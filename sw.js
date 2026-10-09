/* sw.js - keeps a copy of the AMP page on the device, so it opens without a connection (engine room).
   When online the page is always fetched fresh (and the copy refreshed); offline, or if the network does not
   answer within 4 seconds, the saved copy is used. Rig data is kept by the page itself (IndexedDB).
   Upload this file next to index.html. */
const BUILD = 'fba31ecea9ce';
const PAGE_CACHE = 'amp-page-' + BUILD;
const FONT_CACHE = 'amp-fonts-v2';
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;
const CORE = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'].map(p => new URL(p, SCOPE).href);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(PAGE_CACHE);
    await Promise.all(CORE.map(u => fetch(u, {cache: 'reload'}).then(r => r.ok ? c.put(u, r) : null).catch(() => null)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith('amp-page-') && k !== PAGE_CACHE) || (k.startsWith('amp-fonts-') && k !== FONT_CACHE)) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.href.startsWith(SCOPE)){
    const path = url.pathname.slice(new URL(SCOPE).pathname.length);
    if (path === '' || path === 'index.html'){ e.respondWith(page(req)); return; }   // the page itself
    if (path === 'sw.js') return;
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req)));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){ e.respondWith(font(req)); return; }
  // everything else (the database) goes to the network as usual
});
const isPage = r => r && r.ok && r.type === 'basic' && /text\/html/i.test(r.headers.get('content-type') || '');
async function page(req){
  const cache = await caches.open(PAGE_CACHE);
  const saved = await cache.match(INDEX);
  const net = fetch(req.url.split('#')[0], {cache: 'no-store'}).then(r => { if (isPage(r)) cache.put(INDEX, r.clone()); return r; });
  if (!saved) return net.catch(() => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><p style="font:16px sans-serif;padding:24px">No connection. Open this page once while online so it can be kept on this device.</p>', {headers: {'Content-Type': 'text/html; charset=utf-8'}}));
  try {
    const r = await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
    return r && r.ok ? r : saved;
  } catch (err){
    net.catch(() => {});
    return saved;
  }
}
async function font(req){
  // fetched with CORS (Google Fonts allows it) so only real, complete answers are kept
  const c = await caches.open(FONT_CACHE);
  const hit = await c.match(req.url); if (hit) return hit;
  try { const r = await fetch(req.url, {mode: 'cors', credentials: 'omit'}); if (r && r.ok) c.put(req.url, r.clone()); return r; }
  catch (e){ try { return await fetch(req); } catch (e2){ return Response.error(); } }
}
