/* global FullCalendar, luxon */
const TZ = 'Europe/Paris';
const $ = (id) => document.getElementById(id);
const SCHOOL = { zeus: 'EPITA', emn: 'EM Normandie' };
let key = localStorage.getItem('appKey') || '';
let calendar = null;
let rules = [];
let showHidden = localStorage.getItem('showHidden') === '1';
let forceRefresh = false;

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'x-app-key': key, 'content-type': 'application/json', ...(opts.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) { logout(); throw new Error(body.error || 'Please log in again'); }
  if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
  return body;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 3000);
}

const fmt = (iso, opts) => luxon.DateTime.fromISO(iso).setZone(TZ).setLocale('en-GB').toLocaleString(opts);
function ago(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

// ---------- Login ----------
function logout() {
  localStorage.removeItem('appKey'); key = '';
  $('app').hidden = true; $('login').hidden = false;
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  key = $('pw').value;
  $('loginError').hidden = true;
  const r = await fetch('/api/status', { headers: { 'x-app-key': key } });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    $('loginError').textContent = body.error || 'Wrong password';
    $('loginError').hidden = false;
    return;
  }
  localStorage.setItem('appKey', key);
  start();
});

// ---------- Calendar ----------
function isMobile() { return window.matchMedia('(max-width: 640px)').matches; }

function start() {
  $('login').hidden = true; $('app').hidden = false;
  if (calendar) { calendar.refetchEvents(); return; }
  calendar = new FullCalendar.Calendar($('calendar'), {
    timeZone: TZ,
    locale: 'en-gb',
    firstDay: 1,
    height: '100%',
    initialView: localStorage.getItem('view') || (isMobile() ? 'listWeek' : 'timeGridWeek'),
    headerToolbar: isMobile()
      ? { left: 'prev,next today', center: 'title', right: 'timeGridDay,listWeek,dayGridMonth' }
      : { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay,dayGridMonth,listWeek' },
    buttonText: { today: 'Today', timeGridWeek: 'Week', timeGridDay: 'Day', dayGridMonth: 'Month', listWeek: 'List' },
    slotMinTime: '07:00:00', slotMaxTime: '21:00:00', scrollTime: '08:00:00',
    allDaySlot: false, nowIndicator: true,
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    datesSet: (info) => localStorage.setItem('view', info.view.type),
    events: loadEvents,
    eventClassNames: (arg) => [`ev-${arg.event.extendedProps.source}`, arg.event.extendedProps.hidden ? 'ev-hidden' : ''],
    eventContent: (arg) => {
      const p = arg.event.extendedProps;
      if (arg.view.type.startsWith('list')) {
        return { html: `<b>${esc(arg.event.title)}</b> <span class="ev-meta">· ${SCHOOL[p.source]}${p.location ? ' · ' + esc(p.location) : ''}</span>` };
      }
      if (arg.view.type === 'dayGridMonth') return { html: `<span class="ev-meta">${esc(arg.timeText)}</span> <span class="ev-title">${esc(arg.event.title)}</span>` };
      return { html: `<div class="ev-meta">${esc(arg.timeText)}</div><div class="ev-title">${esc(arg.event.title)}</div>${p.location ? `<div class="ev-meta">${esc(p.location)}</div>` : ''}` };
    },
    eventClick: (info) => { info.jsEvent.preventDefault(); openEvent(info.event); },
  });
  calendar.render();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadEvents(info, success, failure) {
  try {
    const q = new URLSearchParams({
      start: new Date(info.startStr).toISOString(),
      end: new Date(info.endStr).toISOString(),
      ...(showHidden ? { all: '1' } : {}),
      ...(forceRefresh ? { refresh: '1' } : {}),
    });
    forceRefresh = false;
    const data = await api(`/api/events?${q}`);
    rules = data.rules;
    renderStatus(data.status);
    $('hiddenCount').textContent = rules.length;
    success(data.events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, extendedProps: e })));
  } catch (e) {
    toast(e.message); failure(e);
  }
}

function renderStatus(s) {
  const z = $('zeusStatus'), m = $('emnStatus');
  z.textContent = s.zeus.ok ? `· ${ago(s.zeus.fetchedAt)}` : '· not syncing';
  z.className = s.zeus.ok ? '' : 'warn';
  z.title = s.zeus.error || '';
  m.textContent = `· ${ago(s.emn.updatedAt)}`;
  const stale = !s.emn.updatedAt || Date.now() - s.emn.updatedAt > 7 * 864e5;
  m.className = stale ? 'warn' : '';
  m.title = stale ? 'Open MyEMN with the add-on installed to update' : '';
  const msgs = [];
  if (!s.zeus.ok) msgs.push(`EPITA: ${s.zeus.error}.`);
  if (!s.emn.updatedAt) msgs.push('EM Normandie: no data yet. Open your MyEMN timetable with the add-on installed.');
  $('banner').textContent = msgs.join(' ');
  $('banner').hidden = !msgs.length;
}

// ---------- Class details ----------
function openEvent(ev) {
  const p = ev.extendedProps;
  $('evSchool').textContent = SCHOOL[p.source];
  $('evSchool').className = `pill ${p.source}`;
  $('evTitle').textContent = p.title;
  $('evWhen').textContent = `${fmt(p.start, { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmt(p.start, luxon.DateTime.TIME_24_SIMPLE)}–${fmt(p.end, luxon.DateTime.TIME_24_SIMPLE)}`;
  for (const [id, v] of [['evRoom', p.location], ['evTeacher', p.teacher], ['evGroup', p.group]]) {
    $(id).textContent = v || '—';
  }
  $('evDesc').textContent = p.description || '';
  const box = $('evActions');
  box.innerHTML = '';
  if (p.hidden) {
    const matching = rules.filter((r) => matchesRule(p, r));
    addAction(box, 'Show this class again', async () => {
      for (const r of matching) await api(`/api/rules?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      toast(matching.length > 1 ? `Removed ${matching.length} rules` : 'Class shown again');
    });
  } else {
    addAction(box, 'Hide only this one', () => addRule({ type: 'event', value: p.id, source: p.source, label: `${p.title} · ${fmt(p.start, luxon.DateTime.DATETIME_MED)}` }));
    addAction(box, `Hide every “${p.title}”`, () => addRule({ type: 'title', value: p.title, source: p.source, label: p.title }));
    if (p.group) for (const g of p.group.split(/[,;/]\s*/).filter(Boolean)) {
      addAction(box, `Hide everything for group “${g}”`, () => addRule({ type: 'contains', value: g, source: p.source, label: `Group ${g}` }));
    }
  }
  $('eventDialog').showModal();
}

function addAction(box, label, fn) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn'; b.textContent = label;
  b.onclick = async () => {
    b.disabled = true;
    try { await fn(); $('eventDialog').close(); calendar.refetchEvents(); } catch (e) { toast(e.message); }
    b.disabled = false;
  };
  box.append(b);
}

// Mirrors the server-side check so "show again" removes the right rules.
function matchesRule(ev, r) {
  if (r.source !== 'any' && r.source !== ev.source) return false;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (r.type === 'event') return r.value === ev.id;
  if (r.type === 'title') return norm(r.value) === norm(ev.title);
  const re = new RegExp(`(^|[^a-z0-9])${norm(r.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
  return [ev.title, ev.group, ev.description].some((f) => re.test(norm(f)));
}

async function addRule(rule) {
  await api('/api/rules', { method: 'POST', body: JSON.stringify(rule) });
  toast('Hidden. Undo it under “Hidden”.');
}

// ---------- Hidden classes ----------
const RULE_TEXT = { event: 'One class', title: 'All with this title', contains: 'Contains text' };
async function renderRules() {
  rules = await api('/api/rules');
  $('hiddenCount').textContent = rules.length;
  const list = $('ruleList');
  list.innerHTML = rules.length ? '' : '<li class="empty">Nothing hidden yet</li>';
  for (const r of [...rules].reverse()) {
    const li = document.createElement('li');
    const where = r.source === 'any' ? 'Both schools' : SCHOOL[r.source];
    li.innerHTML = `<div>${esc(r.type === 'contains' ? `“${r.value}”` : r.label || r.value)}<small>${RULE_TEXT[r.type]} · ${where}</small></div>`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = 'Show again';
    b.onclick = async () => { await api(`/api/rules?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); renderRules(); calendar.refetchEvents(); };
    li.append(b);
    list.append(li);
  }
}
$('hiddenBtn').onclick = () => { renderRules().catch((e) => toast(e.message)); $('showHidden').checked = showHidden; $('hiddenDialog').showModal(); };
$('addRuleBtn').onclick = async () => {
  const value = $('ruleText').value.trim();
  if (!value) return;
  try {
    await api('/api/rules', { method: 'POST', body: JSON.stringify({ type: 'contains', value, source: $('ruleSource').value }) });
    $('ruleText').value = '';
    renderRules(); calendar.refetchEvents();
  } catch (e) { toast(e.message); }
};
$('ruleText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('addRuleBtn').click(); } });
$('showHidden').onchange = (e) => {
  showHidden = e.target.checked;
  localStorage.setItem('showHidden', showHidden ? '1' : '0');
  calendar.refetchEvents();
};

// ---------- Settings ----------
$('settingsBtn').onclick = async () => {
  $('settingsDialog').showModal();
  try {
    const s = await api('/api/status');
    $('feedUrl').value = `${location.origin}/feed.ics?key=${s.feedToken}`;
    $('siteUrl').value = location.origin;
    $('syncKey').value = s.syncToken;
    const items = [
      `EPITA: ${s.zeus.configured ? (s.zeus.ok ? `${s.zeus.count} classes, updated ${ago(s.zeus.fetchedAt)}` : `problem – ${s.zeus.error}`) : 'Zeus link not set yet'}`,
      `EM Normandie: ${s.emn.count} classes, updated ${ago(s.emn.updatedAt)}`,
      `Storage: ${s.storage === 'redis' ? 'database connected' : s.storage === 'file' ? 'local file (dev mode)' : 'no database – add Upstash Redis'}`,
    ];
    $('statusList').innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join('');
  } catch (e) { toast(e.message); }
};
document.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
  const input = $(b.dataset.copy);
  try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
  toast('Copied');
}));
$('logoutBtn').onclick = () => { $('settingsDialog').close(); logout(); };

$('refreshBtn').onclick = () => { forceRefresh = true; calendar.refetchEvents(); toast('Refreshing…'); };

// Close dialogs when clicking the dark backdrop.
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// Refresh every 15 minutes while the tab is open.
setInterval(() => calendar && document.visibilityState === 'visible' && calendar.refetchEvents(), 15 * 60 * 1000);

if (key) start(); else $('login').hidden = false;
