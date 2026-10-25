/*
 * Ringua · Métricas, umbrales y actuadores
 * Definiciones compartidas por la simulación y por las pantallas. Si se
 * cambia un umbral aquí, cambia en toda la aplicación.
 */

import { formatearNumero } from './utilidades.js';

/** Umbrales de las reglas de automatización. */
export const UMBRALES = Object.freeze({
  nivelMinimo: 25,       // % · por debajo arranca la bomba
  nivelRecuperado: 80,   // % · la bomba se detiene al llegar aquí
  temperaturaMinima: 15, // °C
  temperaturaMaxima: 30, // °C
  humedadMinima: 40,     // % · por debajo se abre la electroválvula
  caudalMinimo: 5,       // L/min
  caudalMaximo: 25,      // L/min · por encima: posible fuga
  caudalGrave: 35,       // L/min · por encima: fuga grave y sirena
  minutosRiego: 6,       // duración de un ciclo de riego
});

/**
 * Métricas que mide la instalación.
 * - dispositivo: sensor que la mide
 * - escalaMaxima: valor que llena la barra de progreso
 * - evaluar(valor): devuelve { estado, texto } para colorear la tarjeta
 */
export const METRICAS = Object.freeze({
  nivel: {
    nombre: 'Nivel de agua',
    unidad: '%',
    decimales: 1,
    escalaMaxima: 100,
    dispositivo: 'DEV-01',
    evaluar(valor) {
      if (valor < UMBRALES.nivelMinimo) return { estado: 'alerta', texto: 'Bajo' };
      return { estado: 'ok', texto: 'Normal' };
    },
  },
  temperatura: {
    nombre: 'Temperatura',
    unidad: '°C',
    decimales: 1,
    escalaMaxima: 45,
    dispositivo: 'DEV-02',
    evaluar(valor) {
      if (valor < UMBRALES.temperaturaMinima - 5) return { estado: 'alerta', texto: 'Muy baja' };
      if (valor > UMBRALES.temperaturaMaxima + 5) return { estado: 'alerta', texto: 'Muy alta' };
      if (valor < UMBRALES.temperaturaMinima) return { estado: 'aviso', texto: 'Baja' };
      if (valor > UMBRALES.temperaturaMaxima) return { estado: 'aviso', texto: 'Alta' };
      return { estado: 'ok', texto: 'Normal' };
    },
  },
  humedad: {
    nombre: 'Humedad del suelo',
    unidad: '%',
    decimales: 1,
    escalaMaxima: 100,
    dispositivo: 'DEV-03',
    evaluar(valor) {
      if (valor < UMBRALES.humedadMinima - 10) return { estado: 'alerta', texto: 'Muy seco' };
      if (valor < UMBRALES.humedadMinima) return { estado: 'aviso', texto: 'Seco' };
      return { estado: 'ok', texto: 'Normal' };
    },
  },
  caudal: {
    nombre: 'Caudal',
    unidad: 'L/min',
    decimales: 1,
    escalaMaxima: 50,
    dispositivo: 'DEV-04',
    evaluar(valor) {
      if (valor > UMBRALES.caudalGrave) return { estado: 'alerta', texto: 'Fuga grave' };
      if (valor > UMBRALES.caudalMaximo) return { estado: 'aviso', texto: 'Anómalo' };
      if (valor < UMBRALES.caudalMinimo) return { estado: 'aviso', texto: 'Muy bajo' };
      return { estado: 'ok', texto: 'Normal' };
    },
  },
});

/** Actuadores: dispositivo asociado y textos para cada estado. */
export const ACTUADORES = Object.freeze({
  bomba: { dispositivo: 'DEV-06', nombre: 'Bomba de impulsión', encendido: 'En marcha', apagado: 'Parada', textoAlApagar: 'detenida' },
  valvula: { dispositivo: 'DEV-05', nombre: 'Electroválvula Sector A', encendido: 'Abierta', apagado: 'Cerrada', textoAlApagar: 'cerrada' },
  sirena: { dispositivo: 'DEV-07', nombre: 'Sirena y baliza', encendido: 'Sonando', apagado: 'En reposo', textoAlApagar: 'desactivadas' },
});

/** Equipos de red imprescindibles para que lleguen los datos y se apliquen las reglas. */
export const RED = Object.freeze({
  gateway: 'DEV-08',
  controlador: 'DEV-09',
});

/** Iconos de Bootstrap Icons para cada estado de una métrica. */
export const ICONOS_ESTADO = Object.freeze({
  ok: 'bi-check-circle-fill',
  aviso: 'bi-exclamation-triangle-fill',
  alerta: 'bi-exclamation-octagon-fill',
  'sin-datos': 'bi-dash-circle',
});

/**
 * Formatea el valor de una métrica con su unidad: "23,4 %".
 * @param {keyof METRICAS} clave
 * @param {number} valor
 */
export function formatearMetrica(clave, valor) {
  const metrica = METRICAS[clave];
  return `${formatearNumero(valor, metrica.decimales)} ${metrica.unidad}`;
}
