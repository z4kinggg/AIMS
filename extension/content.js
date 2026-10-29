// Bridge between the page (inject.js) and the add-on's background worker.
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.__timetableSync !== true) return;
  chrome.runtime.sendMessage({ type: 'emn-data', url: e.data.url, data: e.data.data });
});
