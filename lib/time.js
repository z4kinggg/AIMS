// Time helpers. Everything is stored as UTC ISO strings; school times are Paris wall-clock.
export const TZ = 'Europe/Paris';

// Offset (ms) of a time zone from UTC at a given instant.
function tzOffsetMs(utcMs, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// "2026-10-26T09:00:00" (Paris wall time, no zone) -> Date
export function parisWallToDate(y, mo, d, h = 0, mi = 0, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ts = guess - tzOffsetMs(guess);
  // Re-check once in case the guess sat on the other side of a DST change.
  const off2 = tzOffsetMs(ts);
  ts = guess - off2;
  return new Date(ts);
}

// Parse a date value of unknown shape. Strings without a zone are read as Paris time.
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const s = String(v).trim();
  if (/^\d{10,13}$/.test(s)) return parseDate(Number(s));
  // Has explicit zone (Z or +hh:mm)
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s) && /\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return parisWallToDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  // French style 26/10/2026 09:00
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2})[:h](\d{2}))?/);
  if (m) return parisWallToDate(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Combine a date ("2026-10-26") with a time ("09:00") as Paris time.
export function combineDateTime(date, time) {
  const dm = String(date).match(/(\d{4})-(\d{2})-(\d{2})/) || String(date).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const tm = String(time).match(/(\d{1,2})[:h](\d{2})/);
  if (!dm || !tm) return null;
  const [y, mo, d] = dm[1].length === 4 ? [+dm[1], +dm[2], +dm[3]] : [+dm[3], +dm[2], +dm[1]];
  return parisWallToDate(y, mo, d, +tm[1], +tm[2]);
}
