// GET /api/feed?key=… (also /feed.ics?key=…) – subscribe from a phone calendar.
import { getCalendar } from '../lib/calendar.js';
import { buildIcs } from '../lib/ics.js';
import { checkFeed } from '../lib/auth.js';
import { hiddenReason, decodePrefs, FRENCH_GROUPS } from '../public/shared.js';
import * as store from '../lib/store.js';
import { validId } from './prefs.js';
import { recordFeed } from '../lib/stats.js';

export default async function handler(req, res) {
  if (!checkFeed(req.query.key)) return res.status(401).send('Invalid feed link');
  try {
    // Two months back, a year ahead.
    const start = new Date(Date.now() - 60 * 864e5).toISOString();
    const { events } = await getCalendar({ start });
    // Personal choices: saved ones (?u=<device id>), or given in the link (?fr=<group>&h=<rules>).
    let prefs = validId(req.query.u) ? await store.get(`prefs:${req.query.u}`) : null;
    if (validId(req.query.u)) await recordFeed(req.query.u);
    if (!prefs) {
      const fr = Number(req.query.fr);
      prefs = { frenchGroup: fr >= 1 && fr <= FRENCH_GROUPS ? fr : null, rules: decodePrefs(req.query.h) };
    }
    const mine = events.filter(e => !hiddenReason(e, prefs));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="school.ics"');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.status(200).send(buildIcs(mine, prefs.frenchGroup ? `EPITA + EM Normandie (French G${prefs.frenchGroup})` : undefined));
  } catch (e) {
    res.status(500).send(`Error: ${e.message}`);
  }
}
