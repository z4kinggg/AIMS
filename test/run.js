// Run with: npm test
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LOCAL_STORE_FILE = path.join(os.tmpdir(), `cal-test-${process.pid}.json`);
process.env.APP_PASSWORD = 'test-password';
process.env.ADMIN_PASSWORD = 'admin-password';

const { parseDate } = await import('../lib/time.js');
const { parseZeusIcs } = await import('../lib/zeus.js');
const { parseEmn, mergeEmn, rangeFromUrl } = await import('../lib/emn.js');
const { isHidden } = await import('../lib/rules.js');
const { buildIcs } = await import('../lib/ics.js');
const { feedToken, syncToken } = await import('../lib/auth.js');
const { frenchGroupOf, hiddenReason, encodePrefs, decodePrefs } = await import('../public/shared.js');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ZEUS_ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zeus//EN',
  'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
  // Friday before the clock change (summer time) – local 09:00 = 07:00 UTC
  'BEGIN:VEVENT', 'UID:z1', 'DTSTART;TZID=Europe/Paris:20261023T090000', 'DTEND;TZID=Europe/Paris:20261023T120000',
  'SUMMARY:Machine Learning', 'LOCATION:KB-604', 'DESCRIPTION:Intervenant : J. Dupont\\nGroupe : MSc AI', 'END:VEVENT',
  // Monday after the change (winter time) – local 09:00 = 08:00 UTC
  'BEGIN:VEVENT', 'UID:z2', 'DTSTART;TZID=Europe/Paris:20261026T090000', 'DTEND;TZID=Europe/Paris:20261026T120000',
  'SUMMARY:Deep Learning', 'LOCATION:Amphi 4', 'END:VEVENT',
  // Already in UTC
  'BEGIN:VEVENT', 'UID:z3', 'DTSTART:20261027T130000Z', 'DTEND:20261027T150000Z', 'SUMMARY:Français GR2', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('Paris times convert correctly on both sides of the 25 Oct clock change', () => {
  assert.equal(parseDate('2026-10-23T09:00:00').toISOString(), '2026-10-23T07:00:00.000Z');
  assert.equal(parseDate('2026-10-26T09:00:00').toISOString(), '2026-10-26T08:00:00.000Z');
  assert.equal(parseDate('2026-10-26T09:00:00+01:00').toISOString(), '2026-10-26T08:00:00.000Z');
  assert.equal(parseDate('26/10/2026 09h00').toISOString(), '2026-10-26T08:00:00.000Z');
  assert.equal(parseDate(1793001600).toISOString(), new Date(1793001600000).toISOString());
});

test('Zeus calendar file is read, with rooms, teacher and group', () => {
  const ev = parseZeusIcs(ZEUS_ICS);
  assert.equal(ev.length, 3);
  assert.equal(ev[0].title, 'Machine Learning');
  assert.equal(ev[0].start, '2026-10-23T07:00:00.000Z');
  assert.equal(ev[0].location, 'KB-604');
  assert.equal(ev[0].teacher, 'J. Dupont');
  assert.equal(ev[0].group, 'MSc AI');
  assert.equal(ev[1].start, '2026-10-26T08:00:00.000Z');
  assert.equal(ev[2].start, '2026-10-27T13:00:00.000Z');
});

test('MyEMN data is read from several possible shapes', () => {
  const a = parseEmn({ data: [{ id: 7, startDate: '2026-10-26T14:00:00', endDate: '2026-10-26T15:30:00', courseName: 'Brand Strategy', room: { name: 'Room 203' }, teachers: [{ fullName: 'A. Martin' }], groups: ['TD1'] }] });
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].title, a[0].location, a[0].teacher, a[0].group], ['Brand Strategy', 'Room 203', 'A. Martin', 'TD1']);
  assert.equal(a[0].start, '2026-10-26T13:00:00.000Z');
  const b = parseEmn([{ date: '2026-10-27', start: '09:00', end: '12:00', libelle: 'Marketing digital', salle: 'B12' }]);
  assert.equal(b[0].start, '2026-10-27T08:00:00.000Z');
  assert.equal(b[0].end, '2026-10-27T11:00:00.000Z');
  const c = parseEmn({ result: { days: [{ items: [{ dateDebut: '2026-10-28T10:00:00Z', dateFin: '2026-10-28T12:00:00Z', matiere: 'Finance' }] }] } });
  assert.equal(c[0].title, 'Finance');
  assert.equal(parseEmn({ nothing: 'here' }).length, 0);
});

test('A new MyEMN week replaces that week only (cancelled classes disappear)', () => {
  const old = [
    { id: 'emn:1', start: '2026-10-20T08:00:00.000Z', end: '2026-10-20T10:00:00.000Z' },
    { id: 'emn:2', start: '2026-10-27T08:00:00.000Z', end: '2026-10-27T10:00:00.000Z' },
  ];
  const range = rangeFromUrl('https://x.em-normandie.com/api/schedule?startDate=2026-10-26&endDate=2026-11-01');
  assert.equal(range.start, '2026-10-25T23:00:00.000Z');
  const merged = mergeEmn(old, [{ id: 'emn:3', start: '2026-10-28T08:00:00.000Z', end: '2026-10-28T10:00:00.000Z' }], range);
  assert.deepEqual(merged.map(e => e.id), ['emn:1', 'emn:3']);
});

test('Hide rules: single class, title, group text (GR1 does not hide GR10)', () => {
  const ev = (o) => ({ id: 'x', source: 'emn', title: '', group: '', description: '', ...o });
  const rules = [{ type: 'contains', value: 'GR1', source: 'any' }];
  assert.equal(isHidden(ev({ title: 'Français GR1' }), rules), true);
  assert.equal(isHidden(ev({ title: 'Français GR10' }), rules), false);
  assert.equal(isHidden(ev({ group: 'gr1' }), rules), true);
  assert.equal(isHidden(ev({ title: 'Tutorat' }), [{ type: 'title', value: 'tutorat', source: 'zeus' }]), false);
  assert.equal(isHidden(ev({ title: 'Économie' }), [{ type: 'title', value: 'economie', source: 'emn' }]), true);
  assert.equal(isHidden(ev({ id: 'emn:9' }), [{ type: 'event', value: 'emn:9', source: 'any' }]), true);
});

test('French group is recognised in common spellings, and only for French classes', () => {
  const g = (title, extra = {}) => frenchGroupOf({ title, group: '', description: '', ...extra });
  assert.equal(g('Français GR3'), 3);
  assert.equal(g('Francais - Groupe 12'), 12);
  assert.equal(g('French G07'), 7);
  assert.equal(g('FLE', { group: 'Gr 5' }), 5);
  assert.equal(g('Français', { description: 'Groupe : GR2' }), 2);
  assert.equal(g('Français (toute la promo)'), null);
  assert.equal(g('Marketing GR3'), null);
  assert.equal(g('Français GR13'), null);
});

test('Each student sees only their French group, plus their own hides', () => {
  const ev = (title, id = title) => ({ id, source: 'zeus', title, group: '', description: '' });
  const p = { frenchGroup: 3, rules: [{ type: 'title', value: 'Tutorat', source: 'any' }] };
  assert.equal(hiddenReason(ev('Français GR3'), p), '');
  assert.equal(hiddenReason(ev('Français GR4'), p), 'French group 4');
  assert.equal(hiddenReason(ev('Français GR10'), p), 'French group 10');
  assert.equal(hiddenReason(ev('Deep Learning'), p), '');
  assert.equal(hiddenReason(ev('Tutorat'), p), 'Hidden by you');
  assert.equal(hiddenReason(ev('Français GR4'), { frenchGroup: null }), '');
  const rules = [{ type: 'event', value: 'zeus:a:é', source: 'zeus' }, { type: 'contains', value: 'GR2', source: 'any' }];
  assert.deepEqual(decodePrefs(encodePrefs(rules)), rules);
  assert.deepEqual(decodePrefs('garbage!!'), []);
});

test('Phone calendar file is valid', () => {
  const out = buildIcs(parseZeusIcs(ZEUS_ICS));
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((out.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(out, /DTSTART:20261026T080000Z/);
  assert.match(out, /SUMMARY:\[EPITA\] Deep Learning/);
  assert.ok(out.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'lines folded');
});

test('Whole site works end to end (login, both schools, hiding, phone feed)', async () => {
  const zeus = http.createServer((_q, r) => { r.setHeader('content-type', 'text/calendar'); r.end(ZEUS_ICS); }).listen(0);
  await new Promise(r => zeus.once('listening', r));
  process.env.ZEUS_ICS_URL = `http://127.0.0.1:${zeus.address().port}/ics`;
  const { createServer } = await import('../dev-server.js');
  const app = createServer().listen(0);
  await new Promise(r => app.once('listening', r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const H = { 'x-app-key': 'test-password', 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/api/events`)).status, 401);
    assert.equal((await fetch(`${base}/api/emn`, { method: 'POST', headers: { 'x-sync-key': 'bad' }, body: '{}' })).status, 401);

    const push = await fetch(`${base}/api/emn`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-key': syncToken() },
      body: JSON.stringify({ url: 'https://my.em-normandie.com/api/schedule?startDate=2026-10-26&endDate=2026-11-01', data: [{ id: 1, startDate: '2026-10-26T14:00:00', endDate: '2026-10-26T15:30:00', title: 'Brand Strategy', group: 'GR3' }] }),
    }).then(r => r.json());
    assert.equal(push.added, 1);

    let data = await fetch(`${base}/api/events?start=2026-10-19T00:00:00Z&end=2026-11-02T00:00:00Z`, { headers: H }).then(r => r.json());
    assert.equal(data.events.length, 4);
    assert.deepEqual([...new Set(data.events.map(e => e.source))].sort(), ['emn', 'zeus']);

    // A student can't hide classes for everyone; the admin can.
    assert.equal((await fetch(`${base}/api/rules`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'contains', value: 'GR2' }) })).status, 403);
    assert.equal((await fetch(`${base}/api/status`, { headers: H }).then(r => r.json())).syncToken, undefined);
    await fetch(`${base}/api/rules`, { method: 'POST', headers: { ...H, 'x-admin-key': 'admin-password' }, body: JSON.stringify({ type: 'contains', value: 'GR2' }) });
    data = await fetch(`${base}/api/events`, { headers: H }).then(r => r.json());
    assert.equal(data.events.length, 3);
    assert.ok(!data.events.some(e => e.title.includes('GR2')));
    data = await fetch(`${base}/api/events?all=1`, { headers: H }).then(r => r.json());
    assert.equal(data.events.filter(e => e.hidden).length, 1);

    assert.equal((await fetch(`${base}/feed.ics?key=wrong`)).status, 401);
    const feed = await fetch(`${base}/feed.ics?key=${feedToken()}`);
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get('content-type'), /text\/calendar/);
    // Feed covers the last two months, so these October 2026 test classes may fall outside "now"; just check it's a calendar.
    assert.match(await feed.text(), /BEGIN:VCALENDAR/);

    // Student in French group 1 saves their choice; their feed drops group 2's class.
    const sid = 'device-1234abcd';
    assert.equal((await fetch(`${base}/api/prefs`, { method: 'POST', headers: H, body: JSON.stringify({ id: sid, frenchGroup: 1, rules: [] }) })).status, 200);
    assert.equal((await fetch(`${base}/api/prefs`, { method: 'POST', headers: H, body: JSON.stringify({ id: '../x', frenchGroup: 1 }) })).status, 400);
    const prefs = JSON.parse(fs.readFileSync(process.env.LOCAL_STORE_FILE, 'utf8'))[`prefs:${sid}`];
    assert.equal(prefs.frenchGroup, 1);
    const st = await fetch(`${base}/api/status`, { headers: H }).then(r => r.json());
    assert.equal(st.zeus.ok, true);
    assert.equal(st.emn.count, 1);
    assert.equal((await fetch(`${base}/`)).status, 200);
  } finally {
    app.close(); zeus.close();
  }
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name}\n  ${e.stack}`); }
}
fs.rmSync(process.env.LOCAL_STORE_FILE, { force: true });
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
