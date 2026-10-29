// Builds the combined .ics feed for phone calendars (Apple, Google, Outlook).
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Lines longer than 75 bytes must be folded (RFC 5545).
function fold(line) {
  const bytes = Buffer.from(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(events, name = 'EPITA + EM Normandie') {
  const now = stamp(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//unified-calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Europe/Paris',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    const school = e.source === 'zeus' ? 'EPITA' : 'EM Normandie';
    const desc = [school, e.teacher && `Teacher: ${e.teacher}`, e.group && `Group: ${e.group}`, e.description].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${esc(e.id.replace(/[^\w.:@-]/g, '_'))}@unified-calendar`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(`[${school === 'EPITA' ? 'EPITA' : 'EMN'}] ${e.title}`)}`,
      e.location ? `LOCATION:${esc(e.location)}` : null,
      `DESCRIPTION:${esc(desc)}`,
      `CATEGORIES:${school}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}
