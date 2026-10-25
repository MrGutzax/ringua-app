/*
 * Ringua · Dispositivos
 * 1. Datos: carga data/dispositivos.json y mezcla el estado activo/inactivo
 *    que el usuario haya cambiado (guardado en localStorage).
 * 2. Pantalla: catálogo en tarjetas con filtro por tipo, buscador en tiempo
 *    real, contador de resultados y ventana de detalle para activar o
 *    desactivar cada dispositivo.
 */

import { CLAVES, leer, guardar, borrar } from './almacenamiento.js';
import { emitir, escuchar } from './bus.js';
import { registrarEvento } from './registro.js';
import { ACTUADORES, formatearMetrica } from './metricas.js';
import { normalizarTexto } from './utilidades.js';

const RUTA_DATOS = 'data/dispositivos.json';

const NOMBRES_TIPO = Object.freeze({
  sensor: 'Sensor',
  actuador: 'Actuador',
  red: 'Equipo de red',
});

/** Explicación de qué pasa al desactivar cada tipo de dispositivo. */
const AYUDA_INTERRUPTOR = Object.freeze({
  sensor: 'Si lo desactivas deja de enviar lecturas y sus reglas no se evalúan.',
  actuador: 'Si lo desactivas el controlador no podrá accionarlo.',
  gateway: 'Si lo desactivas se interrumpe la recepción de datos de toda la red.',
  controlador: 'Si lo desactivas se detiene el control automático y los actuadores pasan a reposo.',
});

/* ---------- Estado del módulo ---------- */
let dispositivos = [];       // datos tal cual vienen del JSON
let estadosModificados = {}; // { "DEV-07": "activo" } → solo los que difieren del JSON
let filtroTipo = 'todos';
let textoBusqueda = '';
let ultimaInstantanea = null;
let idEnDetalle = null;

/* =========================================================
   DATOS
   ========================================================= */

/** Descarga la lista de dispositivos. Con el service worker funciona sin conexión. */
export async function cargarDispositivos() {
  const respuesta = await fetch(RUTA_DATOS);
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${RUTA_DATOS} (HTTP ${respuesta.status})`);
  }
  const datos = await respuesta.json();
  dispositivos = datos.dispositivos;
  estadosModificados = leer(CLAVES.dispositivos, {});
  return obtenerDispositivos();
}

function estadoActual(dispositivo) {
  return estadosModificados[dispositivo.id] ?? dispositivo.estado;
}

/** Lista de dispositivos con su estado actual. */
export function obtenerDispositivos() {
  return dispositivos.map((dispositivo) => ({ ...dispositivo, estado: estadoActual(dispositivo) }));
}

/** Un dispositivo por su ID, o null. */
export function obtenerDispositivo(id) {
  const dispositivo = dispositivos.find((d) => d.id === id);
  return dispositivo ? { ...dispositivo, estado: estadoActual(dispositivo) } : null;
}

/** true si el dispositivo existe y está activo. */
export function estaActivo(id) {
  const dispositivo = dispositivos.find((d) => d.id === id);
  return Boolean(dispositivo) && estadoActual(dispositivo) === 'activo';
}

/**
 * Activa o desactiva un dispositivo.
 * @param {string} id
 * @param {boolean} activo
 */
export function cambiarEstado(id, activo) {
  const dispositivo = dispositivos.find((d) => d.id === id);
  if (!dispositivo) return;

  const nuevoEstado = activo ? 'activo' : 'inactivo';
  if (estadoActual(dispositivo) === nuevoEstado) return;

  if (nuevoEstado === dispositivo.estado) {
    delete estadosModificados[id];
  } else {
    estadosModificados[id] = nuevoEstado;
  }
  guardar(CLAVES.dispositivos, estadosModificados);

  registrarEvento('info', `${dispositivo.nombre} ${activo ? 'activado' : 'desactivado'} manualmente`, id);
  emitir('dispositivo-cambiado', { id, activo });
}

/** Devuelve todos los dispositivos a su estado inicial. */
export function restablecerDispositivos() {
  estadosModificados = {};
  borrar(CLAVES.dispositivos);
  emitir('dispositivo-cambiado', { id: null, activo: null });
}

/* =========================================================
   PANTALLA: CATÁLOGO
   ========================================================= */

/** Texto en el que se busca: nombre, ID, IP, ubicación, tipo y script. */
function textoBuscable(d) {
  return normalizarTexto([d.nombre, d.id, d.ip, d.ubicacion, NOMBRES_TIPO[d.tipo], d.script].join(' '));
}

/** Crea las tarjetas a partir de la plantilla <template data-plantilla="dispositivo">. */
function pintarCatalogo() {
  const catalogo = document.querySelector('[data-catalogo]');
  const plantilla = document.querySelector('template[data-plantilla="dispositivo"]');
  catalogo.replaceChildren();

  for (const dispositivo of dispositivos) {
    const columna = plantilla.content.firstElementChild.cloneNode(true);
    columna.dataset.dispositivoId = dispositivo.id;
    columna.dataset.tipo = dispositivo.tipo;
    columna.dataset.busqueda = textoBuscable(dispositivo);

    const rellenar = (campo, texto) => {
      columna.querySelector(`[data-campo="${campo}"]`).textContent = texto;
    };
    rellenar('nombre', dispositivo.nombre);
    rellenar('id', dispositivo.id);
    rellenar('tipo', NOMBRES_TIPO[dispositivo.tipo]);
    rellenar('ip', dispositivo.ip);
    rellenar('ubicacion', dispositivo.ubicacion);
    rellenar('nombre-oculto', `: ${dispositivo.nombre}`);

    const icono = columna.querySelector('[data-campo="icono"]');
    icono.dataset.tipo = dispositivo.tipo;
    icono.querySelector('i').className = `bi bi-${dispositivo.icono}`;

    columna.querySelector('[data-abrir-detalle]').dataset.abrirDetalle = dispositivo.id;
    catalogo.append(columna);
  }

  actualizarEstadosCatalogo();
}

/** Actualiza la etiqueta Activo/Inactivo de cada tarjeta. */
function actualizarEstadosCatalogo() {
  document.querySelectorAll('[data-catalogo] [data-dispositivo-id]').forEach((columna) => {
    const activo = estaActivo(columna.dataset.dispositivoId);
    columna.querySelector('.tarjeta-dispositivo').dataset.activo = String(activo);
    const etiqueta = columna.querySelector('[data-campo="estado"]');
    etiqueta.dataset.activo = String(activo);
    etiqueta.textContent = activo ? 'Activo' : 'Inactivo';
  });
}

/** Muestra u oculta tarjetas según el filtro y la búsqueda, y actualiza el contador. */
function aplicarFiltros() {
  const columnas = document.querySelectorAll('[data-catalogo] [data-dispositivo-id]');
  let visibles = 0;

  columnas.forEach((columna) => {
    const coincideTipo = filtroTipo === 'todos' || columna.dataset.tipo === filtroTipo;
    const coincideTexto = !textoBusqueda || columna.dataset.busqueda.includes(textoBusqueda);
    const visible = coincideTipo && coincideTexto;
    columna.hidden = !visible;
    if (visible) visibles += 1;
  });

  document.querySelectorAll('[data-filtro]').forEach((boton) => {
    boton.setAttribute('aria-pressed', String(boton.dataset.filtro === filtroTipo));
  });

  const total = columnas.length;
  const contador = document.querySelector('[data-contador-resultados]');
  if (visibles === 0) {
    contador.textContent = 'No se ha encontrado ningún dispositivo';
  } else if (visibles === total) {
    contador.textContent = `Mostrando los ${total} dispositivos`;
  } else {
    contador.textContent = `Mostrando ${visibles} de ${total} dispositivos`;
  }

  document.querySelector('[data-sin-resultados]').hidden = visibles !== 0;
}

/* =========================================================
   PANTALLA: VENTANA DE DETALLE
   ========================================================= */

function obtenerModal() {
  const elemento = document.querySelector('[data-modal-detalle]');
  return window.bootstrap.Modal.getOrCreateInstance(elemento);
}

/** Texto de la lectura o estado actual de un dispositivo. */
function describirLectura(dispositivo) {
  const activo = dispositivo.estado === 'activo';
  const instantanea = ultimaInstantanea;
  const sinGateway = instantanea?.comunicacion === 'sin-gateway';

  if (dispositivo.metrica) {
    if (!activo) return { etiqueta: 'Lectura actual', texto: 'Sin datos (sensor inactivo)' };
    if (sinGateway) return { etiqueta: 'Lectura actual', texto: 'Sin conexión con el gateway' };
    const lectura = instantanea?.metricas[dispositivo.metrica];
    if (!lectura?.visible) return { etiqueta: 'Lectura actual', texto: 'Esperando lectura…' };
    return {
      etiqueta: 'Lectura actual',
      texto: `${formatearMetrica(dispositivo.metrica, lectura.valor)} · ${lectura.texto}`,
    };
  }

  if (dispositivo.actuador) {
    if (!activo) return { etiqueta: 'Estado actual', texto: 'No disponible' };
    const definicion = ACTUADORES[dispositivo.actuador];
    const actuador = instantanea?.actuadores[dispositivo.actuador];
    if (!actuador) return { etiqueta: 'Estado actual', texto: definicion.apagado };
    let texto = actuador.encendido ? definicion.encendido : definicion.apagado;
    if (dispositivo.actuador === 'valvula' && actuador.encendido) {
      texto += ` · quedan ${actuador.minutosRestantes} min`;
    }
    return { etiqueta: 'Estado actual', texto };
  }

  // Equipos de red
  if (!activo) return { etiqueta: 'Conexión', texto: 'Sin conexión' };
  if (dispositivo.funcion === 'gateway') {
    const enLinea = obtenerDispositivos().filter((d) => d.estado === 'activo').length;
    return { etiqueta: 'Conexión', texto: `En línea · ${enLinea} equipos activos` };
  }
  if (instantanea?.comunicacion === 'sin-gateway') return { etiqueta: 'Conexión', texto: 'Sin enlace con el gateway' };
  return { etiqueta: 'Conexión', texto: 'En línea · control automático activo' };
}

/** Rellena la ventana de detalle con los datos del dispositivo. */
function pintarDetalle() {
  const dispositivo = obtenerDispositivo(idEnDetalle);
  if (!dispositivo) return;

  const modal = document.querySelector('[data-modal-detalle]');
  const campo = (nombre) => modal.querySelector(`[data-detalle="${nombre}"]`);

  campo('nombre').textContent = dispositivo.nombre;
  campo('id').textContent = dispositivo.id;
  campo('tipo').textContent = NOMBRES_TIPO[dispositivo.tipo];
  campo('descripcion').textContent = dispositivo.descripcion;
  campo('ip').textContent = dispositivo.ip;
  campo('ubicacion').textContent = dispositivo.ubicacion;
  campo('script').textContent = dispositivo.script;

  const icono = campo('icono');
  icono.dataset.tipo = dispositivo.tipo;
  icono.querySelector('i').className = `bi bi-${dispositivo.icono}`;

  const activo = dispositivo.estado === 'activo';
  const estado = campo('estado');
  estado.dataset.activo = String(activo);
  estado.textContent = activo ? 'Activo' : 'Inactivo';

  modal.querySelector('[data-detalle-interruptor]').checked = activo;
  campo('ayuda').textContent = AYUDA_INTERRUPTOR[dispositivo.funcion ?? dispositivo.tipo];

  pintarLecturaDetalle();
}

/** Solo actualiza la lectura en vivo (se llama con cada nueva lectura). */
function pintarLecturaDetalle() {
  const dispositivo = obtenerDispositivo(idEnDetalle);
  if (!dispositivo) return;
  const modal = document.querySelector('[data-modal-detalle]');
  const { etiqueta, texto } = describirLectura(dispositivo);
  modal.querySelector('[data-detalle="lectura-etiqueta"]').textContent = etiqueta;
  modal.querySelector('[data-detalle="lectura"]').textContent = texto;
}

function abrirDetalle(id) {
  idEnDetalle = id;
  pintarDetalle();
  obtenerModal().show();
}

/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

/** Prepara la pantalla de dispositivos. Requiere haber llamado antes a cargarDispositivos(). */
export function iniciarPantallaDispositivos() {
  pintarCatalogo();
  aplicarFiltros();

  // Filtro por tipo
  document.querySelectorAll('[data-filtro]').forEach((boton) => {
    boton.addEventListener('click', () => {
      filtroTipo = boton.dataset.filtro;
      aplicarFiltros();
    });
  });

  // Buscador en tiempo real
  const buscador = document.querySelector('[data-buscador]');
  buscador.addEventListener('input', () => {
    textoBusqueda = normalizarTexto(buscador.value);
    aplicarFiltros();
  });

  // Borrar filtros desde el mensaje "sin resultados"
  document.querySelector('[data-accion="borrar-filtros"]').addEventListener('click', () => {
    filtroTipo = 'todos';
    textoBusqueda = '';
    buscador.value = '';
    aplicarFiltros();
    buscador.focus();
  });

  // Abrir el detalle (delegación de eventos en el catálogo)
  document.querySelector('[data-catalogo]').addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-abrir-detalle]');
    if (boton) abrirDetalle(boton.dataset.abrirDetalle);
  });

  // Interruptor activar/desactivar dentro del detalle
  const interruptor = document.querySelector('[data-detalle-interruptor]');
  interruptor.addEventListener('change', () => {
    if (idEnDetalle) cambiarEstado(idEnDetalle, interruptor.checked);
  });

  document.querySelector('[data-modal-detalle]').addEventListener('hidden.bs.modal', () => {
    idEnDetalle = null;
  });

  // Mantener la pantalla al día
  escuchar('dispositivo-cambiado', () => {
    actualizarEstadosCatalogo();
    if (idEnDetalle) pintarDetalle();
  });

  escuchar('lectura', (instantanea) => {
    ultimaInstantanea = instantanea;
    if (idEnDetalle) pintarLecturaDetalle();
  });
}
