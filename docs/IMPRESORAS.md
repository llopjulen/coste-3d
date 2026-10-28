# Conectar impresoras a layercents: guía por marca

Investigación del 25 de octubre de 2026. Explica cómo se habla con cada marca de impresora que se usa de verdad, qué se puede leer sin tocar nada en la impresora, qué está restringido, y en qué orden lo vamos a implementar en el agente (`agent/`). Las fuentes están al final, numeradas: `[3]` en el texto apunta a la fuente 3.

Las cosas cambian con cada firmware (Bambu ha cambiado las reglas tres veces desde 2025). Cuando algo de aquí deje de ser cierto, se corrige este archivo en el mismo PR que adapta el código.

## Por qué hace falta el agente

La web no puede hablar con una impresora directamente, por tres motivos que no dependen de nosotros:

1. **Protocolo.** Las Bambu hablan MQTT sobre TLS (TCP puro, puerto 8883). Un navegador solo abre HTTP, WebSocket y WebRTC; no puede abrir un socket TCP.
2. **Contenido mixto.** layercents.com es `https`, y un navegador bloquea las peticiones de una página `https` a direcciones `http` como `http://192.168.1.50`.
3. **Red privada.** Chrome pide permiso cuando una web pública llama a direcciones de la red local (Local Network Access).

Por eso hay un programa en un ordenador de la misma red (el agente) que habla con las impresoras, y la web solo le pregunta a él en `http://127.0.0.1:31415`.

## Qué impresoras hay que cubrir

Según Context, Bambu Lab fue la marca más vendida de 2025 en impresoras de menos de 2.500 $, con un 37 % de cuota, seguida de Creality, Elegoo y Anycubic; las marcas chinas son más del 90 % de los envíos `[1][2]`. Prusa no sale en esas cifras, pero en Europa y en granjas de impresión pequeñas es muy común (las MK4 y Core One son la máquina "de trabajo" típica).

Conclusión para el orden: **Bambu primero** (la más vendida, y la que tiene Julen), después **Klipper/Moonraker** (con un solo driver cubre Creality K2, varias K1, Elegoo Neptune 4, Qidi, Sovol, Voron y Anycubic con firmware modificado), después **Prusa**. El resto, cuando un usuario real lo pida.

## Resumen

| Marca y modelos | Cómo se habla | Puerto | Credencial | ¿Leer estado en modo normal? | ¿Guarda historial? | Gramos reales | Driver |
|---|---|---|---|---|---|---|---|
| **Bambu Lab**: A1, A1 mini, P1P, P1S, P2S, X1C, X1E, H2D, H2S, H2C, X2D, A2L | MQTT 3.1.1 sobre TLS | 8883 | usuario `bblp`, contraseña = código de acceso LAN, y el número de serie | **Sí** (lectura permitida) | No, en local | Del 3MF por FTPS (puerto 990); puede necesitar Developer Mode | `bambu` (PR de hoy) |
| **Klipper + Moonraker**: Creality K2 / K2 Plus / K2 Pro, K1 con Moonraker, Elegoo Neptune 4, Qidi, Sovol, Voron, Anycubic con Rinkhals | HTTP + JSON (también WebSocket) | 7125 | ninguna en red de confianza, o `X-Api-Key` | Sí | **Sí**: `/server/history/list` | Longitud en mm (pasar a gramos) | `moonraker` (siguiente) |
| **Prusa**: MK4/MK4S, MK3.9, MK3.5, Core One, XL, MINI+; MK3S con PrusaLink en una Raspberry Pi | HTTP REST (PrusaLink) | 80 | usuario `maker` + contraseña de la pantalla | Sí | No, en local | De los metadatos del G-code | `prusalink` |
| **Creality sin root**: K1, K1C, K1 Max, Ender-3 V3, Hi | WebSocket con JSON | 9999 | ninguna | Sí | No | Longitud usada | `creality-ws` (si alguien lo pide) |
| **Elegoo Centauri Carbon** y resina (Saturn, Mars) | SDCP 3.0 sobre WebSocket | 3030 | ninguna | Sí | No | Solo total | `sdcp` (si alguien lo pide) |
| **Elegoo Centauri Carbon 2** | MQTT en modo LAN | 1883 | modo LAN activado | Sí | No | Solo total | `sdcp` |
| **Anycubic Kobra 3 / S1** | MQTT local en modo LAN (ingeniería inversa) | — | sin documentar | Sí, con integraciones de la comunidad | No | — | más adelante |
| **Flashforge Adventurer 5M / 5M Pro / AD5X** | HTTP (+ protocolo TCP antiguo) | 8898 (+ 8899) | número de serie + "check code" | Sí | No | — | más adelante |
| **Cualquier impresora con OctoPrint** (Ender-3 antiguas, etc.) | HTTP REST | 80 o 5000 | `X-Api-Key` | Sí | Con plugins | Estimación del laminador | `octoprint` (fácil, si alguien lo pide) |

"¿Leer estado en modo normal?" significa: sin poner la impresora en un modo especial que le quite funciones a su dueño. Es la pregunta clave, porque a un taller no le vamos a pedir que pierda la app del móvil para usar layercents.

## Bambu Lab

### Cómo funciona

Cada Bambu lleva dentro un servidor MQTT (un "broker"). MQTT es el protocolo estándar del IoT: los dispositivos publican mensajes en "temas" (topics) y quien esté suscrito los recibe. Datos de la conexión `[3][4][5]`:

- Dirección: la IP de la impresora, puerto **8883**, con **TLS** (cifrado).
- Usuario: `bblp`. Contraseña: el **código de acceso LAN** (8 caracteres).
- Versión del protocolo: **MQTT 3.1.1** `[6]`.
- La impresora publica su estado en `device/<NÚMERO_DE_SERIE>/report`.
- Se le piden cosas publicando en `device/<NÚMERO_DE_SERIE>/request`.

Para recibir el estado completo se le manda un `pushall`:

```json
{"pushing": {"sequence_id": "0", "command": "pushall"}}
```

Las P1 y A1 solo mandan **lo que ha cambiado** desde el último mensaje (actualizaciones parciales), así que el agente tiene que ir fusionando cada mensaje con el estado anterior `[4][7]`. Además, `pushall` "carga la impresora" `[4]`: se pide al conectar y, como mucho, cada 5 minutos.

Campos útiles del mensaje (dentro de `print`) `[4][7]`:

| Campo | Qué es |
|---|---|
| `gcode_state` | `IDLE`, `PREPARE`, `RUNNING`, `PAUSE`, `FINISH`, `FAILED` (y otros raros como `SLICING` o `INIT`) |
| `mc_percent` | progreso, de 0 a 100 |
| `mc_remaining_time` | minutos que faltan |
| `layer_num`, `total_layer_num` | capa actual y total |
| `subtask_name` | nombre del trabajo |
| `gcode_file` | archivo que imprime |
| `nozzle_temper`, `bed_temper`, `chamber_temper` | temperaturas (°C) |
| `print_error` | código de error (0 si no hay) |
| `task_id` | id del trabajo; puede ser `0` en impresiones desde la tarjeta o en LAN `[4]` |
| `ams.ams[].tray[]` | bobinas del AMS: `tray_type`, `tray_color`, `remain`… |

### El lío de la autorización (2025-2026)

En enero de 2025 Bambu anunció un "sistema de control de autorización". Llegó a la serie X en marzo de 2025 y a la P1 y la A1 en junio de 2025 (firmware P1 01.08.02.00 y A1 01.05.00.00) `[8][9]`. Lo que cambió:

- **Controlar** la impresora desde un programa de terceros (empezar una impresión, mover ejes, cambiar temperaturas) ya no se puede en modo normal. Hace falta pasar por Bambu Connect, o poner la impresora en **modo "LAN only" + "Developer Mode"** `[8][10]`.
- **Leer** el estado sigue permitido en todos los firmwares: "All read functionality will continue to work, regardless of firmware version" `[3]`. El propio anuncio de Bambu decía que leer temperaturas, posición y velocidad seguía accesible `[11]`.
- Developer Mode solo existe dentro del modo LAN only, y LAN only desconecta la impresora de la nube de Bambu: **deja de funcionar Bambu Handy** (la app del móvil) y las actualizaciones por la app `[10][12]`.

**Para layercents esto es una buena noticia:** solo necesitamos leer. El estado en vivo y el registro de trabajos se pueden hacer con la impresora en modo normal, sin quitarle nada a su dueño. Hay que **comprobarlo en la P1S de Julen** (ver "Qué probar"), porque Bambu ha cambiado de criterio más de una vez `[4]`.

### Los gramos reales

El MQTT no dice cuántos gramos lleva la impresión. Lo dice el archivo `.gcode.3mf` que se mandó a la impresora: dentro lleva `Metadata/slice_info.config`, con los gramos y metros de cada filamento `[4]`. Es exactamente lo que ya lee `parseSliceInfo` en `src/slicerFile.js` cuando arrastras un 3MF a la calculadora.

Ese archivo se descarga por **FTPS implícito, puerto 990**, con el mismo usuario y código `[4][5]`. El problema: Developer Mode "abre MQTT, el vídeo y FTP" `[13]`, lo que sugiere que en modo normal el FTP puede estar cerrado en firmwares nuevos. En una H2S con firmware 01.02.00.00 el FTP dejó de funcionar para Home Assistant y la solución fue activar "Store Sent Files on External Storage" `[14]`. **Hay que probarlo en la P1S** antes de construir ese paso. Si FTPS no funciona en modo normal, el plan B es que la persona arrastre el 3MF a layercents (ya funciona) y el agente lo relacione con el trabajo por nombre y hora.

### Dónde está cada dato en la impresora

- **IP**: en los ajustes de red de la pantalla.
- **Código de acceso**: P1P/P1S: Ajustes > **WLAN**, abajo del todo. A1/A1 mini: hay que activar LAN only para verlo. X1/H2: Ajustes > General `[15]`. Si sale todo a ceros, se pulsa el icono de refrescar al lado `[15]`. Puede cambiar tras actualizar el firmware `[10]`.
- **Número de serie**: Ajustes > Dispositivo (o en Bambu Studio). También se puede descubrir solo: cada Bambu anuncia por la red local un mensaje SSDP al grupo multicast `239.255.255.250`, puertos 1990 y 2021, con su serie (`USN`), su IP (`Location`) y su modelo (`DevModel.bambu.com`) `[16]`. Un paso futuro puede usarlo para que el agente encuentre las impresoras solo.

### Riesgos

- **La conexión se puede caer** (la impresora se apaga, cambia de IP, o hay varios programas conectados a la vez). El agente se reconecta solo, con esperas crecientes para no saturarla.
- **El certificado TLS de la impresora no es de una autoridad pública.** Ver la decisión de seguridad en el DEV_LOG del PR del agente: se guarda su huella la primera vez y se exige la misma después.
- **Bambu puede cerrar la lectura en el futuro.** Por eso el código de cada marca va en su propio archivo (un driver): si cambia una marca, no se toca nada más.

## Klipper con Moonraker

Klipper es un firmware libre que usan muchas impresoras rápidas, y Moonraker es su API: un servidor HTTP y WebSocket en el puerto **7125** `[17][18]`.

- **Estado**: `GET /printer/objects/query?print_stats&display_status&heater_bed&extruder`.
- **Historial de trabajos incluido**: `GET /server/history/list` devuelve cada trabajo con `status` (`completed`, `cancelled`, `error`, `klippy_shutdown`…), `start_time`, `end_time`, `print_duration` y `total_duration` en segundos, y `filament_used` **en milímetros** `[17]`. `GET /server/history/totals` da totales.
- **Autenticación**: normalmente ninguna dentro de la red local (`trusted_clients` en `moonraker.conf`); si está activada, una cabecera `X-Api-Key`.

Esto es mucho mejor que Bambu: los pasos 4 y 5 del plan (registro de trabajos y material real) vienen hechos. Solo hay que convertir mm a gramos: `gramos = mm × π × (diámetro/2)² × densidad / 1000` (con 1,75 mm de PLA a 1,24 g/cm³, un metro son unos 2,98 g).

Qué impresoras traen Moonraker:

- **Creality K2, K2 Plus, K2 Pro**: de serie, en el puerto 7125 `[18]`.
- **Creality K1, K1C, K1 Max**: depende de la unidad. Unas K1C de 2025 tienen la API de Moonraker en el 7125 aunque no traen interfaz web `[19]`; las K1 más antiguas necesitan root y el "Helper Script" para instalarlo `[20]`. Sin root, todas tienen el WebSocket del 9999 (abajo).
- **Elegoo Neptune 4, Qidi (X-Plus 3, Q1 Pro, Plus4), Sovol (SV07, SV08), Voron**: Klipper con Moonraker de fábrica.
- **Anycubic Kobra 3 / S1 con el firmware modificado Rinkhals** y **Flashforge AD5M con Klipper Mod** `[21]`: Moonraker añadido por la comunidad.

## Prusa (PrusaLink)

Las Prusa con firmware Buddy (MK4/MK4S, MK3.9, MK3.5, Core One, XL, MINI+) llevan **PrusaLink**, una API HTTP en la propia impresora. Las MK3S y MK2.5 necesitan una Raspberry Pi con PrusaLink `[22]`.

- Usuario **`maker`** y contraseña de la pantalla: **Ajustes > Red > PrusaLink** `[23][24]`. Firmware 4.7.0 o posterior para la API v1 (en la MINI, 5.1.0) `[22]`.
- Estado: `GET /api/v1/status`. Trabajo actual: `GET /api/v1/job`.
- **No guarda historial** en local (lo guarda Prusa Connect, en la nube). El agente tendría que registrar los trabajos, como con Bambu.

## Creality sin root (WebSocket del puerto 9999)

Las Creality con el sistema de Creality (K1, K1C, K1 Max, Ender-3 V3, Hi, K2) abren un **WebSocket en el puerto 9999** que emite el estado en JSON, sin contraseña `[19][25]`. Incluye progreso, tiempo de impresión y restante en segundos (`printJobTime`, `printLeftTime`) y longitud de material usada `[25][26]`. La integración de Home Assistant que lo usa es `ha_creality_ws` `[26]`. Es un formato sin documentar, así que puede cambiar con cada firmware.

## Elegoo

- **Centauri Carbon** y las de resina (Saturn, Mars): protocolo **SDCP 3.0** sobre WebSocket, puerto **3030**, sin contraseña `[27][28]`. Se descubren mandando `M99999` por UDP al puerto 3000: responden con su nombre, IP e id `[29]`.
- **Centauri Carbon 2**: MQTT en el puerto 1883, con el modo LAN activado; en modo nube no `[27]`.
- Solo dan un **total de filamento**, no el desglose por color `[27]`.

## Anycubic

- **Kobra 3 y Kobra S1**: tienen un "modo LAN" oficial para hablar con Anycubic Slicer Next `[30]`. Por dentro es un broker MQTT local; hay integraciones de Home Assistant que lo usan "sin cuenta de Anycubic y sin root", pero el protocolo no está documentado `[31]`.
- **Kobra 2 / Neo**: sin red útil.
- Con el firmware modificado **Rinkhals**, las Kobra 3 y S1 ganan Moonraker y entran por el driver de Klipper.

## Flashforge

**Adventurer 5M, 5M Pro y AD5X**, con su firmware de fábrica: una API HTTP local con el **número de serie y un "check code"** propio de cada impresora, más un protocolo TCP antiguo de comandos G-code `[32]`. Con firmware modificado ("Klipper Mod") tienen Moonraker en el 7125 `[21]`.

## OctoPrint

Para impresoras antiguas sin red (Ender-3, Prusa MK3S sin PrusaLink…) conectadas por USB a una Raspberry Pi con OctoPrint: API REST con la cabecera `X-Api-Key`. `GET /api/job` da archivo, progreso, `printTime`, `printTimeLeft` y el filamento estimado en mm `[33]`. Es el driver más fácil de todos.

## Cómo está organizado el agente

```
          web (layercents.com)
                  │  GET /printers   (cada 3 s, solo con la pestaña abierta)
                  ▼
   agent/handler.js ── agent/printers.js (la lista y el estado de todas)
                              │
                ┌─────────────┼──────────────┐
                ▼             ▼              ▼
        drivers/bambu.js   (moonraker)    (prusalink)      ← un archivo por marca
                │
          agent/mqtt.js  (cliente MQTT 3.1.1 mínimo, sin dependencias)
                │  TLS, puerto 8883
                ▼
            impresora
```

Cada driver convierte lo que dice su impresora a **un estado común**, el mismo para todas las marcas. La web no sabe de qué marca es cada impresora:

```js
{
  id: 'p1s-taller',           // lo elige la persona al añadirla
  name: 'P1S del taller',
  brand: 'bambu', model: 'P1S',
  connection: 'online',       // connecting | online | offline | auth-error | error
  state: 'printing',          // idle | preparing | printing | paused | finished | failed | unknown
  job: { name: 'Soporte móvil', progress: 0.42, remainingMinutes: 75, layer: 120, totalLayers: 300 },
  temps: { nozzle: 220, bed: 60, chamber: null },
  updatedAt: '2026-10-25T14:10:00Z',
  error: null,
}
```

Las credenciales (códigos de acceso, claves) **nunca salen del agente**: ni a la web, ni al repositorio. Se guardan en un archivo en la carpeta del usuario, fuera del proyecto (`~/.layercents/printers.json`), legible solo por su dueño.

## Para que lo use alguien que no programa

Hoy el agente se arranca con `npm run agent` dentro del proyecto: hace falta Node y el código. Para un taller como Inelme hay que darle un instalable. Opciones, de menos a más trabajo:

1. **Un ejecutable de un solo archivo** con las "Single Executable Applications" de Node: un `.exe` o binario por sistema, sin instalar Node. Lo más ligero.
2. **Docker**, para quien tiene un servidor o Home Assistant.
3. **Una app de escritorio** (Electron o Tauri), con icono en la barra: la más cómoda, pero mucho más pesada.

Lo que cuesta dinero: en macOS, un programa sin **firmar y notarizar** con una cuenta de Apple Developer (de pago, anual) sale bloqueado por Gatekeeper, y en Windows uno sin firma muestra el aviso de SmartScreen. Es una decisión para cuando haya un cliente que lo vaya a usar, no antes.

## Plan, en PRs pequeños

1. Servidor del agente. Hecho.
2. La web detecta el agente. Hecho.
3. **Bambu: estado en vivo por MQTT** (agente) y **pestaña Printers con el estado** (web). Los PRs de hoy.
4. Registro de trabajos de Bambu (inicio, fin, fallo) en un JSON en disco.
5. Gramos reales de Bambu: el 3MF por FTPS, si la prueba en la P1S dice que se puede sin Developer Mode; si no, el plan B de arrastrar el 3MF.
6. Driver Moonraker: estado y el historial que ya trae (cubre Creality K2/K1 con Moonraker, Elegoo Neptune 4, Qidi, Sovol, Voron).
7. Driver PrusaLink.
8. Pestaña Printers con historial, tasa de fallos y tiempo medio.
9. "Use real data" en la calculadora.

Creality por el 9999, Elegoo, Anycubic, Flashforge y OctoPrint: cuando alguien que los tenga lo pida, y con esa persona probándolo.

## Qué probar en la P1S de Julen (antes del paso 4)

Todo con la impresora en **modo normal** (nube), sin LAN only ni Developer Mode:

1. Versión de firmware: Ajustes > Firmware. Apúntala.
2. `npm run agent -- add` con la IP, el número de serie y el código de acceso.
3. `npm run agent`: debe decir "connected" y la pestaña Printers debe enseñar el estado.
4. Lanza una impresión corta desde Bambu Studio o Bambu Handy: la pestaña debe pasar a "printing" con progreso y tiempo restante, y al terminar a "finished".
5. Abre Bambu Handy en el móvil mientras tanto: debe seguir funcionando (si deja de funcionar, apúntalo).
6. Si algo falla, copia lo que imprime la consola del agente (sin el código de acceso).

### Y con el registro de trabajos (paso 4)

El agente apunta cada trabajo en `~/.layercents/jobs.json` y lo enseña en `http://127.0.0.1:31415/jobs`. Con el agente corriendo:

7. Lanza una impresión corta y mira `/jobs` en el navegador mientras imprime: debe haber un trabajo con `endedAt: null` y `startedApprox: false`.
8. Al terminar debe pasar a `outcome: "finished"`, con `realMinutes` parecido a lo que has tardado y `estimatedMinutes` parecido a lo que dijo el laminador.
9. **Cancela una impresión a mitad** y apunta qué sale. No sabemos si Bambu lo manda como `FAILED` (saldría `failed`) o como `IDLE` (saldría `unknown`). Con tu respuesta decidimos si hace falta un resultado `cancelled` propio. Si sale `failed`, apunta también el `printError`.
10. Para el agente (Ctrl+C) a mitad de una impresión y arráncalo otra vez: el trabajo debe seguir abierto (no duplicarse) y cerrarse bien al terminar. Si lo arrancas con la impresión ya empezada, sale con `startedApprox: true` y sin `realMinutes`: es lo esperado.
11. Mira si `subtask_id` / `task_id` cambian entre trabajos lanzados desde Bambu Studio y desde la pantalla de la impresora. Si desde la pantalla siempre valen `"0"`, el agente distingue los trabajos por el nombre del archivo, y dos impresiones seguidas de la misma pieza sin ver el `FINISH` entre medias contarían como una.

La prueba de FTPS para los gramos (paso 5) llegará con su propio PR.

## Fuentes

1. [Bambu Lab overtakes Creality as the world's top-selling budget 3D printer brand](https://tomshardware.com/3d-printing/bambu-lab-overtakes-creality-as-the-worlds-top-selling-budget-3d-printer-brand), Tom's Hardware, abril de 2026.
2. [Entry-level 3D printers: Context Q4 2025 report](https://manufactur3dmag.com/entry-level-3d-printers-context-q4-2025-report/), Manufactur3D.
3. [ha-bambulab: Integration Overview](https://docs.page/greghesp/ha-bambulab), documentación de la integración de Home Assistant.
4. [Bambu Lab adapter via local MQTT (printlog-bridge #85)](https://github.com/HoffmanEngineering/printlog-bridge/issues/85).
5. [bambu-mcp](https://github.com/schwarztim/bambu-mcp).
6. [circuitpython-bambulabs API](https://circuitpython-bambulabs.readthedocs.io/en/stable/api.html) ("Local mode … MQTT 3.1.1").
7. [openHAB Bambu Lab binding](https://www.openhab.org/addons/bindings/bambulab/).
8. [Bambu Lab's Controversial "Authorization Control" Hits Budget 3D Printers](https://all3dp.com/4/bambu-labs-controversial-authorization-control-hits-budget-3d-printers/), All3DP, junio de 2025.
9. [Bambu Lab Firmware Updates](https://bambuhub.net/articles/firmware-updates), BambuHub (versiones de octubre de 2026).
10. [Bambu Lab: LAN-only mode and Developer Mode](https://help.simplyprint.io/en/article/bambu-lab-lan-only-mode-and-developer-mode-how-to-enable-xa0hch/), SimplyPrint.
11. [Self-hosted print farm management for Bambu Lab](https://www.printstash.org/en/blog/self-hosted-print-farm-bambu/), PrintStash.
12. [Bambu Lab: third-party integration](https://wiki.bambulab.com/en/software/third-party-integration), wiki oficial.
13. [Bambu Lab clarifies issues related to latest security update](https://www.voxelmatters.com/bambu-lab-clarifies-issues-related-to-latest-secutiry-update/), VoxelMatters.
14. [H2S LAN Only Mode: Print Weight not populated after firmware 01.02.00.00 (ha-bambulab #1974)](https://github.com/greghesp/ha-bambulab/issues/1974).
15. [Find the access code of a Bambu Lab printer](https://help.octoeverywhere.com/knowledge-base/bambu-lab-3-d-printers/bambu-lab-find-3d-printer-access-code), OctoEverywhere.
16. [Use SSDP standards](https://forum.bambulab.com/t/use-ssdp-standards/7173), foro de Bambu Lab.
17. [Moonraker: job history API](https://moonraker.readthedocs.io/en/latest/external_api/history/).
18. [Printago: connecting Creality printers](https://docs.printago.io/docs/connecting-printers/creality).
19. [K1C 2025 + OrcaSlicer: workarounds for missing web interface](https://forum.creality.com/t/k1c-2025-orcaslicer-workarounds-for-missing-web-interface/47164), foro de Creality.
20. [Setting up your Creality K1C](https://simplyprint.io/setup-guide/creality/k1c.md), SimplyPrint.
21. [Setting up your Flashforge Adventurer 5M](https://simplyprint.io/setup-guide/flashforge/adventurer-5m.md), SimplyPrint.
22. [PrusaLink integration](https://www.home-assistant.io/integrations/prusalink), Home Assistant.
23. [How to connect Prusa MK4, MINI, Core One and XL via network](https://intercom.help/3DPrinterOS/en/articles/9679722-how-to-connect-prusa-mk4-mini-core-one-and-prusa-xl-via-network), 3DPrinterOS.
24. [PrusaLink local login credentials](https://forum.prusa3d.com/forum/hardware-firmware-and-software-help/prusa-link-local-login-credentials), foro de Prusa.
25. [Adding Creality K1 Max to HA using Node-RED (no root)](https://community.home-assistant.io/t/deprecated-adding-creality-k1-max-to-ha-using-nodered-no-root-required/794457), comunidad de Home Assistant.
26. [ha_creality_ws thread](https://community.home-assistant.io/t/ha-creality-ws-thread/940980), comunidad de Home Assistant.
27. [elegoo-homeassistant](https://github.com/danielcherubini/elegoo-homeassistant).
28. [Elegoo MCP server (SDCP v3.0.0, WebSocket 3030)](https://mcp.so/servers/elegoo-mcp-server).
29. [cassini (SDCP)](https://github.com/vvuk/cassini).
30. [Kobra S1 LAN connection guide](https://wiki.anycubic.com/en/fdm-3d-printer/kobra-s1/lan-connection-guide), wiki de Anycubic.
31. [Anycubic 3D printer, local, no cloud required](https://community.home-assistant.io/t/anycubic-3d-printer-local-no-cloud-required-dashboard/1014086), comunidad de Home Assistant.
32. [ff-5mp-api-py](https://github.com/GhostTypes/ff-5mp-api-py).
33. [OctoPrint: job operations](https://docs.octoprint.org/en/main/api/job).
