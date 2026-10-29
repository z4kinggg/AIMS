// Filtering shared by the website (browser) and the phone feed (server),
// so both always hide exactly the same classes.

export const FRENCH_GROUPS = 12;

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const FRENCH_WORD = /(^|[^a-z])(francais|french|fle)([^a-z]|$)/;
// "GR3", "Gr 03", "Groupe 3", "Group-3", "G3", "FR3"
const GROUP_NUM = /(?:^|[^a-z0-9])(?:groupe?|group|gr|grp|g|fr)\s*[-_.#:]?\s*0?(\d{1,2})(?![0-9])/;

// Which French group a class belongs to (1–12), or null if it is not a French group class.
export function frenchGroupOf(ev) {
  const fields = [ev.title, ev.group, ev.description].map(norm);
  const all = fields.join(' \n ');
  if (!FRENCH_WORD.test(all)) return null;
  for (const f of fields) {
    const m = f.match(GROUP_NUM);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= FRENCH_GROUPS) return n;
    }
  }
  return null;
}

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
    if (g && g !== Number(frenchGroup)) return `French group ${g}`;
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
