// Nexcord Live In-Memory Telemetry Logger
const MAX_LOGS = 600;
const logs = [];

export function addLog(level, tag, message, details = null) {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    level: level.toLowerCase(), // 'info' | 'warn' | 'error' | 'success'
    tag: tag.toUpperCase(),     // 'AUTH' | 'FAST2SMS' | 'NEXCONN' | 'WEBRTC' | 'API' | 'SYSTEM'
    message: String(message || ''),
    details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : null,
  };

  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.pop();

  const colorPrefix =
    level === 'error' ? '\x1b[31m[ERROR]\x1b[0m' :
    level === 'warn' ? '\x1b[33m[WARN]\x1b[0m' :
    level === 'success' ? '\x1b[32m[SUCCESS]\x1b[0m' :
    '\x1b[36m[INFO]\x1b[0m';

  console.log(`${colorPrefix} [${entry.tag}] ${entry.message}`);
  return entry;
}

export function getLogs({ limit = 300, tag = '', level = '', search = '' } = {}) {
  let list = logs;
  if (tag && tag !== 'ALL') {
    list = list.filter((l) => l.tag.toUpperCase() === tag.toUpperCase());
  }
  if (level && level !== 'ALL') {
    list = list.filter((l) => l.level.toLowerCase() === level.toLowerCase());
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter((l) => l.message.toLowerCase().includes(q) || (l.details && l.details.toLowerCase().includes(q)));
  }
  return list.slice(0, Number(limit) || 300);
}

export function clearLogs() {
  logs.length = 0;
  addLog('info', 'SYSTEM', 'Admin cleared system logs buffer');
  return { ok: true };
}

// Initial boot log
addLog('info', 'SYSTEM', 'Nexcord server telemetry logger initialized');
