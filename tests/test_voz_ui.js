// Prueba de interfaz del dictado (v2.7) con un reconocedor de voz falso. Uso: node tests/test_voz_ui.js
// Comprueba: botón en la barra superior, hoja de dictado, tarjeta «Entendí», campos en rojo/amarillo, guardado con doble toque,
// permiso de micrófono denegado, navegador sin dictado y que no haya errores de JS ni violaciones de CSP.
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))});
let fallas=0;const ok=(c,m)=>{console.log((c?'  ok  ':' FALLA ')+m);if(!c)fallas++};
const FAKE=`(()=>{window.__rec={lang:null,started:0,frase:'',error:null};
  class R{constructor(){this.lang='';}
    start(){window.__rec.started++;window.__rec.lang=this.lang;const me=this;setTimeout(()=>{
      if(window.__rec.error){me.onerror&&me.onerror({error:window.__rec.error});me.onend&&me.onend();return}
      const t=window.__rec.frase;const res=[Object.assign([{transcript:t}],{isFinal:true})];me.onresult&&me.onresult({results:res});me.onend&&me.onend()},150)}
    stop(){}abort(){}}
  window.SpeechRecognition=R;window.webkitSpeechRecognition=R})();`;
process.on('unhandledRejection',e=>{console.log('ERRORES JS:',globalThis.__p&&globalThis.__p.errs);throw e});
(async()=>{await new Promise(r=>srv.listen(0,r));const URL='http://localhost:'+srv.address().port+'/';
  const b=await chromium.launch();
  const nueva=async(fake=true)=>{const ctx=await b.newContext({viewport:{width:420,height:900},serviceWorkers:'block'});const p=await ctx.newPage();globalThis.__p=p;p.errs=[];
    p.on('pageerror',e=>p.errs.push(e.message));
    await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith(URL))return r.continue();
      if(u.includes('supabase.co'))return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
      return r.fulfill({status:200,contentType:'application/javascript',body:''})});
    await p.addInitScript(()=>{document.addEventListener('securitypolicyviolation',e=>{(window.__csp=window.__csp||[]).push(e.violatedDirective)});
      try{localStorage.setItem('organizado.version','2.7');localStorage.setItem('organizado.tour','1');localStorage.setItem('organizado.askname','1');sessionStorage.setItem('org-splash','1')}catch(e){}});
    if(fake)await p.addInitScript(FAKE);
    await p.goto(URL);await p.waitForTimeout(600);
    const loc=await p.$('#au-local');if(loc){await loc.click();await p.waitForTimeout(400)}
    await p.evaluate(()=>{try{endTour()}catch(e){}try{closeSheet()}catch(e){}});
    // datos propios y conocidos
    await p.evaluate(()=>{S.demo=false;S.cuentas=[{nombre:'Bancolombia',color:'#2C4596'},{nombre:'Nequi',color:'#6E3584'},{nombre:'Efectivo',color:'#0E6E62'}];
      S.cats=[{nombre:'Almuerzo',tipo:'gasto',realidad:'LUJO'},{nombre:'Transporte',tipo:'gasto',realidad:'NECESIDAD'},{nombre:'Salario',tipo:'ingreso',realidad:null},{nombre:'Traspaso',tipo:'sistema',realidad:null},{nombre:'Balance',tipo:'sistema',realidad:null}];
      S.movs=[];S.ppto={};save();render()});
    return{ctx,p}};

  console.log('1. Dictado completo con la frase de ejemplo');
  let {ctx,p}=await nueva();
  ok(await p.$('#top [data-act=voz]')!==null,'hay botón de micrófono en la barra superior');
  await p.evaluate(()=>{window.__rec.frase='regístrame una compra en Bancolombia de tipo lujo en la categoría almuerzo 70.000 pesos'});
  await p.click('#top [data-act=voz]');await p.waitForSelector('.vozc',{timeout:4000});
  ok(await p.evaluate(()=>window.__rec.lang)==='es-CO','el reconocedor usa es-CO');
  ok(await p.evaluate(()=>window.__rec.started)===1,'el micrófono se enciende al tocar (una sola vez)');
  ok(/70\.000/.test(await p.textContent('.vozc-s'))&&/Bancolombia/.test(await p.textContent('.vozc-s')),'la tarjeta resume lo entendido: '+await p.textContent('.vozc-s'));
  ok(await p.inputValue('#f-monto')==='70.000','monto cargado en el formulario');
  ok(await p.evaluate(()=>F.c==='Bancolombia'&&F.cat==='Almuerzo'&&F.r==='LUJO'&&F.mode==='gasto'&&F.f===today()),'cuenta, categoría, lujo, gasto y fecha de hoy');
  ok((await p.$$('.need,.warnf')).length===0,'nada en rojo ni amarillo');
  const n0=await p.evaluate(()=>S.movs.length);ok(n0===0,'todavía no se guardó nada (hace falta tocar Guardar)');
  await p.click('#f-save');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>S.movs.length)===1,'al tocar Guardar queda un movimiento');
  ok(await p.evaluate(()=>{const m=S.movs[0];return m.m===-70000&&m.c==='Bancolombia'&&m.cat==='Almuerzo'&&m.r==='LUJO'}),'guardado como gasto de -70.000 en Bancolombia · Almuerzo · LUJO');
  ok(p.errs.length===0,'sin errores de JS '+p.errs.join('|'));ok((await p.evaluate(()=>window.__csp||[])).length===0,'sin violaciones de CSP');
  await ctx.close();

  console.log('2. Lo que falta o dudo se marca y obliga a elegir');
  ({ctx,p}=await nueva());
  await p.evaluate(()=>{window.__rec.frase='gasté 25 mil en taxi'});
  await p.click('#top [data-act=voz]');await p.waitForSelector('.vozc');
  ok((await p.$$('.vozc-l .need')).length>=1&&await p.$('.field.need')!==null,'sin cuenta: queda en rojo');
  ok(await p.evaluate(()=>F.c==='')&&await p.inputValue('#f-monto')==='25.000','la cuenta queda vacía (no se adivina) y el monto sí se carga');
  await p.click('#f-save');await p.waitForTimeout(150);
  ok(/cuenta/i.test(await p.textContent('#f-err'))&&await p.evaluate(()=>S.movs.length)===0,'no deja guardar sin cuenta');
  await p.click('[data-fc="c"][data-v="Nequi"]');
  ok(await p.$('.vozc-l .need')===null,'al elegir la cuenta se quita el rojo');
  ok(await p.$('.vozc-l .warnf')!==null,'«taxi → Transporte» sigue en amarillo');
  await p.click('#f-save');await p.waitForTimeout(150);
  ok(/amarillo/.test(await p.textContent('#f-err'))&&await p.evaluate(()=>S.movs.length)===0,'primer toque: pide revisar lo amarillo, no guarda');
  await p.click('#f-save');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>S.movs.length===1&&S.movs[0].c==='Nequi'&&S.movs[0].cat==='Transporte'),'segundo toque: guarda');
  await ctx.close();

  console.log('3. Corregir la frase y escribirla a mano');
  ({ctx,p}=await nueva());
  await p.evaluate(()=>{window.__rec.frase='gasté 10 mil en efectivo en transporte'});
  await p.click('#top [data-act=voz]');await p.waitForSelector('.vozc');
  await p.click('[data-act=vozAgain]');await p.waitForSelector('#voz-txt');
  ok(await p.inputValue('#voz-txt')==='gasté 10 mil en efectivo en transporte','«Corregir frase» vuelve con el texto para editarlo');
  ok(await p.evaluate(()=>window.__rec.started)===1,'no vuelve a encender el micrófono solo');
  await p.fill('#voz-txt','gasté 12 mil en nequi en transporte');await p.click('#voz-go');await p.waitForSelector('.vozc');
  ok(await p.inputValue('#f-monto')==='12.000'&&await p.evaluate(()=>F.c==='Nequi'),'la frase corregida se interpreta');
  await p.click('.vbtn');await p.waitForSelector('#voz-txt');ok(true,'el botón «Dictar» del formulario abre el dictado');
  await p.click('#voz-manual');await p.waitForSelector('#f-monto');ok(await p.$('.vozc')===null,'«Mejor lo escribo yo» abre el formulario normal');
  await ctx.close();

  console.log('4. Traspaso por voz');
  ({ctx,p}=await nueva());
  await p.evaluate(()=>{window.__rec.frase='pasa 50 mil de nequi a efectivo'});
  await p.click('#top [data-act=voz]');await p.waitForSelector('.vozc');
  ok(await p.evaluate(()=>F.mode==='traspaso'&&F.c==='Nequi'&&F.c2==='Efectivo'),'origen Nequi, destino Efectivo');
  await p.click('#f-save');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>S.movs.length===2&&S.movs.reduce((a,m)=>a+m.m,0)===0),'se guardan las dos patas del traspaso');
  await ctx.close();

  console.log('5. Micrófono denegado y navegador sin dictado');
  ({ctx,p}=await nueva());
  await p.evaluate(()=>{window.__rec.error='not-allowed'});
  await p.click('#top [data-act=voz]');await p.waitForSelector('#voz-err:not(:empty)',{timeout:3000});
  ok(/Permisos/.test(await p.textContent('#voz-err')),'si el permiso está bloqueado explica cómo activarlo: '+(await p.textContent('#voz-err')).slice(0,60)+'…');
  ok(await p.$('#voz-txt')!==null,'queda la caja de texto como alternativa');
  await ctx.close();
  ({ctx,p}=await nueva(false));
  await p.evaluate(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition});
  await p.click('#top [data-act=voz]');await p.waitForSelector('#voz-txt');
  ok(await p.$('#voz-mic')===null||await p.evaluate(()=>!!(window.SpeechRecognition||window.webkitSpeechRecognition))===false,'sin soporte no se rompe');
  await ctx.close();

  console.log('6. La frase con HTML no se ejecuta');
  ({ctx,p}=await nueva());
  await p.evaluate(()=>{window.__rec.frase='gasté 10 mil en efectivo <img src=x onerror=window.__xss=1> en transporte'});
  await p.click('#top [data-act=voz]');await p.waitForSelector('.vozc');await p.waitForTimeout(300);
  ok(await p.evaluate(()=>!window.__xss&&!document.querySelector('.vozc img')),'se muestra como texto, no como HTML');
  await ctx.close();

  console.log('7. Escritorio (barra lateral) y vistas principales');
  ({ctx,p}=await nueva());
  for(const v of ['inicio','movs','analisis','mas']){await p.evaluate(v=>go(v),v);await p.waitForTimeout(150);}
  ok(p.errs.length===0,'las vistas siguen funcionando sin errores '+p.errs.join('|'));
  await ctx.close();
  console.log('8. Acceso directo del ícono (?voz=1)');
  ({ctx,p}=await nueva());
  await p.goto(URL+'?voz=1');await p.waitForSelector('#voz-txt',{timeout:6000});
  ok(true,'abrir con ?voz=1 va directo al dictado');
  ok(await p.evaluate(()=>location.search===''),'y limpia la dirección para no repetirlo al recargar');
  const man=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.webmanifest'),'utf8'));
  ok(man.shortcuts&&man.shortcuts[0].url==='./?voz=1'&&man.shortcuts[0].icons.length>0,'el manifiesto declara el acceso directo');
  await ctx.close();
  await b.close();srv.close();console.log(fallas?`\n${fallas} FALLAS`:'\nTodo bien');process.exit(fallas?1:0)})();
