/*
 * Ringua · Registro de eventos
 * Guarda los eventos que generan las reglas (alertas, avisos, acciones de
 * los actuadores…) y los cambios que hace el usuario. Se conservan los
 * más recientes en localStorage.
 */

import { CLAVES, leer, guardar } from './almacenamiento.js';
import { emitir } from './bus.js';
import { anunciar } from './utilidades.js';

/** Número máximo de eventos que se conservan. */
const MAXIMO_EVENTOS = 50;

/**
 * Niveles posibles:
 *  - "info"   → información (una válvula se abre, un dispositivo se activa…)
 *  - "exito"  → una situación vuelve a la normalidad
 *  - "aviso"  → valor fuera de rango que conviene vigilar
 *  - "alerta" → situación grave que requiere atención
 */
export const NIVELES = Object.freeze(['info', 'exito', 'aviso', 'alerta']);

let eventos = leer(CLAVES.eventos, []);
let contadorId = Date.now();

/**
 * Añade un evento al registro.
 * @param {'info'|'exito'|'aviso'|'alerta'} nivel
 * @param {string} mensaje Texto que se muestra en el panel.
 * @param {string} [dispositivo] ID del dispositivo relacionado (DEV-01…).
 */
export function registrarEvento(nivel, mensaje, dispositivo = '') {
  const evento = {
    id: `EVT-${(contadorId++).toString(36)}`,
    fecha: Date.now(),
    nivel: NIVELES.includes(nivel) ? nivel : 'info',
    mensaje,
    dispositivo,
  };

  eventos = [evento, ...eventos].slice(0, MAXIMO_EVENTOS);
  guardar(CLAVES.eventos, eventos);

  // Las situaciones importantes se anuncian a los lectores de pantalla
  if (evento.nivel === 'alerta' || evento.nivel === 'aviso') {
    anunciar(mensaje);
  }

  emitir('eventos-cambiados', { nuevo: evento, eventos: obtenerEventos() });
  return evento;
}

/** Devuelve una copia de los eventos, del más reciente al más antiguo. */
export function obtenerEventos() {
  return [...eventos];
}

/** Borra todos los eventos. */
export function limpiarEventos() {
  eventos = [];
  guardar(CLAVES.eventos, eventos);
  emitir('eventos-cambiados', { nuevo: null, eventos: [] });
}
