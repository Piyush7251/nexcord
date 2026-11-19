// Minimal Nexconn Platform Chat API client (server-side only — uses the App Secret).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, '..', '.env');

const APP_KEY = () => process.env.NEXCONN_APP_KEY || '';
const APP_SECRET = () => process.env.NEXCONN_APP_SECRET || '';
let currentHost = null;

function hosts() {
  const primary = process.env.NEXCONN_API_HOST || 'api.sg-light-api.com';
  const backup = process.env.NEXCONN_API_HOST_BACKUP || primary.replace(/^api\./, 'api-b.');
  return { primary, backup };
}

export function isConfigured() {
  const k = APP_KEY().trim();
  const s = APP_SECRET().trim();
  return Boolean(k && s && k !== 'your_app_key' && s !== 'your_app_secret');
}

export function getConfig() {
  return {
    appKey: isConfigured() ? APP_KEY() : '',
    areaCode: Number(process.env.NEXCONN_AREA_CODE || 2),
    apiHost: process.env.NEXCONN_API_HOST || 'api.sg-light-api.com',
    configured: isConfigured(),
  };
}

export function setRuntimeConfig({ appKey, appSecret, apiHost, areaCode }) {
  if (appKey !== undefined) process.env.NEXCONN_APP_KEY = String(appKey).trim();
  if (appSecret !== undefined) process.env.NEXCONN_APP_SECRET = String(appSecret).trim();
  if (apiHost !== undefined && String(apiHost).trim()) {
    const cleanHost = String(apiHost).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    process.env.NEXCONN_API_HOST = cleanHost;
    process.env.NEXCONN_API_HOST_BACKUP = cleanHost.replace(/^api\./, 'api-b.');
    currentHost = null;
  }
  if (areaCode !== undefined) process.env.NEXCONN_AREA_CODE = String(Number(areaCode) || 2);

  const envLines = [
    `NEXCONN_APP_KEY=${process.env.NEXCONN_APP_KEY || ''}`,
    `NEXCONN_APP_SECRET=${process.env.NEXCONN_APP_SECRET || ''}`,
    `NEXCONN_API_HOST=${process.env.NEXCONN_API_HOST || 'api.sg-light-api.com'}`,
    `NEXCONN_API_HOST_BACKUP=${process.env.NEXCONN_API_HOST_BACKUP || 'api-b.sg-light-api.com'}`,
    `NEXCONN_AREA_CODE=${process.env.NEXCONN_AREA_CODE || '2'}`,
    `PORT=${process.env.PORT || '3001'}`,
    `CORS_ORIGINS=${process.env.CORS_ORIGINS || '*'}`,
  ];
  try {
    fs.writeFileSync(ENV_FILE, envLines.join('\n') + '\n', 'utf8');
  } catch (e) {
    console.warn('[nexconn] Could not persist .env file:', e.message);
  }
  return getConfig();
}

function signHeaders() {
  const nonce = crypto.randomBytes(8).toString('hex').slice(0, 16);
  const timestamp = String(Date.now());
  const signature = crypto.createHash('sha1').update(APP_SECRET() + nonce + timestamp).digest('hex');
  return {
    'App-Key': APP_KEY(),
    Nonce: nonce,
    Timestamp: timestamp,
    Signature: signature,
    'X-Request-ID': crypto.randomUUID().replace(/-/g, ''),
    'Content-Type': 'application/json',
  };
}

/**
 * POST a JSON body to a Platform Chat API path with domain failover.
 * Returns the parsed JSON ({ code, ... }). code === 0 means success.
 */
export async function callApi(pathUrl, body) {
  if (!isConfigured()) {
    throw new Error('Nexconn credentials are not configured. Set NEXCONN_APP_KEY and NEXCONN_APP_SECRET in server/.env');
  }
  const { primary, backup } = hosts();
  const order = currentHost === backup ? [backup, primary] : [primary, backup];
  let lastErr;
  for (const host of order) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`https://${host}${pathUrl}`, {
        method: 'POST',
        headers: signHeaders(),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { code: res.status, raw: text }; }
      if (res.status >= 500) { lastErr = new Error(`HTTP ${res.status} from ${host}`); currentHost = host === primary ? backup : primary; continue; }
      currentHost = host;
      if (json.code !== 0 && json.code !== 200) {
        console.warn(`[nexconn] ${pathUrl} ->`, JSON.stringify(json));
      }
      return json;
    } catch (e) {
      lastErr = e;
      currentHost = host === primary ? backup : primary;
    }
  }
  throw lastErr || new Error('Nexconn API request failed');
}

export const ok = (r) => r && (r.code === 0 || r.code === 200);

export async function issueToken(userId, name, avatarUrl) {
  const r = await callApi('/v4/auth/access-token/issue', { userId, name: name.slice(0, 64), ...(avatarUrl ? { avatarUrl } : {}) });
  if (!ok(r)) throw new Error(`Token issue failed (code ${r.code})`);
  return r.result?.accessToken || r.token;
}

export const createCommunity = (userId, channelId, name) =>
  callApi('/v4/community-channel/create', { userId, channelId, name: name.slice(0, 64) });

export const createSubchannel = (channelId, subchannelId, isPrivate = false) =>
  callApi('/v4/community-channel/subchannel/create', { channelId, subchannelId, channelVisibility: isPrivate ? 1 : 0 });

export const deleteSubchannel = (channelId, subchannelId) =>
  callApi('/v4/community-channel/subchannel/delete', { channelId, subchannelId });

export const joinCommunity = (userId, channelId) =>
  callApi('/v4/community-channel/join', { userId, channelId });

export const quitCommunity = (userId, channelId) =>
  callApi('/v4/community-channel/leave', { userId, channelId });

export const dismissCommunity = (channelId) =>
  callApi('/v4/community-channel/dismiss', { channelId });

export const refreshCommunity = (channelId, name) =>
  callApi('/v4/community-channel/update', { channelId, name: name.slice(0, 64) });

export const createOpenChannel = (channelId) =>
  callApi('/v4/open-channel/create', { channelId, destroyType: 0, ttlMinutes: 10080 });
