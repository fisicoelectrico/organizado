// Pruebas del interpretador de frases de voz (v2.7). Uso: node tests/test_voz.js [ruta/a/index.html]
// Extrae del index.html el bloque entre /*VOZ-INICIO*/ y /*VOZ-FIN*/ (reglas puras, sin navegador) y lo ejecuta.
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('/*VOZ-INICIO*/'),b=html.indexOf('/*VOZ-FIN*/');
if(a<0||b<0){console.log(' FALLA no se encontró el bloque de voz');process.exit(1)}
const ctx={};vm.createContext(ctx);vm.runInContext(html.slice(a,b)+';this.vozInterpretar=vozInterpretar;',ctx);
const I=ctx.vozInterpretar;
let fallas=0;const ok=(c,m)=>{console.log((c?'  ok  ':' FALLA ')+m);if(!c)fallas++};
const HOY='2026-11-07'; // sábado
const C={hoy:HOY,
  cuentas:['Bancolombia','Nequi','Efectivo','Davivienda Ahorros','Davivienda Corriente','Banco de Bogotá'],
  cats:[{nombre:'Almuerzo',tipo:'gasto',realidad:'LUJO'},{nombre:'Comida',tipo:'gasto',realidad:'NECESIDAD'},{nombre:'Comida afuera',tipo:'gasto',realidad:'LUJO'},
    {nombre:'Transporte',tipo:'gasto',realidad:'NECESIDAD'},{nombre:'Gimnasio',tipo:'gasto',realidad:null},{nombre:'Salario',tipo:'ingreso'},{nombre:'Freelance',tipo:'ingreso'},
    {nombre:'Otros',tipo:'ambos'},{nombre:'Traspaso',tipo:'sistema'},{nombre:'Balance',tipo:'sistema'}]};
const monto=t=>I(t,C).monto;

console.log('1. La frase de ejemplo de Fredy');
let r=I('regístrame una compra en Bancolombia de tipo lujo en la categoría almuerzo 70.000 pesos',C);
ok(r.modo==='gasto'&&r.monto===70000&&r.c==='Bancolombia'&&r.cat==='Almuerzo'&&r.r==='LUJO'&&r.f===HOY,'gasto, $70.000, Bancolombia, Almuerzo, lujo, hoy');
ok(Object.keys(r.falta).length===0&&Object.keys(r.revisar).length===0,'sin nada en rojo ni en amarillo: '+JSON.stringify([r.falta,r.revisar]));

console.log('2. Montos en pesos colombianos');
const M=[['70.000 pesos',70000],['70000',70000],['$70.000',70000],['70 000',70000],['70 mil',70000],['setenta mil',70000],['setenta mil pesos',70000],['70 lucas',70000],['70k',70000],['una luca',1000],
  ['mil quinientos',1500],['dos mil quinientos',2500],['cincuenta y cinco mil quinientos',55500],['ciento veinte mil',120000],['cien mil',100000],['doscientos cincuenta mil',250000],
  ['un millón',1000000],['1,5 millones',1500000],['1.5 millones',1500000],['dos millones y medio',2500000],['medio millón',500000],['2 millones 500 mil',2500000],['un millón doscientos mil',1200000],
  ['veintiún mil',21000],['treinta y un mil',31000],['8.500',8500],['1.250.000',1250000],['12,50',13],['quince mil',15000],['un palo',1000000]];
for(const [t,v] of M)ok(monto('gasté '+t+' en efectivo en transporte')===v,`«${t}» → ${v} (obtuve ${monto('gasté '+t+' en efectivo en transporte')})`);
r=I('compré un almuerzo en efectivo',C);ok(r.monto===0&&r.falta.monto,'sin monto: queda en rojo, no inventa uno');
r=I('gasté 2 personas almuerzo 45 mil en efectivo',C);ok(r.monto===45000,'«2 personas» no se confunde con el monto');
r=I('gasté 45 mil y 20 mil en efectivo en transporte',C);ok(r.revisar.monto,'dos montos distintos: pide confirmar');
r=I('gasté 500 en efectivo en transporte',C);ok(r.monto===500&&r.revisar.monto,'monto muy chico: avisa por si faltan ceros');
r=I('gasté 50 millones en efectivo en transporte',C);ok(r.revisar.monto,'monto muy alto: avisa');

console.log('3. Fecha (por defecto hoy)');
const F=t=>I(t+' gasté 10 mil en efectivo en transporte',C).f;
ok(F('')===HOY,'sin fecha → hoy');ok(F('hoy')===HOY,'hoy');ok(F('ayer')==='2026-11-06','ayer');ok(F('anteayer')==='2026-11-05','anteayer');ok(F('antes de ayer')==='2026-11-05','antes de ayer');
ok(F('hace 3 días')==='2026-11-04','hace 3 días');ok(F('el lunes')==='2026-11-02','el lunes (el más reciente)');ok(F('el sábado')===HOY,'el sábado (hoy es sábado)');ok(F('el sábado pasado')==='2026-10-31','el sábado pasado');
ok(F('el 3 de octubre')==='2026-10-03','el 3 de octubre');ok(F('el 5 de noviembre')==='2026-11-05','el 5 de noviembre');ok(F('el 20 de diciembre')==='2025-12-20','20 de diciembre (aún no llega → año anterior)');
ok(F('el 3')==='2026-11-03','el 3 → de este mes');ok(F('el 20')==='2026-10-20','el 20 → del mes pasado (aún no llega)');ok(F('el 3 de octubre de 2024')==='2024-10-03','con año');
r=I('gasté 10 mil en efectivo en transporte el 31 de febrero',C);ok(r.f===HOY&&r.revisar.f,'fecha imposible: deja hoy y avisa');
r=I('gasté 10 mil en efectivo en transporte mañana',C);ok(r.f==='2026-11-08'&&r.revisar.f,'mañana: fecha futura, avisa');
r=I('gasté 10 mil esta mañana en efectivo en transporte',C);ok(r.f===HOY&&!r.revisar.f,'«esta mañana» es hoy, no mañana');
ok(I('gasté el 5 de noviembre 70 mil en efectivo en transporte',C).monto===70000,'los números de la fecha no se toman como monto');
ok(I('el 3 pagué 70 mil en efectivo en transporte',C).monto===70000,'«el 3» tampoco');
ok(I('gasté el 70 mil en efectivo en transporte',C).monto===70000,'«el 70 mil» sigue siendo monto');

console.log('4. Tipo de movimiento');
ok(I('gasté 10 mil en efectivo en transporte',C).modo==='gasto','gasté → gasto');
ok(I('me pagaron 2 millones de salario en bancolombia',C).modo==='ingreso','me pagaron → ingreso');
r=I('ingreso de 500 mil en nequi categoría freelance',C);ok(r.modo==='ingreso'&&r.cat==='Freelance'&&r.c==='Nequi','ingreso con categoría de ingreso');
r=I('me llegó el sueldo 3 millones a bancolombia',C);ok(r.modo==='ingreso'&&r.cat==='Salario'&&r.revisar.cat,'sueldo → categoría Salario por sinónimo, en amarillo');
r=I('pasa 50 mil de nequi a efectivo',C);ok(r.modo==='traspaso'&&r.c==='Nequi'&&r.c2==='Efectivo'&&r.monto===50000,'traspaso con «de X a Y»');
r=I('traspaso de 100 mil a nequi desde bancolombia',C);ok(r.modo==='traspaso'&&r.c==='Bancolombia'&&r.c2==='Nequi','traspaso con el orden invertido («a Y desde X»)');
r=I('transferí 20 mil nequi efectivo',C);ok(r.modo==='traspaso'&&r.c&&r.c2&&r.revisar.c,'traspaso sin conectores: avisa qué es origen y destino');
r=I('traspaso de 20 mil de nequi',C);ok(r.modo==='traspaso'&&r.c==='Nequi'&&r.falta.c2,'traspaso con una sola cuenta: pide la otra');
r=I('traspaso de 20 mil de nequi a nequi',C);ok(r.modo==='traspaso'&&r.falta.c2,'origen y destino iguales no se aceptan');
r=I('70 mil en efectivo transporte',C);ok(r.modo==='gasto'&&r.revisar.modo,'sin decir el tipo: asume gasto y lo marca en amarillo');
r=I('me pagaron el pago de transporte 20 mil a efectivo',C);ok(r.modo==='ingreso','«me pagaron» manda sobre «pago»');
r=I('ingreso por compra de transporte 20 mil a efectivo',C);ok(r.revisar.modo,'palabras de ingreso y gasto juntas: confirmar');

console.log('5. Cuentas');
ok(I('gasté 10 mil en nequi en transporte',C).c==='Nequi','nombre exacto');
ok(I('gasté 10 mil en NEQUI en transporte',C).c==='Nequi','mayúsculas');
r=I('gasté 10 mil con banco colombia en transporte',C);ok(r.c==='Bancolombia','«banco colombia» (separado por el reconocedor) → Bancolombia');
r=I('gasté 10 mil en bancolumbia en transporte',C);ok(r.c==='Bancolombia'&&r.revisar.c,'error de dictado (bancolumbia): propone y marca amarillo');
r=I('gasté 10 mil en davivienda en transporte',C);ok(!r.c&&r.falta.c&&r.opciones.c.length===2,'«Davivienda» hay dos: obliga a elegir y las ofrece');
r=I('gasté 10 mil en davivienda ahorros en transporte',C);ok(r.c==='Davivienda Ahorros'&&!r.falta.c,'«Davivienda ahorros» identifica la correcta');
r=I('gasté 10 mil en davivienda corriente en transporte',C);ok(r.c==='Davivienda Corriente','«Davivienda corriente» identifica la correcta');
r=I('gasté 10 mil en transporte',C);ok(!r.c&&r.falta.c,'sin cuenta: rojo, no usa la última cuenta a escondidas');
r=I('gasté 10 mil en la cuenta de ahorros del banco de bogotá en transporte',C);ok(r.c==='Banco de Bogotá','nombre con «de»');
r=I('gasté 10 mil en paypal en transporte',C);ok(!r.c&&r.falta.c,'cuenta que no existe: pide elegir');
ok(I('gasté 10 mil en efectivo en transporte',{...C,cuentas:['Efectivo','Bancolombia']}).c==='Efectivo','cuenta con una sola palabra');

console.log('6. Categorías y tipo (lujo / necesidad)');
r=I('gasté 10 mil en efectivo categoría comida',C);ok(r.cat==='Comida'&&r.r==='NECESIDAD','«comida» elige Comida (no Comida afuera) y hereda su clasificación');
r=I('gasté 10 mil en efectivo categoría comida afuera',C);ok(r.cat==='Comida afuera'&&r.r==='LUJO','«comida afuera» elige la más específica');
r=I('gasté 10 mil en efectivo en transporte de tipo lujo',C);ok(r.cat==='Transporte'&&r.r==='LUJO','lo que dices (lujo) gana sobre la clasificación por defecto');
r=I('gasté 10 mil en efectivo en almuerzo, es una necesidad',C);ok(r.cat==='Almuerzo'&&r.r==='NECESIDAD','necesidad dicha gana sobre lujo por defecto');
r=I('gasté 10 mil en efectivo en transporte lujo necesidad',C);ok(r.revisar.r,'lujo y necesidad a la vez: avisa');
r=I('gasté 10 mil en efectivo en gimnasio',C);ok(r.cat==='Gimnasio'&&r.r===null,'categoría sin clasificación: no se inventa');
r=I('gasté 10 mil en efectivo en la categoría marcianos',C);ok(!r.cat&&r.falta.cat,'categoría que no existe: rojo');
r=I('compré 10 mil en efectivo',C);ok(!r.cat&&r.falta.cat,'sin categoría: rojo');
r=I('gasté 10 mil en efectivo en salario',C);ok(!r.cat,'una categoría de ingreso no vale para un gasto');
r=I('gasté 10 mil en efectivo en la categoría compras',{...C,cats:[...C.cats,{nombre:'Compras',tipo:'gasto'}]});ok(r.cat==='Compras','«categoría compras» sí cuenta aunque «compras» sea un verbo');
r=I('registra una compra de 10 mil en efectivo',{...C,cats:[...C.cats,{nombre:'Compras',tipo:'gasto'}]});ok(!r.cat,'«una compra» sin decir categoría NO elige la categoría Compras a escondidas');
r=I('gasté 10 mil en efectivo en trasporte',C);ok(r.cat==='Transporte'&&r.revisar.cat,'error de ortografía del dictado → Transporte en amarillo');
r=I('gasté 10 mil en efectivo en taxi',C);ok(r.cat==='Transporte'&&r.revisar.cat,'«taxi» → Transporte por sinónimo, en amarillo');
r=I('gasté 10 mil en efectivo en un cine',C);ok(!r.cat&&r.falta.cat,'sinónimo sin categoría de destino: no inventa');
r=I('gasté 10 mil en efectivo en transportes',C);ok(r.cat==='Transporte'&&!r.revisar.cat,'plural');

console.log('7. Concepto');
r=I('gasté 10 mil en efectivo en transporte',C);ok(r.con==='','sin palabras sobrantes no hay concepto');
r=I('gasté 10 mil en efectivo en transporte pasaje a cali',C);ok(r.con==='Pasaje cali'||r.con.length>0,'lo que sobra se propone como concepto: «'+r.con+'»');

console.log('8. Robustez');
for(const t of ['','   ','asdf qwer','$$$','1 2 3 4 5 6 7 8 9','y y y y','mil','de a de a'])ok((()=>{try{const x=I(t,C);return typeof x.resumen==='string'&&Object.keys(x.falta).length>0}catch(e){return false}})(),'frase rara «'+t+'» no rompe y deja campos por completar');
ok((()=>{try{return I('gasté 10 mil en efectivo en transporte',{hoy:HOY,cuentas:[],cats:[]}).falta.c==='Primero crea una cuenta.'}catch(e){return false}})(),'sin cuentas creadas: lo dice');
r=I('gasté 10 mil en efectivo en <img src=x onerror=alert(1)> transporte',C);ok(typeof r.con==='string','texto con HTML no rompe (la interfaz lo escapa con esc())');
console.log(fallas?`\n${fallas} FALLAS`:'\nTodo bien');process.exit(fallas?1:0);
