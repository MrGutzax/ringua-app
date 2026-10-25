/*
 * Ringua · Almacenamiento
 * Envoltorio de localStorage. Todas las claves llevan el prefijo "ringua:"
 * y los valores se guardan como JSON. Si el navegador bloquea el
 * almacenamiento (modo privado estricto, cuota llena…) la app sigue
 * funcionando, solo que sin recordar el estado.
 */

const PREFIJO = 'ringua:';

/** Claves que usa la aplicación. */
export const CLAVES = Object.freeze({
  dispositivos: 'dispositivos', // estado activo/inactivo modificado por el usuario
  eventos: 'eventos',           // registro de eventos del panel
  ajustes: 'ajustes',           // tema e intervalo (también lo lee tema-inicial.js)
  simulacion: 'simulacion',     // última lectura y estado interno de la simulación
});

/**
 * Lee un valor guardado.
 * @param {string} clave Una de las CLAVES.
 * @param {*} valorPorDefecto Valor devuelto si no existe o no se puede leer.
 */
export function leer(clave, valorPorDefecto = null) {
  try {
    const texto = localStorage.getItem(PREFIJO + clave);
    return texto === null ? valorPorDefecto : JSON.parse(texto);
  } catch (error) {
    console.warn(`[Ringua] No se pudo leer "${clave}" del almacenamiento.`, error);
    return valorPorDefecto;
  }
}

/**
 * Guarda un valor.
 * @param {string} clave Una de las CLAVES.
 * @param {*} valor Cualquier valor serializable a JSON.
 */
export function guardar(clave, valor) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch (error) {
    console.warn(`[Ringua] No se pudo guardar "${clave}".`, error);
  }
}

/**
 * Elimina un valor guardado.
 * @param {string} clave Una de las CLAVES.
 */
export function borrar(clave) {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch (error) {
    console.warn(`[Ringua] No se pudo borrar "${clave}".`, error);
  }
}
