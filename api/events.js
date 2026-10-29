// GET /api/events?start=ISO&end=ISO[&all=1][&refresh=1] – merged timetable for the website.
import { getCalendar } from '../lib/calendar.js';
import { checkApp, deny } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkApp(req)) return deny(res);
  try {
    const { start, end, all, refresh } = req.query;
    const data = await getCalendar({ start, end, includeHidden: all === '1', force: refresh === '1' });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
