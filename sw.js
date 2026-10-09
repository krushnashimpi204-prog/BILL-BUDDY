/**
 * Bills Buddy - Cache Cleanup & Auto-Reset Service Worker
 * Ensures any previously cached stale assets are completely cleared.
 */

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Do not intercept any fetch requests - allow direct network & fresh DOM rendering
self.addEventListener('fetch', (e) => {
  // Pass-through to network
});
