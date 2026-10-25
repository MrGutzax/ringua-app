/*
 * Ringua · Bus de eventos
 * Canal sencillo para que los módulos se comuniquen sin depender unos de
 * otros. Por ejemplo, la simulación emite "lectura" y el panel la escucha.
 *
 * Eventos que circulan por el bus:
 *  - "lectura"               → nueva instantánea de la simulación
 *  - "simulacion-estado"     → la simulación se ha pausado o reanudado
 *  - "eventos-cambiados"     → el registro de eventos ha cambiado
 *  - "dispositivo-cambiado"  → un dispositivo se ha activado o desactivado
 *  - "pantalla-cambiada"     → el usuario ha cambiado de pantalla
 *  - "ajustes-cambiados"     → han cambiado el tema o el intervalo
 */

const canal = new EventTarget();

/**
 * Publica un evento en el bus.
 * @param {string} nombre Nombre del evento.
 * @param {*} [detalle] Datos que acompañan al evento.
 */
export function emitir(nombre, detalle) {
  canal.dispatchEvent(new CustomEvent(nombre, { detail: detalle }));
}

/**
 * Se suscribe a un evento del bus.
 * @param {string} nombre Nombre del evento.
 * @param {(detalle: *) => void} manejador Función que recibe los datos.
 * @returns {() => void} Función para cancelar la suscripción.
 */
export function escuchar(nombre, manejador) {
  const envoltorio = (evento) => manejador(evento.detail);
  canal.addEventListener(nombre, envoltorio);
  return () => canal.removeEventListener(nombre, envoltorio);
}
