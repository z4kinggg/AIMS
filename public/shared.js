// Filtering shared by the website (browser) and the phone feed (server),
// so both always hide exactly the same classes.

export const FRENCH_GROUPS = 12;

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Classes split by French group. Tutorat uses the same group numbers ("GR3 - Tutorat …").
const GROUP_SUBJECT = /(^|[^a-z])(francais|french|fle|tutorat|tutoring)([^a-z]|$)/;
// "GR3", "Gr 03", "Groupe 3", "Group-3", "G3", "FR3"
const GROUP_NUM = /(?:^|[^a-z0-9])(?:groupe?|group|gr|grp|g|fr)\s*[-_.#:]?\s*0?(\d{1,2})(?![0-9])/;

const isGroupSubject = (ev) => GROUP_SUBJECT.test([ev.title, ev.group, ev.description].map(norm).join(' \n '));

// Which French group a class belongs to (1–12), or null if it is not a French or tutorat group class.
export function frenchGroupOf(ev) {
  const fields = [ev.title, ev.group, ev.description].map(norm);
  if (!isGroupSubject(ev)) return null;
  for (const f of fields) {
    const m = f.match(GROUP_NUM);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= FRENCH_GROUPS) return n;
    }
  }
  return null;
}

const parisDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

// Zeus also lists shared blocks for the whole year group, e.g. "Tutorat & French for Fall 26 T1"
// booked in several rooms at once. They have no group number and overlap the group classes.
// Each one gets `sharedSlot`: the groups that have their own class that day. Those students see
// their own class instead; a group with nothing of its own that day keeps the shared block.
// A French class with no group and no group classes at the same time (e.g. an exam) is left alone.
// Run this on whole days, before any date-range filtering.
export function markSharedSlots(events) {
  const grouped = events.map((e) => ({ e, g: frenchGroupOf(e) })).filter((x) => x.g);
  return events.map((e) => {
    if (!isGroupSubject(e) || frenchGroupOf(e)) return e;
    const s = Date.parse(e.start), end = Date.parse(e.end);
    const overlaps = grouped.some(({ e: g }) => Date.parse(g.start) < end && Date.parse(g.end) > s);
    if (!overlaps) return e;
    const day = parisDay(e.start);
    const groups = [...new Set(grouped.filter(({ e: g }) => parisDay(g.start) === day).map((x) => x.g))].sort((a, b) => a - b);
    return { ...e, sharedSlot: groups };
  });
}

export const SHARED_SLOT = 'All groups';

// Personal hide rules: { type: 'event' | 'title' | 'contains', value, source: 'any' | 'zeus' | 'emn' }
export function matchesRule(ev, r) {
  if (r.source && r.source !== 'any' && r.source !== ev.source) return false;
  if (r.type === 'event') return ev.id === r.value;
  if (r.type === 'title') return norm(ev.title) === norm(r.value);
  if (r.type === 'contains') {
    const needle = norm(r.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Whole-word match so "GR1" doesn't also hide "GR10".
    const re = new RegExp(`(^|[^a-z0-9])${needle}($|[^a-z0-9])`);
    return [ev.title, ev.group, ev.description].some((f) => re.test(norm(f)));
  }
  return false;
}

// Why a class is hidden for this student, or '' if it is shown.
export function hiddenReason(ev, { frenchGroup = null, rules = [] } = {}) {
  if (frenchGroup) {
    const g = frenchGroupOf(ev);
    if (g && g !== Number(frenchGroup)) return `Group ${g}`;
    if (!g && Array.isArray(ev.sharedSlot) && ev.sharedSlot.includes(Number(frenchGroup))) return SHARED_SLOT;
  }
  if (rules.some((r) => matchesRule(ev, r))) return 'Hidden by you';
  return '';
}

// Personal settings travel in the phone-feed link as one short parameter.
export function encodePrefs(rules) {
  const compact = rules.map((r) => [r.type[0], r.value, r.source?.[0] || 'a']);
  const json = JSON.stringify(compact);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePrefs(s) {
  if (!s) return [];
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString();
    const T = { e: 'event', t: 'title', c: 'contains' }, S = { a: 'any', z: 'zeus', e: 'emn' };
    return JSON.parse(json).slice(0, 200).map(([t, v, s]) => ({ type: T[t], value: String(v), source: S[s] || 'any' })).filter((r) => r.type);
  } catch { return []; }
}
