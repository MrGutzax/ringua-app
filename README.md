# Ringua · Monitorización hídrica IoT

**Versión 0.1.0-beta**

Ringua es una aplicación web progresiva (PWA) para supervisar y controlar una instalación IoT de recursos hídricos. Una red de sensores mide el agua y su entorno y envía los datos a un **Home Gateway**. Una **placa controladora** con scripts en Python aplica unas reglas de automatización, y los **actuadores** (electroválvula, bomba y sirena) se activan solos cuando hace falta. Todo se supervisa desde este panel.

La red de la instalación está simulada en **Cisco Packet Tracer**, en la subred `192.168.10.0/24` con el gateway en `192.168.10.1`. En esta beta, las lecturas del panel también se simulan en el navegador.

> **Beta:** las funciones principales están completas, pero la app todavía puede cambiar. Si encuentras un fallo, abre una incidencia en el repositorio.

---

## Características

- **Panel en vivo** con nivel de agua, temperatura, humedad del suelo y caudal. Se actualiza solo y colorea cada valor según su umbral.
- **Reglas automáticas:**
  - Nivel < 25 % → arranca la bomba (se detiene al llegar al 80 %).
  - Humedad < 40 % → riego de 6 minutos.
  - Temperatura fuera de 15–30 °C → aviso.
  - Caudal anómalo → aviso de posible fuga; si supera 35 L/min, suena la sirena.
- **Registro de eventos**, generado solo cuando cambia una situación.
- **Catálogo de dispositivos** con filtros por tipo, buscador en tiempo real y ventana de detalle desde la que se activa o desactiva cada equipo.
- **Instalable** en Android, iPhone/iPad y PC, y **funciona sin conexión**.
- **Tema claro, oscuro o según el sistema**.
- **Accesible:** se maneja con teclado, tiene foco visible, etiquetas en los formularios y avisos para lectores de pantalla.

## Dispositivos

| ID | Nombre | Tipo | IP | Ubicación | Script |
|---|---|---|---|---|---|
| DEV-01 | Sensor de Nivel de Agua | sensor | 192.168.10.11 | Depósito Principal | `sensor_nivel.py` |
| DEV-02 | Sensor de Temperatura Ambiente | sensor | 192.168.10.12 | Zona Exterior Norte | `sensor_temperatura.py` |
| DEV-03 | Sensor de Humedad del Suelo | sensor | 192.168.10.13 | Sector de Riego A | `sensor_humedad.py` |
| DEV-04 | Caudalímetro de Tubería Principal | sensor | 192.168.10.14 | Conducto Central | `sensor_caudal.py` |
| DEV-05 | Electroválvula de Riego Sector A | actuador | 192.168.10.21 | Sector de Riego A | `actuador_valvula.py` |
| DEV-06 | Bomba de Impulsión de Agua | actuador | 192.168.10.22 | Depósito Principal | `actuador_bomba.py` |
| DEV-07 | Sirena y Baliza de Emergencia | actuador | 192.168.10.23 | Caseta de Control | `actuador_alarma.py` |
| DEV-08 | Home Gateway IoT Central | red | 192.168.10.1 | Rack de Comunicaciones | `gateway_reglas.py` |
| DEV-09 | Placa Controladora SBC Python | red | 192.168.10.5 | Caseta de Control | `controlador_principal.py` |

La sirena (DEV-07) viene **desactivada** de serie. Mientras esté así, una fuga grave solo genera el evento «Sirena no disponible». Actívala en *Dispositivos* para que suene.

## Tecnología

- HTML5, **Bootstrap 5.3** y **Bootstrap Icons**, descargados en `vendor/` (sin CDN).
- **JavaScript vanilla con módulos ES**. Sin frameworks ni paso de compilación.
- **PWA:** `manifest.webmanifest` y un service worker con caché versionada.
- **localStorage** para el estado de los dispositivos, los eventos, los ajustes y la última lectura.
- Rutas relativas en todo el proyecto, así que funciona dentro de una subcarpeta (por ejemplo, en GitHub Pages).

## Estructura de carpetas

```
Ringua-App/
├── index.html              Página única con las 5 pantallas
├── manifest.webmanifest    Datos de instalación de la PWA
├── sw.js                   Service worker (caché y modo sin conexión)
├── .nojekyll               Evita que GitHub Pages procese los archivos
├── css/
│   └── estilos.css         Estilos propios (mobile first, tema claro/oscuro)
├── data/
│   └── dispositivos.json   Datos iniciales de los 9 dispositivos
├── icons/                  Logotipo (SVG) e iconos PNG de 192 y 512 px
├── js/
│   ├── app.js              Arranque: conecta todos los módulos
│   ├── tema-inicial.js     Aplica el tema antes de pintar (evita parpadeos)
│   ├── navegacion.js       Cambio de pantalla por hash (#/panel…)
│   ├── simulacion.js       Motor de simulación y reglas de automatización
│   ├── metricas.js         Umbrales, métricas y actuadores
│   ├── panel.js            Pantalla Panel en vivo
│   ├── inicio.js           Pantalla Inicio
│   ├── dispositivos.js     Datos y pantalla de dispositivos
│   ├── ajustes.js          Tema, intervalo, restablecer y versión
│   ├── instalacion.js      Service worker, botón Instalar y avisos
│   ├── registro.js         Registro de eventos
│   ├── almacenamiento.js   Lectura y escritura en localStorage
│   ├── bus.js              Comunicación entre módulos
│   ├── utilidades.js       Formatos, avisos emergentes y accesibilidad
│   └── version.js          Número de versión de la app
└── vendor/
    ├── bootstrap/          Bootstrap 5.3.3 (CSS y JS)
    └── bootstrap-icons/    Bootstrap Icons 1.11.3 (CSS y fuentes)
```

## Cómo funciona la simulación

Cada actualización del panel equivale a **un minuto** de funcionamiento de la instalación. Los valores no saltan al azar: cada uno parte del anterior, sigue una tendencia física y suma un ruido pequeño. Además, las métricas están relacionadas entre sí:

- **Nivel:** baja según el caudal consumido y sube cuando la bomba está en marcha.
- **Humedad del suelo:** baja por evaporación (más rápido con calor) y sube mientras se riega.
- **Caudal:**
  - Depende de la demanda y del riego.
  - De vez en cuando aparece una fuga que crece poco a poco, se mantiene y luego remite.
- **Temperatura:** sigue un ciclo de día y noche acelerado.

Las reglas generan eventos solo al **entrar o salir** de una situación (con histéresis), no en cada lectura.

Desactivar dispositivos tiene efectos:

- **Un sensor inactivo** deja su tarjeta en «Sin datos».
- **Sin el gateway** (DEV-08) no llegan lecturas.
- **Sin la placa controladora** (DEV-09) se detiene el control automático y los actuadores pasan a reposo.

## Probar en local

La app **no funciona abriendo `index.html` con doble clic** (`file://`): los módulos ES, `fetch()` y el service worker necesitan un servidor web. Usa cualquiera de estas opciones desde la carpeta del proyecto.

**Con Python** (incluido en la mayoría de sistemas):

```bash
python -m http.server 8080
```

**Con Node.js:**

```bash
npx serve -l 8080
```

**Con Visual Studio Code:** extensión *Live Server* → botón *Go Live*.

Después abre <http://localhost:8080> en Chrome o Edge.

### Consejos para el desarrollo

- **El service worker sirve los archivos desde la caché.** Mientras desarrollas, activa en las DevTools *Application → Service workers → Update on reload*, o recarga con `Ctrl + Shift + R`.
- **Para probar el modo sin conexión:** DevTools → *Network* → *Offline*, y recarga la página.

## Publicar en GitHub Pages

1. **Sube el proyecto a GitHub.** Crea un repositorio, por ejemplo `ringua`, y ejecuta:

   ```bash
   git remote add origin https://github.com/TU_USUARIO/ringua.git
   ```

   ```bash
   git push -u origin main
   ```

2. **Activa GitHub Pages.** En GitHub, ve a **Settings → Pages**. En *Build and deployment* elige **Deploy from a branch**, la rama **main** y la carpeta **/ (root)**, y pulsa **Save**.
3. **Abre la app.** En uno o dos minutos estará disponible en `https://TU_USUARIO.github.io/ringua/`.

Como todas las rutas son relativas, no hay que cambiar nada para que funcione en la subcarpeta `/ringua/`. GitHub Pages sirve la web por **HTTPS**, que es lo que hace falta para instalar la PWA en el móvil.

### Publicar una versión nueva

1. Cambia `VERSION` en `sw.js` (por ejemplo `0.1.0-beta-2`) y, si procede, `VERSION_APP` en `js/version.js`.
2. Haz commit y `git push`.
3. Al abrir la app, aparecerá el aviso **«Hay una versión nueva de Ringua disponible»** con el botón **Actualizar**. La caché antigua se borra sola.

## Instalar la app

### Android (Chrome)

1. Abre la dirección de GitHub Pages en **Chrome**.
2. Pulsa el botón **Instalar app** de la cabecera, o el menú **⋮ → Instalar aplicación** (o *Añadir a pantalla de inicio*).
3. Ringua aparecerá entre tus aplicaciones y se abrirá a pantalla completa.

### iPhone y iPad (Safari)

1. Abre la dirección en **Safari** (en iOS 16.4 o posterior también vale Chrome o Edge).
2. Pulsa **Compartir** (cuadrado con flecha hacia arriba).
3. Elige **Añadir a pantalla de inicio** y confirma con **Añadir**.

iOS no muestra el botón «Instalar app» automático. Las instrucciones también aparecen en *Ajustes* dentro de la app.

### PC (Chrome o Edge)

1. Abre la app (en local con `http://localhost:8080` o en GitHub Pages).
2. Pulsa **Instalar app** en la cabecera, o el icono de instalar que aparece a la derecha de la barra de direcciones.
3. Ringua se abrirá en su propia ventana y tendrá acceso directo en el menú Inicio o en el escritorio.

### Probar en el móvil sin publicar

Si abres la app en el móvil con la IP del PC (`http://192.168.x.x:8080`, misma red Wi-Fi), se verá y funcionará. Pero los navegadores **solo activan el service worker con HTTPS o en `localhost`**, así que no podrás instalarla ni usarla sin conexión.

Para probar la instalación en un Android sin publicar:

1. Conecta el móvil por USB con la depuración USB activada.
2. En el PC, abre `chrome://inspect` → **Port forwarding** y añade `8080` → `localhost:8080`.
3. En el móvil, abre `http://localhost:8080`.

## Accesibilidad

- Se navega por completo con teclado. El foco se ve siempre, y hay un enlace «Saltar al contenido».
- Al cambiar de pantalla, el foco pasa al título (útil para lectores de pantalla).
- Los estados nunca dependen solo del color: llevan icono y texto («Normal», «Aviso», «Alerta»).
- Las alertas nuevas se anuncian mediante una región `aria-live`.
- Se respeta la preferencia de **movimiento reducido** del sistema.

## Licencias de terceros

- [Bootstrap](https://getbootstrap.com/) 5.3.3: licencia MIT (`vendor/bootstrap/LICENSE`).
- [Bootstrap Icons](https://icons.getbootstrap.com/) 1.11.3: licencia MIT (`vendor/bootstrap-icons/LICENSE`).
