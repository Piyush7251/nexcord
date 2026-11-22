// OTP Security, Multi-Level Rate Limiting, Cooldown & Financial Protection Engine
// Supports Redis (distributed) with Atomic Persistent File Store fallback.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.OTP_STATE_FILE || path.join(__dirname, '..', 'data', 'otp_security_state.json');

// ---------------------------------------------------------------- Configuration
export const OTP_CONFIG = {
  cooldownSeconds: parseInt(process.env.OTP_COOLDOWN_SECONDS || '30', 10), // 30s cooldown
  otpTtlSeconds: parseInt(process.env.OTP_EXPIRATION_SECONDS || '300', 10), // 5 min TTL
  maxVerifyAttempts: parseInt(process.env.MAX_OTP_VERIFY_ATTEMPTS || '5', 10), // max 5 failed attempts

  // Per-phone limits
  maxPhonePerHour: parseInt(process.env.OTP_MAX_PER_PHONE_HOUR || '5', 10),
  maxPhonePerDay: parseInt(process.env.OTP_MAX_PER_PHONE_DAY || '10', 10),

  // Per-IP limits
  maxIpPer10Min: parseInt(process.env.OTP_MAX_PER_IP_10MIN || '5', 10),
  maxIpPerDay: parseInt(process.env.OTP_MAX_PER_IP_DAY || '20', 10),

  // Per-account limit
  maxAccountPerHour: parseInt(process.env.OTP_MAX_PER_ACCOUNT_HOUR || '10', 10),

  // Global circuit breaker & spending limits
  globalMax10Min: parseInt(process.env.OTP_GLOBAL_MAX_10MIN || '30', 10),
  dailyBudgetCount: parseInt(process.env.OTP_DAILY_BUDGET_COUNT || '100', 10), // max 100 SMS/day
  dailyBudgetInr: parseFloat(process.env.OTP_DAILY_BUDGET_INR || '25.00'), // max ₹25/day
  costPerMessageInr: 0.25, // ₹0.25 per WhatsApp message
};

// ---------------------------------------------------------------- Normalization & Helpers
export function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  const digits = cleaned.replace(/\D/g, '');
  // Special master admin number
  if (digits === '123456789' || digits === '91123456789') {
    return '+91123456789';
  }

  // Indian standard mobile number: 10 digits starting with 6, 7, 8, or 9
  if (cleaned.startsWith('+91')) {
    const ten = cleaned.slice(3);
    if (/^[6-9]\d{9}$/.test(ten) && !/^(\d)\1{9}$/.test(ten)) return `+91${ten}`;
    if (/^\d{10}$/.test(ten)) return `+91${ten}`;
    return null;
  }
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    const ten = cleaned.slice(2);
    if (/^[6-9]\d{9}$/.test(ten) && !/^(\d)\1{9}$/.test(ten)) return `+91${ten}`;
    if (/^\d{10}$/.test(ten)) return `+91${ten}`;
    return null;
  }
  if (!cleaned.startsWith('+') && cleaned.length === 10) {
    if (/^[6-9]\d{9}$/.test(cleaned) && !/^(\d)\1{9}$/.test(cleaned)) return `+91${cleaned}`;
    if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
    return null;
  }
  if (cleaned.startsWith('+')) {
    // E.164 international format (+ followed by 7 to 15 digits)
    if (/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
    return null;
  }
  // International format without leading '+' but with country code (8-15 digits)
  if (/^[1-9]\d{7,14}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

export function isAdminPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits === '123456789' || digits === '91123456789';
}

export function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length <= 6) return '****';
  return `${s.slice(0, 4)}••••${s.slice(-2)}`;
}

export function generateSecureOtp() {
  // Cryptographically secure 6-digit random number (100000 - 999999)
  return crypto.randomInt(100000, 1000000).toString();
}

// ---------------------------------------------------------------- Storage Layer
export class PersistentFileOtpStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.locks = new Set();
    this.state = {
      cooldowns: {}, // phone -> timestamp (ms)
      otps: {},      // phone -> { codeHash, salt, attempts, expiresAt, createdAt }
      rateLimits: {
        phoneHours: {}, // phone -> [timestamp, ...]
        phoneDays: {},  // phone -> [timestamp, ...]
        ip10Mins: {},   // ip -> [timestamp, ...]
        ipDays: {},     // ip -> [timestamp, ...]
        accountHours: {}, // accountId -> [timestamp, ...]
        global10Mins: [], // [timestamp, ...]
      },
      budget: {
        dateStr: new Date().toISOString().slice(0, 10),
        count: 0,
        spentInr: 0,
      },
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.state = { ...this.state, ...parsed };
      }
    } catch (e) {
      console.warn('[OtpStore] Warning reading persistent state, initializing fresh store:', e.message);
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 1), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (e) {
      console.error('[OtpStore] Error persisting state to disk:', e.message);
    }
  }

  async acquireLock(key, ttlMs = 10000) {
    if (this.locks.has(key)) return false;
    this.locks.add(key);
    setTimeout(() => this.locks.delete(key), ttlMs);
    return true;
  }

  async releaseLock(key) {
    this.locks.delete(key);
  }

  async getCooldown(phone) {
    const until = this.state.cooldowns[phone] || 0;
    const now = Date.now();
    if (until > now) {
      const remainingSeconds = Math.ceil((until - now) / 1000);
      return { active: true, remainingSeconds, cooldownUntil: until };
    }
    return { active: false, remainingSeconds: 0, cooldownUntil: 0 };
  }

  async setCooldown(phone, seconds) {
    const until = Date.now() + seconds * 1000;
    this.state.cooldowns[phone] = until;
    this.save();
    return until;
  }

  async getBudgetStatus() {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (this.state.budget.dateStr !== todayStr) {
      this.state.budget = { dateStr: todayStr, count: 0, spentInr: 0 };
      this.save();
    }
    const b = this.state.budget;
    const countExceeded = b.count >= OTP_CONFIG.dailyBudgetCount;
    const spendExceeded = b.spentInr >= OTP_CONFIG.dailyBudgetInr;
    return {
      dailyCount: b.count,
      dailySpendInr: b.spentInr,
      budgetExhausted: countExceeded || spendExceeded,
      reason: countExceeded ? 'Daily SMS count budget reached' : spendExceeded ? 'Daily budget cap reached' : null,
    };
  }

  async checkRateLimits(phone, ip, accountId = null) {
    const now = Date.now();
    const rl = this.state.rateLimits;

    // 1. Budget check
    const budget = await this.getBudgetStatus();
    if (budget.budgetExhausted) {
      return { allowed: false, reason: `OTP delivery paused: ${budget.reason}. Please contact support.` };
    }

    // 2. Global velocity limit (last 10m)
    rl.global10Mins = (rl.global10Mins || []).filter((t) => t > now - 10 * 60 * 1000);
    if (rl.global10Mins.length >= OTP_CONFIG.globalMax10Min) {
      return { allowed: false, reason: 'High system OTP traffic. Please wait 5 minutes before trying again.' };
    }

    // 3. IP limit (10 min)
    rl.ip10Mins[ip] = (rl.ip10Mins[ip] || []).filter((t) => t > now - 10 * 60 * 1000);
    if (rl.ip10Mins[ip].length >= OTP_CONFIG.maxIpPer10Min) {
      const oldest = rl.ip10Mins[ip][0];
      const waitSec = Math.ceil((oldest + 10 * 60 * 1000 - now) / 1000);
      return { allowed: false, reason: `Too many requests from this network. Please wait ${waitSec}s.`, retryAfter: waitSec };
    }

    // 4. IP daily limit
    rl.ipDays[ip] = (rl.ipDays[ip] || []).filter((t) => t > now - 24 * 60 * 60 * 1000);
    if (rl.ipDays[ip].length >= OTP_CONFIG.maxIpPerDay) {
      return { allowed: false, reason: 'Daily request limit reached for this network. Please try again tomorrow.' };
    }

    // 5. Phone hourly limit
    rl.phoneHours[phone] = (rl.phoneHours[phone] || []).filter((t) => t > now - 60 * 60 * 1000);
    if (rl.phoneHours[phone].length >= OTP_CONFIG.maxPhonePerHour) {
      const oldest = rl.phoneHours[phone][0];
      const waitSec = Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000);
      return { allowed: false, reason: `Hourly limit reached for this phone number. Please wait ${Math.ceil(waitSec / 60)} minutes.`, retryAfter: waitSec };
    }

    // 6. Phone daily limit
    rl.phoneDays[phone] = (rl.phoneDays[phone] || []).filter((t) => t > now - 24 * 60 * 60 * 1000);
    if (rl.phoneDays[phone].length >= OTP_CONFIG.maxPhonePerDay) {
      return { allowed: false, reason: 'Daily verification limit reached for this phone number. Please try again tomorrow.' };
    }

    // 7. Account hourly limit
    if (accountId) {
      rl.accountHours[accountId] = (rl.accountHours[accountId] || []).filter((t) => t > now - 60 * 60 * 1000);
      if (rl.accountHours[accountId].length >= OTP_CONFIG.maxAccountPerHour) {
        return { allowed: false, reason: 'Account hourly limit reached for OTP verification.' };
      }
    }

    return { allowed: true };
  }

  async recordOtpSent(phone, ip, accountId = null, costInr = OTP_CONFIG.costPerMessageInr) {
    const now = Date.now();
    const rl = this.state.rateLimits;
    rl.global10Mins.push(now);

    rl.ip10Mins[ip] = rl.ip10Mins[ip] || [];
    rl.ip10Mins[ip].push(now);

    rl.ipDays[ip] = rl.ipDays[ip] || [];
    rl.ipDays[ip].push(now);

    rl.phoneHours[phone] = rl.phoneHours[phone] || [];
    rl.phoneHours[phone].push(now);

    rl.phoneDays[phone] = rl.phoneDays[phone] || [];
    rl.phoneDays[phone].push(now);

    if (accountId) {
      rl.accountHours[accountId] = rl.accountHours[accountId] || [];
      rl.accountHours[accountId].push(now);
    }

    // Track daily budget
    await this.getBudgetStatus(); // ensures date check
    this.state.budget.count += 1;
    this.state.budget.spentInr += costInr;

    this.save();
  }

  async storeOtp(phone, code, ttlSeconds = OTP_CONFIG.otpTtlSeconds) {
    const salt = crypto.randomBytes(8).toString('hex');
    const hash = crypto.createHash('sha256').update(code + salt).digest('hex');
    const now = Date.now();
    this.state.otps[phone] = {
      codeHash: hash,
      salt,
      attempts: 0,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };
    this.save();
  }

  async verifyOtp(phone, candidateCode) {
    const rec = this.state.otps[phone];
    if (!rec) {
      return { valid: false, reason: 'No pending verification code found or code has expired' };
    }

    const now = Date.now();
    if (rec.expiresAt < now) {
      delete this.state.otps[phone];
      this.save();
      return { valid: false, reason: 'Verification code has expired' };
    }

    // Check brute-force attempts
    if (rec.attempts >= OTP_CONFIG.maxVerifyAttempts) {
      delete this.state.otps[phone];
      this.save();
      return { valid: false, reason: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    const candidateHash = crypto.createHash('sha256').update(candidateCode + rec.salt).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(rec.codeHash))) {
      // Invalidate OTP atomically upon successful verification (replay protection)
      delete this.state.otps[phone];
      this.save();
      return { valid: true };
    }

    // Increment failed attempt counter
    rec.attempts += 1;
    const remaining = OTP_CONFIG.maxVerifyAttempts - rec.attempts;
    if (remaining <= 0) {
      delete this.state.otps[phone];
      this.save();
      return { valid: false, reason: 'Too many incorrect attempts. Code has been invalidated.', attemptsRemaining: 0 };
    }

    this.save();
    return { valid: false, reason: 'Incorrect verification code', attemptsRemaining: remaining };
  }

  async resetForTesting() {
    this.locks.clear();
    this.state = {
      cooldowns: {},
      otps: {},
      rateLimits: {
        phoneHours: {},
        phoneDays: {},
        ip10Mins: {},
        ipDays: {},
        accountHours: {},
        global10Mins: [],
      },
      budget: {
        dateStr: new Date().toISOString().slice(0, 10),
        count: 0,
        spentInr: 0,
      },
    };
    this.save();
  }
}

// ---------------------------------------------------------------- Redis Store Implementation
export class RedisOtpStore {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async acquireLock(key, ttlMs = 10000) {
    const res = await this.redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  async releaseLock(key) {
    await this.redis.del(`lock:${key}`).catch(() => {});
  }

  async getCooldown(phone) {
    const val = await this.redis.get(`cooldown:${phone}`);
    if (val) {
      const until = parseInt(val, 10);
      const now = Date.now();
      if (until > now) {
        return { active: true, remainingSeconds: Math.ceil((until - now) / 1000), cooldownUntil: until };
      }
    }
    return { active: false, remainingSeconds: 0, cooldownUntil: 0 };
  }

  async setCooldown(phone, seconds) {
    const until = Date.now() + seconds * 1000;
    await this.redis.set(`cooldown:${phone}`, until.toString(), 'EX', seconds);
    return until;
  }

  async getBudgetStatus() {
    const today = new Date().toISOString().slice(0, 10);
    const countKey = `budget:count:${today}`;
    const spendKey = `budget:spend:${today}`;
    const count = parseInt((await this.redis.get(countKey)) || '0', 10);
    const spend = parseFloat((await this.redis.get(spendKey)) || '0');
    const countExceeded = count >= OTP_CONFIG.dailyBudgetCount;
    const spendExceeded = spend >= OTP_CONFIG.dailyBudgetInr;
    return {
      dailyCount: count,
      dailySpendInr: spend,
      budgetExhausted: countExceeded || spendExceeded,
      reason: countExceeded ? 'Daily SMS count budget reached' : spendExceeded ? 'Daily budget cap reached' : null,
    };
  }

  async checkRateLimits(phone, ip, accountId = null) {
    const budget = await this.getBudgetStatus();
    if (budget.budgetExhausted) {
      return { allowed: false, reason: `OTP delivery paused: ${budget.reason}. Please contact support.` };
    }

    const ipCount = parseInt((await this.redis.get(`rl:ip10m:${ip}`)) || '0', 10);
    if (ipCount >= OTP_CONFIG.maxIpPer10Min) {
      const ttl = await this.redis.ttl(`rl:ip10m:${ip}`);
      return { allowed: false, reason: `Too many requests from this network. Please wait ${ttl}s.`, retryAfter: ttl };
    }

    const phoneHourCount = parseInt((await this.redis.get(`rl:phHour:${phone}`)) || '0', 10);
    if (phoneHourCount >= OTP_CONFIG.maxPhonePerHour) {
      const ttl = await this.redis.ttl(`rl:phHour:${phone}`);
      return { allowed: false, reason: `Hourly limit reached for this phone number. Please wait ${Math.ceil(ttl / 60)} minutes.`, retryAfter: ttl };
    }

    const phoneDayCount = parseInt((await this.redis.get(`rl:phDay:${phone}`)) || '0', 10);
    if (phoneDayCount >= OTP_CONFIG.maxPhonePerDay) {
      return { allowed: false, reason: 'Daily verification limit reached for this phone number. Please try again tomorrow.' };
    }

    const globalCount = parseInt((await this.redis.get('rl:global10m')) || '0', 10);
    if (globalCount >= OTP_CONFIG.globalMax10Min) {
      return { allowed: false, reason: 'High system OTP traffic. Please wait 5 minutes before trying again.' };
    }

    return { allowed: true };
  }

  async recordOtpSent(phone, ip, accountId = null, costInr = OTP_CONFIG.costPerMessageInr) {
    const multi = this.redis.multi();
    const today = new Date().toISOString().slice(0, 10);

    multi.incr(`budget:count:${today}`);
    multi.expire(`budget:count:${today}`, 86400 * 2);

    multi.incrbyfloat(`budget:spend:${today}`, costInr);
    multi.expire(`budget:spend:${today}`, 86400 * 2);

    multi.incr(`rl:ip10m:${ip}`);
    multi.expire(`rl:ip10m:${ip}`, 600);

    multi.incr(`rl:phHour:${phone}`);
    multi.expire(`rl:phHour:${phone}`, 3600);

    multi.incr(`rl:phDay:${phone}`);
    multi.expire(`rl:phDay:${phone}`, 86400);

    multi.incr('rl:global10m');
    multi.expire('rl:global10m', 600);

    if (accountId) {
      multi.incr(`rl:acc:${accountId}`);
      multi.expire(`rl:acc:${accountId}`, 3600);
    }

    await multi.exec();
  }

  async storeOtp(phone, code, ttlSeconds = OTP_CONFIG.otpTtlSeconds) {
    const salt = crypto.randomBytes(8).toString('hex');
    const hash = crypto.createHash('sha256').update(code + salt).digest('hex');
    const data = JSON.stringify({ codeHash: hash, salt, attempts: 0 });
    await this.redis.set(`otp:${phone}`, data, 'EX', ttlSeconds);
  }

  async verifyOtp(phone, candidateCode) {
    // Atomic check via Redis
    const key = `otp:${phone}`;
    const raw = await this.redis.get(key);
    if (!raw) {
      return { valid: false, reason: 'No pending verification code found or code has expired' };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this.redis.del(key);
      return { valid: false, reason: 'Corrupt code state' };
    }

    if (parsed.attempts >= OTP_CONFIG.maxVerifyAttempts) {
      await this.redis.del(key);
      return { valid: false, reason: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    const candidateHash = crypto.createHash('sha256').update(candidateCode + parsed.salt).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(parsed.codeHash))) {
      await this.redis.del(key);
      return { valid: true };
    }

    parsed.attempts += 1;
    const remaining = OTP_CONFIG.maxVerifyAttempts - parsed.attempts;
    if (remaining <= 0) {
      await this.redis.del(key);
      return { valid: false, reason: 'Too many incorrect attempts. Code has been invalidated.', attemptsRemaining: 0 };
    }

    const ttl = await this.redis.ttl(key);
    if (ttl > 0) {
      await this.redis.set(key, JSON.stringify(parsed), 'EX', ttl);
    }
    return { valid: false, reason: 'Incorrect verification code', attemptsRemaining: remaining };
  }

  async resetForTesting() {
    const keys = await this.redis.keys('*:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }
}

// ---------------------------------------------------------------- Factory / Store Instance
let storeInstance = null;

export async function getOtpStore() {
  if (storeInstance) return storeInstance;

  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    try {
      const { default: Redis } = await import('ioredis');
      const url = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
      const client = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
      await client.connect();
      console.log('[OtpStore] Connected to Redis at', url.replace(/:\/\/[^@]*@/, '://***@'));
      storeInstance = new RedisOtpStore(client);
      return storeInstance;
    } catch (e) {
      console.warn('[OtpStore] Redis connection failed, falling back to atomic persistent store:', e.message);
    }
  }

  storeInstance = new PersistentFileOtpStore(STATE_FILE);
  return storeInstance;
}

export function setCustomOtpStore(store) {
  storeInstance = store;
}
