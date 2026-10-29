// Sends captured MyEMN data to your site. Settings live in chrome.storage (site address + sync key).
const DYNAMIC_ID = 'timetable-extra';

async function settings() {
  return chrome.storage.sync.get({ siteUrl: '', syncKey: '', extraHost: '' });
}

function badge(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  if (title) chrome.action.setTitle({ title });
}

let lastSent = '';
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'emn-data') { push(msg).then(reply); return true; }
  if (msg.type === 'register-extra') { registerExtra(msg.host).then(reply, (e) => reply({ error: e.message })); return true; }
  return false;
});

async function push({ url, data }) {
  const { siteUrl, syncKey } = await settings();
  if (!siteUrl || !syncKey) { badge('?', '#b45309', 'Open the add-on and enter your site address and sync key'); return; }
  const body = JSON.stringify({ url, data });
  if (body === lastSent) return; // same answer as a moment ago
  try {
    const r = await fetch(new URL('/api/emn', siteUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': syncKey },
      body,
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || `HTTP ${r.status}`);
    lastSent = body;
    if (res.added > 0) {
      badge('✓', '#15803d', `Synced ${res.added} EM Normandie classes`);
      await chrome.storage.local.set({ lastSync: { at: Date.now(), added: res.added, url } });
    }
  } catch (e) {
    badge('!', '#b91c1c', `Sync failed: ${e.message}`);
    await chrome.storage.local.set({ lastError: { at: Date.now(), message: e.message } });
  }
}

// Lets the add-on also run on a MyEMN address outside *.em-normandie.*
async function registerExtra(host) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [DYNAMIC_ID, DYNAMIC_ID + '-bridge'] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(s => s.id) });
  if (!host) return { ok: true };
  const matches = [`https://${host}/*`];
  await chrome.scripting.registerContentScripts([
    { id: DYNAMIC_ID, matches, js: ['inject.js'], runAt: 'document_start', world: 'MAIN', allFrames: true },
    { id: DYNAMIC_ID + '-bridge', matches, js: ['content.js'], runAt: 'document_start', allFrames: true },
  ]);
  return { ok: true };
}
