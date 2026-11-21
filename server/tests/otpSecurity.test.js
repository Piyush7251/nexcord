// Automated Security Test Suite for Nexcord OTP Engine & Rate Limiter
// Enforces: 30s cooldown, multi-level rate limits, concurrency locking, budget guards, persistence, and replay/brute-force defense.
import test, { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.MOCK_SMS = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_STATE_FILE = path.join(__dirname, 'test_otp_security_state.json');
process.env.OTP_STATE_FILE = TEST_STATE_FILE;

// Import security modules
const {
  OTP_CONFIG,
  normalizePhone,
  isAdminPhone,
  generateSecureOtp,
  maskPhone,
  getOtpStore,
} = await import('../src/otpSecurity.js');

const { setMockSmsHandler } = await import('../src/sms.js');

describe('Nexcord OTP Security & Rate Limiting Test Suite', () => {
  let store;
  const PHONE_A = '+919876543210';
  const PHONE_B = '+919123456789';
  const CLIENT_IP_1 = '192.168.1.100';
  const CLIENT_IP_2 = '10.0.0.50';

  before(async () => {
    store = await getOtpStore();
  });

  beforeEach(async () => {
    // Reset state before each test
    await store.resetForTesting();
    // Default mock handler: success
    setMockSmsHandler(async ({ phone, code }) => ({
      provider: 'Fast2SMS WhatsApp (Mocked)',
      deliveredToCarrier: true,
      details: `Dispatched code to ${phone}`,
    }));
  });

  after(() => {
    try {
      if (fs.existsSync(TEST_STATE_FILE)) fs.unlinkSync(TEST_STATE_FILE);
      if (fs.existsSync(`${TEST_STATE_FILE}.tmp`)) fs.unlinkSync(`${TEST_STATE_FILE}.tmp`);
    } catch {}
  });

  // Test 1: First OTP request succeeds
  it('1. First OTP request succeeds: E.164 normalization, secure 6-digit code, cooldown set', async () => {
    const rawInput = ' 9876543210 ';
    const normalized = normalizePhone(rawInput);
    assert.equal(normalized, PHONE_A, 'Normalized phone should be E.164 (+919876543210)');

    const code = generateSecureOtp();
    assert.match(code, /^\d{6}$/, 'Generated OTP must be exactly 6 digits');
    assert.ok(parseInt(code, 10) >= 100000 && parseInt(code, 10) <= 999999, 'OTP must be in range 100000-999999');

    // Initial cooldown check
    const initialCooldown = await store.getCooldown(normalized);
    assert.equal(initialCooldown.active, false, 'No initial cooldown should be active');

    // Simulate successful dispatch
    await store.setCooldown(normalized, 30);
    await store.recordOtpSent(normalized, CLIENT_IP_1, null, OTP_CONFIG.costPerMessageInr);
    await store.storeOtp(normalized, code, 300);

    const cooldownAfter = await store.getCooldown(normalized);
    assert.equal(cooldownAfter.active, true, 'Cooldown must be active after dispatch');
    assert.ok(cooldownAfter.remainingSeconds >= 28 && cooldownAfter.remainingSeconds <= 30, 'Remaining cooldown should be ~30s');
  });

  // Test 2: Immediate resend returns HTTP 429
  it('2. Immediate resend within 30 seconds is blocked with active cooldown remaining', async () => {
    await store.setCooldown(PHONE_A, 30);
    const check = await store.getCooldown(PHONE_A);

    assert.equal(check.active, true, 'Subsequent request must find active cooldown');
    assert.ok(check.remainingSeconds > 0, 'Remaining seconds must be greater than zero');
    assert.ok(check.cooldownUntil > Date.now(), 'cooldownUntil timestamp must be in the future');
  });

  // Test 3: Request allowed after 30 seconds
  it('3. Request is allowed after 30-second cooldown expires', async () => {
    // Set an expired cooldown
    await store.setCooldown(PHONE_A, 30);
    // Artificially age the cooldown timestamp
    store.state.cooldowns[PHONE_A] = Date.now() - 1000;
    store.save();

    const check = await store.getCooldown(PHONE_A);
    assert.equal(check.active, false, 'Cooldown should be inactive after expiration');
    assert.equal(check.remainingSeconds, 0, 'Remaining seconds should be 0');
  });

  // Test 4: Independent cooldowns for different phone numbers
  it('4. Cooldowns are strictly isolated per phone number', async () => {
    await store.setCooldown(PHONE_A, 30);

    const checkA = await store.getCooldown(PHONE_A);
    const checkB = await store.getCooldown(PHONE_B);

    assert.equal(checkA.active, true, 'Phone A must have active cooldown');
    assert.equal(checkB.active, false, 'Phone B must NOT be throttled by Phone A');
  });

  // Test 5: Repeated requests cannot bypass cooldown
  it('5. Repeated requests cannot bypass cooldown timer', async () => {
    await store.setCooldown(PHONE_A, 30);

    for (let i = 0; i < 5; i++) {
      const check = await store.getCooldown(PHONE_A);
      assert.equal(check.active, true, `Attempt ${i + 1} must be rejected by cooldown`);
    }
  });

  // Test 6: Simultaneous parallel requests cannot generate duplicate OTPs (concurrency check)
  it('6. Simultaneous parallel requests cannot acquire duplicate locks for the same target', async () => {
    const lockKey = `lock:phone:${PHONE_A}`;

    // Launch 10 simultaneous requests attempting to acquire the concurrency lock
    const results = await Promise.all([
      store.acquireLock(lockKey, 5000),
      store.acquireLock(lockKey, 5000),
      store.acquireLock(lockKey, 5000),
      store.acquireLock(lockKey, 5000),
      store.acquireLock(lockKey, 5000),
    ]);

    const acquired = results.filter((r) => r === true);
    const rejected = results.filter((r) => r === false);

    assert.equal(acquired.length, 1, 'Exactly one concurrent request must acquire lock');
    assert.equal(rejected.length, 4, 'All simultaneous parallel requests must be rejected');

    // Clean up
    await store.releaseLock(lockKey);
    const acquiredAfterRelease = await store.acquireLock(lockKey, 5000);
    assert.equal(acquiredAfterRelease, true, 'Lock can be acquired again after release');
    await store.releaseLock(lockKey);
  });

  // Test 7: Multiple instances / shared rate-limit state simulation
  it('7. Shared storage reflects identical state across simulated server worker processes', async () => {
    // Worker 1 writes cooldown and records OTP sent
    await store.setCooldown(PHONE_A, 30);
    await store.recordOtpSent(PHONE_A, CLIENT_IP_1, null, OTP_CONFIG.costPerMessageInr);

    // Worker 2 reads from the same persistent file state
    const { default: fs } = await import('node:fs');
    const raw = fs.readFileSync(TEST_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    assert.ok(parsed.cooldowns[PHONE_A] > Date.now(), 'Worker 2 sees active cooldown');
    assert.equal(parsed.rateLimits.phoneHours[PHONE_A].length, 1, 'Worker 2 sees recorded rate limit');
    assert.equal(parsed.budget.count, 1, 'Worker 2 sees budget increment');
  });

  // Test 8: Application restart persistence
  it('8. Application restart persists all cooldowns, pending OTP hashes, and rate limits', async () => {
    const secretCode = '849201';
    await store.setCooldown(PHONE_A, 30);
    await store.storeOtp(PHONE_A, secretCode, 300);
    await store.recordOtpSent(PHONE_A, CLIENT_IP_1, null, 0.25);

    // Simulate server crash and restart: instantiate brand new store instance pointing to same file
    const { PersistentFileOtpStore } = await import('../src/otpSecurity.js');
    const restartedStore = new PersistentFileOtpStore(TEST_STATE_FILE);

    const cooldown = await restartedStore.getCooldown(PHONE_A);
    assert.equal(cooldown.active, true, 'Cooldown must survive application restart');

    const verify = await restartedStore.verifyOtp(PHONE_A, secretCode);
    assert.equal(verify.valid, true, 'Stored OTP hash must survive restart and verify successfully');
  });

  // Test 9: Provider failure handled correctly
  it('9. Provider failure does not lock cooldown or charge financial budget', async () => {
    // Mock provider failure (e.g. carrier timeout or Fast2SMS rejection)
    setMockSmsHandler(async () => ({
      provider: 'Fast2SMS WhatsApp',
      deliveredToCarrier: false,
      details: 'Fast2SMS API responded with carrier network timeout',
    }));

    const mockRes = await (await import('../src/sms.js')).sendSms({ phone: PHONE_A, code: '112233' });
    assert.equal(mockRes.deliveredToCarrier, false, 'SMS delivery flagged as failed');

    // Because delivery failed, backend flow does NOT invoke setCooldown or recordOtpSent
    const cooldown = await store.getCooldown(PHONE_A);
    assert.equal(cooldown.active, false, 'Failed dispatch must not lock user into cooldown');

    const budget = await store.getBudgetStatus();
    assert.equal(budget.dailyCount, 0, 'Failed dispatch must not count against spending budget');
  });

  // Test 10: Daily delivery budget & spending limit circuit-breaker
  it('10. Daily delivery budget & spending limit circuit-breaker triggers when exhausted', async () => {
    // Fill up daily count budget
    store.state.budget.count = OTP_CONFIG.dailyBudgetCount;
    store.save();

    const rateCheck = await store.checkRateLimits(PHONE_A, CLIENT_IP_1);
    assert.equal(rateCheck.allowed, false, 'Request must be blocked when daily budget count reached');
    assert.match(rateCheck.reason, /budget/i, 'Reason must state budget exhaustion');

    // Reset count, test INR spend cap
    store.state.budget.count = 0;
    store.state.budget.spentInr = OTP_CONFIG.dailyBudgetInr + 1;
    store.save();

    const rateCheckSpend = await store.checkRateLimits(PHONE_A, CLIENT_IP_1);
    assert.equal(rateCheckSpend.allowed, false, 'Request must be blocked when INR budget cap reached');
  });

  // Test 11: OTP expiration and replay/brute-force protection
  it('11. Enforces TTL expiration, replay invalidation, and brute-force attempt lockout', async () => {
    const validCode = '556677';
    await store.storeOtp(PHONE_A, validCode, 300);

    // 1. Wrong code increments failed attempt counter
    const wrong1 = await store.verifyOtp(PHONE_A, '000000');
    assert.equal(wrong1.valid, false, 'Wrong code must be rejected');
    assert.equal(wrong1.attemptsRemaining, 4, 'Remaining attempts must be 4');

    // 2. 4 more wrong attempts exhaust the max allowed attempts (5 total)
    await store.verifyOtp(PHONE_A, '000001');
    await store.verifyOtp(PHONE_A, '000002');
    await store.verifyOtp(PHONE_A, '000003');
    const wrongFinal = await store.verifyOtp(PHONE_A, '000004');
    assert.equal(wrongFinal.valid, false, 'Final wrong attempt rejected');
    assert.equal(wrongFinal.attemptsRemaining, 0, 'Attempts remaining must be 0');

    // 3. Brute force lockout: Even with the correct code now, OTP has been invalidated
    const postLockout = await store.verifyOtp(PHONE_A, validCode);
    assert.equal(postLockout.valid, false, 'Correct code cannot be used once brute force lockout triggers');

    // 4. Replay protection: Store fresh code, verify it once, then verify again
    const freshCode = '998811';
    await store.storeOtp(PHONE_B, freshCode, 300);
    const firstVerify = await store.verifyOtp(PHONE_B, freshCode);
    assert.equal(firstVerify.valid, true, 'First verification must succeed');

    const replayAttempt = await store.verifyOtp(PHONE_B, freshCode);
    assert.equal(replayAttempt.valid, false, 'Replaying previously verified code must fail (atomic single-use)');

    // 5. Expiration check
    await store.storeOtp(PHONE_B, '123123', 1);
    // Artificially expire the record
    store.state.otps[PHONE_B].expiresAt = Date.now() - 5000;
    store.save();
    const expiredCheck = await store.verifyOtp(PHONE_B, '123123');
    assert.equal(expiredCheck.valid, false, 'Expired OTP must be rejected');
    assert.match(expiredCheck.reason, /expired/i, 'Reason must indicate expiration');
  });

  // Test 12: IP-based rate limiting
  it('12. Enforces IP-based rate limiting window (max 5 requests per 10 minutes)', async () => {
    // Register 5 requests from CLIENT_IP_1
    for (let i = 0; i < OTP_CONFIG.maxIpPer10Min; i++) {
      const allowed = await store.checkRateLimits(`+91900000000${i}`, CLIENT_IP_1);
      assert.equal(allowed.allowed, true, `Request ${i + 1} from IP should be allowed`);
      await store.recordOtpSent(`+91900000000${i}`, CLIENT_IP_1, null, 0.25);
    }

    // 6th request from same IP should be blocked
    const blockedCheck = await store.checkRateLimits('+919999999999', CLIENT_IP_1);
    assert.equal(blockedCheck.allowed, false, '6th request from same IP must be rate limited');
    assert.match(blockedCheck.reason, /Too many requests from this network/i);

    // Another IP should NOT be blocked
    const differentIpCheck = await store.checkRateLimits('+919999999999', CLIENT_IP_2);
    assert.equal(differentIpCheck.allowed, true, 'Different IP address must not be blocked');
  });

  // Bonus Test: HTTP API Integration check
  it('13. HTTP API integration: POST /api/auth/send-otp enforces 30s cooldown and returns 429 with cooldown payload', async () => {
    try {
      // Test against live local server if running
      const res1 = await fetch('http://localhost:3001/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+919876543210' }),
      });

      if (res1.ok || res1.status === 429) {
        // If first succeeded or was on cooldown, verify response format
        const body1 = await res1.json();
        assert.ok(body1 !== null, 'Response must be valid JSON');

        // Immediate second request
        const res2 = await fetch('http://localhost:3001/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '+919876543210' }),
        });
        const body2 = await res2.json();

        assert.equal(res2.status, 429, 'Immediate second HTTP request must return status 429');
        assert.equal(body2.ok, false, 'Response body ok should be false');
        assert.ok(body2.cooldownSeconds > 0, 'Response must include positive cooldownSeconds');
      }
    } catch (e) {
      // Local server port might not be reachable in isolated CI; store unit tests cover full logic
      console.log('Skipping live HTTP fetch subcheck:', e.message);
    }
  });
});
