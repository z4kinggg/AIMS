// GET /api/feed?key=… (also /feed.ics?key=…) – subscribe from a phone calendar.
import { getCalendar } from '../lib/calendar.js';
import { buildIcs } from '../lib/ics.js';
import { checkFeed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkFeed(req.query.key)) return res.status(401).send('Invalid feed link');
  try {
    // Two months back, a year ahead.
    const start = new Date(Date.now() - 60 * 864e5).toISOString();
    const { events } = await getCalendar({ start });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="school.ics"');
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).send(buildIcs(events));
  } catch (e) {
    res.status(500).send(`Error: ${e.message}`);
  }
}
