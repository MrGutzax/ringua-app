/*
 * Ringua · Inicio
 * Resumen del estado de la instalación: dispositivos activos, alertas
 * activas, última lectura, lecturas actuales y último evento.
 */

import { escuchar } from './bus.js';
import { obtenerDispositivos } from './dispositivos.js';
import { obtenerEventos } from './registro.js';
import { METRICAS, formatearMetrica } from './metricas.js';
import { formatearHora, formatearMomento } from './utilidades.js';
import { pintarChipEstado } from './panel.js';

let ultimaInstantanea = null;

function rellenar(nombre, texto) {
  document.querySelectorAll(`[data-resumen="${nombre}"]`).forEach((elemento) => {
    elemento.textContent = texto;
  });
}

/** Contadores de dispositivos activos. */
function pintarDispositivos() {
  const dispositivos = obtenerDispositivos();
  rellenar('activos', String(dispositivos.filter((d) => d.estado === 'activo').length));
  rellenar('total', String(dispositivos.length));
}

/** Último evento registrado. */
function pintarUltimoEvento() {
  const [ultimo] = obtenerEventos();
  rellenar('ultimo-evento', ultimo ? `${ultimo.mensaje} (${formatearMomento(ultimo.fecha)})` : 'sin eventos');
}

/** Bloque de estado general: verde, ámbar, rojo o gris. */
function pintarEstadoGeneral(instantanea) {
  const bloque = document.querySelector('[data-estado-general]');
  const icono = bloque.querySelector('[data-estado-general-icono]');
  const titulo = bloque.querySelector('[data-estado-general-titulo]');
  const texto = bloque.querySelector('[data-estado-general-texto]');

  const conProblemas = Object.entries(instantanea.metricas).filter(([, m]) => m.estado === 'aviso' || m.estado === 'alerta');
  const hayAlerta = conProblemas.some(([, m]) => m.estado === 'alerta');
  const nombres = conProblemas.map(([clave]) => METRICAS[clave].nombre).join(', ');

  let estado = 'ok';
  let claseIcono = 'bi-check-circle-fill';
  let textoTitulo = 'Todo en orden';
  let textoDetalle = 'Todas las métricas están dentro de sus umbrales.';

  if (instantanea.comunicacion === 'sin-gateway') {
    estado = 'sin-conexion';
    claseIcono = 'bi-wifi-off';
    textoTitulo = 'Sin conexión con el gateway';
    textoDetalle = 'Activa el Home Gateway (DEV-08) en Dispositivos para volver a recibir lecturas.';
  } else if (conProblemas.length > 0) {
    estado = hayAlerta ? 'alerta' : 'aviso';
    claseIcono = hayAlerta ? 'bi-exclamation-octagon-fill' : 'bi-exclamation-triangle-fill';
    textoTitulo = conProblemas.length === 1 ? '1 alerta activa' : `${conProblemas.length} alertas activas`;
    textoDetalle = `Revisa: ${nombres}.`;
  } else if (instantanea.comunicacion === 'sin-controlador') {
    estado = 'aviso';
    claseIcono = 'bi-cpu';
    textoTitulo = 'Control automático detenido';
    textoDetalle = 'Las lecturas llegan, pero la placa controladora (DEV-09) está desactivada.';
  }

  if (instantanea.enPausa) {
    textoDetalle += ' La simulación está en pausa.';
  }

  bloque.dataset.estado = estado;
  icono.className = `bi ${claseIcono} estado-general__icono`;
  titulo.textContent = textoTitulo;
  texto.textContent = textoDetalle;
}

/** Lista compacta con las cuatro lecturas. */
function pintarLecturas(instantanea) {
  document.querySelectorAll('[data-mini-metrica]').forEach((fila) => {
    const clave = fila.dataset.miniMetrica;
    const lectura = instantanea.metricas[clave];
    fila.querySelector('[data-campo="valor"]').textContent = lectura.visible ? formatearMetrica(clave, lectura.valor) : '–';
    pintarChipEstado(fila.querySelector('[data-campo="estado"]'), lectura.estado, lectura.texto);
  });
}

function pintarLectura(instantanea) {
  ultimaInstantanea = instantanea;
  rellenar('alertas', String(instantanea.alertasActivas));
  rellenar('ultima-lectura', instantanea.marcaTiempo ? formatearHora(instantanea.marcaTiempo) : '–');
  pintarEstadoGeneral(instantanea);
  pintarLecturas(instantanea);
}

/** Prepara la pantalla de inicio. */
export function iniciarInicio() {
  pintarDispositivos();
  pintarUltimoEvento();

  escuchar('lectura', pintarLectura);
  escuchar('dispositivo-cambiado', pintarDispositivos);
  escuchar('eventos-cambiados', pintarUltimoEvento);
  escuchar('simulacion-estado', ({ enPausa }) => {
    if (!ultimaInstantanea) return;
    ultimaInstantanea = { ...ultimaInstantanea, enPausa };
    pintarEstadoGeneral(ultimaInstantanea);
  });
}
