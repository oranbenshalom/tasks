// Service worker בסיסי: שומר את קבצי האפליקציה כדי שתיפתח גם בלי אינטרנט.
// הנתונים עצמם נשמרים במטמון של Firestore, לא כאן.
const CACHE = 'todo-shell-v3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'storage.js', 'firebase-config.js',
  'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// רשת קודם (כדי לקבל עדכונים), ואם אין חיבור: מהמטמון.
// קבצי האפליקציה וספריות Firebase בלבד. בקשות ל-Firestore/Auth לא נוגעים.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const ours = url.origin === self.location.origin || url.hostname === 'www.gstatic.com';
  if (e.request.method !== 'GET' || !ours) return;
  e.respondWith(
    // no-cache: תמיד בודק מול השרת אם יש גרסה חדשה (בלי להוריד מחדש אם לא השתנה)
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
