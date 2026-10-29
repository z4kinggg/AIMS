// EPITA timetable: fetched from the private Zeus ICS link, cached for 15 minutes.
import ical from 'node-ical';
import * as store from './store.js';

const CACHE_KEY = 'zeus:cache';
const MAX_AGE_MS = 15 * 60 * 1000;

const clean = (s) => (s == null ? '' : String(typeof s === 'object' && 'val' in s ? s.val : s))
  .replace(/\\n/g, '\n').replace(/\\,/g, ',').trim();

export function parseZeusIcs(text) {
  const data = ical.sync.parseICS(text);
  const out = [];
  for (const [uid, ev] of Object.entries(data)) {
    if (ev.type !== 'VEVENT' || !ev.start) continue;
    const start = new Date(ev.start);
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60 * 1000);
    if (isNaN(start) || isNaN(end)) continue;
    const description = clean(ev.description);
    out.push({
      id: `zeus:${ev.uid || uid}:${start.toISOString()}`,
      source: 'zeus',
      title: clean(ev.summary) || 'EPITA class',
      start: start.toISOString(),
      end: end.toISOString(),
      location: clean(ev.location),
      teacher: (description.match(/(?:Intervenant|Teacher|Professeur|Enseignant)s?\s*:\s*(.+)/i) || [])[1]?.trim() || '',
      group: (description.match(/(?:Groupe?s?|Groups?)\s*:\s*(.+)/i) || [])[1]?.trim() || '',
      description,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export async function getZeusEvents({ force = false } = {}) {
  const url = process.env.ZEUS_ICS_URL;
  const cached = await store.get(CACHE_KEY);
  if (!url) return { events: [], status: { ok: false, error: 'ZEUS_ICS_URL is not set' } };
  const fresh = cached && Date.now() - cached.fetchedAt < MAX_AGE_MS;
  if (fresh && !force) return { events: cached.events, status: { ok: true, fetchedAt: cached.fetchedAt, cached: true } };
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'unified-calendar/1.0' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Zeus answered HTTP ${r.status}`);
    const text = await r.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Zeus did not return a calendar file (link expired?)');
    const events = parseZeusIcs(text);
    const entry = { fetchedAt: Date.now(), events };
    await store.set(CACHE_KEY, entry).catch(() => {});
    return { events, status: { ok: true, fetchedAt: entry.fetchedAt, cached: false } };
  } catch (e) {
    // Keep showing the last good copy if Zeus is down.
    return {
      events: cached?.events || [],
      status: { ok: false, error: e.message, fetchedAt: cached?.fetchedAt || null },
    };
  }
}
