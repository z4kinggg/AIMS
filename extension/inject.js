// Runs inside the MyEMN page. Watches the page's own network requests and,
// when it loads timetable data, hands a copy to the add-on. Nothing else is read.
(() => {
  if (window.__timetableSyncInstalled) return;
  window.__timetableSyncInstalled = true;
  const WANTED = /schedule|planning|agenda|timetable|calendar|emploi|edt|events?\b|cours|sessions?/i;
  const send = (url, data) => {
    try { window.postMessage({ __timetableSync: true, url: String(url), data }, '*'); } catch {}
  };
  const consider = (url, text) => {
    if (!WANTED.test(String(url))) return;
    if (!text || text.length < 2 || text.length > 5e6) return;
    try { send(new URL(url, location.href).href, JSON.parse(text)); } catch { /* not JSON */ }
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = args[0] instanceof Request ? args[0].url : args[0];
      if (WANTED.test(String(url))) res.clone().text().then(t => consider(url, t)).catch(() => {});
    } catch {}
    return res;
  };

  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__tsUrl = url;
    return open.call(this, method, url, ...rest);
  };
  const sendXhr = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        if (this.responseType === '' || this.responseType === 'text') consider(this.__tsUrl, this.responseText);
        else if (this.responseType === 'json') consider(this.__tsUrl, JSON.stringify(this.response));
      } catch {}
    });
    return sendXhr.apply(this, args);
  };
})();
