/* ORGANIZADO$ · service worker: deja abrir la app sin internet. Sube el número de versión al cambiar archivos. */
const V='organizado-2.2';
const CORE=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k.startsWith('organizado-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.hostname.endsWith('.supabase.co'))return;                 /* la API y el login nunca se guardan en caché */
  if(r.mode==='navigate'){                                         /* la app: primero la red (así llegan las actualizaciones), si no hay internet la copia guardada */
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put('index.html',cp))}return res}).catch(()=>caches.match('index.html')));return}
  if(u.origin===location.origin){e.respondWith(caches.match(r).then(h=>h||fetch(r)));return}
  e.respondWith(caches.open(V).then(c=>c.match(r).then(h=>{                /* librerías y fuentes: las guardadas y se refrescan por detrás */
    const n=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res}).catch(()=>h);return h||n})));
});
