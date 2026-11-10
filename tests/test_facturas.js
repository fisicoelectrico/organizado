// Prueba de Facturas y precios (v2.10, solo administrador) con un Supabase falso. Uso: node tests/test_facturas.js
// Comprueba: entrada oculta para quien no es admin, foto -> Edge Function -> pantalla de revisión (rojo/amarillo, cuadre con el total,
// alias aprendidos), doble toque con dudosos, lo que se envía a guardar_factura, historial por producto, errores y celular/escritorio.
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))});
let fallas=0;const ok=(c,m)=>{console.log((c?'  ok  ':' FALLA ')+m);if(!c)fallas++};
// Supabase falso: se instala sobre la app ya cargada en modo local
const FAKE=(admin,lectura)=>{
  window.__sb={calls:[],saved:null,admin,lectura,resumen:[{producto_id:1,nombre:'Arroz',unidad:'kg',n:3,mediana:4200,minimo:3900,maximo:4600,ultimo:4300,ultima_tienda:'D1',ultima_fecha:'2026-11-01'}],
    facturas:[{id:7,tienda:'D1',fecha:'2026-11-01',total:52000,items_factura:[{count:4}]}]};
  const q=(table)=>{const st={table,ops:[]};const api={select(){st.ops.push('select');return api},order(){return api},limit(){return api},eq(c,v){st.ops.push(c+'='+v);return api},gte(){return api},delete(){st.ops.push('delete');return api},
    then(res,rej){window.__sb.calls.push(table+':'+st.ops.join(','));let data=[];
      if(table==='precios_resumen')data=window.__sb.resumen;else if(table==='facturas')data=window.__sb.facturas;
      else if(table==='alias_productos')data=[{texto:'crema leche alq 900ml',productos:{nombre:'Crema de leche',unidad:'l'}}];
      else if(table==='items_factura')data=[{id:1,precio_base:4300,precio_total:2150,cantidad:1,contenido:0.5,texto_original:'ARROZ DIANA 500G',facturas:{fecha:'2026-11-01',tienda:'D1'}},{id:2,precio_base:4000,precio_total:4000,cantidad:1,contenido:1,texto_original:'ARROZ ROA 1KG',facturas:{fecha:'2026-10-20',tienda:'Éxito'}}];
      return Promise.resolve({data,error:null}).then(res,rej)}};return api};
  sb={from:q,rpc:async(fn,args)=>{window.__sb.calls.push('rpc:'+fn);if(fn==='es_admin')return{data:window.__sb.admin,error:null};
      if(fn==='guardar_factura'){window.__sb.saved=args.p;return{data:99,error:null}}},
    functions:{invoke:async(name,o)=>{window.__sb.calls.push('fn:'+name);window.__sb.img=o.body.imagen.length;await new Promise(r=>setTimeout(r,300));
      if(window.__sb.lectura==='error')return{data:null,error:{message:'x',context:{json:async()=>({error:'Llegaste al tope de 40 lecturas en 24 horas'})}}};
      return{data:window.__sb.lectura,error:null}}},auth:{signOut:async()=>({})}};
  cloud.user={id:'u1',email:'admin@prueba.co'};return adminCheck()};
const LECTURA={es_factura:true,tienda:'D1',fecha:'2026-11-09',total:30050,items:[
  {texto:'ARROZ DIANA 500G',producto:'Arroz',unidad:'kg',cantidad:2,contenido:0.5,precio_total:4400,seguro:true},
  {texto:'CREMA LECHE ALQ 900ML',producto:'Crema',unidad:'und',cantidad:1,contenido:1,precio_total:8900,seguro:true},
  {texto:'PIMENTON ROJO',producto:'Pimentón',unidad:'kg',cantidad:1,contenido:0.35,precio_total:2450,seguro:false},
  {texto:'ACEITE GIRASOL 3000ML',producto:'Aceite',unidad:'l',cantidad:1,contenido:3,precio_total:0,seguro:true}]};
(async()=>{await new Promise(r=>srv.listen(0,r));const URL='http://localhost:'+srv.address().port+'/';
  const b=await chromium.launch();
  const nueva=async(admin,lectura,vp={width:420,height:900})=>{const ctx=await b.newContext({viewport:vp,serviceWorkers:'block'});const p=await ctx.newPage();p.errs=[];
    p.on('pageerror',e=>p.errs.push(e.message));
    await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith(URL))return r.continue();
      if(u.includes('supabase.co'))return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});
      return r.fulfill({status:200,contentType:'application/javascript',body:''})});
    await p.addInitScript(()=>{try{localStorage.setItem('organizado.version','2.10');localStorage.setItem('organizado.tour','1');localStorage.setItem('organizado.askname','1');sessionStorage.setItem('org-splash','1')}catch(e){}});
    await p.goto(URL);await p.waitForTimeout(600);
    const loc=await p.$('#au-local');if(loc){await loc.click();await p.waitForTimeout(400)}
    await p.evaluate(()=>{try{endTour()}catch(e){}try{closeSheet()}catch(e){}});
    await p.evaluate(`(${FAKE})(${JSON.stringify(admin)},${JSON.stringify(lectura)})`);
    await p.evaluate(()=>go('mas'));return{ctx,p}};
  const foto=async p=>{const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
    await p.setInputFiles('[data-fx-file]:not([capture])',{name:'f.png',mimeType:'image/png',buffer:png})};

  console.log('1. Usuario normal: no ve nada');
  let {ctx,p}=await nueva(false,LECTURA);
  ok(await p.$('#view [data-go=facturas]')===null,'Más no muestra Facturas y precios');
  await p.evaluate(()=>go('facturas'));
  ok(/Solo|solo la ve el administrador/.test(await p.textContent('#view')),'abrir la vista a mano dice que no está disponible');
  ok(await p.$('[data-fx-file]')===null,'sin botón de foto');
  ok(!(await p.evaluate(()=>window.__sb.calls.join('|'))).includes('fn:'),'no llama a la Edge Function');
  await ctx.close();

  console.log('2. Administrador: lectura y revisión');
  ({ctx,p}=await nueva(true,LECTURA));
  ok(await p.$('#view [data-go=facturas]')!==null,'Más muestra Facturas y precios');
  await p.click('#view [data-go=facturas]');await p.waitForTimeout(200);
  ok(/Arroz/.test(await p.textContent('#view'))&&/4\.200/.test(await p.textContent('#view')),'lista la mediana del historial');
  ok(/D1/.test(await p.textContent('#view')),'lista las últimas facturas');
  await foto(p);await p.waitForTimeout(100);
  ok(/Leyendo la factura/.test(await p.textContent('#view')),'muestra «Leyendo la factura…»');
  await p.waitForSelector('.fxr');
  ok(await p.evaluate(()=>window.__sb.img>50),'envió la imagen en base64');
  ok(await p.$$eval('.fxr',r=>r.length)===4,'4 líneas para revisar');
  ok(await p.inputValue('[data-fx=producto][data-i="1"]')==='Crema de leche','el alias aprendido reemplaza la sugerencia («Crema» -> «Crema de leche»)');
  ok(await p.inputValue('[data-fx=unidad][data-i="1"]')==='l','y su unidad (litro)');
  ok(/Aprendido/.test(await p.textContent('[data-fx-row="1"]')),'la línea dice «Aprendido»');
  ok(await p.$eval('[data-fx-row="2"]',e=>e.classList.contains('fx-doubt')),'el pimentón dudoso queda en amarillo');
  ok(await p.$eval('[data-fx-row="3"]',e=>e.classList.contains('fx-bad')),'el aceite sin precio queda en rojo');
  ok(await p.isDisabled('#fx-save'),'Guardar deshabilitado con una línea en rojo');
  ok(/4\.400/.test(await p.textContent('[data-fx-base="0"]')),'arroz: 2 × 0,5 kg por $4.400 = $4.400 por kg');
  await p.fill('[data-fx=precio_total][data-i="3"]','14300');
  ok(await p.inputValue('[data-fx=precio_total][data-i="3"]')==='14.300','formatea el precio al escribir');
  ok(!(await p.$eval('[data-fx-row="3"]',e=>e.classList.contains('fx-bad'))),'el aceite sale del rojo');
  ok(/4\.767/.test(await p.textContent('[data-fx-base="3"]')),'aceite: $14.300 / 3 l = $4.767 por litro');
  await p.fill('#fx-total','40000');
  ok(/Cuadra con el total/.test(await p.textContent('#fx-check'))===false&&/Diferencia/.test(await p.textContent('#fx-check')),'avisa la diferencia con el total: '+(await p.textContent('#fx-check')).replace(/\s+/g,' ').slice(0,120));
  await p.fill('#fx-total','30.050');await p.fill('#fx-total','30050');
  await p.fill('[data-fx=precio_total][data-i="1"]','8900');
  await p.fill('[data-fx=precio_total][data-i="3"]','14300');
  ok(/Cuadra con el total/.test(await p.textContent('#fx-check')),'4.400+8.900+2.450+14.300 = 30.050 cuadra');
  ok(!(await p.isDisabled('#fx-save')),'Guardar habilitado');
  await p.click('#fx-save');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>window.__sb.saved===null),'primer toque con dudosos no guarda');
  ok(/amarillo/.test(await p.textContent('#toast')),'pide revisar las amarillas');
  await p.click('#fx-save');await p.waitForTimeout(250);
  const s=await p.evaluate(()=>window.__sb.saved);
  ok(s&&s.items.length===4&&s.tienda==='D1'&&s.fecha==='2026-11-09'&&s.total===30050,'segundo toque guarda la factura');
  ok(s&&s.items[1].producto==='Crema de leche'&&s.items[1].texto==='CREMA LECHE ALQ 900ML'&&s.items[3].precio_total===14300&&s.items[0].contenido===0.5,'manda texto original, producto, contenido y precio');
  ok(/Factura guardada/.test(await p.textContent('#toast')),'confirma «Factura guardada»');
  ok(await p.$('[data-fx-file]')!==null,'vuelve a la pantalla de inicio');

  console.log('3. Historial de un producto y detalle de factura');
  await p.click('[data-act=fxProd]');await p.waitForTimeout(200);
  const sh=await p.textContent('#sheet-body');
  ok(/Mediana 90 días/.test(sh)&&/ARROZ ROA 1KG/.test(sh)&&/Éxito/.test(sh),'la hoja del producto muestra el historial por tienda');
  await p.evaluate(()=>closeSheet());
  await p.click('[data-act=fxFact]');await p.waitForTimeout(200);
  ok(/Eliminar esta factura/.test(await p.textContent('#sheet-body')),'el detalle de factura permite eliminarla');
  await p.click('#fx-delf');await p.click('#cf-ok');await p.waitForTimeout(150);
  ok((await p.evaluate(()=>window.__sb.calls.join('|'))).includes('facturas:delete,id=7'),'elimina la factura 7');
  ok(p.errs.length===0,'sin errores de JS '+p.errs.join('|'));
  await ctx.close();

  console.log('4. Error de la Edge Function y descartar');
  ({ctx,p}=await nueva(true,'error'));
  await p.evaluate(()=>go('facturas'));await foto(p);await p.waitForTimeout(600);
  ok(/tope de 40 lecturas/.test(await p.textContent('#view')),'muestra el mensaje de la función');
  await p.evaluate(()=>{window.__sb.lectura={es_factura:false,tienda:'',fecha:'',total:0,items:[]}});await foto(p);await p.waitForTimeout(600);
  ok(/No encontré productos/.test(await p.textContent('#view')),'foto sin factura: lo dice y no abre revisión');
  ok(p.errs.length===0,'sin errores de JS '+p.errs.join('|'));
  await ctx.close();

  console.log('5. Celular y escritorio sin desbordes');
  for(const vp of [{width:360,height:780},{width:1280,height:900}]){
    ({ctx,p}=await nueva(true,LECTURA,vp));await p.evaluate(()=>go('facturas'));await foto(p);await p.waitForSelector('.fxr');
    const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    ok(ov<=0,`${vp.width}px: sin scroll horizontal (${ov})`);
    await p.screenshot({path:path.join(require('os').tmpdir(),`fx-${vp.width}.png`),fullPage:false});
    ok(p.errs.length===0,'sin errores de JS '+p.errs.join('|'));await ctx.close()}

  await b.close();srv.close();console.log(fallas?`\n${fallas} FALLAS`:'\nTodo bien');process.exit(fallas?1:0)})();
