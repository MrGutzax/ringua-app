/*
 * Ringua · Ajustes
 * Tema claro/oscuro (sistema de temas de Bootstrap 5.3 con data-bs-theme),
 * intervalo de actualización del panel, restablecer los datos de la demo y
 * versión de la aplicación. Las preferencias se guardan en localStorage.
 */

import { CLAVES, leer, guardar } from './almacenamiento.js';
import { emitir } from './bus.js';
import { mostrarAviso } from './utilidades.js';
import { VERSION_APP } from './version.js';

const AJUSTES_POR_DEFECTO = Object.freeze({
  tema: 'sistema',   // 'claro' | 'oscuro' | 'sistema'
  intervalo: 3000,   // milisegundos entre lecturas
});

const TEMAS_VALIDOS = ['claro', 'oscuro', 'sistema'];
const INTERVALOS_VALIDOS = [2000, 3000, 5000, 10000];

/** Color de la barra de estado del sistema (debe coincidir con la cabecera). */
const COLOR_CABECERA = Object.freeze({ light: '#0a4d8c', dark: '#0c2a46' });

const consultaTemaOscuro = window.matchMedia('(prefers-color-scheme: dark)');

let ajustes = cargarAjustes();

/** Lee los ajustes guardados y descarta valores no válidos. */
function cargarAjustes() {
  const guardados = { ...AJUSTES_POR_DEFECTO, ...leer(CLAVES.ajustes, {}) };
  if (!TEMAS_VALIDOS.includes(guardados.tema)) guardados.tema = AJUSTES_POR_DEFECTO.tema;
  if (!INTERVALOS_VALIDOS.includes(guardados.intervalo)) guardados.intervalo = AJUSTES_POR_DEFECTO.intervalo;
  return guardados;
}

function guardarAjustes() {
  guardar(CLAVES.ajustes, ajustes);
  emitir('ajustes-cambiados', { ...ajustes });
}

/** Devuelve una copia de los ajustes actuales. */
export function obtenerAjustes() {
  return { ...ajustes };
}

/** Tema que se ve realmente: 'light' o 'dark'. */
function temaVisible() {
  if (ajustes.tema === 'oscuro') return 'dark';
  if (ajustes.tema === 'claro') return 'light';
  return consultaTemaOscuro.matches ? 'dark' : 'light';
}

/** Aplica el tema a la página y sincroniza los controles que lo muestran. */
function aplicarTema() {
  const tema = temaVisible();
  document.documentElement.setAttribute('data-bs-theme', tema);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_CABECERA[tema]);

  // Botón rápido de la cabecera
  const boton = document.querySelector('[data-accion="alternar-tema"]');
  const icono = boton.querySelector('[data-icono-tema]');
  const textoBoton = tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  icono.className = `bi ${tema === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`;
  boton.setAttribute('aria-label', textoBoton);
  boton.title = textoBoton;

  // Opciones de la pantalla de ajustes
  document.querySelectorAll('[data-opcion-tema]').forEach((opcion) => {
    opcion.checked = opcion.value === ajustes.tema;
  });
}

function cambiarTema(tema) {
  ajustes.tema = tema;
  guardarAjustes();
  aplicarTema();
}

/**
 * Prepara la pantalla de ajustes.
 * @param {object} acciones
 * @param {(ms: number) => void} acciones.alCambiarIntervalo
 * @param {() => void} acciones.alRestablecer
 * @returns {{tema: string, intervalo: number}} Ajustes cargados.
 */
export function iniciarAjustes({ alCambiarIntervalo, alRestablecer }) {
  aplicarTema();

  // Si el usuario eligió "Según el sistema", seguir los cambios del sistema
  consultaTemaOscuro.addEventListener('change', () => {
    if (ajustes.tema === 'sistema') aplicarTema();
  });

  document.querySelectorAll('[data-opcion-tema]').forEach((opcion) => {
    opcion.addEventListener('change', () => {
      if (opcion.checked) cambiarTema(opcion.value);
    });
  });

  document.querySelector('[data-accion="alternar-tema"]').addEventListener('click', () => {
    cambiarTema(temaVisible() === 'dark' ? 'claro' : 'oscuro');
  });

  // Intervalo de actualización
  const selector = document.querySelector('[data-ajuste="intervalo"]');
  selector.value = String(ajustes.intervalo);
  selector.addEventListener('change', () => {
    ajustes.intervalo = Number(selector.value);
    guardarAjustes();
    alCambiarIntervalo(ajustes.intervalo);
    mostrarAviso(`El panel se actualizará cada ${ajustes.intervalo / 1000} segundos.`);
  });

  // Restablecer datos de la demo (con confirmación)
  const ventana = document.querySelector('[data-modal-confirmar]');
  document.querySelector('[data-accion="restablecer"]').addEventListener('click', () => {
    window.bootstrap.Modal.getOrCreateInstance(ventana).show();
  });
  document.querySelector('[data-accion="confirmar-restablecer"]').addEventListener('click', () => {
    alRestablecer();
    window.bootstrap.Modal.getOrCreateInstance(ventana).hide();
    mostrarAviso('Se han restablecido los datos de la demo.');
  });

  // Versión
  document.querySelectorAll('[data-version-app]').forEach((elemento) => {
    elemento.textContent = VERSION_APP;
  });

  return obtenerAjustes();
}
