/*
 * Ringua · Utilidades
 * Funciones pequeñas que usan varios módulos: formato de números y horas,
 * normalización de texto, avisos emergentes y anuncios para lectores de
 * pantalla.
 */

const LOCALE = 'es-ES';

/**
 * Formatea un número con separador decimal español.
 * @param {number} valor
 * @param {number} [decimales=1]
 */
export function formatearNumero(valor, decimales = 1) {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/**
 * Devuelve la hora en formato hh:mm:ss.
 * @param {number} marcaTiempo Milisegundos desde 1970.
 */
export function formatearHora(marcaTiempo) {
  return new Date(marcaTiempo).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Hora si es de hoy; fecha corta y hora si es de otro día.
 * @param {number} marcaTiempo Milisegundos desde 1970.
 */
export function formatearMomento(marcaTiempo) {
  const fecha = new Date(marcaTiempo);
  const hoy = new Date();
  if (fecha.toDateString() === hoy.toDateString()) {
    return formatearHora(marcaTiempo);
  }
  return fecha.toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Pasa el texto a minúsculas y quita las tildes para comparar búsquedas.
 * "Electroválvula" → "electrovalvula"
 * @param {string} texto
 */
export function normalizarTexto(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Lee un mensaje en voz alta a los lectores de pantalla (región aria-live).
 * @param {string} mensaje
 */
export function anunciar(mensaje) {
  const region = document.querySelector('[data-anuncio]');
  if (!region) return;
  // Vaciar primero garantiza que se anuncie aunque el texto se repita
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = mensaje;
  }, 60);
}

/**
 * Muestra un aviso emergente (toast de Bootstrap).
 * @param {string} texto Mensaje del aviso.
 * @param {object} [opciones]
 * @param {{texto: string, alPulsar: () => void}} [opciones.accion] Botón opcional.
 * @param {number} [opciones.duracion=5000] Milisegundos visible. 0 = no se oculta solo.
 */
export function mostrarAviso(texto, { accion = null, duracion = 5000 } = {}) {
  const contenedor = document.querySelector('[data-contenedor-avisos]');
  const plantilla = document.querySelector('template[data-plantilla="aviso"]');
  if (!contenedor || !plantilla || !window.bootstrap) return;

  const aviso = plantilla.content.firstElementChild.cloneNode(true);
  aviso.querySelector('[data-aviso-texto]').textContent = texto;

  if (accion) {
    const boton = aviso.querySelector('[data-aviso-accion]');
    boton.textContent = accion.texto;
    boton.hidden = false;
    boton.addEventListener('click', () => {
      accion.alPulsar();
      window.bootstrap.Toast.getOrCreateInstance(aviso).hide();
    });
  }

  contenedor.append(aviso);
  aviso.addEventListener('hidden.bs.toast', () => aviso.remove());

  const toast = window.bootstrap.Toast.getOrCreateInstance(aviso, {
    autohide: duracion > 0,
    delay: duracion,
  });
  toast.show();
}

/**
 * Limita un número a un rango.
 * @param {number} valor
 * @param {number} minimo
 * @param {number} maximo
 */
export function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}
