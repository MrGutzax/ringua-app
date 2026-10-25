/*
 * Ringua · Instalación y modo sin conexión
 * - Registra el service worker (sw.js), que guarda la app en caché.
 * - Muestra el botón "Instalar app" cuando el navegador lo permite
 *   (evento beforeinstallprompt de Chrome, Edge y Android).
 * - En iPhone/iPad explica cómo instalarla desde Safari.
 * - Avisa cuando hay una versión nueva y cuando se pierde la conexión.
 */

import { mostrarAviso } from './utilidades.js';

let eventoInstalacion = null;     // se guarda para lanzarlo al pulsar el botón
let actualizacionSolicitada = false;

const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** true si la app se está ejecutando instalada (ventana propia). */
function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function mostrarBotonesInstalar(visibles) {
  document.querySelectorAll('[data-accion="instalar"]').forEach((boton) => {
    boton.hidden = !visibles;
  });
}

/** Texto de la tarjeta "Instalar la aplicación" de Ajustes. */
function pintarEstadoInstalacion() {
  const texto = document.querySelector('[data-instalacion-estado]');
  const instruccionesIOS = document.querySelector('[data-instrucciones-ios]');
  instruccionesIOS.hidden = true;

  if (estaInstalada()) {
    texto.textContent = 'Estás usando Ringua como aplicación instalada.';
  } else if (eventoInstalacion) {
    texto.textContent = 'Instala Ringua para abrirla en su propia ventana y usarla sin conexión.';
  } else if (esIOS) {
    texto.textContent = 'En iPhone y iPad la instalación se hace desde el menú de Safari.';
    instruccionesIOS.hidden = false;
  } else {
    texto.textContent = 'Cuando tu navegador lo permita aparecerá aquí el botón para instalar. '
      + 'En Chrome y Edge también puedes usar el icono de instalar de la barra de direcciones.';
  }
}

async function instalar() {
  if (!eventoInstalacion) return;
  eventoInstalacion.prompt();
  const { outcome } = await eventoInstalacion.userChoice;
  eventoInstalacion = null;
  mostrarBotonesInstalar(false);
  pintarEstadoInstalacion();
  if (outcome === 'dismissed') {
    mostrarAviso('Puedes instalar Ringua más tarde desde Ajustes.');
  }
}

/* ---------- Service worker ---------- */

function pintarEstadoOffline(texto) {
  document.querySelectorAll('[data-estado-offline]').forEach((elemento) => {
    elemento.textContent = texto;
  });
}

/** Pregunta al service worker qué versión de caché tiene. */
function consultarVersionCache(trabajador) {
  const canal = new MessageChannel();
  canal.port1.onmessage = ({ data }) => {
    document.querySelectorAll('[data-version-cache]').forEach((elemento) => {
      elemento.textContent = data.cache;
    });
  };
  trabajador.postMessage({ tipo: 'OBTENER_VERSION' }, [canal.port2]);
}

/** Ofrece actualizar cuando hay un service worker nuevo esperando. */
function avisarActualizacion(trabajadorNuevo) {
  mostrarAviso('Hay una versión nueva de Ringua disponible.', {
    duracion: 0,
    accion: {
      texto: 'Actualizar',
      alPulsar: () => {
        actualizacionSolicitada = true;
        trabajadorNuevo.postMessage({ tipo: 'ACTIVAR_YA' });
      },
    },
  });
}

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    pintarEstadoOffline('No disponible en este navegador');
    return;
  }

  try {
    const registro = await navigator.serviceWorker.register('./sw.js');

    if (registro.waiting && navigator.serviceWorker.controller) {
      avisarActualizacion(registro.waiting);
    }

    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing;
      nuevo?.addEventListener('statechange', () => {
        // Solo es una "actualización" si ya había una versión controlando la página
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          avisarActualizacion(nuevo);
        }
      });
    });

    // Al activarse la versión nueva se recarga una sola vez
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (actualizacionSolicitada) {
        actualizacionSolicitada = false;
        window.location.reload();
      }
    });

    const listo = await navigator.serviceWorker.ready;
    pintarEstadoOffline('Activado: la app funciona sin conexión');
    if (listo.active) consultarVersionCache(listo.active);
  } catch (error) {
    console.warn('[Ringua] No se pudo registrar el service worker.', error);
    pintarEstadoOffline('No disponible (se necesita HTTPS o localhost)');
  }
}

/* ---------- Indicador de conexión ---------- */

function pintarConexion() {
  document.querySelectorAll('[data-indicador-offline]').forEach((indicador) => {
    indicador.hidden = navigator.onLine;
  });
}

/** Prepara la instalación, el service worker y el indicador de conexión. */
export function iniciarInstalacion() {
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    eventoInstalacion = evento;
    mostrarBotonesInstalar(!estaInstalada());
    pintarEstadoInstalacion();
  });

  window.addEventListener('appinstalled', () => {
    eventoInstalacion = null;
    mostrarBotonesInstalar(false);
    pintarEstadoInstalacion();
    mostrarAviso('Ringua se ha instalado correctamente.');
  });

  document.querySelectorAll('[data-accion="instalar"]').forEach((boton) => {
    boton.addEventListener('click', instalar);
  });

  window.addEventListener('online', () => {
    pintarConexion();
    mostrarAviso('Conexión recuperada.');
  });
  window.addEventListener('offline', () => {
    pintarConexion();
    mostrarAviso('Sin conexión. Ringua sigue funcionando con los datos guardados.');
  });

  pintarConexion();
  pintarEstadoInstalacion();
  registrarServiceWorker();
}
