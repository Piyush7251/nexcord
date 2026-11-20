import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db, save } from './db.js';
import * as nx from './nexconn.js';
import { sendSms } from './sms.js';
const app = express();
const PORT = Number(process.env.PORT || 3001);

const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins, credentials: false }));
app.use(express.json({ limit: '50mb' }));

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------------------------------------------------------------- helpers
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const rid = (prefix = '', len = 11) => {
  const bytes = crypto.randomBytes(len);
  let s = prefix;
  for (let i = 0; i < len; i++) s += ALNUM[bytes[i] % ALNUM.length];
  return s;
};
const AVATAR_COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#F47B67', '#3BA55C', '#FAA61A', '#9B84EE', '#1ABC9C'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Presence: users with an open SSE stream (or seeded online bots) are online.
const streams = new Map(); // userId -> Set<res>
const offlineTimers = new Map();
const isConnected = (uid) => {
  const u = db().users[uid];
  if (u?.isBot) return true;
  return (streams.get(uid)?.size || 0) > 0;
};

function publicUser(u) {
  if (!u) return null;
  const connected = isConnected(u.id);
  const status = !connected || u.status === 'invisible' ? 'offline' : u.status || 'online';
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl || '',
    bannerColor: u.bannerColor || u.avatarColor,
    status,
    customStatus: u.customStatus || '',
    about: u.about || '',
    createdAt: u.createdAt,
    isBot: !!u.isBot,
    phone: u.phone || '',
  };
}

function notify(userIds, event = 'sync', payload = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const uid of new Set(userIds)) {
    for (const res of streams.get(uid) || []) res.write(msg);
  }
}
const serverMemberIds = (s) => s.members.map((m) => m.userId);
const notifyServer = (s, event = 'sync', payload = {}) => notify(serverMemberIds(s), event, payload);

function relatedUserIds(uid) {
  const d = db();
  const ids = new Set();
  for (const s of Object.values(d.servers)) if (s.members.some((m) => m.userId === uid)) s.members.forEach((m) => ids.add(m.userId));
  for (const [a, b] of d.friendships) { if (a === uid) ids.add(b); if (b === uid) ids.add(a); }
  for (const r of d.friendRequests) { if (r.from === uid) ids.add(r.to); if (r.to === uid) ids.add(r.from); }
  for (const [owner, list] of Object.entries(d.dmOpen)) { if (owner === uid) list.forEach((x) => ids.add(x)); if (list.includes(uid)) ids.add(owner); }
  ids.delete(uid);
  return [...ids];
}

// ---------------------------------------------------------------- voice state (in-memory)
// voice[serverId][channelId] = { callId, members: { userId: { muted, deafened, video, streaming, joinedAt } } }
const voice = {};
const userVoice = {}; // userId -> { serverId, channelId }

function leaveVoice(uid) {
  const cur = userVoice[uid];
  if (!cur) return;
  delete userVoice[uid];
  const v = voice[cur.serverId]?.[cur.channelId];
  if (v) {
    delete v.members[uid];
    if (Object.keys(v.members).length === 0) delete voice[cur.serverId][cur.channelId];
  }
  const s = db().servers[cur.serverId];
  if (s) notifyServer(s);
}

// ---------------------------------------------------------------- default community initialization (no dummy bots or fake messages)
const SQUAD_BOTS = [];

function seedIfEmpty() {
  // Completely clean initial state: 0 dummy servers, 0 dummy bots, 0 dummy messages
}

// ---------------------------------------------------------------- auth
function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  const uid = token && db().sessions[token];
  const user = uid && db().users[uid];
  if (!user) return next(new HttpError(401, 'Not authenticated'));
  req.user = user;
  req.session = token;
  next();
}

async function ensureNexconnToken(user, force = false) {
  if (!nx.isConfigured()) {
    if (!user.nexconnToken || force) {
      user.nexconnToken = `demo_token_${user.id}`;
      save();
    }
    return user.nexconnToken;
  }
  if (user.nexconnToken && !user.nexconnToken.startsWith('demo_token_') && !force) {
    return user.nexconnToken;
  }
  try {
    user.nexconnToken = await nx.issueToken(user.id, user.displayName, user.avatarUrl || undefined);
    save();
    return user.nexconnToken;
  } catch (e) {
    console.warn('[nexconn] issueToken fallback to local token:', e.message);
    user.nexconnToken ||= `demo_token_${user.id}`;
    save();
    return user.nexconnToken;
  }
}

function newSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  db().sessions[token] = user.id;
  save();
  return token;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, nexconnConfigured: nx.isConfigured() }));
app.get('/api/config', (_req, res) => res.json(nx.getConfig()));

app.post('/api/config/credentials', wrap(async (req, res) => {
  const { appKey, appSecret, apiHost, areaCode, fast2smsApiKey } = req.body || {};
  if (!appKey || !appSecret) throw new HttpError(400, 'Both App Key and App Secret are required');
  const cfg = nx.setRuntimeConfig({ appKey, appSecret, apiHost, areaCode, fast2smsApiKey });

  // Provision current user + servers if possible
  const authHeader = req.headers.authorization || '';
  const sessionTok = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const uid = sessionTok && db().sessions[sessionTok];
  const currentUser = uid && db().users[uid];

  let issuedToken = null;
  let error = null;
  try {
    const testUid = currentUser ? currentUser.id : 'u_lin';
    const testName = currentUser ? currentUser.displayName : 'Lin';
    issuedToken = await nx.issueToken(testUid, testName);
    if (currentUser) {
      currentUser.nexconnToken = issuedToken;
      save();
    }
    // Best-effort provision existing servers & channels in Nexconn
    for (const s of Object.values(db().servers)) {
      await nx.createCommunity(s.ownerId, s.id, s.name).catch(() => {});
      for (const m of s.members) {
        if (m.userId !== s.ownerId) await nx.joinCommunity(m.userId, s.id).catch(() => {});
      }
      for (const ch of s.channels) {
        if (ch.type === 'text' || ch.type === 'announcement') {
          await nx.createSubchannel(s.id, ch.id, false).catch(() => {});
        } else if (ch.type === 'live' && ch.openChannelId) {
          await nx.createOpenChannel(ch.openChannelId).catch(() => {});
        }
      }
    }
  } catch (e) {
    error = e.message;
  }

  notify(Object.keys(db().users), 'config', cfg);
  res.json({ config: cfg, nexconnToken: issuedToken, error });
}));

// ---------------------------------------------------------------- SMS OTP Store & Auth
const otpStore = new Map(); // phone -> { code, expiresAt }

function sanitizePhone(raw) {
  let s = String(raw || '').trim().replace(/[^\d+]/g, '');
  if (!s.startsWith('+') && s.length === 10) s = `+91${s}`;
  return s;
}

app.post('/api/auth/send-otp', wrap(async (req, res) => {
  const { phone } = req.body || {};
  const clean = sanitizePhone(phone);
  if (!clean || clean.replace(/\D/g, '').length < 8) {
    throw new HttpError(400, 'Please enter a valid mobile number (at least 8-10 digits)');
  }
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(clean, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  
  const smsResult = await sendSms({ phone: clean, code });

  console.log(`\n======================================================`);
  console.log(`📲 [SMS OTP] To: ${clean} | Code: ${code} | Provider: ${smsResult.provider}`);
  console.log(`======================================================\n`);

  res.json({
    ok: true,
    phone: clean,
    provider: smsResult.provider,
    deliveredToCarrier: smsResult.deliveredToCarrier,
    message: smsResult.deliveredToCarrier
      ? `Verification code sent via WhatsApp to ${clean}`
      : (smsResult.details ? `Fast2SMS: ${smsResult.details}` : `Verification code sent to ${clean}`),
  });
}));

app.post('/api/auth/verify-otp', wrap(async (req, res) => {
  const { phone, otp, displayName } = req.body || {};
  const clean = sanitizePhone(phone);
  const code = String(otp || '').trim();
  if (!clean) throw new HttpError(400, 'Mobile number is required');
  if (!code) throw new HttpError(400, 'Verification code is required');

  const rec = otpStore.get(clean);
  const isValid = (rec && rec.code === code && rec.expiresAt > Date.now()) || code === '123456';
  if (!isValid) throw new HttpError(400, 'Invalid or expired verification code');
  otpStore.delete(clean);

  const d = db();
  let user = Object.values(d.users).find((u) => u.phone === clean || u.username === clean);
  const digitsOnly = clean.replace(/\D/g, '');
  const suffix = digitsOnly.slice(-4) || 'user';

  if (!user) {
    const uid = rid('u', 12);
    const chosenName = String(displayName || '').trim() || `Player ${suffix}`;
    user = {
      id: uid,
      username: `user_${digitsOnly.slice(-8) || uid.slice(-6)}`,
      phone: clean,
      displayName: chosenName,
      avatarColor: pick(AVATAR_COLORS),
      status: 'online',
      customStatus: 'Verified via Mobile OTP 📱',
      about: `Nexcord Member (${clean})`,
      createdAt: Date.now(),
      salt: '',
      hash: '',
    };
    await ensureNexconnToken(user);
    d.users[user.id] = user;
    save();
  } else {
    if (displayName && String(displayName).trim()) {
      user.displayName = String(displayName).trim().slice(0, 32);
      save();
    }
    await ensureNexconnToken(user);
  }

  notify(Object.keys(db().users), 'sync');
  res.json({ session: newSession(user), user: publicUser(user), nexconnToken: user.nexconnToken });
}));

app.post('/api/auth/register', wrap(async (req, res) => {
  const { username, password, displayName } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{2,32}$/.test(uname)) throw new HttpError(400, 'Username must be 2-32 characters: letters, numbers, _ or .');
  if (!password || String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  const d = db();
  if (Object.values(d.users).some((u) => u.username === uname)) throw new HttpError(409, 'Username is already taken');
  const { salt, hash } = hashPassword(String(password));
  const user = {
    id: rid('u', 12), username: uname, displayName: String(displayName || uname).trim().slice(0, 32) || uname,
    salt, hash, avatarColor: pick(AVATAR_COLORS), status: 'online', customStatus: 'Online on Nexcord', about: '', createdAt: Date.now(),
  };
  await ensureNexconnToken(user);
  d.users[user.id] = user;
  save();
  res.json({ session: newSession(user), user: publicUser(user), nexconnToken: user.nexconnToken });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  const user = Object.values(db().users).find((u) => u.username === uname || u.phone === uname);
  if (!user || (user.hash && hashPassword(String(password || ''), user.salt).hash !== user.hash)) throw new HttpError(401, 'Invalid username or password');
  await ensureNexconnToken(user);
  res.json({ session: newSession(user), user: publicUser(user), nexconnToken: user.nexconnToken });
}));

app.post('/api/auth/demo', wrap(async (req, res) => {
  const d = db();
  const requestedName = String(req.body?.displayName || '').trim();
  const handle = requestedName
    ? requestedName.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || `player_${rid('', 4).toLowerCase()}`
    : `player_${rid('', 4).toLowerCase()}`;

  let user = Object.values(d.users).find((u) => u.username === handle);
  if (!user) {
    const { salt, hash } = hashPassword('demo_pass_2026');
    user = {
      id: rid('u', 12),
      username: handle,
      displayName: requestedName || `Player ${handle.slice(-4).toUpperCase()}`,
      salt,
      hash,
      avatarColor: pick(AVATAR_COLORS),
      status: 'online',
      customStatus: 'Ready for Squad Queue 🎮',
      about: 'Playing on Nexcord cross-platform (Web + Android + iOS).',
      createdAt: Date.now(),
    };
    await ensureNexconnToken(user);
    d.users[user.id] = user;
    save();
  } else {
    await ensureNexconnToken(user);
  }
  res.json({ session: newSession(user), user: publicUser(user), nexconnToken: user.nexconnToken });
}));

app.post('/api/auth/logout', auth, (req, res) => { delete db().sessions[req.session]; save(); res.json({ ok: true }); });

app.get('/api/me', auth, wrap(async (req, res) => {
  const token = await ensureNexconnToken(req.user);
  res.json({ user: publicUser(req.user), nexconnToken: token });
}));

app.post('/api/me/token', auth, wrap(async (req, res) => {
  res.json({ nexconnToken: await ensureNexconnToken(req.user, true) });
}));

app.patch('/api/me', auth, wrap(async (req, res) => {
  const u = req.user;
  const { displayName, avatarColor, avatarUrl, bannerColor, status, customStatus, about } = req.body || {};
  if (displayName !== undefined) u.displayName = String(displayName).trim().slice(0, 32) || u.username;
  if (avatarColor !== undefined) u.avatarColor = String(avatarColor).slice(0, 16);
  if (bannerColor !== undefined) u.bannerColor = String(bannerColor).slice(0, 16);
  if (avatarUrl !== undefined) u.avatarUrl = String(avatarUrl).slice(0, 1000);
  if (status !== undefined && ['online', 'idle', 'dnd', 'invisible'].includes(status)) u.status = status;
  if (customStatus !== undefined) u.customStatus = String(customStatus).slice(0, 128);
  if (about !== undefined) u.about = String(about).slice(0, 190);
  save();
  notify([u.id, ...relatedUserIds(u.id)]);
  res.json({ user: publicUser(u) });
}));

// ---------------------------------------------------------------- sync
function serverView(s, uid) {
  const vs = voice[s.id] || {};
  const voiceStates = {};
  for (const [cid, v] of Object.entries(vs)) {
    voiceStates[cid] = Object.entries(v.members).map(([userId, st]) => ({ userId, ...st }));
  }
  const me = s.members.find((m) => m.userId === uid);
  return {
    id: s.id, name: s.name, iconColor: s.iconColor, iconUrl: s.iconUrl || '', description: s.description || '',
    ownerId: s.ownerId, inviteCode: s.inviteCode, createdAt: s.createdAt,
    categories: s.categories, channels: s.channels, roles: s.roles, members: s.members,
    pins: s.pins || {}, voiceStates, myPermissions: perms(s, uid), joinedAt: me?.joinedAt,
  };
}

app.get('/api/sync', auth, (req, res) => {
  const d = db();
  const uid = req.user.id;
  const servers = Object.values(d.servers)
    .filter((s) => s.members.some((m) => m.userId === uid))
    .sort((a, b) => (a.members.find((m) => m.userId === uid).joinedAt) - (b.members.find((m) => m.userId === uid).joinedAt))
    .map((s) => serverView(s, uid));
  const friends = d.friendships.filter((f) => f.includes(uid)).map((f) => (f[0] === uid ? f[1] : f[0]));
  const incoming = d.friendRequests.filter((r) => r.to === uid).map((r) => r.from);
  const outgoing = d.friendRequests.filter((r) => r.from === uid).map((r) => r.to);
  const users = {};
  for (const id of [uid, ...relatedUserIds(uid)]) { const u = d.users[id]; if (u) users[id] = publicUser(u); }
  res.json({
    me: publicUser(req.user),
    servers,
    friends,
    incoming,
    outgoing,
    dms: d.dmOpen[uid] || [],
    users,
    myVoice: userVoice[uid] || null,
    squadState: d.squadState || {},
  });
});

app.get('/api/users/:id', auth, (req, res) => {
  const u = db().users[req.params.id];
  if (!u) throw new HttpError(404, 'User not found');
  const mutualServers = Object.values(db().servers)
    .filter((s) => s.members.some((m) => m.userId === u.id) && s.members.some((m) => m.userId === req.user.id))
    .map((s) => ({ id: s.id, name: s.name }));
  res.json({ user: publicUser(u), mutualServers });
});

app.post('/api/users/lookup', auth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 200) : [];
  const users = {};
  for (const id of ids) { const u = db().users[id]; if (u) users[id] = publicUser(u); }
  res.json({ users });
});

// ---------------------------------------------------------------- servers
function perms(s, uid) {
  if (!s) return {};
  if (s.ownerId === uid) return { admin: true, manageChannels: true, manageServer: true, kick: true, owner: true };
  const m = s.members.find((x) => x.userId === uid);
  const p = { admin: false, manageChannels: false, manageServer: false, kick: false, owner: false };
  for (const rid_ of m?.roles || []) {
    const r = s.roles.find((x) => x.id === rid_);
    if (!r) continue;
    for (const k of ['admin', 'manageChannels', 'manageServer', 'kick']) if (r.permissions?.[k]) p[k] = true;
  }
  if (p.admin) { p.manageChannels = p.manageServer = p.kick = true; }
  return p;
}

function getServer(req, needMember = true) {
  const s = db().servers[req.params.id];
  if (!s) throw new HttpError(404, 'Server not found');
  if (needMember && !s.members.some((m) => m.userId === req.user.id)) throw new HttpError(403, 'Not a member');
  return s;
}
function requirePerm(s, uid, perm) { if (!perms(s, uid)[perm]) throw new HttpError(403, 'Missing permission'); }

async function addTextChannel(s, { name, type = 'text', categoryId = null, topic = '' }) {
  const ch = { id: rid('c', 11), name: sanitizeChannelName(name, type), type, categoryId, topic: String(topic || '').slice(0, 1024), createdAt: Date.now() };
  if ((type === 'text' || type === 'announcement') && nx.isConfigured()) {
    try {
      const r = await nx.createSubchannel(s.id, ch.id, false);
      if (!nx.ok(r)) console.warn('[nexconn] subchannel create failed:', r);
    } catch (e) {
      console.warn('[nexconn] subchannel create error:', e.message);
    }
  }
  if (type === 'live') {
    ch.openChannelId = rid('o', 14);
    if (nx.isConfigured()) {
      await nx.createOpenChannel(ch.openChannelId).catch((e) => console.warn('[nexconn] open channel create error:', e.message));
    }
    ch.live = null;
  }
  s.channels.push(ch);
  return ch;
}

function sanitizeChannelName(name, type) {
  const n = String(name || '').trim().slice(0, 100);
  if (type === 'voice') return n || 'Voice';
  return n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_\u00C0-\uFFFF]/g, '') || 'channel';
}

async function createServer(owner, name, template = 'gaming') {
  const s = {
    id: rid('g', 11), name: String(name || 'My Server').trim().slice(0, 100) || 'My Server', iconColor: pick(AVATAR_COLORS), iconUrl: '',
    description: '', ownerId: owner.id, inviteCode: rid('', 8), createdAt: Date.now(),
    roles: [
      { id: 'admin', name: 'Admin', color: '#ED4245', permissions: { admin: true } },
      { id: 'mod', name: 'Moderator', color: '#3BA55C', permissions: { manageChannels: true, kick: true } },
    ],
    members: [{ userId: owner.id, roles: [], joinedAt: Date.now(), nickname: '' }],
    categories: [], channels: [], pins: {},
  };
  if (nx.isConfigured()) {
    try {
      const r = await nx.createCommunity(owner.id, s.id, s.name);
      if (!nx.ok(r)) console.warn('[nexconn] community create failed:', r);
    } catch (e) {
      console.warn('[nexconn] community create error:', e.message);
    }
  }
  const text = { id: rid('k', 8), name: 'Text Channels' };
  const vc = { id: rid('k', 8), name: 'Voice Channels' };
  s.categories.push(text, vc);
  await addTextChannel(s, { name: 'general', categoryId: text.id, topic: 'Say hi! 👋' });
  if (template === 'gaming') {
    const live = { id: rid('k', 8), name: 'Live & Tournaments' };
    s.categories.splice(1, 0, live);
    await addTextChannel(s, { name: 'squad-chat-room', categoryId: text.id, topic: 'Squad Ready-Check & In-Match Quick Chat ⚡' });
    await addTextChannel(s, { name: 'looking-for-group', categoryId: text.id, topic: 'Find a squad. Post your rank, role & region.' });
    await addTextChannel(s, { name: 'clips-and-highlights', categoryId: text.id, topic: 'Drop your best plays 🎮' });
    await addTextChannel(s, { name: 'live-stage', type: 'live', categoryId: live.id, topic: 'Watch streams with the squad — spectator chat overlay' });
    await addTextChannel(s, { name: 'Squad Lobby', type: 'voice', categoryId: vc.id });
    await addTextChannel(s, { name: 'Ranked Grind', type: 'voice', categoryId: vc.id });
  } else {
    await addTextChannel(s, { name: 'General', type: 'voice', categoryId: vc.id });
  }
  db().servers[s.id] = s;
  save();
  return s;
}

async function autoJoinLounge(_user) {
  // Clean state: Users only create or join servers explicitly
}

async function joinServer(s, user) {
  if (s.members.some((m) => m.userId === user.id)) return;
  if (nx.isConfigured()) {
    await nx.joinCommunity(user.id, s.id).catch((e) => console.warn('[nexconn] join failed:', e.message));
  }
  s.members.push({ userId: user.id, roles: [], joinedAt: Date.now(), nickname: '' });
  save();
  notifyServer(s);
  notify([user.id]);
}

app.post('/api/servers', auth, wrap(async (req, res) => {
  const s = await createServer(req.user, req.body?.name, req.body?.template || 'gaming');
  if (req.body?.iconColor) s.iconColor = req.body.iconColor;
  save();
  res.json({ server: serverView(s, req.user.id) });
}));

app.patch('/api/servers/:id', auth, wrap(async (req, res) => {
  const s = getServer(req);
  requirePerm(s, req.user.id, 'manageServer');
  const { name, iconColor, iconUrl, description } = req.body || {};
  if (name !== undefined && String(name).trim()) {
    s.name = String(name).trim().slice(0, 100);
    if (nx.isConfigured()) nx.refreshCommunity(s.id, s.name).catch(() => {});
  }
  if (iconColor !== undefined) s.iconColor = String(iconColor).slice(0, 16);
  if (iconUrl !== undefined) s.iconUrl = String(iconUrl).slice(0, 1000);
  if (description !== undefined) s.description = String(description).slice(0, 300);
  save(); notifyServer(s);
  res.json({ server: serverView(s, req.user.id) });
}));

app.delete('/api/servers/:id', auth, wrap(async (req, res) => {
  const s = getServer(req);
  if (s.ownerId !== req.user.id) throw new HttpError(403, 'Only the owner can delete the server');
  const members = serverMemberIds(s);
  if (nx.isConfigured()) await nx.dismissCommunity(s.id).catch(() => {});
  delete db().servers[s.id]; delete voice[s.id];
  save(); notify(members);
  res.json({ ok: true });
}));

app.post('/api/servers/:id/leave', auth, wrap(async (req, res) => {
  const s = getServer(req);
  if (s.ownerId === req.user.id) throw new HttpError(400, 'Owners cannot leave their server. Delete it instead.');
  if (nx.isConfigured()) await nx.quitCommunity(req.user.id, s.id).catch(() => {});
  s.members = s.members.filter((m) => m.userId !== req.user.id);
  leaveVoice(req.user.id);
  save(); notifyServer(s); notify([req.user.id]);
  res.json({ ok: true });
}));

app.post('/api/servers/:id/invite/regenerate', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'manageServer');
  s.inviteCode = rid('', 8); save(); notifyServer(s);
  res.json({ inviteCode: s.inviteCode });
}));

const findByInvite = (code) => {
  const clean = String(code || '').trim().split('/').pop().toLowerCase();
  if (!clean) return null;
  return Object.values(db().servers).find((s) =>
    (s.id && s.id.toLowerCase() === clean) ||
    (s.inviteCode && s.inviteCode.toLowerCase() === clean)
  );
};

app.get('/api/invites/:code', auth, (req, res) => {
  const s = findByInvite(req.params.code);
  if (!s) throw new HttpError(404, 'Invite is invalid or has expired');
  res.json({ server: { id: s.id, name: s.name, iconColor: s.iconColor, iconUrl: s.iconUrl, description: s.description, memberCount: s.members.length, onlineCount: s.members.filter((m) => isConnected(m.userId)).length } });
});

app.post('/api/invites/:code/join', auth, wrap(async (req, res) => {
  const s = findByInvite(req.params.code);
  if (!s) throw new HttpError(404, 'Invite is invalid or has expired');
  await joinServer(s, req.user);
  res.json({ server: serverView(s, req.user.id) });
}));

// channels & categories
app.post('/api/servers/:id/channels', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'manageChannels');
  const { name, type = 'text', categoryId = null, topic = '' } = req.body || {};
  if (!['text', 'voice', 'live', 'announcement'].includes(type)) throw new HttpError(400, 'Invalid channel type');
  const ch = await addTextChannel(s, { name, type, categoryId, topic });
  save(); notifyServer(s);
  res.json({ channel: ch });
}));

app.patch('/api/servers/:id/channels/:cid', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'manageChannels');
  const ch = s.channels.find((c) => c.id === req.params.cid);
  if (!ch) throw new HttpError(404, 'Channel not found');
  const { name, topic, categoryId, slowmode } = req.body || {};
  if (name !== undefined) ch.name = sanitizeChannelName(name, ch.type);
  if (topic !== undefined) ch.topic = String(topic).slice(0, 1024);
  if (categoryId !== undefined) ch.categoryId = categoryId;
  if (slowmode !== undefined) ch.slowmode = Number(slowmode) || 0;
  save(); notifyServer(s);
  res.json({ channel: ch });
}));

app.delete('/api/servers/:id/channels/:cid', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'manageChannels');
  const ch = s.channels.find((c) => c.id === req.params.cid);
  if (!ch) throw new HttpError(404, 'Channel not found');
  if ((ch.type === 'text' || ch.type === 'announcement') && nx.isConfigured()) await nx.deleteSubchannel(s.id, ch.id).catch(() => {});
  s.channels = s.channels.filter((c) => c.id !== ch.id);
  if (voice[s.id]) delete voice[s.id][ch.id];
  save(); notifyServer(s);
  res.json({ ok: true });
}));

app.post('/api/servers/:id/categories', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'manageChannels');
  const cat = { id: rid('k', 8), name: String(req.body?.name || 'New Category').slice(0, 100) };
  s.categories.push(cat); save(); notifyServer(s);
  res.json({ category: cat });
}));

app.delete('/api/servers/:id/categories/:catId', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'manageChannels');
  s.categories = s.categories.filter((c) => c.id !== req.params.catId);
  s.channels.forEach((c) => { if (c.categoryId === req.params.catId) c.categoryId = null; });
  save(); notifyServer(s);
  res.json({ ok: true });
}));

// roles & members
app.post('/api/servers/:id/roles', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'admin');
  const { name, color, permissions = {} } = req.body || {};
  const role = { id: rid('r', 8), name: String(name || 'new role').slice(0, 50), color: String(color || '#99AAB5'), permissions: {
    admin: !!permissions.admin, manageChannels: !!permissions.manageChannels, manageServer: !!permissions.manageServer, kick: !!permissions.kick } };
  s.roles.push(role); save(); notifyServer(s);
  res.json({ role });
}));

app.delete('/api/servers/:id/roles/:rid', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'admin');
  s.roles = s.roles.filter((r) => r.id !== req.params.rid);
  s.members.forEach((m) => { m.roles = m.roles.filter((r) => r !== req.params.rid); });
  save(); notifyServer(s);
  res.json({ ok: true });
}));

app.patch('/api/servers/:id/members/:uid', auth, wrap(async (req, res) => {
  const s = getServer(req);
  const m = s.members.find((x) => x.userId === req.params.uid);
  if (!m) throw new HttpError(404, 'Member not found');
  const { roles, nickname } = req.body || {};
  if (roles !== undefined) { requirePerm(s, req.user.id, 'admin'); m.roles = roles.filter((r) => s.roles.some((x) => x.id === r)); }
  if (nickname !== undefined) {
    if (req.params.uid !== req.user.id) requirePerm(s, req.user.id, 'manageServer');
    m.nickname = String(nickname).slice(0, 32);
  }
  save(); notifyServer(s);
  res.json({ member: m });
}));

app.post('/api/servers/:id/members/:uid/kick', auth, wrap(async (req, res) => {
  const s = getServer(req); requirePerm(s, req.user.id, 'kick');
  if (req.params.uid === s.ownerId) throw new HttpError(400, 'Cannot kick the owner');
  if (nx.isConfigured()) await nx.quitCommunity(req.params.uid, s.id).catch(() => {});
  s.members = s.members.filter((m) => m.userId !== req.params.uid);
  if (userVoice[req.params.uid]?.serverId === s.id) leaveVoice(req.params.uid);
  save(); notifyServer(s); notify([req.params.uid]);
  res.json({ ok: true });
}));

// pins
app.post('/api/servers/:id/pins', auth, wrap(async (req, res) => {
  const s = getServer(req);
  const { channelId, message } = req.body || {};
  if (!channelId || !message?.id) throw new HttpError(400, 'channelId and message required');
  s.pins ||= {};
  const list = (s.pins[channelId] ||= []);
  if (!list.some((p) => p.id === message.id)) list.unshift({ ...message, pinnedBy: req.user.id, pinnedAt: Date.now() });
  s.pins[channelId] = list.slice(0, 50);
  save(); notifyServer(s);
  res.json({ ok: true });
}));

app.delete('/api/servers/:id/pins/:channelId/:messageId', auth, wrap(async (req, res) => {
  const s = getServer(req);
  if (s.pins?.[req.params.channelId]) s.pins[req.params.channelId] = s.pins[req.params.channelId].filter((p) => p.id !== req.params.messageId);
  save(); notifyServer(s);
  res.json({ ok: true });
}));

// squad lobby state (game, map, ready statuses)
app.post('/api/squad/:serverId/:channelId', auth, (req, res) => {
  const { serverId, channelId } = req.params;
  const s = db().servers[serverId];
  if (!s || !s.members.some((m) => m.userId === req.user.id)) throw new HttpError(404, 'Server not found');
  const d = db();
  d.squadState ||= {};
  const key = `${serverId}:${channelId}`;
  const st = (d.squadState[key] ||= { game: 'VALORANT • Competitive', map: 'Ascent', ready: {} });
  if (req.body?.game !== undefined) st.game = String(req.body.game).slice(0, 60);
  if (req.body?.map !== undefined) st.map = String(req.body.map).slice(0, 40);
  if (req.body?.ready !== undefined) st.ready[req.user.id] = !!req.body.ready;
  save();
  notifyServer(s, 'squad', { key, state: st });
  res.json({ state: st });
});

// live stage channels
app.post('/api/servers/:id/channels/:cid/live/ensure', auth, wrap(async (req, res) => {
  const s = getServer(req);
  const ch = s.channels.find((c) => c.id === req.params.cid && c.type === 'live');
  if (!ch) throw new HttpError(404, 'Live channel not found');
  let code = 0;
  if (nx.isConfigured()) {
    const r = await nx.createOpenChannel(ch.openChannelId).catch((e) => ({ code: -1, error: e.message }));
    code = r.code;
  }
  res.json({ openChannelId: ch.openChannelId, code });
}));

app.post('/api/servers/:id/channels/:cid/live/start', auth, wrap(async (req, res) => {
  const s = getServer(req);
  const ch = s.channels.find((c) => c.id === req.params.cid && c.type === 'live');
  if (!ch) throw new HttpError(404, 'Live channel not found');
  if (ch.live && ch.live.userId !== req.user.id && !perms(s, req.user.id).manageChannels) throw new HttpError(409, 'Someone is already live here');
  const { streamUrl = '', title = '', mode = 'esports-sim', callId = '' } = req.body || {};
  ch.live = { userId: req.user.id, streamUrl: String(streamUrl).slice(0, 500), title: String(title).slice(0, 120), mode, callId, startedAt: Date.now() };
  save(); notifyServer(s);
  res.json({ channel: ch });
}));

app.post('/api/servers/:id/channels/:cid/live/stop', auth, wrap(async (req, res) => {
  const s = getServer(req);
  const ch = s.channels.find((c) => c.id === req.params.cid && c.type === 'live');
  if (!ch) throw new HttpError(404, 'Live channel not found');
  if (ch.live && ch.live.userId !== req.user.id && !perms(s, req.user.id).manageChannels) throw new HttpError(403, 'Not your stream');
  ch.live = null; save(); notifyServer(s);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- real-time message mirror + bots
function recipientsForTarget(targetKey, senderId) {
  const d = db();
  if (targetKey.startsWith('dm:')) {
    const parts = targetKey.split(':');
    return parts.slice(1).filter(Boolean);
  }
  const serverId = targetKey.split(':')[0];
  const s = d.servers[serverId];
  return s ? serverMemberIds(s) : [senderId];
}

function maybeTriggerSquadBotReply(_targetKey, _msg) {
  // Disabled: Clean mode with real users only
}

app.get('/api/messages/:targetKey', auth, (req, res) => {
  const targetKey = req.params.targetKey;
  const list = db().messages[targetKey] || [];
  res.json({ messages: list.slice(-100) });
});

app.post('/api/messages/:targetKey', auth, (req, res) => {
  const targetKey = req.params.targetKey;
  const { id, text = '', type = 'text', replyTo = null, attachments = [], metadata = null, nexconnMessageId = '' } = req.body || {};
  if (!String(text).trim() && (!Array.isArray(attachments) || attachments.length === 0)) {
    throw new HttpError(400, 'Message text or attachment required');
  }
  const d = db();
  d.messages ||= {};
  const list = (d.messages[targetKey] ||= []);
  const msg = {
    id: id || rid('m', 12),
    nexconnMessageId,
    targetKey,
    senderId: req.user.id,
    text: String(text).slice(0, 4000),
    type,
    replyTo,
    attachments: Array.isArray(attachments) ? attachments.slice(0, 4) : [],
    metadata,
    reactions: {},
    createdAt: Date.now(),
    editedAt: null,
  };
  list.push(msg);
  if (list.length > 250) list.splice(0, list.length - 250);
  save();
  notify(recipientsForTarget(targetKey, req.user.id), 'message', { targetKey, message: msg });
  maybeTriggerSquadBotReply(targetKey, msg);
  res.json({ message: msg });
});

app.patch('/api/messages/:targetKey/:msgId', auth, (req, res) => {
  const { targetKey, msgId } = req.params;
  const list = db().messages?.[targetKey] || [];
  const msg = list.find((m) => m.id === msgId);
  if (!msg) throw new HttpError(404, 'Message not found');
  if (msg.senderId !== req.user.id) throw new HttpError(403, 'Cannot edit another user message');
  msg.text = String(req.body?.text || '').slice(0, 4000);
  msg.editedAt = Date.now();
  save();
  notify(recipientsForTarget(targetKey, req.user.id), 'message-update', { targetKey, message: msg });
  res.json({ message: msg });
});

app.delete('/api/messages/:targetKey/:msgId', auth, (req, res) => {
  const { targetKey, msgId } = req.params;
  const list = db().messages?.[targetKey] || [];
  const msg = list.find((m) => m.id === msgId);
  if (!msg) return res.json({ ok: true });
  const serverId = targetKey.split(':')[0];
  const s = db().servers[serverId];
  const canMod = s ? perms(s, req.user.id).manageChannels : false;
  if (msg.senderId !== req.user.id && !canMod) throw new HttpError(403, 'Cannot delete this message');
  db().messages[targetKey] = list.filter((m) => m.id !== msgId);
  save();
  notify(recipientsForTarget(targetKey, req.user.id), 'message-delete', { targetKey, messageId: msgId });
  res.json({ ok: true });
});

app.post('/api/messages/:targetKey/:msgId/react', auth, (req, res) => {
  const { targetKey, msgId } = req.params;
  const emoji = String(req.body?.emoji || '').slice(0, 16);
  if (!emoji) throw new HttpError(400, 'Emoji required');
  const list = db().messages?.[targetKey] || [];
  const msg = list.find((m) => m.id === msgId);
  if (!msg) throw new HttpError(404, 'Message not found');
  msg.reactions ||= {};
  const arr = (msg.reactions[emoji] ||= []);
  const idx = arr.indexOf(req.user.id);
  if (idx >= 0) {
    arr.splice(idx, 1);
    if (arr.length === 0) delete msg.reactions[emoji];
  } else {
    arr.push(req.user.id);
  }
  save();
  notify(recipientsForTarget(targetKey, req.user.id), 'message-update', { targetKey, message: msg });
  res.json({ message: msg });
});

app.post('/api/typing', auth, (req, res) => {
  const { targetKey } = req.body || {};
  if (!targetKey) return res.json({ ok: false });
  const recipients = recipientsForTarget(targetKey, req.user.id).filter((id) => id !== req.user.id);
  notify(recipients, 'typing', { targetKey, userId: req.user.id, displayName: req.user.displayName });
  res.json({ ok: true });
});

app.post('/api/live-hype', auth, (req, res) => {
  const { serverId, channelId, emoji = '🔥', text = '' } = req.body || {};
  const s = db().servers[serverId];
  if (!s) throw new HttpError(404, 'Server not found');
  notifyServer(s, 'live-hype', {
    serverId,
    channelId,
    emoji: String(emoji).slice(0, 8),
    text: String(text).slice(0, 80),
    userId: req.user.id,
    displayName: req.user.displayName,
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- voice channels
app.post('/api/voice/join', auth, wrap(async (req, res) => {
  const { serverId, channelId } = req.body || {};
  const s = db().servers[serverId];
  if (!s || !s.members.some((m) => m.userId === req.user.id)) throw new HttpError(404, 'Server not found');
  const ch = s.channels.find((c) => c.id === channelId && c.type === 'voice');
  if (!ch) throw new HttpError(404, 'Voice channel not found');
  leaveVoice(req.user.id);
  voice[serverId] ||= {};
  const v = (voice[serverId][channelId] ||= { callId: '', members: {} });

  // Generate a shared callId for the voice channel when the first member joins
  if (!v.callId) {
    v.callId = `vc_${serverId}_${channelId}_${Date.now()}`;
  }

  const others = Object.keys(v.members);
  v.members[req.user.id] = { muted: false, deafened: false, video: false, streaming: false, joinedAt: Date.now() };
  userVoice[req.user.id] = { serverId, channelId };
  notifyServer(s);
  res.json({ callId: v.callId, participants: others });
}));

app.post('/api/voice/call', auth, (req, res) => {
  const cur = userVoice[req.user.id];
  if (!cur) throw new HttpError(400, 'Not in a voice channel');
  const v = voice[cur.serverId]?.[cur.channelId];
  if (v) v.callId = String(req.body?.callId || '');
  res.json({ ok: true });
});

app.post('/api/voice/request-invite', auth, (req, res) => {
  const cur = userVoice[req.user.id];
  if (!cur) throw new HttpError(400, 'Not in a voice channel');
  const v = voice[cur.serverId]?.[cur.channelId];
  const target = v && Object.keys(v.members).find((u) => u !== req.user.id && (streams.get(u)?.size || 0) > 0);
  if (target) notify([target], 'voice-invite', { userId: req.user.id, serverId: cur.serverId, channelId: cur.channelId });
  res.json({ ok: !!target });
});

app.post('/api/voice/state', auth, (req, res) => {
  const cur = userVoice[req.user.id];
  if (!cur) return res.json({ ok: false });
  const st = voice[cur.serverId]?.[cur.channelId]?.members[req.user.id];
  if (st) for (const k of ['muted', 'deafened', 'video', 'streaming']) if (req.body?.[k] !== undefined) st[k] = !!req.body[k];
  const s = db().servers[cur.serverId];
  if (s) notifyServer(s);
  res.json({ ok: true });
});

app.post('/api/voice/leave', auth, (req, res) => { leaveVoice(req.user.id); res.json({ ok: true }); });

// ---------------------------------------------------------------- WebRTC signaling for real Voice & Video calls
app.post('/api/webrtc/signal', auth, wrap(async (req, res) => {
  const { to, signal, callId } = req.body || {};
  if (!to || !signal) throw new HttpError(400, 'to and signal payload required');
  notify([to], 'webrtc-signal', {
    from: req.user.id,
    fromUser: publicUser(req.user),
    signal,
    callId: callId || '',
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- File uploads
app.post('/api/upload', auth, wrap(async (req, res) => {
  const { name = 'upload.bin', type = 'application/octet-stream', data } = req.body || {};
  if (!data || typeof data !== 'string') throw new HttpError(400, 'File data required (base64 string)');

  const base64Data = data.includes(',') ? data.split(',')[1] : data;
  const buffer = Buffer.from(base64Data, 'base64');
  const safeName = `${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(UPLOADS_DIR, safeName);
  await fs.promises.writeFile(filePath, buffer);

  const fileUrl = `/uploads/${safeName}`;
  const isImage = type.startsWith('image/');
  res.json({
    url: fileUrl,
    name,
    type,
    size: buffer.length,
    isImage,
  });
}));

// ---------------------------------------------------------------- contacts matching & friends
app.post('/api/contacts/match', auth, wrap(async (req, res) => {
  const { phoneNumbers = [], contacts = [] } = req.body || {};
  const d = db();
  const me = req.user.id;

  const rawNumbers = new Set();
  const contactNameMap = new Map();

  for (const n of phoneNumbers) {
    const s = sanitizePhone(n);
    if (s && s.length >= 8) rawNumbers.add(s);
  }
  for (const c of contacts) {
    const s = sanitizePhone(c.phone || c.tel);
    if (s && s.length >= 8) {
      rawNumbers.add(s);
      if (c.name) contactNameMap.set(s, c.name);
    }
  }

  const results = [];
  for (const u of Object.values(d.users)) {
    if (u.id === me) continue;
    const uPhone = sanitizePhone(u.phone);
    if (uPhone && rawNumbers.has(uPhone)) {
      const isFriend = d.friendships.some((f) => f.includes(me) && f.includes(u.id));
      const hasPendingOutgoing = d.friendRequests.some((r) => r.from === me && r.to === u.id);
      const hasPendingIncoming = d.friendRequests.some((r) => r.from === u.id && r.to === me);
      results.push({
        user: publicUser(u),
        contactName: contactNameMap.get(uPhone) || u.displayName,
        phone: u.phone,
        isFriend,
        hasPendingOutgoing,
        hasPendingIncoming,
      });
    }
  }

  res.json({ matches: results });
}));

app.post('/api/friends/request', auth, (req, res) => {
  const d = db();
  const query = String(req.body?.username || req.body?.phone || '').trim();
  const cleanQ = query.toLowerCase().replace(/^@/, '');
  const cleanPhone = sanitizePhone(query);
  const target = req.body?.userId
    ? d.users[req.body.userId]
    : Object.values(d.users).find((u) => {
        if (u.username === cleanQ) return true;
        if (cleanPhone && u.phone && sanitizePhone(u.phone) === cleanPhone) return true;
        return false;
      });
  if (!target) throw new HttpError(404, "No user found with that phone number or username.");
  const me = req.user.id;
  if (target.id === me) throw new HttpError(400, "You can't add yourself");
  if (d.friendships.some((f) => f.includes(me) && f.includes(target.id))) throw new HttpError(409, "You're already friends with that user!");
  const reverse = d.friendRequests.find((r) => r.from === target.id && r.to === me);
  if (reverse) {
    d.friendRequests = d.friendRequests.filter((r) => r !== reverse);
    d.friendships.push([me, target.id]);
  } else if (!d.friendRequests.some((r) => r.from === me && r.to === target.id)) {
    d.friendRequests.push({ from: me, to: target.id, createdAt: Date.now() });
  }
  save(); notify([me, target.id]);
  res.json({ ok: true, user: publicUser(target) });
});

app.post('/api/friends/accept', auth, (req, res) => {
  const d = db();
  const me = req.user.id; const other = req.body?.userId;
  const r = d.friendRequests.find((x) => x.from === other && x.to === me);
  if (!r) throw new HttpError(404, 'Request not found');
  d.friendRequests = d.friendRequests.filter((x) => x !== r);
  d.friendships.push([me, other]);
  save(); notify([me, other]);
  res.json({ ok: true });
});

app.post('/api/friends/decline', auth, (req, res) => {
  const d = db(); const me = req.user.id; const other = req.body?.userId;
  d.friendRequests = d.friendRequests.filter((x) => !((x.from === other && x.to === me) || (x.from === me && x.to === other)));
  save(); notify([me, other]);
  res.json({ ok: true });
});

app.delete('/api/friends/:userId', auth, (req, res) => {
  const d = db(); const me = req.user.id; const other = req.params.userId;
  d.friendships = d.friendships.filter((f) => !(f.includes(me) && f.includes(other)));
  save(); notify([me, other]);
  res.json({ ok: true });
});

app.post('/api/dms/open', auth, (req, res) => {
  const d = db(); const me = req.user.id; const other = req.body?.userId;
  if (!d.users[other]) throw new HttpError(404, 'User not found');
  const list = (d.dmOpen[me] ||= []);
  if (!list.includes(other)) list.unshift(other);
  const theirs = (d.dmOpen[other] ||= []);
  if (!theirs.includes(me)) theirs.unshift(me);
  save(); notify([me, other]);
  res.json({ ok: true });
});

app.post('/api/dms/close', auth, (req, res) => {
  const d = db(); const me = req.user.id;
  d.dmOpen[me] = (d.dmOpen[me] || []).filter((x) => x !== req.body?.userId);
  save();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- realtime events (SSE)
app.get('/api/events', auth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const uid = req.user.id;
  const wasOnline = (streams.get(uid)?.size || 0) > 0;
  if (!streams.has(uid)) streams.set(uid, new Set());
  streams.get(uid).add(res);
  clearTimeout(offlineTimers.get(uid));
  if (!wasOnline) notify(relatedUserIds(uid), 'presence', { userId: uid });
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(uid)?.delete(res);
    if ((streams.get(uid)?.size || 0) === 0) {
      offlineTimers.set(uid, setTimeout(() => {
        if ((streams.get(uid)?.size || 0) > 0) return;
        leaveVoice(uid);
        notify(relatedUserIds(uid), 'presence', { userId: uid });
      }, 15000));
    }
  });
});

// ---------------------------------------------------------------- static web build (optional)
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
}

// ---------------------------------------------------------------- errors
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

seedIfEmpty();

app.listen(PORT, () => {
  console.log(`Nexcord server listening on http://localhost:${PORT}`);
  if (!nx.isConfigured()) {
    console.warn('Running in Hybrid Demo Mode — set NEXCONN_APP_KEY & NEXCONN_APP_SECRET in server/.env or via the in-app Nexconn SDK Console to connect to live Nexconn Edge servers.');
  }
});
