// Chemical Set Record - offline support.
// Online: fetch the newest page (so a refresh picks up updates) and keep a copy.
// Bad or no connection: if the network has not answered within 3 seconds, open the saved copy instead.
var CACHE = 'csr-v6', FILES = ['./', 'index.html', 'manifest.json', 'icon.svg'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  var fromNet = fetch(e.request, { cache: 'no-store' }).then(function (r) {
    if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return r;
  });
  var saved = function () { return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); }); };
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    var useSaved = function () { saved().then(function (m) { if (done) return; if (m) { done = true; resolve(m); } }); };
    var t = setTimeout(useSaved, 3000);
    fromNet.then(function (r) { clearTimeout(t); if (!done) { done = true; resolve(r); } }, function () {
      clearTimeout(t);
      saved().then(function (m) { if (!done) { done = true; resolve(m || Response.error()); } });
    });
  }));
  e.waitUntil(fromNet.catch(function () {}));
});
