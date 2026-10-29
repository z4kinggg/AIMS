// Key-value storage. Uses Upstash Redis on Vercel; falls back to a local JSON file for development.
import { Redis } from '@upstash/redis';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const FILE = process.env.LOCAL_STORE_FILE || path.join(process.cwd(), '.local-store.json');
function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

export const storageKind = redis ? 'redis' : (process.env.VERCEL ? 'missing' : 'file');

export async function get(key, fallback = null) {
  if (redis) {
    const v = await redis.get(key);
    return v == null ? fallback : v;
  }
  const v = readFile()[key];
  return v === undefined ? fallback : v;
}

export async function set(key, value) {
  if (redis) { await redis.set(key, value); return; }
  if (process.env.VERCEL) throw new Error('No database connected. Add Upstash Redis in the Vercel dashboard (see SETUP.md).');
  const all = readFile();
  all[key] = value;
  fs.writeFileSync(FILE, JSON.stringify(all));
}
