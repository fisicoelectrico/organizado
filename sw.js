/* ORGANIZADO$ · service worker: deja abrir la app sin internet. Sube el número de versión al cambiar archivos. */
const V='organizado-2.9';
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

/* ---- notificaciones de pagos (v2.9) ----
   Tocar el aviso abre (o trae al frente) la app. Con «periodicsync» (Chrome con la app instalada) el navegador despierta este archivo
   cada tanto aunque la app esté cerrada: lee la copia mínima de pagos que la app dejó en la caché «notif-data» y avisa una vez al día. */
self.addEventListener('notificationclick',e=>{e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c)return c.focus()}return self.clients.openWindow('./')}))});
const hoyISO=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const diasA=f=>Math.round((new Date(f+'T12:00')-new Date(hoyISO()+'T12:00'))/864e5);
const cuando=n=>n<0?`vencido hace ${-n} día${n===-1?'':'s'}`:n===0?'vence hoy':n===1?'vence mañana':`vence en ${n} días`;
async function avisoPagos(){
  const c=await caches.open('notif-data');const r=await c.match('./notif-snapshot.json');if(!r)return;
  const items=((await r.json()).items||[]).filter(i=>i.prox&&diasA(i.prox)<=7).sort((a,b)=>diasA(a.prox)-diasA(b.prox));if(!items.length)return;
  const lines=items.map(i=>`${i.txt} · ${cuando(diasA(i.prox))}`),sig=hoyISO()+':'+lines.join('|');
  const lr=await c.match('./notif-last');if(lr&&(await lr.text())===sig)return;
  await c.put('./notif-last',new Response(sig));
  await self.registration.showNotification(items.some(i=>diasA(i.prox)<0)?'Tienes pagos vencidos':'Tienes pagos por atender',
    {body:lines.slice(0,4).join('\n')+(lines.length>4?`\n… y ${lines.length-4} más`:''),icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:'organizado-pagos',data:{url:'./'}});
}
self.addEventListener('periodicsync',e=>{if(e.tag==='organizado-pagos')e.waitUntil(avisoPagos().catch(()=>{}))});
