// Prueba de las notificaciones de pagos (v2.9). Uso: node tests/test_notif.js
// Comprueba: entrada en Más, interruptor que pide permiso, aviso de prueba, aviso solo en segundo plano y una vez al día,
// permiso bloqueado, copia para el service worker y que no haya errores de JS.
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))});
let fallas=0;const ok=(c,m)=>{console.log((c?'  ok  ':' FALLA ')+m);if(!c)fallas++};
(async()=>{await new Promise(r=>srv.listen(0,r));const URL='http://localhost:'+srv.address().port+'/';
  const b=await chromium.launch({channel:'chromium'});   // el Chromium completo: el «headless shell» siempre niega las notificaciones
  const nueva=async(perm)=>{const ctx=await b.newContext({viewport:{width:420,height:900}});if(perm)await ctx.grantPermissions(['notifications']);
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith(URL))return r.continue();
      if(u.includes('supabase.co'))return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
      return r.fulfill({status:200,contentType:'application/javascript',body:''})});
    await p.addInitScript(()=>{try{localStorage.setItem('organizado.version','2.9');localStorage.setItem('organizado.tour','1');localStorage.setItem('organizado.askname','1');sessionStorage.setItem('org-splash','1')}catch(e){}});
    await p.goto(URL);await p.waitForTimeout(700);
    const loc=await p.$('#au-local');if(loc){await loc.click();await p.waitForTimeout(400)}
    await p.evaluate(()=>{try{endTour()}catch(e){}try{closeSheet()}catch(e){}});
    await p.evaluate(()=>navigator.serviceWorker.ready);
    await p.evaluate(()=>{const f=n=>{const d=new Date(Date.now()+n*864e5);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
      const base=S.deudas[0]?JSON.parse(JSON.stringify(S.deudas[0])):null;window.__base=base;
      S.demo=false;S.fijos=[];S.deudas=S.deudas.slice(0,2);if(S.deudas[0])S.deudas[0].prox=f(1);if(S.deudas[1])S.deudas[1].prox=f(-2);save();closeSheet();render()});
    return{ctx,p}};
  const notis=p=>p.evaluate(async()=>(await (await navigator.serviceWorker.ready).getNotifications()).map(n=>({t:n.title,b:n.body})));

  console.log('1. Activar con permiso concedido');
  let {ctx,p}=await nueva(true);
  ok(await p.evaluate(()=>alertas().length)===2,'los datos de prueba tienen 2 pagos por atender');
  await p.evaluate(()=>go('mas'));
  ok(await p.$('#view [data-go=notificaciones]')!==null,'Más tiene la entrada Notificaciones');
  await p.click('#view [data-go=notificaciones]');
  ok(await p.isChecked('#nt-on')===false,'el interruptor empieza apagado');
  await p.click('#nt-on');await p.waitForTimeout(600);
  ok(await p.isChecked('#nt-on')===true&&await p.evaluate(()=>notifOn()),'queda activado');
  let n=await notis(p);ok(n.length===1&&n[0].t==='Notificaciones activadas','muestra el aviso de bienvenida: '+JSON.stringify(n));
  await p.click('[data-act=notifTest]');await p.waitForTimeout(400);
  n=await notis(p);ok(n.length===1&&n[0].t==='Tienes pagos vencidos'&&/vencido hace 2 días/.test(n[0].b)&&/vence mañana/.test(n[0].b),'aviso de prueba con los pagos: '+JSON.stringify(n));
  ok(!/\$|\d{4,}/.test(n[0].b),'el aviso no muestra montos');
  const snap=await p.evaluate(async()=>{const r=await (await caches.open('notif-data')).match('./notif-snapshot.json');return r?(await r.json()).items.length:-1});
  ok(snap===2,'deja la copia de 2 pagos para el service worker');

  console.log('2. Aviso automático solo en segundo plano y una vez');
  await p.evaluate(async()=>{for(const x of await (await navigator.serviceWorker.ready).getNotifications())x.close()});
  await p.evaluate(()=>notifCheck());ok((await notis(p)).length===0,'con la app a la vista no avisa');
  await p.evaluate(async()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});await notifCheck()});
  n=await notis(p);ok(n.length===1&&n[0].t==='Tienes pagos vencidos','en segundo plano avisa');
  await p.evaluate(async()=>{for(const x of await (await navigator.serviceWorker.ready).getNotifications())x.close();await notifCheck()});
  ok((await notis(p)).length===0,'no repite el mismo aviso el mismo día');

  console.log('3. Apagar');
  await p.evaluate(()=>{delete document.hidden});
  await p.click('#nt-on');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>!notifOn())&&await p.isChecked('#nt-on')===false,'se apaga');
  ok(p.errs.length===0,'sin errores de JS '+p.errs.join('|'));
  await ctx.close();

  console.log('4. Permiso negado');
  ({ctx,p}=await nueva(false));
  await p.evaluate(()=>go('notificaciones'));
  await p.click('#nt-on').catch(()=>{});await p.waitForTimeout(600);
  ok(await p.evaluate(()=>!notifOn()),'sin permiso no queda activado');
  ok(await p.evaluate(()=>Notification.permission)!=='granted','permiso: '+await p.evaluate(()=>Notification.permission));
  ok(p.errs.length===0,'sin errores de JS '+p.errs.join('|'));
  await ctx.close();
  await b.close();srv.close();console.log(fallas?`\n${fallas} FALLA(S)`:'\nTodo bien');process.exit(fallas?1:0)})();
