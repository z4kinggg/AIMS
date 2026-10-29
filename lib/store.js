// Key-value storage. On Vercel it finds whatever Redis database is connected,
// whatever names Vercel gave its settings (with or without a prefix).
// Without one, it uses a local JSON file (development only).
import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient } from 'redis';
import fs from 'node:fs';
import path from 'node:path';

// Find an env var by exact name, or by name ending in "_<name>" (custom prefix like STORAGE_KV_REST_API_URL).
function findEnv(names) {
  const keys = Object.keys(process.env);
  for (const n of names) {
    if (process.env[n]) return process.env[n];
    const k = keys.find(k => k.endsWith(`_${n}`) && process.env[k]);
    if (k) return process.env[k];
  }
  return undefined;
}

const restUrl = findEnv(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'REDIS_REST_API_URL']);
const restToken = findEnv(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_REST_API_TOKEN']);
const redisUrl = findEnv(['REDIS_URL', 'KV_URL', 'UPSTASH_REDIS_URL']);

const upstash = restUrl && restToken ? new UpstashRedis({ url: restUrl, token: restToken }) : null;
const kind = upstash ? 'redis' : redisUrl ? 'redis-tcp' : (process.env.VERCEL ? 'missing' : 'file');
export const storageKind = kind === 'redis-tcp' ? 'redis' : kind;

// Names (never values) of settings that look database-related, to help when nothing is found.
export const storageEnvNames = Object.keys(process.env).filter(k => /REDIS|KV_|UPSTASH/i.test(k)).sort();

// Plain Redis connection (REDIS_URL), reused between requests on a warm function.
let tcpClient = null;
async function tcp() {
  if (!tcpClient) {
    tcpClient = createClient({ url: redisUrl, socket: { connectTimeout: 5000 } });
    tcpClient.on('error', () => {});
    await tcpClient.connect();
  }
  return tcpClient;
}

const FILE = process.env.LOCAL_STORE_FILE || path.join(process.cwd(), '.local-store.json');
function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

function missing() {
  const seen = storageEnvNames.length ? ` Found these settings: ${storageEnvNames.join(', ')}.` : ' No database settings found on the server.';
  return new Error(`No database connected.${seen} In Vercel, check the database is connected to this project, then redeploy.`);
}

export async function get(key, fallback = null) {
  if (upstash) {
    const v = await upstash.get(key);
    return v == null ? fallback : v;
  }
  if (kind === 'redis-tcp') {
    const v = await (await tcp()).get(key);
    return v == null ? fallback : JSON.parse(v);
  }
  if (kind === 'missing') return fallback;
  const v = readFile()[key];
  return v === undefined ? fallback : v;
}

export async function set(key, value) {
  if (upstash) { await upstash.set(key, value); return; }
  if (kind === 'redis-tcp') { await (await tcp()).set(key, JSON.stringify(value)); return; }
  if (kind === 'missing') throw missing();
  const all = readFile();
  all[key] = value;
  fs.writeFileSync(FILE, JSON.stringify(all));
}
