// EM Normandie timetable. MyEMN has no export, so the browser add-on sends us
// the JSON the MyEMN page loads (its `schedule?startDate=…` request).
// The exact field names are not known yet, so this parser tries the common
// shapes. Once a real sample is in hand, it can be tightened.
import * as store from './store.js';
import { parseDate, combineDateTime } from './time.js';

const KEY = 'emn:events';
const RAW_KEY = 'emn:lastRaw';
const RAW_FULL_KEY = 'emn:lastRawWithClasses';

const pick = (o, names) => {
  for (const n of names) {
    const v = n.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
    if (v != null && v !== '') return v;
  }
  return undefined;
};
const text = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  if (typeof v === 'object') return text(pick(v, ['name', 'label', 'libelle', 'title', 'fullName', 'code', 'value']) ?? '');
  return String(v).trim();
};

const START = ['start', 'startDate', 'startDateTime', 'start_date', 'startTime', 'dateDebut', 'debut', 'beginDate', 'begin', 'from', 'dtstart'];
const END = ['end', 'endDate', 'endDateTime', 'end_date', 'endTime', 'dateFin', 'fin', 'to', 'dtend'];
const TITLE = ['title', 'name', 'subject', 'courseName', 'course.name', 'course', 'libelle', 'label', 'summary', 'matiere', 'module', 'activity', 'lesson'];
const ROOM = ['location', 'room', 'rooms', 'roomName', 'roomLabel', 'roomCode', 'salle', 'salles', 'place', 'classroom', 'classrooms', 'lieu', 'locations'];
const ROOM_KEY = /room|salle|classroom|lieu|locat|amphi|local(?!e)|building|batiment/i;
const TEACHER = ['teacher', 'teachers', 'teacherName', 'professor', 'intervenant', 'intervenants', 'speaker', 'enseignant', 'staff'];
const GROUP = ['group', 'groups', 'groupName', 'groupe', 'groupes', 'class', 'promotion', 'section'];
const TYPE = ['type', 'eventType', 'courseType', 'category', 'nature'];

// MyEMN may nest the room deeper or under another name: look through the
// class object for any field whose name looks like a room, and for lists of
// "resources" tagged as rooms.
function findRoom(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 3) return '';
  if (Array.isArray(o)) return o.map(x => findRoom(x, depth + 1)).filter(Boolean).join(', ');
  const tagged = Object.values(o).find(v => Array.isArray(v) && v.some(r => r && typeof r === 'object' && /room|salle|classroom|lieu/i.test(String(r.type || r.kind || r.category || r.resourceType || ''))));
  if (tagged) return tagged.filter(r => /room|salle|classroom|lieu/i.test(String(r.type || r.kind || r.category || r.resourceType || ''))).map(text).filter(Boolean).join(', ');
  for (const [k, v] of Object.entries(o)) {
    if (!ROOM_KEY.test(k) || /id$|^is|^has|count|type$/i.test(k) || v == null || typeof v === 'boolean') continue;
    const t = text(v);
    if (t && t.length < 120) return t;
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') { const t = findRoom(v, depth + 1); if (t) return t; }
  }
  return '';
}

function looksLikeEvent(o) {
  return o && typeof o === 'object' && !Array.isArray(o) && pick(o, START) !== undefined;
}

// Find the list of class objects anywhere inside the response.
function findEventArray(node, depth = 0) {
  if (depth > 6 || node == null) return null;
  if (Array.isArray(node)) {
    if (node.some(looksLikeEvent)) return node.filter(looksLikeEvent);
    const nested = node.flatMap(n => findEventArray(n, depth + 1) || []);
    return nested.length ? nested : null;
  }
  if (typeof node === 'object') {
    const all = [];
    for (const v of Object.values(node)) { const f = findEventArray(v, depth + 1); if (f) all.push(...f); }
    return all.length ? all : null;
  }
  return null;
}

function resolveTime(o, names, dateFallback) {
  const v = pick(o, names);
  if (v == null) return null;
  // A bare "09:00" needs the day from somewhere else.
  if (typeof v === 'string' && /^\d{1,2}[:h]\d{2}/.test(v.trim())) {
    const day = pick(o, ['date', 'day', 'jour']) || dateFallback;
    return day ? combineDateTime(day, v) : null;
  }
  return parseDate(v);
}

export function parseEmn(json) {
  const list = findEventArray(json) || [];
  const out = [];
  for (const o of list) {
    const start = resolveTime(o, START);
    let end = resolveTime(o, END, pick(o, ['date', 'day', 'jour']));
    if (!start) continue;
    if (!end || end <= start) {
      const mins = Number(pick(o, ['duration', 'durationMinutes', 'duree']));
      end = new Date(start.getTime() + (mins > 0 ? mins : 90) * 60000);
    }
    const title = text(pick(o, TITLE)) || 'EM Normandie class';
    const type = text(pick(o, TYPE));
    const rawId = pick(o, ['id', 'uid', 'eventId', 'sessionId', 'uuid']);
    out.push({
      id: `emn:${rawId ?? `${title}:${start.toISOString()}`}`,
      source: 'emn',
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      location: text(pick(o, ROOM)) || findRoom(o),
      teacher: text(pick(o, TEACHER)),
      group: text(pick(o, GROUP)),
      description: [type, text(pick(o, ['description', 'comment', 'commentaire', 'details']))].filter(Boolean).join('\n'),
    });
  }
  // The same class can appear twice in one response; keep one.
  const seen = new Map();
  for (const e of out) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
}

// Range the MyEMN request covered, read from its URL (startDate=…&endDate=…).
export function rangeFromUrl(url) {
  try {
    const u = new URL(url);
    const s = parseDate(u.searchParams.get('startDate') || u.searchParams.get('start') || u.searchParams.get('from'));
    let e = parseDate(u.searchParams.get('endDate') || u.searchParams.get('end') || u.searchParams.get('to'));
    if (s && e && /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get('endDate') || '')) e = new Date(e.getTime() + 864e5); // inclusive end day
    return s && e ? { start: s.toISOString(), end: e.toISOString() } : null;
  } catch { return null; }
}

// Replace what we know about the covered range with the new data
// (so classes that MyEMN cancelled disappear too).
export function mergeEmn(existing, incoming, range) {
  let r = range;
  if (!r && incoming.length) r = { start: incoming[0].start, end: incoming.at(-1).end };
  const kept = r ? existing.filter(e => e.end <= r.start || e.start >= r.end) : existing.filter(e => !incoming.some(n => n.id === e.id));
  return [...kept, ...incoming].sort((a, b) => a.start.localeCompare(b.start));
}

export async function saveEmnPayload({ url, data }) {
  const incoming = parseEmn(data);
  const range = rangeFromUrl(url);
  if (url) {
    const raw = { receivedAt: Date.now(), url, count: incoming.length, sample: JSON.stringify(data).slice(0, 20000) };
    await store.set(RAW_KEY, raw);
    if (incoming.length || JSON.stringify(data).length > 200) await store.set(RAW_FULL_KEY, raw);
  }
  // An empty answer for a range we cannot place would wipe nothing useful; ignore it.
  if (!incoming.length && !range) return { added: 0, total: (await getEmnState()).events.length, warning: 'No classes found in that response' };
  const state = await getEmnState();
  const events = mergeEmn(state.events, incoming, range);
  await store.set(KEY, { updatedAt: Date.now(), events });
  return { added: incoming.length, total: events.length, range };
}

export async function getEmnState() {
  return (await store.get(KEY)) || { updatedAt: null, events: [] };
}
export async function getEmnRaw() {
  return (await store.get(RAW_FULL_KEY)) || store.get(RAW_KEY);
}
