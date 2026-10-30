// GET /api/stats – usage numbers, admin only.
import { checkAdmin } from '../lib/auth.js';
import { getStats } from '../lib/stats.js';

export default async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  try { res.setHeader('Cache-Control', 'no-store'); res.status(200).json(await getStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
}
