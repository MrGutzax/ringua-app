/*
 * Ringua · Motor de simulación
 *
 * Simula la instalación hídrica y el controlador que aplica las reglas.
 * Cada "lectura" equivale a un minuto de funcionamiento. Los valores no
 * saltan al azar: cada uno parte del anterior, sigue una tendencia física y
 * suma un ruido pequeño. Además, las métricas están relacionadas:
 *
 *  - El nivel del depósito baja según el caudal consumido y sube con la bomba.
 *  - La humedad del suelo baja por evaporación (más rápido con calor) y sube
 *    mientras la electroválvula riega.
 *  - El caudal depende de la demanda, del riego y de las fugas ocasionales.
 *  - La temperatura sigue un ciclo de día y noche acelerado.
 *
 * Después de mover los valores se aplican las reglas (umbrales) y se
 * registran eventos solo cuando cambia una situación, no en cada lectura.
 */

import { CLAVES, leer, guardar } from './almacenamiento.js';
import { emitir, escuchar } from './bus.js';
import { registrarEvento } from './registro.js';
import { estaActivo } from './dispositivos.js';
import { METRICAS, UMBRALES, ACTUADORES, RED, formatearMetrica } from './metricas.js';
import { limitar } from './utilidades.js';

/* ---------- Parámetros físicos de la simulación ---------- */
const VERSION_ESTADO = 1;          // si cambia la forma del estado, se descarta el guardado
const LECTURAS_POR_DIA = 240;      // duración del ciclo térmico (día acelerado)
const CONSUMO_POR_LITRO = 0.08;    // % del depósito que se vacía por cada L/min en un minuto
const APORTE_BOMBA = 6;            // % del depósito que repone la bomba por minuto
const APORTE_RIEGO = 3.6;          // % de humedad que gana el suelo por minuto de riego
const CAUDAL_RIEGO = 6;            // L/min adicionales mientras se riega
const CONSUMO_MEDIO = 12.5;        // L/min de demanda habitual
const PROBABILIDAD_FUGA = 0.006;   // probabilidad de que empiece una fuga en cada lectura
const HISTERESIS_TEMPERATURA = 0.3;
const HISTERESIS_CAUDAL = 0.5;

/* ---------- Estado ---------- */
let estado = null;
let temporizador = null;
let intervaloMs = 3000;

/** Estado de partida de una instalación recién arrancada. */
function crearEstadoInicial() {
  const metricas = { nivel: 64, temperatura: 21.4, humedad: 53, caudal: 12.6 };
  return {
    version: VERSION_ESTADO,
    minuto: 70,                       // reloj simulado (para el ciclo térmico)
    metricas,
    anteriores: { ...metricas },      // lectura previa, para calcular la tendencia
    consumoBase: CONSUMO_MEDIO,       // demanda de agua, varía lentamente
    desvioClima: 0,                   // desviación lenta respecto al ciclo térmico
    actuadores: { bomba: false, valvula: false, sirena: false },
    minutosRiegoRestantes: 0,
    fuga: null,                       // { intensidad, objetivo, fase, minutosEstable }
    condiciones: { nivel: 'ok', temperatura: 'ok', humedad: 'ok', caudal: 'ok' },
    avisosEmitidos: {},               // evita repetir el mismo aviso de "no disponible"
    comunicacion: 'ok',               // 'ok' | 'sin-gateway' | 'sin-controlador'
    ultimaLectura: null,
    enPausa: false,
  };
}

/** Carga el estado guardado o crea uno nuevo. Devuelve true si es nuevo. */
function cargarEstado() {
  const guardado = leer(CLAVES.simulacion, null);
  if (guardado && guardado.version === VERSION_ESTADO) {
    const base = crearEstadoInicial();
    estado = {
      ...base,
      ...guardado,
      metricas: { ...base.metricas, ...guardado.metricas },
      actuadores: { ...base.actuadores, ...guardado.actuadores },
      condiciones: { ...base.condiciones, ...guardado.condiciones },
    };
    return false;
  }
  estado = crearEstadoInicial();
  return true;
}

function guardarEstado() {
  guardar(CLAVES.simulacion, estado);
}

/** Número aleatorio entre -1 y 1 con más probabilidad cerca de 0 (forma de campana). */
function ruido() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

/* =========================================================
   1. FÍSICA: cómo evolucionan los valores
   ========================================================= */

function evolucionarTemperatura() {
  const m = estado.metricas;
  estado.desvioClima = limitar(estado.desvioClima + ruido() * 0.15, -3, 3);

  // Ciclo de día y noche: mínimo al amanecer, máximo por la tarde
  const fase = (estado.minuto % LECTURAS_POR_DIA) / LECTURAS_POR_DIA;
  const objetivo = 22.5 + 7 * Math.sin(2 * Math.PI * (fase - 0.25)) + estado.desvioClima;

  m.temperatura += (objetivo - m.temperatura) * 0.15 + ruido() * 0.12;
  m.temperatura = limitar(m.temperatura, -5, 50);
}

function evolucionarFuga() {
  // A veces aparece una fuga que crece poco a poco, se mantiene y remite
  if (!estado.fuga && Math.random() < PROBABILIDAD_FUGA) {
    estado.fuga = {
      intensidad: 0,
      objetivo: 10 + Math.random() * 18,           // L/min extra en el pico
      fase: 'creciendo',
      minutosEstable: 8 + Math.floor(Math.random() * 10),
    };
  }

  const fuga = estado.fuga;
  if (!fuga) return;

  if (fuga.fase === 'creciendo') {
    fuga.intensidad += 1.5 + Math.random();
    if (fuga.intensidad >= fuga.objetivo) {
      fuga.intensidad = fuga.objetivo;
      fuga.fase = 'estable';
    }
  } else if (fuga.fase === 'estable') {
    fuga.minutosEstable -= 1;
    if (fuga.minutosEstable <= 0) fuga.fase = 'remitiendo';
  } else {
    fuga.intensidad -= 2.5;
    if (fuga.intensidad <= 0) estado.fuga = null;
  }
}

function evolucionarCaudal() {
  const m = estado.metricas;
  // La demanda cambia despacio y tiende a volver a su valor medio
  estado.consumoBase = limitar(
    estado.consumoBase + ruido() * 0.25 + (CONSUMO_MEDIO - estado.consumoBase) * 0.03,
    8,
    17,
  );

  evolucionarFuga();

  const objetivo = estado.consumoBase
    + (estado.actuadores.valvula ? CAUDAL_RIEGO : 0)
    + (estado.fuga ? estado.fuga.intensidad : 0);

  m.caudal += (objetivo - m.caudal) * 0.5 + ruido() * 0.25;
  m.caudal = limitar(m.caudal, 0, 60);
}

function evolucionarNivel() {
  const m = estado.metricas;
  const salida = m.caudal * CONSUMO_POR_LITRO;
  const entrada = estado.actuadores.bomba ? APORTE_BOMBA : 0;
  m.nivel = limitar(m.nivel - salida + entrada + ruido() * 0.08, 0, 100);
}

function evolucionarHumedad() {
  const m = estado.metricas;
  const evaporacion = 0.3 + Math.max(0, m.temperatura - 18) * 0.03;
  const riego = estado.actuadores.valvula ? APORTE_RIEGO : 0;
  m.humedad = limitar(m.humedad - evaporacion + riego + ruido() * 0.1, 0, 100);
}

/** El ciclo de riego dura unos minutos y luego la válvula se cierra sola. */
function descontarRiego() {
  if (!estado.actuadores.valvula) return;
  estado.minutosRiegoRestantes -= 1;
  if (estado.minutosRiegoRestantes <= 0) {
    estado.minutosRiegoRestantes = 0;
    estado.actuadores.valvula = false;
    registrarEvento(
      'info',
      `Riego finalizado. Electroválvula cerrada (humedad ${formatearMetrica('humedad', estado.metricas.humedad)})`,
      ACTUADORES.valvula.dispositivo,
    );
  }
}

/* =========================================================
   2. COMUNICACIONES Y SEGURIDAD
   ========================================================= */

/** Comprueba si el gateway y el controlador están activos y registra los cambios. */
function actualizarComunicacion() {
  const anterior = estado.comunicacion;
  let actual = 'ok';
  if (!estaActivo(RED.gateway)) actual = 'sin-gateway';
  else if (!estaActivo(RED.controlador)) actual = 'sin-controlador';

  if (actual === anterior) return;
  estado.comunicacion = actual;

  if (actual === 'sin-gateway') {
    registrarEvento('alerta', 'Sin conexión con el Home Gateway: no se reciben lecturas', RED.gateway);
  } else if (actual === 'sin-controlador') {
    registrarEvento('aviso', 'Control automático detenido: la placa controladora está desactivada', RED.controlador);
  } else if (anterior === 'sin-gateway') {
    registrarEvento('exito', 'Home Gateway en línea. Se reanuda la recepción de datos', RED.gateway);
  } else {
    registrarEvento('exito', 'Control automático reanudado', RED.controlador);
  }
}

/** Apaga un actuador y deja constancia del motivo. */
function apagarActuador(clave, motivo) {
  if (!estado.actuadores[clave]) return;
  estado.actuadores[clave] = false;
  if (clave === 'valvula') estado.minutosRiegoRestantes = 0;
  const { nombre, textoAlApagar, dispositivo } = ACTUADORES[clave];
  registrarEvento('info', `${nombre} ${textoAlApagar}: ${motivo}`, dispositivo);
}

/**
 * Modo seguro: si falta el control o el propio actuador está desactivado,
 * el actuador se detiene. También se detiene la bomba si no hay lectura de
 * nivel, y la sirena si no hay lectura de caudal.
 */
function aplicarSeguridad() {
  const sinControl = estado.comunicacion !== 'ok';

  for (const clave of Object.keys(ACTUADORES)) {
    if (!estado.actuadores[clave]) continue;
    if (!estaActivo(ACTUADORES[clave].dispositivo)) {
      apagarActuador(clave, 'el dispositivo se ha desactivado');
    } else if (sinControl) {
      apagarActuador(clave, 'sin control automático');
    }
  }

  if (estado.actuadores.bomba && !estaActivo(METRICAS.nivel.dispositivo)) {
    apagarActuador('bomba', 'sin lectura de nivel');
  }
  if (estado.actuadores.sirena && !estaActivo(METRICAS.caudal.dispositivo)) {
    apagarActuador('sirena', 'sin lectura de caudal');
  }
}

/**
 * Valor que "ve" el controlador: null si el sensor está inactivo o no hay
 * gateway. Se redondea a una décima, la resolución de los sensores, para que
 * las reglas y los textos usen exactamente el mismo número.
 */
function lecturaVisible(clave) {
  if (estado.comunicacion === 'sin-gateway') return null;
  if (!estaActivo(METRICAS[clave].dispositivo)) return null;
  return Math.round(estado.metricas[clave] * 10) / 10;
}

/** Registra un aviso de "no disponible" solo una vez por situación. */
function avisarUnaVez(clave, nivel, mensaje, dispositivo) {
  if (estado.avisosEmitidos[clave]) return;
  estado.avisosEmitidos[clave] = true;
  registrarEvento(nivel, mensaje, dispositivo);
}

function olvidarAviso(clave) {
  delete estado.avisosEmitidos[clave];
}

/* =========================================================
   3. REGLAS DE AUTOMATIZACIÓN
   ========================================================= */

/** Nivel < 25 % → bomba en marcha y alerta. Se detiene al llegar al 80 %. */
function reglaNivel() {
  const nivel = lecturaVisible('nivel');
  if (nivel === null) {
    estado.condiciones.nivel = 'ok';
    return;
  }

  const bomba = ACTUADORES.bomba;
  const bajo = nivel < UMBRALES.nivelMinimo;

  if (bajo && estado.condiciones.nivel !== 'bajo') {
    estado.condiciones.nivel = 'bajo';
    registrarEvento('alerta', `Nivel de agua bajo: ${formatearMetrica('nivel', nivel)} (mínimo ${UMBRALES.nivelMinimo} %)`, METRICAS.nivel.dispositivo);
  } else if (!bajo && estado.condiciones.nivel === 'bajo') {
    estado.condiciones.nivel = 'ok';
  }

  if (bajo && !estado.actuadores.bomba) {
    if (estaActivo(bomba.dispositivo)) {
      estado.actuadores.bomba = true;
      olvidarAviso('bomba');
      registrarEvento('info', 'Bomba de impulsión en marcha para reponer el depósito', bomba.dispositivo);
    } else {
      avisarUnaVez('bomba', 'alerta', 'No se puede reponer el depósito: la bomba está desactivada', bomba.dispositivo);
    }
  }

  if (estado.actuadores.bomba && nivel >= UMBRALES.nivelRecuperado) {
    estado.actuadores.bomba = false;
    registrarEvento('exito', `Depósito recuperado (${formatearMetrica('nivel', nivel)}). Bomba detenida`, bomba.dispositivo);
  }

  if (!bajo) olvidarAviso('bomba');
}

/** Temperatura fuera de 15–30 °C → aviso. */
function reglaTemperatura() {
  const temperatura = lecturaVisible('temperatura');
  if (temperatura === null) {
    estado.condiciones.temperatura = 'ok';
    return;
  }

  const anterior = estado.condiciones.temperatura;
  const { temperaturaMinima: minima, temperaturaMaxima: maxima } = UMBRALES;

  // La histéresis evita avisos repetidos cuando el valor oscila junto al umbral
  let actual = 'ok';
  if (temperatura > maxima || (anterior === 'alta' && temperatura > maxima - HISTERESIS_TEMPERATURA)) actual = 'alta';
  else if (temperatura < minima || (anterior === 'baja' && temperatura < minima + HISTERESIS_TEMPERATURA)) actual = 'baja';

  if (actual === anterior) return;
  estado.condiciones.temperatura = actual;

  const valor = formatearMetrica('temperatura', temperatura);
  const dispositivo = METRICAS.temperatura.dispositivo;
  if (actual === 'alta') registrarEvento('aviso', `Temperatura alta: ${valor} (máximo ${maxima} °C)`, dispositivo);
  else if (actual === 'baja') registrarEvento('aviso', `Temperatura baja: ${valor} (mínimo ${minima} °C)`, dispositivo);
  else registrarEvento('exito', `Temperatura de nuevo en rango: ${valor}`, dispositivo);
}

/** Humedad < 40 % → la electroválvula del Sector A riega unos minutos. */
function reglaHumedad() {
  const humedad = lecturaVisible('humedad');
  if (humedad === null) {
    estado.condiciones.humedad = 'ok';
    return;
  }

  const valvula = ACTUADORES.valvula;
  const seco = humedad < UMBRALES.humedadMinima;

  if (seco && estado.condiciones.humedad !== 'seco') {
    estado.condiciones.humedad = 'seco';
    registrarEvento('aviso', `Humedad del suelo baja: ${formatearMetrica('humedad', humedad)} (mínimo ${UMBRALES.humedadMinima} %)`, METRICAS.humedad.dispositivo);
  } else if (!seco && estado.condiciones.humedad === 'seco') {
    estado.condiciones.humedad = 'ok';
  }

  if (seco && !estado.actuadores.valvula) {
    if (estaActivo(valvula.dispositivo)) {
      estado.actuadores.valvula = true;
      estado.minutosRiegoRestantes = UMBRALES.minutosRiego;
      olvidarAviso('valvula');
      registrarEvento('info', `Electroválvula del Sector A abierta: riego de ${UMBRALES.minutosRiego} min`, valvula.dispositivo);
    } else {
      avisarUnaVez('valvula', 'aviso', 'Riego no disponible: la electroválvula está desactivada', valvula.dispositivo);
    }
  }

  if (!seco) olvidarAviso('valvula');
}

/** Caudal fuera de 5–25 L/min → posible fuga. Por encima de 35 L/min → sirena. */
function reglaCaudal() {
  const caudal = lecturaVisible('caudal');
  if (caudal === null) {
    estado.condiciones.caudal = 'ok';
    return;
  }

  const anterior = estado.condiciones.caudal;
  const { caudalMinimo, caudalMaximo, caudalGrave } = UMBRALES;

  let actual = 'ok';
  if (caudal > caudalGrave || (anterior === 'grave' && caudal > caudalGrave - HISTERESIS_CAUDAL * 2)) {
    actual = 'grave';
  } else if (caudal > caudalMaximo || caudal < caudalMinimo
    || (anterior !== 'ok' && caudal > caudalMaximo - HISTERESIS_CAUDAL)) {
    actual = 'anomalo';
  }

  const valor = formatearMetrica('caudal', caudal);
  const dispositivo = METRICAS.caudal.dispositivo;

  if (actual !== anterior) {
    estado.condiciones.caudal = actual;
    if (actual === 'grave') {
      registrarEvento('alerta', `Fuga grave: ${valor} en la tubería principal`, dispositivo);
    } else if (actual === 'anomalo' && anterior === 'ok') {
      const texto = caudal < caudalMinimo ? 'Caudal muy bajo' : 'Caudal anómalo';
      registrarEvento('aviso', `${texto}: ${valor}. Posible fuga en la red`, dispositivo);
    } else if (actual === 'ok') {
      registrarEvento('exito', `Caudal normalizado: ${valor}`, dispositivo);
    }
  }

  const sirena = ACTUADORES.sirena;
  if (actual === 'grave' && !estado.actuadores.sirena) {
    if (estaActivo(sirena.dispositivo)) {
      estado.actuadores.sirena = true;
      olvidarAviso('sirena');
      registrarEvento('alerta', 'Sirena y baliza de emergencia activadas', sirena.dispositivo);
    } else {
      avisarUnaVez('sirena', 'aviso', 'Sirena no disponible: el dispositivo está desactivado', sirena.dispositivo);
    }
  }

  if (actual === 'ok') {
    olvidarAviso('sirena');
    if (estado.actuadores.sirena) {
      estado.actuadores.sirena = false;
      registrarEvento('info', 'Sirena desactivada: el caudal ha vuelto a la normalidad', sirena.dispositivo);
    }
  }
}

function aplicarReglas() {
  if (estado.comunicacion !== 'ok') return;
  reglaNivel();
  reglaTemperatura();
  reglaHumedad();
  reglaCaudal();
}

/* =========================================================
   4. CICLO DE LECTURA E INSTANTÁNEAS
   ========================================================= */

/** Avanza un minuto la instalación, aplica las reglas y avisa a las pantallas. */
function avanzar() {
  estado.minuto += 1;
  estado.anteriores = { ...estado.metricas };

  evolucionarTemperatura();
  evolucionarCaudal();
  evolucionarNivel();
  evolucionarHumedad();
  descontarRiego();

  actualizarComunicacion();
  aplicarSeguridad();
  aplicarReglas();

  estado.ultimaLectura = Date.now();
  guardarEstado();
  emitir('lectura', obtenerInstantanea());
}

function calcularTendencia(clave) {
  const diferencia = estado.metricas[clave] - (estado.anteriores[clave] ?? estado.metricas[clave]);
  if (diferencia > 0.05) return 'sube';
  if (diferencia < -0.05) return 'baja';
  return 'estable';
}

/**
 * Copia del estado lista para pintar en pantalla.
 * Las pantallas nunca modifican el estado directamente.
 */
export function obtenerInstantanea() {
  const metricas = {};
  let alertasActivas = 0;

  for (const [clave, definicion] of Object.entries(METRICAS)) {
    const valor = estado.metricas[clave];
    const sensorActivo = estaActivo(definicion.dispositivo);
    const visible = estado.comunicacion !== 'sin-gateway' && sensorActivo;

    let evaluacion = { estado: 'sin-datos', texto: sensorActivo ? 'Sin conexión' : 'Sensor inactivo' };
    if (visible && estado.ultimaLectura) {
      evaluacion = definicion.evaluar(valor);
      if (evaluacion.estado !== 'ok') alertasActivas += 1;
    }

    metricas[clave] = {
      valor,
      visible: visible && Boolean(estado.ultimaLectura),
      estado: evaluacion.estado,
      texto: evaluacion.texto,
      tendencia: calcularTendencia(clave),
    };
  }

  const actuadores = {};
  for (const [clave, definicion] of Object.entries(ACTUADORES)) {
    actuadores[clave] = {
      encendido: estado.actuadores[clave],
      disponible: estaActivo(definicion.dispositivo),
    };
  }
  actuadores.valvula.minutosRestantes = estado.minutosRiegoRestantes;

  return {
    marcaTiempo: estado.ultimaLectura,
    enPausa: estado.enPausa,
    intervalo: intervaloMs,
    comunicacion: estado.comunicacion,
    metricas,
    actuadores,
    alertasActivas,
  };
}

/* =========================================================
   5. CONTROL DE LA SIMULACIÓN (API pública)
   ========================================================= */

function programar() {
  window.clearInterval(temporizador);
  temporizador = null;
  if (!estado.enPausa) {
    temporizador = window.setInterval(avanzar, intervaloMs);
  }
}

function notificarEstado() {
  emitir('simulacion-estado', { enPausa: estado.enPausa, intervalo: intervaloMs });
}

/**
 * Arranca la simulación.
 * @param {object} opciones
 * @param {number} opciones.intervalo Milisegundos entre lecturas.
 */
export function iniciarSimulacion({ intervalo }) {
  intervaloMs = intervalo;
  const esNueva = cargarEstado();
  if (esNueva) {
    registrarEvento('info', 'Sistema iniciado. Home Gateway 192.168.10.1 en línea', RED.gateway);
  }

  // Cuando el usuario activa o desactiva un dispositivo, se reacciona al momento
  escuchar('dispositivo-cambiado', () => {
    actualizarComunicacion();
    aplicarSeguridad();
    guardarEstado();
    emitir('lectura', obtenerInstantanea());
  });

  // Primera lectura inmediata para no esperar al primer intervalo
  if (!estado.enPausa || !estado.ultimaLectura) {
    avanzar();
  } else {
    emitir('lectura', obtenerInstantanea());
  }
  programar();
  notificarEstado();
}

/** Cambia el tiempo entre lecturas. */
export function establecerIntervalo(milisegundos) {
  intervaloMs = milisegundos;
  programar();
  notificarEstado();
  emitir('lectura', obtenerInstantanea());
}

export function pausar() {
  estado.enPausa = true;
  guardarEstado();
  programar();
  notificarEstado();
}

export function reanudar() {
  estado.enPausa = false;
  guardarEstado();
  avanzar();
  programar();
  notificarEstado();
}

export function alternarPausa() {
  if (estado.enPausa) reanudar();
  else pausar();
}

export function estaEnPausa() {
  return estado.enPausa;
}

/** Vuelve al estado inicial (lo usa "Restablecer datos de la demo"). */
export function reiniciarSimulacion() {
  estado = crearEstadoInicial();
  registrarEvento('info', 'Sistema iniciado. Home Gateway 192.168.10.1 en línea', RED.gateway);
  avanzar();
  programar();
  notificarEstado();
}
