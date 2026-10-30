// Simple usage stats for the admin: who opened the site (by random device id,
// no names) and who uses the phone-calendar link. Kept small: 90 days max.
import * as store from './store.js';

const KEY = 'stats:v1';
const KEEP_DAYS = 90;
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
export const parisDay = (t = Date.now()) => dayFmt.format(new Date(t));
const addDays = (k, n) => { const d = new Date(`${k}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const empty = () => ({ devices: {}, days: {} });

async function update(fn) {
  const s = (await store.get(KEY)) || empty();
  fn(s);
  const oldest = addDays(parisDay(), -KEEP_DAYS);
  for (const d of Object.keys(s.days)) if (d < oldest) delete s.days[d];
  await store.set(KEY, s);
}

function touch(s, id, kind, extra = {}) {
  const now = Date.now(), day = parisDay(now);
  const dev = s.devices[id] || (s.devices[id] = { first: now });
  dev[kind === 'site' ? 'site' : 'feed'] = now;
  Object.assign(dev, extra);
  const d = s.days[day] || (s.days[day] = { site: [], feed: [] });
  if (!d[kind].includes(id)) d[kind].push(id);
}

export const recordVisit = (id, frenchGroup) => update(s => touch(s, id, 'site', { fr: frenchGroup ?? null })).catch(() => {});
export const recordFeed = (id) => update(s => touch(s, id, 'feed')).catch(() => {});

export async function getStats() {
  const s = (await store.get(KEY)) || empty();
  const today = parisDay();
  const uniq = (kind, n) => {
    const set = new Set();
    for (let i = 0; i < n; i++) for (const id of s.days[addDays(today, -i)]?.[kind] || []) set.add(id);
    return set;
  };
  const people = (n) => new Set([...uniq('site', n), ...uniq('feed', n)]).size;
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const k = addDays(today, -i), d = s.days[k] || { site: [], feed: [] };
    daily.push({ day: k, site: d.site.length, feed: d.feed.length, people: new Set([...d.site, ...d.feed]).size });
  }
  const groups = {};
  for (const dev of Object.values(s.devices)) if (dev.site) { const g = dev.fr ? String(dev.fr) : 'none'; groups[g] = (groups[g] || 0) + 1; }
  return {
    today: people(1), week: people(7), month: people(30),
    siteWeek: uniq('site', 7).size,
    feedWeek: uniq('feed', 7).size,
    totalDevices: Object.keys(s.devices).length,
    daily, groups,
  };
}
