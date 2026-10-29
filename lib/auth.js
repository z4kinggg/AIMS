// One secret (APP_PASSWORD) protects the site. Separate tokens for the
// phone feed and the browser add-on are derived from it, so leaking one
// of those links never reveals the password.
import crypto from 'node:crypto';

const derive = (label) =>
  crypto.createHash('sha256').update(`${process.env.APP_PASSWORD || ''}:${label}`).digest('hex').slice(0, 32);

export const feedToken = () => derive('feed');
export const syncToken = () => derive('sync');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function configured() { return Boolean(process.env.APP_PASSWORD); }

export function checkApp(req) {
  return configured() && safeEqual(req.headers['x-app-key'], process.env.APP_PASSWORD);
}
export function checkSync(req) {
  return configured() && safeEqual(req.headers['x-sync-key'], syncToken());
}
export function checkFeed(key) {
  return configured() && safeEqual(key, feedToken());
}

export function deny(res, msg = 'Wrong or missing password') {
  res.status(configured() ? 401 : 500).json({ error: configured() ? msg : 'APP_PASSWORD is not set on the server (see SETUP.md).' });
}
