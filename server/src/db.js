// Tiny JSON-file database. Good enough for a hackathon deployment; swap for a real DB later.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');

const empty = () => ({
  users: {},
  sessions: {},
  servers: {},
  friendRequests: [],
  friendships: [],
  dmOpen: {},
  messages: {},
  squadState: {},
});

let data = empty();
try {
  if (fs.existsSync(DB_FILE)) data = { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
} catch (e) {
  console.error('Failed to read DB, starting fresh', e);
}

let timer = null;
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}

export const db = () => data;
