# QR

PWA para **leer y generar códigos QR** desde el navegador, también sin conexión.
Hecha con [Vite](https://vite.dev) y [jq79](https://github.com/jgermade/jq79).

**https://jgermade.github.io/qr/**

## Qué hace

Generar y leer comparten la misma vista: el QR que se lee aparece donde se dibuja el generado, con el
formulario relleno con lo que contiene, listo para editarlo o descargarlo.

**Generar**

- Texto o enlaces, y redes WiFi (`WIFI:T:WPA;S:…;P:…;;`, con el escapado que pide el formato).
- Nivel de corrección de errores (L/M/Q/H) y colores.
- Descarga en PNG o SVG, copiar la imagen al portapapeles y compartir (donde el navegador lo permite).

**Leer**

- Con la cámara, abriendo una imagen, arrastrándola o pegándola (Ctrl+V).
- Una red WiFi rellena los campos de WiFi (salvo las de empresa, WPA2-EAP…, que llevan campos que el
  formulario no tiene); cualquier otra cosa, el texto tal cual.
- Reconoce enlaces, WiFi, email, teléfono, SMS, ubicaciones y contactos, y ofrece la acción que toca
  (abrir, llamar, copiar la contraseña…) mientras el formulario siga con lo leído. Solo se enlazan esquemas
  seguros (`http`, `https`, `mailto`, `tel`, `sms`): un QR con `javascript:…` se muestra como texto.
- Historial de las últimas lecturas, guardado en el dispositivo.
- Usa el `BarcodeDetector` nativo cuando el navegador lo tiene y [jsQR](https://github.com/cozmo/jsQR)
  en el resto; jsQR va en un chunk aparte y solo se descarga si hace falta.

**PWA**

- Instalable, con service worker ([vite-plugin-pwa](https://vite-pwa-org.netlify.app/)) que precachea
  toda la app: funciona sin conexión y se actualiza sola.
- Acceso directo «Leer un QR» desde el icono, que abre la app con la cámara en marcha.

**Extensión para el navegador** (Chrome, Edge y Firefox)

- El botón de la barra genera el QR de la página que estás viendo, y lee el QR que aparezca en la pestaña.
- Menú contextual: generar el QR de la página, de un enlace o del texto seleccionado, y leer el QR de una
  imagen o de la pantalla.
- Sin permisos sobre las webs: solo `activeTab` (la pestaña actual cuando pulsas el botón o el menú),
  `contextMenus` y `storage`.

## Extensión para el navegador

**Firefox**: la app muestra en el pie «Instalar la extensión para Firefox», que la instala con un clic. Se
actualiza sola con cada release.

**Chrome / Edge**: Chrome solo instala extensiones desde la Chrome Web Store. Mientras no esté publicada:

1. Descarga `qr-extension-chrome-vX.Y.Z.zip` de la [última release](https://github.com/jgermade/qr/releases/latest)
   y descomprímelo.
2. Abre `chrome://extensions` (o `edge://extensions`) y activa el **Modo desarrollador**.
3. **Cargar descomprimida** → elige la carpeta.

## Desarrollo

```sh
npm install
npm run dev       # servidor de desarrollo con HMR
npm test          # tests (Vitest)
npm run build     # build de producción en dist/
npm run preview   # sirve dist/
npm run build:extension   # extensión en dist-extension/chrome y dist-extension/firefox
```

Para probar la extensión, carga `dist-extension/chrome` en `chrome://extensions` (Modo desarrollador →
Cargar descomprimida) o `dist-extension/firefox` en `about:debugging` → Este Firefox → Cargar complemento
temporal. `npx web-ext run -s dist-extension/firefox` abre un Firefox limpio con ella.

La cámara necesita un contexto seguro: `localhost` vale, pero para probar desde el móvil hace falta HTTPS.

## Estructura

```
index.html                 entrada de Vite
src/main.js                monta App.html
src/App.html               cabecera y pie
src/components/
  Workspace.html           generador y lector (formulario, cámara, imagen, historial)
  ScanResult.html          resultado de una lectura
src/lib/
  qr.js                    matriz QR (uqr), SVG y PNG
  scan.js                  decodificación (BarcodeDetector / jsQR) y cámara
  payload.js               formatos: WiFi, enlaces, email, teléfono…
  history.js               historial en localStorage
  extension.js             enlace a la extensión según el navegador
extension/
  manifest.js              manifest.json de Chrome y de Firefox
  popup.html, popup.js     popup (y ventana del menú contextual)
  background.js            menú contextual
  public/icons/            iconos de la extensión
vite.extension.config.js   build de la extensión
tests/                     tests de la lógica y de los componentes
public/                    iconos y favicon
```

La extensión reutiliza `src/lib`, pero no los componentes: jq79 compila las plantillas con `new Function`,
y la CSP de las extensiones (Manifest V3) no permite `unsafe-eval`. El popup es DOM plano.

Los componentes son ficheros `.html` de jq79 (`<script :setup>`, plantilla y `<style scoped>`), que el
plugin `jq79/vite` importa como módulos.

## Despliegue

Workflows de GitHub Actions:

- **`build.yml`**: instala, ejecuta los tests y hace la build. Se lanza en cada push a `main` y en cada
  pull request, y `release.yml` lo reutiliza (`workflow_call`).
- **`release.yml`**: se lanza a mano desde *Actions → Release → Run workflow* eligiendo `patch`,
  `minor` o `major`. Ejecuta `build.yml` con la nueva versión y empaqueta la extensión: zip para Chrome y,
  para Firefox, la sube a Mozilla para que la firme. Después hace commit y tag de la versión
  (`chore(release): x.y.z`), crea la release de GitHub con la build y la extensión adjuntas, y despliega
  la build en GitHub Pages junto al `.xpi` y su `extension/updates.json`, desde donde Firefox la instala
  y la actualiza.
- **`firefox.yml`**: Mozilla suele firmar la extensión en un minuto, pero a veces la manda a revisión
  manual y tarda días. La release no la espera más de 5 minutos: sale sin `.xpi` y Pages sigue sirviendo
  el de la versión anterior. Este workflow comprueba cada 3 horas (o a mano, *Run workflow*) si Mozilla
  ya ha aprobado la última versión; cuando lo hace, adjunta el `.xpi` a la release y vuelve a desplegar
  Pages con él. Si Mozilla la rechaza, falla hasta que salga una versión nueva.
- **`pages.yml`**: el despliegue en Pages que usan los dos anteriores.

Configuración necesaria en el repositorio:

1. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. Si `main` está protegida, permitir que `github-actions[bot]` haga push (el commit de la versión).
3. Para firmar la extensión de Firefox, los secrets `AMO_JWT_ISSUER` y `AMO_JWT_SECRET`
   (*Settings → Secrets and variables → Actions → New repository secret*). Se generan en
   [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/)
   con una cuenta de Mozilla: *Generate new credentials*; el «JWT issuer» es `AMO_JWT_ISSUER` y el
   «JWT secret», `AMO_JWT_SECRET`. Sin ellos la release sale sin `.xpi` y la app no muestra el enlace de
   Firefox. Con ellos hace falta también la variable `FIREFOX_EXTENSION_ID`
   (*Settings → Secrets and variables → Actions → Variables*): el id de la extensión en Firefox, con forma
   de email (`qr@tudominio.com`) aunque no tiene por qué existir. AMO lo asocia a tu cuenta al firmar la
   primera versión y no se puede cambiar después sin publicar otra extensión.
4. Opcional, Chrome Web Store: la variable `CHROME_WEBSTORE_ID` (el id de la extensión, tras publicarla a
   mano la primera vez) y los secrets `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` y `CWS_REFRESH_TOKEN`
   ([cómo obtenerlos](https://github.com/fregante/chrome-webstore-upload-keys)). Con ellos cada release
   publica la nueva versión y la app enlaza a la tienda.
5. Con dominio propio, la variable `SITE_URL` (la URL de la app, acabada en `/`), además de `BASE_PATH`.
3. La app se construye para servirse en `/<repo>/`. Con un dominio propio, crea la variable de
   repositorio `BASE_PATH` con valor `/` (*Settings → Secrets and variables → Actions → Variables*).
