# ORGANIZADO$

App web de finanzas personales pensada para el celular: registro rápido de gastos, ingresos y traspasos, cartera con saldo por cuenta, análisis con gráficos, presupuesto mensual, control de deudas y préstamos con recordatorios de pago, metas de ahorro (con lo disponible y lo apartado en cada cuenta) y una lista de compras rápida.

**Cuentas y nube (v2.0).** Quien inicia sesión con su correo (con contraseña, o con un enlace que llega al correo) ve sus datos desde cualquier dispositivo. Los datos se guardan en el dispositivo y en una base de datos Supabase; cada cuenta ve únicamente su propia fila (seguridad por fila). Sin sesión, la app sigue funcionando solo con el navegador. En cualquier caso conviene descargar un respaldo de vez en cuando desde *Más › Importar y respaldos*.

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
