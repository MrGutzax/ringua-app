/*
 * Ringua · Service worker
 *
 * Guarda en caché todos los archivos de la app al instalarse para que
 * funcione sin conexión. Cada versión usa una caché con su propio nombre:
 * al cambiar VERSION, el navegador descarga los archivos nuevos y la caché
 * antigua se borra al activarse la versión nueva.
 *
 * Estrategias:
 *  - Archivos de la app (HTML, CSS, JS, iconos, Bootstrap): primero caché.
 *  - data/*.json: se responde con la caché y se actualiza en segundo plano.
 *  - Navegación sin conexión: siempre se devuelve index.html.
 */

const VERSION = '0.1.0-beta-1';
const NOMBRE_CACHE = `ringua-${VERSION}`;

/** Todo lo necesario para que la app funcione sin conexión (rutas relativas). */
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './js/tema-inicial.js',
  './js/app.js',
  './js/ajustes.js',
  './js/almacenamiento.js',
  './js/bus.js',
  './js/dispositivos.js',
  './js/inicio.js',
  './js/instalacion.js',
  './js/metricas.js',
  './js/navegacion.js',
  './js/panel.js',
  './js/registro.js',
  './js/simulacion.js',
  './js/utilidades.js',
  './js/version.js',
  './data/dispositivos.json',
  './icons/logo.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './vendor/bootstrap/css/bootstrap.min.css',
  './vendor/bootstrap/js/bootstrap.bundle.min.js',
  './vendor/bootstrap-icons/bootstrap-icons.min.css',
  './vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  './vendor/bootstrap-icons/fonts/bootstrap-icons.woff',
];

/* ---------- Instalación: descargar y guardar todos los archivos ---------- */
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(NOMBRE_CACHE).then((cache) => cache.addAll(ARCHIVOS)),
  );
  // No se activa solo si ya hay una versión anterior: la página ofrece "Actualizar"
});

/* ---------- Activación: borrar cachés de versiones anteriores ---------- */
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith('ringua-') && nombre !== NOMBRE_CACHE)
          .map((nombre) => caches.delete(nombre)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* ---------- Mensajes desde la página ---------- */
self.addEventListener('message', (evento) => {
  const tipo = evento.data?.tipo;
  if (tipo === 'ACTIVAR_YA') {
    self.skipWaiting();
  } else if (tipo === 'OBTENER_VERSION') {
    evento.ports[0]?.postMessage({ version: VERSION, cache: NOMBRE_CACHE });
  }
});

/* ---------- Peticiones ---------- */
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  if (peticion.mode === 'navigate') {
    evento.respondWith(responderNavegacion(peticion));
  } else if (url.pathname.endsWith('.json') && url.pathname.includes('/data/')) {
    evento.respondWith(cacheYActualizar(evento, peticion));
  } else {
    evento.respondWith(primeroCache(peticion));
  }
});

/** Páginas: la copia guardada de index.html; si no existe, la red. */
async function responderNavegacion(peticion) {
  const cache = await caches.open(NOMBRE_CACHE);
  const guardada = await cache.match(peticion, { ignoreSearch: true })
    ?? await cache.match('./index.html');
  if (guardada) return guardada;
  return fetch(peticion);
}

/** Archivos estáticos: caché; si falta, red (y se guarda para la próxima vez). */
async function primeroCache(peticion) {
  const cache = await caches.open(NOMBRE_CACHE);
  const guardada = await cache.match(peticion, { ignoreSearch: true });
  if (guardada) return guardada;

  const respuesta = await fetch(peticion);
  if (respuesta.ok && respuesta.type === 'basic') {
    cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

/** Datos: se responde al momento con la caché y se pide la versión nueva en segundo plano. */
async function cacheYActualizar(evento, peticion) {
  const cache = await caches.open(NOMBRE_CACHE);
  const guardada = await cache.match(peticion, { ignoreSearch: true });

  const desdeRed = fetch(peticion)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(peticion, respuesta.clone());
      return respuesta;
    })
    .catch(() => guardada);

  if (guardada) {
    evento.waitUntil(desdeRed);
    return guardada;
  }
  return desdeRed;
}
