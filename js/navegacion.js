/*
 * Ringua · Navegación
 * Cambia de pantalla sin recargar la página usando el hash de la URL
 * (#/inicio, #/panel…). Así el botón "atrás" del navegador funciona y no
 * hace falta configurar nada en el servidor (útil en GitHub Pages).
 */

import { emitir } from './bus.js';

/** Pantallas disponibles y su título para la pestaña del navegador. */
const PANTALLAS = Object.freeze({
  inicio: 'Inicio',
  panel: 'Panel en vivo',
  dispositivos: 'Dispositivos',
  acerca: 'Acerca de',
  ajustes: 'Ajustes',
});

const PANTALLA_POR_DEFECTO = 'inicio';

let pantallaActual = null;

/** Devuelve el nombre de la pantalla indicada en el hash, o null si no es válida. */
function leerPantallaDelHash() {
  const coincidencia = window.location.hash.match(/^#\/([\w-]+)/);
  const nombre = coincidencia ? coincidencia[1] : null;
  return nombre && Object.hasOwn(PANTALLAS, nombre) ? nombre : null;
}

/**
 * Muestra la pantalla indicada en la URL y marca su enlace como activo.
 * @param {boolean} moverFoco Si es true, lleva el foco al título de la
 *   pantalla (útil para teclado y lectores de pantalla).
 */
function mostrarPantalla(moverFoco) {
  let nombre = leerPantallaDelHash();

  if (!nombre) {
    // El hash "#contenido" lo usa el enlace de salto: no es una pantalla
    if (window.location.hash === '#contenido') return;
    nombre = PANTALLA_POR_DEFECTO;
    if (window.location.hash) {
      history.replaceState(null, '', `#/${nombre}`);
    }
  }

  // Mostrar solo la sección elegida
  document.querySelectorAll('[data-pantalla]').forEach((seccion) => {
    seccion.hidden = seccion.dataset.pantalla !== nombre;
  });

  // Marcar el enlace activo en la barra lateral y en la barra inferior
  document.querySelectorAll('[data-nav-enlace]').forEach((enlace) => {
    const esActivo = enlace.dataset.navEnlace === nombre;
    enlace.classList.toggle('active', esActivo);
    if (esActivo) {
      enlace.setAttribute('aria-current', 'page');
    } else {
      enlace.removeAttribute('aria-current');
    }
  });

  document.title = `${PANTALLAS[nombre]} · Ringua`;

  if (nombre !== pantallaActual) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  if (moverFoco) {
    const titulo = document.querySelector(`[data-pantalla="${nombre}"] [data-titulo-pantalla]`);
    titulo?.focus({ preventScroll: true });
  }

  pantallaActual = nombre;
  emitir('pantalla-cambiada', nombre);
}

/** Enlace "Saltar al contenido": lleva el foco al contenido sin tocar el hash. */
function prepararEnlaceDeSalto() {
  const enlace = document.querySelector('[data-saltar-contenido]');
  enlace?.addEventListener('click', (evento) => {
    evento.preventDefault();
    const titulo = document.querySelector('[data-pantalla]:not([hidden]) [data-titulo-pantalla]');
    (titulo ?? document.querySelector('main'))?.focus();
  });
}

/** Devuelve el nombre de la pantalla visible. */
export function obtenerPantallaActual() {
  return pantallaActual;
}

/** Arranca la navegación: muestra la pantalla inicial y escucha los cambios de hash. */
export function iniciarNavegacion() {
  prepararEnlaceDeSalto();
  window.addEventListener('hashchange', () => mostrarPantalla(true));
  mostrarPantalla(false);
}
