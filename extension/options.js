const $ = (id) => document.getElementById(id);
const status = (msg, ok) => { $('status').textContent = msg; $('status').className = ok ? 'ok' : 'bad'; };

(async () => {
  const s = await chrome.storage.sync.get({ siteUrl: '', syncKey: '', extraHost: '' });
  $('siteUrl').value = s.siteUrl; $('syncKey').value = s.syncKey; $('extraHost').value = s.extraHost;
  const { lastSync, lastError } = await chrome.storage.local.get(['lastSync', 'lastError']);
  if (lastError && (!lastSync || lastError.at > lastSync.at)) status(`Last sync failed: ${lastError.message}`, false);
  else if (lastSync) status(`Last sync: ${lastSync.added} classes, ${new Date(lastSync.at).toLocaleString()}`, true);
})();

$('save').onclick = async () => {
  let siteUrl = $('siteUrl').value.trim().replace(/\/+$/, '');
  const syncKey = $('syncKey').value.trim();
  const extraHost = $('extraHost').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  try {
    if (!/^https:\/\//.test(siteUrl)) siteUrl = 'https://' + siteUrl;
    const origin = new URL(siteUrl).origin;
    // Ask for permission to reach a site that isn't on vercel.app, and the extra MyEMN host.
    const origins = [];
    if (!origin.endsWith('.vercel.app')) origins.push(origin + '/*');
    if (extraHost) origins.push(`https://${extraHost}/*`);
    if (origins.length && !(await chrome.permissions.request({ origins }))) return status('Permission was refused', false);
    // Check the key before saving.
    const r = await fetch(origin + '/api/emn', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-key': syncKey }, body: JSON.stringify({ url: '', data: [] }) });
    if (r.status === 401) return status('The site rejected that sync key', false);
    if (!r.ok) return status(`The site answered ${r.status}. Check the address.`, false);
    await chrome.storage.sync.set({ siteUrl: origin, syncKey, extraHost });
    const reg = await chrome.runtime.sendMessage({ type: 'register-extra', host: extraHost });
    if (reg?.error) return status(reg.error, false);
    chrome.action.setBadgeText({ text: '' });
    status('Saved and connected. Now open your MyEMN timetable.', true);
  } catch (e) {
    status(`Could not reach the site: ${e.message}`, false);
  }
};
