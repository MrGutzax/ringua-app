/*
 * Ringua · Panel en vivo
 * Pinta las cuatro métricas, el estado de los actuadores y la lista de
 * últimos eventos. Se actualiza solo cada vez que la simulación emite una
 * nueva lectura.
 */

import { escuchar } from './bus.js';
import { alternarPausa } from './simulacion.js';
import { obtenerEventos, limpiarEventos } from './registro.js';
import { obtenerDispositivo } from './dispositivos.js';
import { METRICAS, ACTUADORES, ICONOS_ESTADO, formatearMetrica } from './metricas.js';
import { formatearNumero, formatearMomento, limitar, mostrarAviso } from './utilidades.js';

const ICONOS_EVENTO = Object.freeze({
  info: 'bi-info-circle-fill',
  exito: 'bi-check-circle-fill',
  aviso: 'bi-exclamation-triangle-fill',
  alerta: 'bi-exclamation-octagon-fill',
});

const NOMBRES_NIVEL = Object.freeze({
  info: 'Información',
  exito: 'Resuelto',
  aviso: 'Aviso',
  alerta: 'Alerta',
});

const TENDENCIAS = Object.freeze({
  sube: { icono: 'bi-arrow-up', texto: 'subiendo' },
  baja: { icono: 'bi-arrow-down', texto: 'bajando' },
  estable: { icono: 'bi-dash', texto: 'estable' },
});

/* Estado que combina pausa y conexión para el indicador de la cabecera */
let enPausa = false;
let comunicacion = 'ok';

/** Crea un icono de Bootstrap Icons decorativo. */
function crearIcono(clase) {
  const icono = document.createElement('i');
  icono.className = `bi ${clase}`;
  icono.setAttribute('aria-hidden', 'true');
  return icono;
}

/**
 * Rellena una etiqueta de estado (Normal / Aviso / Alerta / Sin datos).
 * También la usa la pantalla de Inicio.
 */
export function pintarChipEstado(chip, estado, texto) {
  chip.dataset.estado = estado;
  chip.replaceChildren(crearIcono(ICONOS_ESTADO[estado]), document.createTextNode(` ${texto}`));
}

/* ---------- Métricas ---------- */
function pintarMetricas(instantanea) {
  document.querySelectorAll('[data-metrica]').forEach((tarjeta) => {
    const clave = tarjeta.dataset.metrica;
    const definicion = METRICAS[clave];
    const lectura = instantanea.metricas[clave];

    tarjeta.dataset.estado = lectura.estado;

    const valor = tarjeta.querySelector('[data-campo="valor"]');
    valor.textContent = lectura.visible ? formatearNumero(lectura.valor, definicion.decimales) : '–';

    const barra = tarjeta.querySelector('[data-campo="barra"]');
    const porcentaje = lectura.visible ? limitar((lectura.valor / definicion.escalaMaxima) * 100, 0, 100) : 0;
    barra.firstElementChild.style.width = `${porcentaje}%`;
    barra.setAttribute('aria-valuenow', lectura.visible ? lectura.valor.toFixed(1) : '0');
    barra.setAttribute('aria-valuetext', lectura.visible ? formatearMetrica(clave, lectura.valor) : 'Sin datos');

    pintarChipEstado(tarjeta.querySelector('[data-campo="estado"]'), lectura.estado, lectura.texto);

    const tendencia = tarjeta.querySelector('[data-campo="tendencia"]');
    if (lectura.visible) {
      const { icono, texto } = TENDENCIAS[lectura.tendencia];
      const oculto = document.createElement('span');
      oculto.className = 'visually-hidden';
      oculto.textContent = `Tendencia: ${texto}`;
      tendencia.replaceChildren(crearIcono(icono), oculto);
      tendencia.title = `Tendencia: ${texto}`;
    } else {
      tendencia.replaceChildren();
      tendencia.removeAttribute('title');
    }
  });
}

/* ---------- Actuadores (Panel e Inicio) ---------- */
function pintarActuadores(instantanea) {
  document.querySelectorAll('[data-actuador]').forEach((elemento) => {
    const clave = elemento.dataset.actuador;
    const definicion = ACTUADORES[clave];
    const actuador = instantanea.actuadores[clave];

    let estado = 'apagado';
    let texto = definicion.apagado;
    if (!actuador.disponible) {
      estado = 'no-disponible';
      texto = 'No disponible';
    } else if (actuador.encendido) {
      estado = 'encendido';
      texto = definicion.encendido;
      if (clave === 'valvula') texto += ` · ${actuador.minutosRestantes} min`;
    }

    elemento.dataset.estadoActuador = estado;
    elemento.querySelector('[data-actuador-texto]').textContent = texto;
  });
}

/* ---------- Lista de eventos ---------- */
function pintarEventos(eventos) {
  const lista = document.querySelector('[data-lista-eventos]');
  const plantilla = document.querySelector('template[data-plantilla="evento"]');

  const elementos = eventos.map((evento) => {
    const item = plantilla.content.firstElementChild.cloneNode(true);
    item.dataset.nivel = evento.nivel;
    item.querySelector('.evento__icono').classList.add(ICONOS_EVENTO[evento.nivel]);

    const mensaje = item.querySelector('.evento__mensaje');
    const nivelOculto = document.createElement('span');
    nivelOculto.className = 'visually-hidden';
    nivelOculto.textContent = `${NOMBRES_NIVEL[evento.nivel]}: `;
    mensaje.append(nivelOculto, evento.mensaje);

    const hora = item.querySelector('time');
    hora.dateTime = new Date(evento.fecha).toISOString();
    hora.textContent = formatearMomento(evento.fecha);

    const dispositivo = obtenerDispositivo(evento.dispositivo);
    item.querySelector('.evento__dispositivo').textContent = dispositivo
      ? `${dispositivo.id} ${dispositivo.nombre}`
      : 'Sistema';
    return item;
  });

  lista.replaceChildren(...elementos);
  lista.hidden = eventos.length === 0;
  document.querySelector('[data-sin-eventos]').hidden = eventos.length > 0;
  document.querySelector('[data-contador-eventos]').textContent = String(eventos.length);
}

/* ---------- Controles e indicador de la cabecera ---------- */
function pintarControles() {
  const boton = document.querySelector('[data-accion="alternar-simulacion"]');
  boton.querySelector('[data-texto-pausa]').textContent = enPausa ? 'Reanudar' : 'Pausar';
  boton.querySelector('[data-icono-pausa]').className = `bi ${enPausa ? 'bi-play-fill' : 'bi-pause-fill'}`;

  const indicador = document.querySelector('[data-indicador-simulacion]');
  const texto = indicador.querySelector('[data-indicador-simulacion-texto]');
  if (comunicacion === 'sin-gateway') {
    indicador.dataset.estado = 'sin-conexion';
    texto.textContent = 'Sin datos';
  } else if (enPausa) {
    indicador.dataset.estado = 'pausa';
    texto.textContent = 'En pausa';
  } else {
    indicador.dataset.estado = 'en-vivo';
    texto.textContent = 'En vivo';
  }
  indicador.title = `Simulación: ${texto.textContent.toLowerCase()}`;
}

/** Prepara el panel y se suscribe a las lecturas. */
export function iniciarPanel() {
  document.querySelector('[data-accion="alternar-simulacion"]').addEventListener('click', alternarPausa);

  document.querySelector('[data-accion="limpiar-eventos"]').addEventListener('click', () => {
    if (obtenerEventos().length === 0) {
      mostrarAviso('No hay eventos que limpiar.');
      return;
    }
    limpiarEventos();
    mostrarAviso('Se han eliminado los eventos.');
  });

  escuchar('lectura', (instantanea) => {
    comunicacion = instantanea.comunicacion;
    pintarMetricas(instantanea);
    pintarActuadores(instantanea);
    pintarControles();
  });

  escuchar('simulacion-estado', (estado) => {
    enPausa = estado.enPausa;
    document.querySelectorAll('[data-intervalo-texto]').forEach((elemento) => {
      elemento.textContent = `${estado.intervalo / 1000} s`;
    });
    pintarControles();
  });

  escuchar('eventos-cambiados', ({ eventos }) => pintarEventos(eventos));
  pintarEventos(obtenerEventos());
}
