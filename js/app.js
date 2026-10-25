/*
 * Ringua · Arranque de la aplicación
 * Conecta los módulos en el orden correcto:
 *  1. Ajustes (tema), navegación e instalación: no dependen de los datos.
 *  2. Carga de dispositivos desde data/dispositivos.json.
 *  3. Pantallas que escuchan las lecturas.
 *  4. Simulación, que empieza a emitir lecturas.
 */

import { iniciarAjustes } from './ajustes.js';
import { iniciarNavegacion } from './navegacion.js';
import { iniciarInstalacion } from './instalacion.js';
import { cargarDispositivos, iniciarPantallaDispositivos, restablecerDispositivos } from './dispositivos.js';
import { iniciarPanel } from './panel.js';
import { iniciarInicio } from './inicio.js';
import { limpiarEventos } from './registro.js';
import { iniciarSimulacion, establecerIntervalo, reiniciarSimulacion } from './simulacion.js';
import { mostrarAviso } from './utilidades.js';

async function arrancar() {
  const ajustes = iniciarAjustes({
    alCambiarIntervalo: establecerIntervalo,
    alRestablecer: () => {
      restablecerDispositivos();
      limpiarEventos();
      reiniciarSimulacion();
    },
  });

  iniciarNavegacion();
  iniciarInstalacion();

  try {
    await cargarDispositivos();
  } catch (error) {
    console.error('[Ringua] Error al cargar los dispositivos.', error);
    document.querySelector('[data-contador-resultados]').textContent = 'No se pudieron cargar los dispositivos.';
    mostrarAviso('No se pudieron cargar los dispositivos. Comprueba la conexión y recarga la página.', { duracion: 0 });
    return;
  }

  iniciarPantallaDispositivos();
  iniciarPanel();
  iniciarInicio();
  iniciarSimulacion({ intervalo: ajustes.intervalo });
}

arrancar();
