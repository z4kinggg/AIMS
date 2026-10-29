// The site is public: anyone can view the timetable.
// A server secret (APP_PASSWORD, or ADMIN_PASSWORD if that's the only one set) is
// used to derive the phone-feed and add-on keys, so they keep working unchanged.
// ADMIN_PASSWORD unlocks the admin tools (add-on sync key, hide for everyone).
import crypto from 'node:crypto';

const secret = () => process.env.APP_PASSWORD || process.env.ADMIN_PASSWORD || '';
const derive = (label) => crypto.createHash('sha256').update(`${secret()}:${label}`).digest('hex').slice(0, 32);

export const feedToken = () => derive('feed');
export const syncToken = () => derive('sync');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function configured() { return Boolean(secret()); }

// Viewing is open to everyone.
export function checkApp() { return true; }

export function checkAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  return safeEqual(req.headers['x-admin-key'], process.env.ADMIN_PASSWORD);
}
export const adminRequired = () => Boolean(process.env.ADMIN_PASSWORD);

export function checkSync(req) {
  return configured() && safeEqual(req.headers['x-sync-key'], syncToken());
}
export function checkFeed(key) {
  return configured() && safeEqual(key, feedToken());
}

export function deny(res, msg = 'Not allowed') {
  res.status(configured() ? 401 : 500).json({ error: configured() ? msg : 'Set ADMIN_PASSWORD on the server (see SETUP.md).' });
}
