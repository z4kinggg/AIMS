import { FRENCH_GROUPS, hiddenReason, matchesRule, frenchGroupOf } from './shared.js';

const TZ = 'Europe/Paris';
const SCHOOL = { zeus: 'EPITA', emn: 'EM Normandie' };
const LOGO = { zeus: '/logos/epita.webp', emn: '/logos/emn.webp' };
const logo = (src, cls = '') => `<img class="logo-img ${src} ${cls}" src="${LOGO[src]}" alt="" width="${src === 'zeus' ? 30 : 20}" height="20" decoding="async">`;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Saved on this device ----------
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const state = {
  adminKey: ls.get('adminKey', ''),
  deviceId: ls.get('deviceId') || (() => { const id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).toLowerCase(); ls.set('deviceId', id); return id; })(),
  frenchGroup: ls.get('frenchGroup'), // number 1–12, 0 = no French, null = not chosen yet
  myRules: ls.get('myRules', []),
  showHidden: ls.get('showHidden', false),
  tab: ls.get('tab') || (matchMedia('(min-width: 960px)').matches ? 'week' : 'day'),
  selected: null,
  weeks: new Map(),
  status: null,
  globalRules: [],
};
const prefs = () => ({ frenchGroup: state.frenchGroup || null, rules: state.myRules });

// ---------- Paris dates ----------
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayKey = (d) => keyFmt.format(new Date(d));
const hhmm = (d) => timeFmt.format(new Date(d));
const keyDate = (k) => new Date(`${k}T00:00:00Z`);
const addDays = (k, n) => { const d = keyDate(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (k) => (keyDate(k).getUTCDay() + 6) % 7; // Monday = 0
const weekStart = (k) => addDays(k, -dow(k));
const fmtKey = (k, o) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(keyDate(k));
const today = () => dayKey(Date.now());
function duration(ms) {
  const m = Math.round(ms / 60000), h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h${r ? String(r).padStart(2, '0') : ''}` : `${r} min`;
}
function ago(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

// ---------- Server ----------
async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'x-admin-key': state.adminKey, 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
  return body;
}

async function loadWeek(ws, { force = false } = {}) {
  if (!force && state.weeks.has(ws)) return state.weeks.get(ws);
  // A day either side, so no class is lost to time-zone edges.
  const q = new URLSearchParams({ start: `${addDays(ws, -1)}T00:00:00Z`, end: `${addDays(ws, 8)}T00:00:00Z`, ...(force ? { refresh: '1' } : {}) });
  const p = api(`/api/events?${q}`).then((data) => {
    state.globalRules = data.rules || [];
    renderBanner(data.status);
    const byDay = new Map();
    for (const e of data.events) {
      const k = dayKey(e.start);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(e);
    }
    return { byDay, loadedAt: Date.now() };
  });
  state.weeks.set(ws, p);
  p.catch(() => state.weeks.delete(ws));
  return p;
}

let prefsTimer, pendingVisit = false, lastVisitDay = null;
// Saves this device's choices on the server. visit=true also counts an
// anonymous "opened the site today" for the admin's usage numbers.
function savePrefs(visit = false) {
  ls.set('frenchGroup', state.frenchGroup);
  ls.set('myRules', state.myRules);
  if (visit) { pendingVisit = true; lastVisitDay = today(); }
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    const v = pendingVisit; pendingVisit = false;
    api('/api/prefs', { method: 'POST', body: JSON.stringify({ id: state.deviceId, ...prefs(), visit: v }) }).catch(() => {});
  }, 300);
}

// Classes for one day, after this student's filters.
function eventsFor(week, k) {
  const list = (week.byDay.get(k) || []).map((e) => ({ ...e, reason: hiddenReason(e, prefs()) }));
  return list.filter((e) => state.showHidden || !e.reason).sort((a, b) => a.start.localeCompare(b.start));
}

// ---------- Screens ----------
function show(id) {
  for (const s of ['onboard', 'app']) $(s).hidden = s !== id;
}

function lockAdmin() {
  ls.del('adminKey'); state.adminKey = '';
  refreshStatus();
}

function groupButtons(container, onPick, small = false) {
  container.innerHTML = '';
  for (let g = 1; g <= FRENCH_GROUPS; g++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'group-btn';
    b.setAttribute('aria-pressed', String(state.frenchGroup === g));
    b.setAttribute('aria-label', `French group ${g}`);
    b.innerHTML = small ? String(g) : `<span><small>Group</small>${g}</span>`;
    b.onclick = () => onPick(g);
    container.append(b);
  }
}

function boot() {
  if (state.frenchGroup == null) {
    show('onboard');
    groupButtons($('onboardGroups'), (g) => { state.frenchGroup = g; savePrefs(); startApp(); });
    $('skipGroup').onclick = () => { state.frenchGroup = 0; savePrefs(); startApp(); };
    return;
  }
  startApp();
}

function startApp() {
  show('app');
  state.selected = state.selected || today();
  savePrefs(true); // keeps the phone feed in step with this device, and counts the visit
  setTab(state.tab);
  refreshStatus();
}

// ---------- Header (month + week strip) ----------
async function renderHeader() {
  const sel = state.selected, ws = weekStart(sel);
  $('monthLabel').textContent = fmtKey(sel, { month: 'long', year: 'numeric' });
  $('weekStrip').classList.toggle('week-mode', state.tab === 'week');
  const days = $('days');
  days.innerHTML = '';
  let week = null;
  try { week = await loadWeek(ws); } catch {}
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i);
    const evs = week ? eventsFor({ byDay: week.byDay }, k).filter((e) => !e.reason) : [];
    const sources = [...new Set(evs.map((e) => e.source))];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day-chip' + (k === today() ? ' today' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(k === sel));
    b.setAttribute('aria-label', `${fmtKey(k, { weekday: 'long', day: 'numeric', month: 'long' })}, ${evs.length} classes`);
    b.innerHTML = `<span class="dow">${fmtKey(k, { weekday: 'short' }).slice(0, 3)}</span><span class="num">${fmtKey(k, { day: 'numeric' })}</span><span class="dots">${sources.map((s) => `<i class="${s}"></i>`).join('')}</span>`;
    b.onclick = () => { state.selected = k; if (state.tab !== 'day') setTab('day'); else render(); };
    days.append(b);
  }
}

$('prevWeek').onclick = () => moveWeek(-1);
$('nextWeek').onclick = () => moveWeek(1);
$('todayBtn').onclick = () => { state.selected = today(); if (state.tab === 'me') setTab('day'); else render(); };
$('monthLabel').onclick = $('todayBtn').onclick;
$('refreshBtn').onclick = async () => {
  const b = $('refreshBtn'); b.classList.add('spin');
  state.weeks.clear();
  try { await loadWeek(weekStart(state.selected), { force: true }); render(); toast('Up to date'); }
  catch (e) { toast(e.message); }
  b.classList.remove('spin');
};
function moveWeek(n) { state.selected = addDays(state.selected, 7 * n); render(); }
function moveDay(n) { state.selected = addDays(state.selected, n); render(); }

// Swipe left/right to change day (Day) or week (Week).
let touch = null;
$('view').addEventListener('touchstart', (e) => { if (e.touches.length === 1) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }, { passive: true });
$('view').addEventListener('touchend', (e) => {
  if (!touch || state.tab === 'me') return;
  const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && Date.now() - touch.t < 600) (state.tab === 'day' ? moveDay : moveWeek)(dx < 0 ? 1 : -1);
  touch = null;
}, { passive: true });

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => setTab(t.dataset.tab)));
function setTab(tab) {
  state.tab = tab; ls.set('tab', tab);
  document.querySelectorAll('.tab').forEach((t) => (t.dataset.tab === tab ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  window.scrollTo({ top: 0 });
  render();
}

function render() {
  $('weekStrip').hidden = state.tab === 'me';
  $('todayBtn').hidden = state.tab === 'me';
  $('refreshBtn').hidden = state.tab === 'me';
  $('view').classList.toggle('wide', state.tab === 'week');
  if (state.tab === 'me') { $('monthLabel').textContent = 'Me'; renderMe(); return; }
  renderHeader();
  (state.tab === 'day' ? renderDay : renderWeek)();
  // Load the next and previous weeks in the background so swiping feels instant.
  const ws = weekStart(state.selected);
  loadWeek(addDays(ws, 7)).catch(() => {}); loadWeek(addDays(ws, -7)).catch(() => {});
}

const ICON = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pinF: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  personF: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  group: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.7.8 3 2.6 3.5 5.2"/></svg>',
};

let cardEvents = new Map();
function card(e) {
  cardEvents.set(e.id, e);
  const now = Date.now(), s = Date.parse(e.start), en = Date.parse(e.end);
  const live = now >= s && now < en, past = now >= en;
  const progress = live ? Math.round(((now - s) / (en - s)) * 100) : 0;
  const tag = e.reason ? `<span class="tag">${esc(e.reason)}</span>` : live ? '<span class="now-badge">Now</span>' : '';
  return `<button type="button" class="card ${e.source}${live ? ' now' : ''}${past ? ' past' : ''}${e.reason ? ' hidden-ev' : ''}" data-id="${esc(e.id)}">
    <div class="time"><b>${hhmm(e.start)}</b><span>${hhmm(e.end)}</span></div>
    <div class="body">
      <div class="school">${logo(e.source)}<span>${SCHOOL[e.source]}</span> ${tag}</div>
      <div class="title">${esc(e.title)}</div>
      <div class="meta">${e.location ? `<span>${ICON.pin}${esc(e.location)}</span>` : ''}${e.teacher ? `<span>${ICON.person}${esc(e.teacher)}</span>` : ''}</div>
    </div>
    ${live ? `<div class="progress" style="width:${progress}%"></div>` : ''}
  </button>`;
}
function bindCards() {
  $('view').querySelectorAll('.card').forEach((c) => (c.onclick = () => openEvent(cardEvents.get(c.dataset.id))));
}
const skeleton = () => `<div class="list">${'<div class="skeleton"></div>'.repeat(3)}</div>`;

async function renderDay() {
  const k = state.selected, view = $('view');
  view.innerHTML = skeleton();
  let week;
  try { week = await loadWeek(weekStart(k)); } catch (e) { view.innerHTML = errorBox(e); return; }
  if (state.tab !== 'day' || state.selected !== k) return;
  const evs = eventsFor(week, k), shown = evs.filter((e) => !e.reason);
  cardEvents = new Map();
  const label = k === today() ? 'Today' : k === addDays(today(), 1) ? 'Tomorrow' : fmtKey(k, { weekday: 'long' });
  const sum = shown.length ? `${shown.length} class${shown.length > 1 ? 'es' : ''} · ${hhmm(shown[0].start)}–${hhmm(shown.reduce((m, e) => (e.end > m ? e.end : m), shown[0].end))}` : '';
  let html = `<div class="day-head"><h2>${label}, ${fmtKey(k, { day: 'numeric', month: 'long' })}</h2><span class="sum">${sum}</span></div>`;
  if (!evs.length) {
    html += `<div class="empty"><div class="big">☀️</div><b>No classes</b>${dow(k) >= 5 ? 'Enjoy the weekend.' : 'Nothing scheduled this day.'}</div>`;
  } else {
    html += '<div class="list">';
    evs.forEach((e, i) => {
      const prev = evs[i - 1];
      if (prev && !prev.reason && !e.reason) {
        const gap = Date.parse(e.start) - Date.parse(prev.end);
        if (gap >= 30 * 60000) html += `<div class="gap">Break · ${duration(gap)}</div>`;
      }
      html += card(e);
    });
    html += '</div>';
  }
  view.innerHTML = html;
  bindCards();
}

async function renderWeek() {
  const ws = weekStart(state.selected), view = $('view');
  view.innerHTML = skeleton();
  let week;
  try { week = await loadWeek(ws); } catch (e) { view.innerHTML = errorBox(e); return; }
  if (state.tab !== 'week' || weekStart(state.selected) !== ws) return;
  cardEvents = new Map();
  const sunday = addDays(ws, 6);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i)).filter((k) => k !== sunday || eventsFor(week, k).length);
  const total = days.reduce((n, k) => n + eventsFor(week, k).filter((e) => !e.reason).length, 0);
  let html = `<div class="day-head"><h2>Week of ${fmtKey(ws, { day: 'numeric', month: 'long' })}</h2><span class="sum">${total} classes</span></div>`;
  html += `<div class="week" style="--cols:${days.length}">`;
  for (const k of days) {
    const evs = eventsFor(week, k);
    html += `<section class="week-day${k === today() ? ' is-today' : ''}"><h3>${fmtKey(k, { weekday: 'long' })} <small>${fmtKey(k, { day: 'numeric', month: 'short' })}</small></h3>
      ${evs.length ? `<div class="list">${evs.map(card).join('')}</div>` : '<div class="none">No classes</div>'}</section>`;
  }
  view.innerHTML = html + '</div>';
  bindCards();
}

const errorBox = (e) => `<div class="empty"><div class="big">⚠️</div><b>Couldn't load classes</b>${esc(e.message)}<br><button class="btn small" style="margin-top:14px" onclick="location.reload()">Try again</button></div>`;

function renderBanner(s) {
  if (!s) return;
  const msgs = [];
  if (!s.zeus.ok) msgs.push(`EPITA classes aren't updating right now (${s.zeus.error}).`);
  if (!s.emn.updatedAt) msgs.push('EM Normandie classes haven\'t been added yet.');
  else if (Date.now() - s.emn.updatedAt > 10 * 864e5) msgs.push(`EM Normandie classes were last updated ${ago(s.emn.updatedAt)} and may be out of date.`);
  $('banner').textContent = msgs.join(' ');
  $('banner').hidden = !msgs.length;
}

// ---------- Class details sheet ----------
function openEvent(e) {
  if (!e) return;
  const fg = frenchGroupOf(e);
  const when = `${fmtKey(dayKey(e.start), { weekday: 'long', day: 'numeric', month: 'long' })}`;
  let html = `<div class="sheet-school">${logo(e.source, 'lg')}<span class="pill ${e.source}">${SCHOOL[e.source]}</span></div><h2 id="sheetTitle">${esc(e.title)}</h2>
    <div class="facts">
      <div class="fact">${ICON.clock}<div>${hhmm(e.start)} – ${hhmm(e.end)} <small>${when} · ${duration(Date.parse(e.end) - Date.parse(e.start))}</small></div></div>
      ${e.location ? `<div class="fact">${ICON.pinF}<div>${esc(e.location)}<small>Room</small></div></div>` : ''}
      ${e.teacher ? `<div class="fact">${ICON.personF}<div>${esc(e.teacher)}<small>Teacher</small></div></div>` : ''}
      ${e.group || fg ? `<div class="fact">${ICON.group}<div>${esc(e.group || `French group ${fg}`)}<small>Group</small></div></div>` : ''}
    </div>
    ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}`;
  const actions = [];
  if (e.reason && e.reason.startsWith('French')) {
    html += `<div class="note">This is French group ${fg}. You're in group ${state.frenchGroup}.</div>`;
    actions.push(['Change my French group', () => { closeSheet(); setTab('me'); }]);
  } else if (e.reason) {
    actions.push(['Show this class again', () => {
      const before = state.myRules;
      state.myRules = state.myRules.filter((r) => !matchesRule(e, r));
      savePrefs(); closeSheet(); render();
      toast('Shown again', () => { state.myRules = before; savePrefs(); render(); });
    }]);
  } else {
    actions.push(['Hide this class for me', () => hideForMe({ type: 'event', value: e.id, source: e.source, label: `${e.title} · ${fmtKey(dayKey(e.start), { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(e.start)}` })]);
    actions.push([`Hide every “${e.title}” for me`, () => hideForMe({ type: 'title', value: e.title, source: e.source, label: e.title })]);
    if (state.status?.admin) actions.push([`Hide “${e.title}” for everyone`, async () => {
      try { await api('/api/rules', { method: 'POST', body: JSON.stringify({ type: 'title', value: e.title, source: e.source, label: e.title }) }); state.weeks.clear(); closeSheet(); render(); toast('Hidden for everyone'); }
      catch (err) { toast(err.message); }
    }, 'ghost']);
  }
  html += '<div class="actions" id="sheetActions"></div><button type="button" class="btn ghost block" id="sheetClose">Close</button>';
  $('sheetBody').innerHTML = html;
  for (const [label, fn, cls] of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `btn ${cls || ''}`; b.textContent = label; b.onclick = fn;
    $('sheetActions').append(b);
  }
  $('sheetClose').onclick = closeSheet;
  $('sheet').showModal();
}
function closeSheet() { $('sheet').close(); }
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });

function hideForMe(rule) {
  const before = state.myRules;
  state.myRules = [...state.myRules, { ...rule, id: String(Date.now()) }];
  savePrefs(); closeSheet(); render();
  toast('Hidden for you', () => { state.myRules = before; savePrefs(); render(); });
}

// ---------- Me ----------
async function refreshStatus() {
  try { state.status = await api('/api/status'); } catch {}
  if (state.tab === 'me') renderMe();
}

function renderMe() {
  const s = state.status;
  const feed = s ? `${location.origin}/feed.ics?key=${s.feedToken}&u=${state.deviceId}` : '';
  const webcal = feed.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const rules = state.myRules;
  const view = $('view');
  view.innerHTML = `
    <section class="section">
      <h2>French group</h2>
      <p class="muted">${state.frenchGroup ? `You see French classes for group ${state.frenchGroup} only.` : 'You see no French group filter.'}</p>
      <div class="group-grid small" id="meGroups"></div>
      <button class="btn ghost block" id="noFrench" type="button" aria-pressed="${state.frenchGroup === 0}">${state.frenchGroup === 0 ? '✓ ' : ''}I don't have French classes</button>
    </section>

    <section class="section">
      <h2>Phone calendar</h2>
      <p class="muted">Add your timetable to your phone's calendar. It updates on its own and follows your group and hidden classes.</p>
      ${s ? `<div class="actions">
        <a class="btn primary" href="${esc(webcal)}">Add to iPhone / Mac Calendar</a>
        <a class="btn" href="${esc(google)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      </div>
      <details class="help"><summary>Copy the link instead</summary>
        <div class="copy-row" style="margin-top:10px"><input id="feedUrl" readonly value="${esc(feed)}" aria-label="Calendar link"><button class="btn small" type="button" data-copy="feedUrl">Copy</button></div>
        <ol><li><b>iPhone:</b> Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar.</li>
        <li><b>Google:</b> on a computer, calendar.google.com → Other calendars + → From URL. Google refreshes every few hours.</li>
        <li><b>Outlook:</b> Add calendar → Subscribe from web.</li></ol>
      </details>` : '<p class="muted">Loading…</p>'}
    </section>

    <section class="section">
      <h2>Hidden by you</h2>
      <div class="rows" id="myRules">
        ${rules.length ? rules.map((r, i) => `<div class="rowi"><div class="t">${esc(r.label || r.value)}<small>${r.type === 'event' ? 'One class' : 'Every class with this name'} · ${SCHOOL[r.source] || 'Both schools'}</small></div><button class="btn small" type="button" data-unhide="${i}">Show</button></div>`).join('')
          : '<p class="muted" style="margin:0">Nothing yet. Tap any class to hide it.</p>'}
      </div>
      <div class="rowi"><div class="t">Show hidden classes<small>Faded, so you can bring them back</small></div>
        <label class="switch"><input type="checkbox" id="showHidden" ${state.showHidden ? 'checked' : ''} aria-label="Show hidden classes"><span></span></label></div>
    </section>

    <section class="section">
      <h2>Updates</h2>
      <div class="rows">${s ? `
        <div class="rowi"><div class="t"><div class="brand-row">${logo('zeus')}<span class="status-dot ${s.zeus.ok ? '' : 'warn'}"></span>EPITA</div><small>${s.zeus.ok ? `${s.zeus.count} classes · updated ${ago(s.zeus.fetchedAt)}` : esc(s.zeus.error || 'Not set up')}</small></div></div>
        <div class="rowi"><div class="t"><div class="brand-row">${logo('emn')}<span class="status-dot ${s.emn.updatedAt && Date.now() - s.emn.updatedAt < 10 * 864e5 ? '' : 'warn'}"></span>EM Normandie</div><small>${s.emn.count} classes · updated ${ago(s.emn.updatedAt)}</small></div></div>` : '<p class="muted">Loading…</p>'}
      </div>
    </section>

    ${adminSection(s)}

    <section class="section">
      <h2>Install</h2>
      <p class="muted" style="margin:0">On iPhone, tap Share → <b>Add to Home Screen</b> to open this like an app. On Android, use the browser menu → <b>Install app</b>.</p>
      ${s?.admin ? '<button class="btn danger block" id="lockBtn" type="button">Lock admin on this device</button>' : ''}
    </section>`;

  groupButtons($('meGroups'), (g) => {
    state.frenchGroup = g; savePrefs(); renderMe(); toast(`French group ${g} saved`);
  }, true);
  $('noFrench').onclick = () => { state.frenchGroup = 0; savePrefs(); renderMe(); toast('French filter off'); };
  view.querySelectorAll('[data-unhide]').forEach((b) => (b.onclick = () => {
    state.myRules = state.myRules.filter((_, i) => i !== Number(b.dataset.unhide)); savePrefs(); renderMe();
  }));
  $('showHidden').onchange = (e) => { state.showHidden = e.target.checked; ls.set('showHidden', state.showHidden); };
  if ($('lockBtn')) $('lockBtn').onclick = () => { lockAdmin(); toast('Admin locked'); };
  view.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
    const input = $(b.dataset.copy);
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    toast('Copied');
  }));
  const unlock = $('adminUnlock');
  if (unlock) unlock.onclick = async () => {
    state.adminKey = $('adminPw').value;
    await refreshStatus();
    if (state.status?.admin) { ls.set('adminKey', state.adminKey); toast('Admin unlocked'); }
    else { state.adminKey = ''; toast('Wrong admin password'); }
  };
  if ($('usage')) loadUsage();
  const sample = $('copySample');
  if (sample) sample.onclick = async () => {
    try {
      const r = await api('/api/status?raw=1');
      if (!r.emnSample) return toast('No MyEMN data received yet');
      const txt = r.emnSample;
      try { await navigator.clipboard.writeText(txt); toast('Sample copied, paste it in the chat'); }
      catch { $('view').insertAdjacentHTML('beforeend', `<textarea readonly style="width:100%;height:200px">${esc(txt)}</textarea>`); }
    } catch (e) { toast(e.message); }
  };
  view.querySelectorAll('[data-global]').forEach((b) => (b.onclick = async () => {
    try { await api(`/api/rules?id=${encodeURIComponent(b.dataset.global)}`, { method: 'DELETE' }); state.weeks.clear(); await loadWeek(weekStart(state.selected)); renderMe(); }
    catch (e) { toast(e.message); }
  }));
}

async function loadUsage() {
  try {
    const u = await api('/api/stats');
    const max = Math.max(1, ...u.daily.map((d) => d.people));
    const groups = Object.entries(u.groups).sort((a, b) => (a[0] === 'none') - (b[0] === 'none') || a[0] - b[0]);
    $('usage').innerHTML = `
      <div class="stat-row">
        <div class="stat"><b>${u.today}</b><span>today</span></div>
        <div class="stat"><b>${u.week}</b><span>last 7 days</span></div>
        <div class="stat"><b>${u.month}</b><span>last 30 days</span></div>
      </div>
      <p class="muted" style="margin:10px 0 6px">This week: ${u.siteWeek} opened the site · ${u.feedWeek} use the phone calendar</p>
      <div class="bars" role="img" aria-label="People per day, last 14 days">
        ${u.daily.map((d) => `<div class="bar" title="${fmtKey(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.people} ${d.people === 1 ? 'person' : 'people'}"><span>${d.people || ''}</span><i style="height:${Math.round((d.people / max) * 72)}%"></i><small>${fmtKey(d.day, { weekday: 'narrow' })}</small></div>`).join('')}
      </div>
      ${groups.length ? `<p class="muted" style="margin:12px 0 0">French groups picked: ${groups.map(([g, n]) => `${g === 'none' ? 'none' : `G${g}`} × ${n}`).join(' · ')}</p>` : ''}
      <p class="muted" style="margin:6px 0 0;font-size:13px">Counts devices, not names. Includes you.</p>`;
  } catch (e) { $('usage').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

function adminSection(s) {
  if (!s) return '';
  if (!s.admin) {
    return s.adminRequired ? `<section class="section"><details class="help"><summary>Admin</summary>
      <p class="muted" style="margin-top:8px">For whoever keeps the EM Normandie classes up to date.</p>
      <div class="copy-row"><input id="adminPw" type="password" placeholder="Admin password" aria-label="Admin password"><button class="btn small" id="adminUnlock" type="button">Unlock</button></div>
    </details></section>` : `<section class="section"><details class="help"><summary>Admin</summary>
      <p class="muted" style="margin:8px 0 0">Admin tools are off. To turn them on, add <code>ADMIN_PASSWORD</code> in Vercel → Settings → Environment Variables, then redeploy.</p>
    </details></section>`;
  }
  const g = state.globalRules;
  return `<section class="section">
    <h2>Admin · Browser add-on</h2>
    <p class="muted">Paste these into the add-on, then open the MyEMN timetable to update EM Normandie classes for everyone.</p>
    <label>Site address</label>
    <div class="copy-row"><input id="siteUrl" readonly value="${esc(location.origin)}"><button class="btn small" type="button" data-copy="siteUrl">Copy</button></div>
    <label>Sync key</label>
    <div class="copy-row"><input id="syncKey" readonly value="${esc(s.syncToken || '')}"><button class="btn small" type="button" data-copy="syncKey">Copy</button></div>
    <button class="btn small" type="button" id="copySample" style="margin-top:12px">Copy MyEMN sample (for troubleshooting)</button>
    <h2 style="margin-top:18px">Usage</h2>
    <div id="usage"><p class="muted">Loading…</p></div>
    <h2 style="margin-top:18px">Hidden for everyone</h2>
    <div class="rows">${g.length ? g.map((r) => `<div class="rowi"><div class="t">${esc(r.label || r.value)}<small>${SCHOOL[r.source] || 'Both schools'}</small></div><button class="btn small" type="button" data-global="${esc(r.id)}">Show</button></div>`).join('') : '<p class="muted" style="margin:0">Nothing.</p>'}</div>
  </section>`;
}

// ---------- Toast ----------
function toast(msg, undo) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = () => { t.hidden = true; undo(); };
  t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), undo ? 5000 : 2500);
}

// Keep "Now" accurate and data fresh.
setInterval(() => { if (!$('app').hidden && state.tab === 'day' && state.selected === today()) renderDay(); }, 60 * 1000);
setInterval(() => { if (!$('app').hidden && document.visibilityState === 'visible') { state.weeks.clear(); if (state.tab !== 'me') render(); } }, 15 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('app').hidden) {
    if (lastVisitDay !== today()) savePrefs(true); // app left open overnight still counts as a new day
    const w = state.weeks.get(weekStart(state.selected));
    w?.then((x) => { if (Date.now() - x.loadedAt > 10 * 60 * 1000) { state.weeks.clear(); if (state.tab !== 'me') render(); } });
  }
});

boot();
