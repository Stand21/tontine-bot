// Version 3 — force remplacement de l'ancien cache
const CACHE = 'tontine-v3';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png'];

self.addEventListener('install', e => {
  // skipWaiting force l'activation immédiate même si d'anciens onglets sont ouverts
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  // Supprimer TOUS les anciens caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => {
        console.log('[SW] Suppression ancien cache:', k);
        return caches.delete(k);
      }))
    ).then(() => {
      // Prendre le contrôle de TOUS les onglets ouverts immédiatement
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Les appels API ne passent JAMAIS par le cache — toujours réseau
  if (url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/ping') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Pour les assets : réseau en priorité, cache en fallback (network-first)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Mettre à jour le cache avec la nouvelle version
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Push notifications
self.addEventListener('push', e => {
  let data = { title: '🔔 Ma Tontine', body: 'Rappel de cotisation', url: '/' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(e.notification.data?.url || '/');
    })
  );
});
