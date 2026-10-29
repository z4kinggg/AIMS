// POST /api/prefs { id, frenchGroup, rules } – saves one student's choices so their
// phone-feed link (feed.ics?key=…&u=<id>) follows them without being re-added.
import * as store from '../lib/store.js';
import { checkApp, deny } from '../lib/auth.js';
import { FRENCH_GROUPS } from '../public/shared.js';

export const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{8,64}$/.test(id);

export function cleanPrefs(body = {}) {
  const fr = Number(body.frenchGroup);
  const rules = (Array.isArray(body.rules) ? body.rules : []).slice(0, 300)
    .filter(r => r && ['event', 'title', 'contains'].includes(r.type) && r.value)
    .map(r => ({ type: r.type, value: String(r.value).slice(0, 300), source: ['zeus', 'emn'].includes(r.source) ? r.source : 'any' }));
  return { frenchGroup: fr >= 1 && fr <= FRENCH_GROUPS ? fr : null, rules, updatedAt: Date.now() };
}

export default async function handler(req, res) {
  if (!checkApp(req)) return deny(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!validId(body.id)) return res.status(400).json({ error: 'Bad id' });
  try {
    await store.set(`prefs:${body.id}`, cleanPrefs(body));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
