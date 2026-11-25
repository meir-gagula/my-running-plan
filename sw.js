const V = 'run-v2';
const FILES = ['./', 'index.html', 'style.css', 'engine.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // קודם הרשת (כדי לקבל עדכונים), ואם אין קליטה: מהמטמון
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
// לחיצה על כפתור בהתראה: פותח את האפליקציה עם הפעולה
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const act = e.action || 'open', sid = (e.notification.data && e.notification.data.sid) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const url = './index.html?act=' + act + '&sid=' + encodeURIComponent(sid);
    for (const c of cs) { if ('focus' in c) { c.postMessage({ act, sid }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
