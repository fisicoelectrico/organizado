# ORGANIZADO$

App web de finanzas personales pensada para el celular: registro rápido de gastos, ingresos y traspasos, cartera con saldo por cuenta, análisis con gráficos, presupuesto mensual, control de deudas y préstamos con recordatorios de pago, metas de ahorro (con lo disponible y lo apartado en cada cuenta) y una lista de compras rápida.

**Cuentas y nube (v2.0).** Quien inicia sesión con su correo (con contraseña, o con un enlace que llega al correo) ve sus datos desde cualquier dispositivo. Los datos se guardan en el dispositivo y en una base de datos Supabase; cada cuenta ve únicamente su propia fila (seguridad por fila). Sin sesión, la app sigue funcionando solo con el navegador. En cualquier caso conviene descargar un respaldo de vez en cuando desde *Más › Importar y respaldos*.

## Dictar movimientos por voz (v2.7)

El micrófono (barra superior, o **Dictar** dentro de *Nuevo movimiento*) escucha una frase en español de Colombia con la Web Speech API del navegador y la convierte en un movimiento con reglas propias (sin servicios de pago): monto (`70 mil`, `setenta mil`, `70.000`, `2 millones y medio`, `50 lucas`), cuenta, categoría, gasto/ingreso/traspaso, lujo/necesidad y fecha (hoy si no se dice; entiende `ayer`, `el lunes`, `el 5 de noviembre`). Nunca guarda sola: carga el formulario normal con una tarjeta «Entendí», lo que falta queda en rojo y lo dudoso en amarillo. El código del interpretador está entre `/*VOZ-INICIO*/` y `/*VOZ-FIN*/` en `index.html`.

Chrome envía el audio a los servidores de Google para transcribirlo, así que dictar necesita internet.

Pruebas (Node 18+ y `playwright` instalado): `node tests/test_voz.js` (interpretador, sin navegador) y `node tests/test_voz_ui.js` (interfaz con un reconocedor falso).

## Notificaciones de pagos (v2.9)

En **Más › Notificaciones** hay un interruptor que pide el permiso del navegador y activa los avisos de deudas que vencen en los próximos 7 días o ya se pasaron, y de pagos fijos por confirmar. Todo ocurre en el dispositivo: la app calcula los pagos y los muestra con la Notification API a través de `sw.js`; no hay servidor de push. Los avisos no llevan montos.

- Con la app abierta en segundo plano: revisa cada 15 minutos y avisa una vez al día por cada cambio.
- Con la app cerrada: solo donde el navegador soporta *Periodic Background Sync* (Chrome con la app instalada). La app deja una copia mínima de los pagos en la caché `notif-data` y `sw.js` la lee cuando el navegador lo despierta.
- iPhone y iPad: solo con la app agregada a la pantalla de inicio (iOS 16.4+), y sin avisos con la app cerrada.

Avisos garantizados con la app cerrada requieren push desde el servidor (Supabase Edge Function + cron + claves VAPID); no está implementado. Prueba: `node tests/test_notif.js`.

## Publicar con GitHub Pages

1. Crea un repositorio público en GitHub, por ejemplo `organizado`.
2. Sube este `index.html` (y este README) a la raíz del repositorio.
3. En el repositorio entra a **Settings › Pages**.
4. En *Build and deployment* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guarda.
5. En uno o dos minutos la app queda en `https://TU-USUARIO.github.io/organizado/`. Ese es el link para compartir.

## Base de datos (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com) y ejecuta `supabase/setup.sql` en *SQL Editor*.
2. En *Authentication › Sign In / Providers* deja activado Email, y en *URL Configuration* pon la dirección de la página (Site URL y Redirect URLs).
3. El login por correo y contraseña no necesita configuración extra. Opcional: con un correo propio (SMTP) se pueden editar las plantillas de *Magic Link* y *Confirm signup* para que el correo traiga un código (`{{ .Token }}`) además del enlace. Con el correo por defecto de Supabase el login funciona con el enlace.
4. La URL del proyecto y la clave publicable (`sb_publishable_…`) van al inicio del módulo «nube» de `index.html`. Nunca pongas aquí la clave `secret` ni `service_role`.

## Instalar la app

La página es una app instalable (PWA): tiene manifiesto, íconos propios y un *service worker* (`sw.js`) que guarda una copia para abrirla sin internet. En la app, **Más › Instalar la app** explica los pasos del dispositivo:
- **Android (Chrome):** menú ⋮ › *Instalar app*.
- **iPhone (Safari):** Compartir › *Agregar a pantalla de inicio*.
- **Computador (Chrome o Edge):** ícono de instalar en la barra de direcciones.

Al publicar cambios, sube el número de `V` en `sw.js` si cambias los archivos que guarda (íconos o manifiesto); `index.html` siempre se baja de la red primero.

## Actualizar

Reemplaza `index.html` en el repositorio por la versión nueva. Los datos de las personas no se borran al actualizar: viven en su navegador y, si tienen cuenta, en la nube.
