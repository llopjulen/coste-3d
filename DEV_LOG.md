# DEV_LOG

Registro de cambios del proyecto. La entrada más nueva va arriba.

### 2026-11-06, Modelo de impresora en «Your setup» (rellena el consumo)
- Archivo y sitio: src/printerPresets.js (nuevo, con tests en printerPresets.test.js); src/App.jsx, dentro de la función App, junto a `resetSetup` (`presetId`, `pickPreset`), y en el panel «Your setup», encima de los campos del grupo de la impresora; src/index.css (`.preset-select`, `.preset-note`); claves `preset.*` en los tres diccionarios.
- Qué cambió: en «Your setup» hay un desplegable «Modelo» con las Bambu Lab (A1 mini, A1, P1P, P1S, X1C, X1E, H2D). Al elegir una, el campo Consumo se rellena con la potencia media imprimiendo PLA que publica Bambu Lab, y una nota debajo dice de dónde sale, con un enlace a la fuente.
- Por qué: el consumo es el dato que nadie sabe. La etiqueta de la fuente de alimentación dice 350 W, pero imprimiendo la media es un tercio de eso, así que la gente pone un número malo o deja los 110 W por defecto. Solo se rellena el consumo, no el precio de la impresora: el precio cambia con las ofertas y el país, y un número inventado aquí sería peor que ninguno. Solo hay Bambu Lab porque es la única marca de la que tengo la cifra oficial ([wiki de Bambu Lab](https://wiki.bambulab.com/en/general/power-consumption)). Las demás se añaden cuando haya una fuente, y mientras tanto «Otra» no toca nada. El modelo elegido no se guarda (es estado de React de esta visita): lo que se recuerda es el consumo, que ya era un campo de «Your setup» y se guarda con `set`. Así no hay clave nueva en localStorage ni cambios en backup.js. Descartado: guardar el modelo en `setup`, que obligaba a tocar la validación de la copia y a decidir qué pasa si la persona cambia el consumo a mano.
- Concepto nuevo: un `<select>` controlado en React. Su valor sale del estado (`value={presetId}`) y cada cambio pasa por `onChange`, igual que los inputs de número: `<select value={x} onChange={e => setX(e.target.value)}>`. El `<select>` nativo se usa a propósito: en el iPhone abre la rueda del sistema y funciona con teclado sin escribir nada.
- Cómo probarlo: `npm test` (dos tests nuevos). En la web: «Your setup» → Edit → Modelo → Bambu Lab P1S. El consumo pasa a 105 W y sale la nota con el enlace. Recarga: el consumo sigue en 105 (guardado) y el desplegable vuelve a «Otra», que es lo esperado. Si cambias el consumo a mano, la nota desaparece porque ese número ya es tuyo.

### 2026-11-05, Tests pgTAP del modelo de taller (workspaces, membresías, invitaciones, presupuestos, negocio)
- Archivo y sitio: supabase/tests/workspaces.test.sql (nuevo). Borrados supabase/tests/prelude.sql y supabase/rls.test.js. docs/TALLER.md (sección «Quién lee y quién escribe» y fila «El jefe borra su cuenta») y docs/NUBE.md (lista de Seguridad). docs/MAPA.md (tabla de archivos).
- Qué cambió: 95 tests pgTAP que fijan el contrato de docs/TALLER.md antes de que exista la migración (TDD): estructura, `is_member`/`has_role`, permisos por rol, aislamiento entre talleres, `anon`, y ciclo de vida (crear y borrar taller y cuenta). Fuera el arnés antiguo del modelo `user_id`. La documentación tenía una contradicción (`restrict` y «cascada» a la vez) y queda corregida.
- Por qué:
  - **pgTAP dentro de la base de datos y no un runner en JS.** El test corre con `set local role` y `request.jwt.claims` como lo haría PostgREST, así que prueba las políticas reales, no una imitación. Todo va dentro de `begin … rollback`, por lo que no deja datos.
  - **Una persona por rol más un segundo taller.** Un test de «el operario no ve nada» solo vale si se demuestra también que el jefe sí ve; y el aislamiento solo se prueba con datos de otro taller al lado.
  - **Distinguir `42501` de permiso y de RLS.** `permission denied` (capa de privilegios, `GRANT`) y `violates row-level security policy` (capa de filas) llevan el mismo código; los tests miran el efecto (filas que quedan) y no solo el mensaje.
  - **Pruebas de las pruebas.** Con 14 mutaciones de una migración de referencia (quitar una política, abrir un permiso, etc.) se comprobó que los tests las detectan. Una se escapaba (el operario intentaba ascenderse a `owner`, que ya bloquea el índice único, así que no probaba la política); ahora intenta `manager`.
  - **Corrección de docs.** Con `owner_id on delete restrict`, borrar un usuario con taller falla siempre; «cascada» solo es posible borrando antes el taller. Se documenta el orden. Alternativa descartada: `cascade` en `owner_id`, que borraría los datos de otros miembros al borrar al jefe.
  - **Trampa documentada:** un trigger que restaura `created_by` en cada `update` rompe `on delete set null`, porque la clave foránea hace un `update` interno. La protección se aplica solo a roles de la web.
  - **Fuera `prelude.sql`:** `supabase test db` ejecuta todos los `.sql` de supabase/tests/ y el prelude no tiene plan. Supabase ya trae roles, `auth.users` y `auth.uid()`.
- Concepto nuevo: **pgTAP** son funciones SQL que imprimen TAP (`ok 1 - descripción`). `select plan(2); select is(1+1, 2, 'suma'); select ok(true); select * from finish();` imprime `1..2`, `ok 1 - suma`, `ok 2`. `throws_ok(sql, '42501', null, 'msg')` comprueba que una sentencia falla con ese código.
- De la carrera: Bases de datos (transacciones y aislamiento: todo el test es una transacción con `rollback`; integridad referencial: `restrict`/`cascade`/`set null`; vistas y permisos: `GRANT`/`REVOKE`). Ingeniería del software (pruebas: TDD y pruebas de mutación).
- Cómo probarlo: `supabase start`, `supabase db reset` y `supabase test db`. Con tu migración sin terminar se espera ROJO en workspaces.test.sql (no existen las tablas); va pasando a verde según escribes `workspaces`, `memberships`… `orders.test.sql` seguirá en rojo: usa el modelo antiguo y se reescribe en el PR siguiente.

### 2026-11-05, Modo taller: el modelo de datos pasa de `user_id` a `workspace_id` (solo documentos)
- Archivo y sitio: docs/TALLER.md (nuevo). docs/PEDIDOS.md: cabecera, límites, contrato del adaptador (`createSupabaseStore({ workspaceId })`), `save_order`, la sección «Esquema propuesto» entera, las notas para escribirlo y un aviso en «Tests». docs/NUBE.md: sección «Esquema», token del agente, borrado de cuenta y orden de PRs (paso 6 bis). CLAUDE.md: párrafo de pedidos y de la nube.
- Qué cambió: el diseño admite talleres de varias personas (jefe, encargado, operario, cada uno con su cuenta). Los datos son de un taller (`workspace_id`), y una cuenta suelta es un taller de una persona. Pedidos y clientes se parten en tablas de producción y de finanzas. No hay código ni SQL: es el contrato que tu migración tiene que cumplir.
- Por qué:
  - **`workspace_id` en vez de `user_id`.** Descartado: seguir con `user_id` y una tabla «compartir fila a fila» (permisos por fila, lento y difícil de razonar) y tener dos modelos, uno para cuentas sueltas y otro para talleres (doble código y una migración de datos al pasar de uno a otro). Con `workspace_id` la política es siempre «¿soy miembro de este taller y con qué rol?». Se decide ahora porque nada está aplicado todavía: después habría que reescribir tablas, políticas, `save_order` y los 52 tests.
  - **Tablas separadas para producción y finanzas.** RLS filtra filas, no columnas: no hay política que enseñe a un rol el nombre y la cantidad de una línea y le oculte el precio de esa misma fila. Y los roles de la API comparten un único rol de Postgres (`authenticated`), así que ni los permisos por columna ayudan. Descartado: vistas (hay que acordarse de revocar la tabla base) y funciones que recortan el JSON (la seguridad queda en código que se puede olvidar llamar). Partir la tabla hace que la política de cada una sea una sola frase.
  - **`is_member` y `has_role` con `security definer`.** Una política de `memberships` que consulta `memberships` recursa sin fin. Las funciones leen la tabla saltándose RLS y solo devuelven datos del propio `auth.uid()`; llevan `set search_path = ''` para que nadie pueda hacer que ejecuten un objeto suyo de otro esquema.
  - **El operario cambia el estado con `set_order_status` y no con `update`.** Una política de update no distingue columnas: podría cambiar también la fecha de entrega o las notas. Es `definer`, así que tiene que comprobar dentro que el pedido es de un taller suyo; los tests lo probarán con un operario de otro taller.
  - **`save_order` y `next_order_number` reciben el taller.** Una persona puede ser miembro de varios talleres, y ya no hay un `auth.uid()` que haga de «taller implícito».
  - **Sin trigger que cree el taller al registrarse:** si falla, falla el registro de la persona y es difícil de depurar. Lo crea `create_workspace`, que llama la web al primer inicio de sesión.
  - **«Que no se pasen la cuenta»:** ninguna clave lo impide. Lo que funciona: entrar con enlace a su propio correo, invitación ligada al correo, asientos comprobados en el servidor y que quitar a alguien corte el acceso en el acto (RLS consulta `memberships` en cada petición).
- Concepto nuevo: multi-tenancy (varios clientes que comparten la misma base de datos y el mismo código, con los datos aislados por `workspace_id`) y RBAC (control de acceso por roles). Ejemplo mínimo: `create policy p on t for select using (public.is_member(workspace_id))` deja leer solo las filas cuyo taller es uno de los tuyos.
- De la carrera: Bases de datos: la partición vertical (dividir una tabla por columnas según quién las usa) y las claves foráneas con `on delete restrict / cascade / set null`. Seguridad / Sistemas: control de acceso basado en roles y mínimo privilegio, y por qué `security definer` es una escalada de privilegios que hay que acotar (`search_path`). Concurrencia: el `select … for update` que serializa las aceptaciones de invitación para no pasarse de asientos.
- Cómo probarlo: no hay código. Lee docs/TALLER.md y comprueba contra la tabla de roles que cada acción tiene su sitio; comprueba que cada tabla de «Esquema propuesto» (docs/PEDIDOS.md) cae en un solo grupo (producción o finanzas). `npm test` y `npm run build` no cambian. **Ojo:** `npm run test:db` deja de ser válido para pedidos hasta el PR de tests nuevo.

### 2026-11-06, Tests de pedidos reescritos para el modo taller (con roles)
- Archivo y sitio: supabase/tests/orders.test.sql (reescrito entero, 89 tests), scripts/db/order-numbers-race.sh (taller y dos personas), docs/PEDIDOS.md (sección de tests y dos reglas nuevas para `save_order`), docs/MAPA.md, CLAUDE.md.
- Qué cambió: los tests de pedidos pasan del modelo «un usuario, sus datos» (`user_id`) al modo taller de docs/TALLER.md: `workspace_id`, las firmas nuevas (`save_order(taller, json)`, `next_order_number(taller)`, `set_order_status`), las tablas de finanzas separadas y qué puede ver y hacer cada rol.
- Por qué:
  - El modelo cambió el 2026-11-05 y los tests viejos ya no servían para validar tu migración: probaban tablas y firmas que no van a existir.
  - **Lo nuevo que prueban son los roles**, que es donde está el riesgo: un operario que viera precios, o que pudiera cambiar la fecha de entrega con un `update`, sería un fallo de seguridad silencioso. Se prueba lo que ve (`select`), lo que no puede escribir (comprobando después el estado real, como superusuario) y que su única puerta, `set_order_status`, comprueba que el pedido es de **su** taller.
  - **`real_count` como superusuario:** cuando alguien sin permiso intenta algo, RLS puede «fallar» de dos formas, con un error o tocando 0 filas. Lo que importa es que no cambie nada, así que se mira el estado real sin RLS.
  - **Mutation testing otra vez:** contra una referencia privada probé 11 fallos típicos de este modelo y cada uno hace fallar al menos un test. Dos parecían escaparse (borrar el historial en `save_order` y un contador con `max()`), pero no eran fallos: sin política de `delete` en `order_events`, RLS hace que ese `delete` no borre nada, y `max()` solo ve las filas de tu taller. Los rehíce como fallos de verdad (con política de borrado y con una secuencia global) y ahí sí los pillan.
  - **Dos reglas que salieron al escribir la referencia,** ya en docs/PEDIDOS.md:
    - `save_order` inserta solo los eventos que no existen ya (por `order_id`, `at` y `type`), porque `set_order_status` escribe eventos que el JSON del front todavía no tiene.
    - El `do update` del conflicto nunca toca `workspace_id`.
- Concepto nuevo: **mutante equivalente**. Es un cambio en el código que parece un fallo pero no cambia el comportamiento, así que ningún test puede detectarlo, y no es culpa de los tests. Aquí, RLS convertía dos de mis «fallos» en inofensivos. La forma de saberlo es razonar por qué sobrevive, en vez de añadir tests a ciegas.
- De la carrera: Bases de datos: control de acceso por filas con roles (RLS), partición vertical (producción y finanzas), funciones `security definer` frente a `invoker`. Programación concurrente: el contador por taller bajo 40 peticiones simultáneas de dos personas. Ingeniería del Software: TDD y mutation testing, incluidos los mutantes equivalentes.
- Cómo probarlo: con Docker y `supabase start`, `npm run test:db`. Sin tu migración del modo taller fallan (no existen las tablas), que es lo esperado. Con ella, todo tiene que salir `ok`, y la última línea del script de carrera es «ok - 40 peticiones…».

### 2026-11-06, Rediseño sereno: menos plantilla, más herramienta
- Archivo y sitio: src/App.jsx (`Field` sin botón «i», sin el estado `openHelp`; `tabsRef` y su `useEffect` junto a la sincronización con la URL); src/index.css (`h1`, `.subtitle`, `.help`, `.dropzone`, `.drop-title`, `.drop-hint`, `.extra-add .controls`, fundidos `.tabs.more-left` y `.tabs.more-right`, y siete usos del oro pasados a color de texto); src/i18n/{en,es,fr}.js (`import.drop` e `import.hint` más cortos; fuera `field.whatIs`); scripts/shots.mjs (fechas de ejemplo de 2026); DESIGN.md.
- Qué cambió: la calculadora y el resto de pantallas pierden los rasgos de plantilla.
  - **Título a escala de app.**
  - **Sin «ⓘ» en cada campo:** la ayuda sale al tocar el campo.
  - **Importar es una fila de la lista**, no una caja discontinua.
  - **El oro solo** en el precio, el botón principal y dónde estás.
  - **Las pestañas del móvil** marcan con un fundido que hay más.
- Por qué:
  - **Lo que hacía que pareciera «hecha por IA»**, mirando las capturas:
    - un titular de landing de 2,6 rem con subtítulo encima de cada herramienta;
    - un círculo «i» tras cada una de las ~20 etiquetas;
    - una caja de borde discontinuo para soltar archivos;
    - el oro repartido por enlaces, avisos e iconos, así que dejaba de señalar lo importante.
    Son los patrones por defecto de las plantillas. Las herramientas buenas (Ajustes de iOS, Linear) van directas al trabajo y usan un único color de acento con disciplina.
  - **Ayuda al enfocar** y no con un botón: la explicación aparece justo cuando la necesitas (al escribir en ese campo) y desaparece después. Sigue en la página y unida al campo con `aria-describedby`, así que un lector de pantalla la lee al entrar en él. Se pierde el poder leerla sin tocar el campo, a cambio de quitar 20 botones de la pantalla.
  - **El h1 cambia de tamaño pero no de texto:** Google lo lee en el HTML prerenderizado, y el texto es lo que cuenta para el SEO.
  - **Fundido según el scroll real:** con un fundido fijo, a 768 px «Planes» parecía cortado aunque cabían todas, y a 390 px abriendo Calendario se cortaba «Calculadora» por la izquierda sin aviso. Ahora se mira `scrollLeft` y `scrollWidth`, y además la pestaña abierta se desplaza a la vista.
  - **Texto de importar más corto:** de tres líneas a dos. Plain copy, una de las reglas de Taste Skill: decir lo que hace en las menos palabras posibles.
  - El sistema queda escrito en DESIGN.md (ayuda de campo, h1, importar, usos del oro), para que no vuelva.
- Concepto nuevo: **`:focus-within`**. Es un selector CSS que se cumple cuando el elemento o cualquiera de sus hijos tiene el foco. Ejemplo: `.field:focus-within .help{display:block}` enseña la ayuda mientras escribes en el input de dentro, sin una línea de JavaScript.
- De la carrera: Interacción Persona-Ordenador: jerarquía visual, carga cognitiva (20 botones menos) y divulgación progresiva (la ayuda solo cuando hace falta).
- Cómo probarlo: `npm run build && npm run shots` y compara con las capturas de antes. En la calculadora, toca «Peso de la pieza»: sale su explicación debajo. En el móvil, abre `/es/?view=calendar`: «Calendario» está a la vista y hay un fundido a cada lado.

### 2026-11-06, Auditoría de la interfaz, la pantalla en la URL, DESIGN.md y capturas automáticas
- Archivo y sitio: src/route.js y src/route.test.js (nuevos); src/App.jsx (estado inicial de `view` y `ordersOpen` leído de la URL, dos `useEffect` junto a `quoteParts` que sincronizan URL y pantalla, enlace «Saltar al contenido» antes de la barra y su destino `#contenido` después); src/index.css (bloque «Auditoría» al final); src/i18n/{en,es,fr}.js (`a11y.skip`); scripts/shots.mjs (nuevo); package.json (script `shots` y `playwright-core` en devDependencies); .gitignore (`shots/`); DESIGN.md (reescrito); docs/MAPA.md; CLAUDE.md.
- Qué cambió:
  - **La pestaña abierta va en la URL** (`/es/?view=orders&order=…`). Recargar, compartir un enlace y el botón Atrás del navegador funcionan.
  - **En el iPhone los campos ya no hacen zoom al tocarlos.**
  - **Pequeños arreglos de accesibilidad y táctil.**
  - **DESIGN.md describe el sistema actual**, y `npm run shots` fotografía la web en 8 combinaciones de pantalla.
- Por qué:
  - **Las cuatro herramientas que investigamos**, y qué se usó de cada una:
    - **Web Interface Guidelines de Vercel:** una lista de reglas de interfaz que se pasó por el código. Encontró los arreglos de esta entrada.
    - **Awesome DESIGN.md:** el formato del archivo DESIGN.md. Escribimos el nuestro en vez de copiar el de otra marca, para no parecernos a Linear o a Apple.
    - **Playwright CLI:** para que un agente maneje un navegador. Aquí se usa Playwright directamente en `shots.mjs`, y en tu Mac puedes instalar el CLI (`npm i -g @playwright/cli`) para que Claude Code pruebe la web solo.
    - **Taste Skill:** está hecho para webs de empresa (landings), no para pantallas de una herramienta. Se reserva para una futura landing de layercents.
  - **La URL como estado:** antes la pestaña vivía solo en React, así que al recargar volvías a la calculadora, Atrás te sacaba de la web y no se podía enlazar «Pedidos». Va en parámetros (`?view=`) y no en rutas (`/es/pedidos`) porque GitHub Pages sirve archivos estáticos: `/es/pedidos` daría 404, y `?view=` llega al mismo `index.html`.
  - **`pushState` en cada cambio y `replaceState` en el primero:** cada pestaña es un paso de Atrás, como una página. Pero corregir un enlace roto al abrir (`?view=report` sin nada seleccionado pasa a Historial) no debe dejar un paso de Atrás hacia la nada.
  - **Lo que viene de la URL no se cree a ciegas:** una vista desconocida es la calculadora, y un id con caracteres raros se ignora. Un enlace lo escribe otra persona.
  - **16 px en los campos táctiles:** la web usa letra de 15 px, y Safari en iPhone amplía la página al tocar cualquier campo de menos de 16 px. Pasaba en cada campo de la calculadora. Solo con `pointer: coarse` (pantalla táctil), así el ordenador no cambia.
  - **`touch-action: manipulation`:** quita los ~300 ms que el móvil espera tras un toque para ver si es un doble toque de zoom. Los botones responden al instante.
  - **`overscroll-behavior`:** el scroll dentro de una hoja no arrastra la página de detrás, y con ratón la página no rebota al final. En táctil se deja el rebote, que sirve para recargar.
  - **«Saltar al contenido»:** con el teclado, el primer Tab ofrece saltar las nueve paradas de la barra lateral (WCAG 2.4.1).
  - **El foco de las notas de las hojas** no se veía al llegar con el teclado.
  - **`playwright-core` como dependencia de desarrollo:** es Playwright sin navegadores incluidos (pocos MB). Usa el Chrome que ya tienes (`channel: 'chrome'`) y no se publica con la web. Descarté el paquete `playwright` completo, que descarga sus propios navegadores (cientos de MB).
  - **DESIGN.md reescrito:** el de octubre describía el estilo anterior al rediseño del 3 de noviembre (titulares en Bricolage, otros colores). Una IA que lo leyera volvería al estilo viejo. Se conservan sus partes que siguen valiendo: el papel del PDF y los colores de la barra de costes.
- Concepto nuevo: **History API**. `history.pushState(estado, '', '/es/?view=orders')` cambia la URL sin recargar la página y añade un paso al botón Atrás. Cuando la persona pulsa Atrás, el navegador lanza el evento `popstate`, y ahí lees la URL y pones la pantalla que toca.
- De la carrera: Interacción Persona-Ordenador: accesibilidad (WCAG 2.4.1, saltar bloques; foco visible), tamaños mínimos táctiles y la URL como parte de la interfaz. Redes / Sistemas Distribuidos: por qué un servidor estático no puede resolver `/es/pedidos` y sí `?view=`.
- Cómo probarlo: `npm test` (296 pasan).
  - **URL:** abre `layercents.com/es/?view=orders`: sale Pedidos. Ve a Calendario y pulsa Atrás: vuelves a Pedidos. Recarga: sigues ahí.
  - **Teclado:** pulsa Tab nada más cargar: sale «Saltar al contenido».
  - **iPhone:** toca un campo de la calculadora: ya no hace zoom.
  - **Capturas (en tu Mac):** `npm install`, `npm run build && npm run shots` y mira la carpeta `shots/`.

### 2026-11-04, Tests de la base de datos de pedidos, antes que el SQL
- Archivo y sitio: supabase/tests/orders.test.sql (nuevo, 52 tests pgTAP), scripts/db/order-numbers-race.sh (nuevo), package.json (script `test:db`), docs/PEDIDOS.md (`security invoker`, qué hace `save_order`, lista de tests), docs/MAPA.md, CLAUDE.md.
- Qué cambió: están los tests que tu migración de Supabase tiene que pasar, escritos antes que el SQL. No hay SQL de producción: ese lo escribes tú.
- Por qué:
  - **TDD para el backend:** los tests fijan el contrato (nombres de tablas y columnas, `save_order(p_order jsonb)`, `next_order_number()`, qué se rechaza) antes de que exista el código. Cuando escribas la migración sabrás al momento si encaja con el front, sin tener que adivinarlo.
  - **pgTAP** es el framework de tests de Postgres que usa Supabase (`supabase test db`). Cada test corre en una transacción que acaba en `ROLLBACK`, así que no ensucia la base.
  - **Hacerse pasar por un usuario** como lo hace Supabase en cada petición: `set local role authenticated` y el JWT en `request.jwt.claims`, de donde `auth.uid()` lee el `sub`. Así se prueba RLS de verdad y no con el superusuario, que se la salta.
  - **`security invoker` en vez de `definer`:** con definer la función corre con los permisos de su dueño y RLS no se aplica dentro. Lo comprobé: con definer, el usuario B sobrescribía un pedido de A. Cambiado en docs/PEDIDOS.md.
  - **Tests de los tests (mutation testing):** escribí una implementación de referencia privada (fuera del repo) para ver que los tests pueden pasar. Luego le metí a propósito los fallos típicos y comprobé que cada uno hace fallar al menos un test: línea sin comprobar el pedido padre, `security definer`, historial duplicado, RLS olvidado, `qty` sin `check`, `cascade` en vez de `set null`. Un test que nunca falla no protege nada.
  - **La concurrencia no se puede probar en una sola sesión**, así que va en un script aparte que abre 40 conexiones a la vez. Con un contador de «leo y luego escribo», las 40 peticiones sacaron solo 3 números distintos. Con una sola sentencia `insert … on conflict do update … returning`, 1..40 sin repetir: Postgres bloquea la fila del contador y pone las peticiones en fila.
  - Al escribirlos, dos fallos eran de los propios tests: el plan decía 46 tests y eran 52, y un test de pago negativo reutilizaba los ids de las líneas de otro pedido, así que chocaba antes con la clave primaria. Corregidos.
- Concepto nuevo: **mutation testing**. Cambias el código a propósito por una versión con un fallo concreto y miras si algún test lo detecta; si ninguno falla, a tus tests les falta un caso. Ejemplo: quitar `check (qty between 1 and 100000)` hizo fallar «una línea con cantidad 0 se rechaza».
- De la carrera: Bases de datos: transacciones, restricciones CHECK, UNIQUE y claves foráneas con SET NULL y CASCADE, y control de acceso por fila. Sistemas Operativos / Programación concurrente: condición de carrera y exclusión mutua por bloqueo de fila en `next_order_number()`. Ingeniería del Software: TDD y mutation testing.
- Cómo probarlo: con Docker abierto, `supabase start`. Sin tu migración, `npm run test:db` falla (no existen las tablas): es lo esperado. Escribe la migración en `supabase/migrations/`, haz `supabase db reset` para aplicarla y vuelve a ejecutar `npm run test:db` hasta que salga todo en verde.

### 2026-11-04, Pedidos conectados con Historial y Calendario, y migración (paso 3 de 3)
- Archivo y sitio: src/useOrders.js (`importLegacy`), src/App.jsx (efecto de migración al arrancar con `legacyDone`, `ordersPreset`, props nuevas de History, Calendar y Orders, Excel con el pedido de cada presupuesto), src/History.jsx (fuera el filtro por estado, el selector de estado y el beneficio por presupuesto; columna «Pedido» con enlace o «Crear pedido»; botón «Pedido con N»), src/schedule.js y src/schedule.test.js (reescritos sobre pedidos), src/Calendar.jsx (lee pedidos; cada fila abre su pedido; «Venta» pasa a «Cobro»), src/NewOrderDialog.jsx (fecha sugerida por la cola), src/orders.js (`ordersByQuote`), src/exportExcel.js (columna «Pedido» en vez de Estado, Cobrado y Beneficio real), src/sales.js (marcado como antiguo), borrados src/OrderDialog.jsx y src/SaleDialog.jsx, src/index.css, src/i18n/{en,es,fr}.js, docs/MAPA.md, CLAUDE.md.
- Qué cambió:
  - **Migración:** al abrir la web, los presupuestos que estaban como «Pedido» o «Vendido» se convierten en pedidos de verdad (los vendidos, entregados y con su cobro), con su ficha de cliente.
  - **Historial:** cada presupuesto dice en qué pedido está (y en qué estado), o tiene un botón para crearlo. Las piezas marcadas se pueden convertir en un pedido juntas.
  - **Calendario y cola:** leen los pedidos. Tocar uno lo abre.
  - **Nuevo pedido:** propone la fecha de entrega según la cola.
- Por qué:
  - **Un solo sitio para «qué pasó después del presupuesto».** Si conviven el estado por presupuesto y los pedidos, tendrías dos verdades que se contradicen. Por eso el Historial deja de editar estados y la pestaña Pedidos es la única que lo hace.
  - **Migración idempotente y a prueba de cortes:** `importLegacy` pide números reales al store (así el contador avanza también en Supabase), guarda clientes y pedidos, y solo marca con `orderId` los presupuestos cuyo pedido se guardó de verdad. Si el navegador se llena a medias, los que faltan se reintentan en la próxima carga: ni se pierden ni se duplican. Lo comprobé recargando dos veces: siguen siendo 3 pedidos.
  - **`useRef` para que corra una vez:** en desarrollo, React (StrictMode) ejecuta los efectos dos veces. La ref lo evita, y aun así la función es idempotente.
  - **sales.js no se borra:** los presupuestos antiguos y las copias ya descargadas llevan `status` y `sale`. backup.js los sigue validando, y la migración los lee.
  - **La cola solo cuenta pendientes e imprimiendo:** un pedido «Listo» ya está impreso, así que sale en su día de entrega pero no ocupa impresora.
  - **«Aceptados» en el Historial** es ahora el porcentaje de presupuestos que acabaron en un pedido no cancelado: la tasa de conversión.
  - **El Excel lleva «#0012 · Entregado»** en vez de las tres columnas de venta, que ya no se rellenan desde el presupuesto. Las cifras de cobros están en Pedidos.
- Concepto nuevo: **migración de datos en el cliente**. Igual que una migración de base de datos, pero se ejecuta en el navegador de cada persona al abrir la app, porque los datos viven allí. Tiene que ser idempotente: no sabes cuántas veces se va a ejecutar. Ejemplo: `if (!q.orderId && q.status === 'order') → crear pedido y poner orderId`.
- De la carrera: Bases de datos: migración de esquema con datos existentes y atomicidad por elemento (solo se marca lo que se guardó), en `importLegacy`. Sistemas Operativos: la cola EDF ahora sobre pedidos, en `planOrders`.
- Cómo probarlo: `npm test` (291 pasan).
  - **Migración:** en un navegador con presupuestos marcados como «Pedido» o «Vendido» de antes, abre la web. Salen en Pedidos (los vendidos, entregados y pagados) y el Historial enseña «#000X · Pendiente».
  - **Desde el Historial:** marca dos presupuestos → «Pedido con 2» → la hoja propone fecha → «Crear pedido».
  - **Calendario:** sale en la cola; tócalo y se abre.

### 2026-11-04, Pestaña Pedidos y Clientes (paso 2 de 3)
- Archivo y sitio: src/Orders.jsx, src/OrderDetail.jsx, src/NewOrderDialog.jsx, src/OrderParts.jsx y src/useOrders.js (nuevos); src/App.jsx (store único `ordersStore`, `useOrders`, pestaña «Pedidos» con el número de abiertos, vista `orders`, `orders.reload()` tras restaurar); src/NavIcons.jsx (icono de caja); src/index.css (bloque «Pedidos»); src/i18n/{en,es,fr}.js (`nav.orders`, `orders.*`, `order.*`, `neworder.*`, `customers.*`); docs/MAPA.md; CLAUDE.md.
- Qué cambió: hay una pestaña Pedidos con dos listas, Pedidos y Clientes.
  - **Lista de pedidos:** cifras arriba (abiertos y cuántos van tarde, por cobrar, cobrado, beneficio de los entregados), buscador y filtros (abiertos, entregados, cancelados, todos).
  - **Página de cada pedido:** estado en un control segmentado, cliente, entrega y canal, piezas editables (cantidad y precio), líneas libres, envío, descuento y comisiones, pagos con su forma y fecha, notas e historial con hora.
  - **Ficha de cada cliente:** sus datos, lo que ha pagado y lo que debe, y sus pedidos.
- Por qué:
  - **Escritura optimista** en `useOrders`: la pantalla cambia al momento y luego se guarda. Si el store falla, sale un aviso y se vuelve a leer lo guardado, así que nunca se queda en pantalla algo que no está guardado. Con localStorage no se nota; con tu Supabase es la diferencia entre una app ágil y un spinner en cada toque.
  - **Los campos guardan al salir** (blur o Enter), no en cada tecla. Cada guardado es una escritura en el store, y con red detrás una nota escrita letra a letra serían cuarenta peticiones. El borrador vive en el estado del campo.
  - **Un solo store en todo el módulo** (`const ordersStore = createLocalStore()` fuera del componente): `useOrders` depende de él, y un objeto nuevo en cada render lo recargaría en bucle. Cambiar esa línea por el store de Supabase es todo lo que necesitará la pantalla.
  - **La página abierta la guarda `App`** (`ordersOpen`) y no la pestaña. Así el Historial y el Calendario podrán abrir un pedido directamente en el paso 3. La app no tiene router y no hace falta uno para esto.
  - **Al crear un pedido, el cliente se escribe con sugerencias** (`<datalist>`). Un nombre que ya existe, aunque cambien las mayúsculas o las tildes, se enlaza con su ficha (`findByName`), y uno nuevo crea ficha. Así «Bar Pepe» y «bar pepe» no acaban siendo dos clientes; lo comprobé en el navegador.
  - **Importes en la moneda de la pantalla y guardados en EUR**, como en la hoja de venta. Se escriben con la coma o el punto del idioma: al probarlo salía «4.95» entre importes con coma.
  - **El total de la hoja «Nuevo pedido» se calcula pasando por `lineFromQuote`:** salía un céntimo distinto del total del pedido, porque sumaba los precios sin redondear como lo hace el pedido.
  - **Estados y pagos con un punto de color apagado Y la palabra:** el color nunca es la única pista (WCAG 1.4.1). El oro solo en el total, que es el precio, y en el botón principal.
  - **Borrar pide confirmación** y recomienda cancelar: un pedido cancelado se queda en el historial sin contar en las sumas.
- Concepto nuevo: **actualización optimista**. Aplicas el cambio en pantalla antes de que el servidor responda y lo deshaces si falla. Ejemplo: `setData(nuevo); try { await store.save(x) } catch { await reload() }`.
- De la carrera: Interacción Persona-Ordenador: los campos que guardan al salir, la confirmación antes de una acción destructiva y no depender solo del color, en OrderParts.jsx y OrderDetail.jsx. Sistemas Distribuidos: la consistencia que da la actualización optimista con reconciliación (`persist` en useOrders.js).
- Cómo probarlo: `npm test` (291 pasan). Guarda dos o tres presupuestos y ve a Pedidos → «+ Nuevo pedido». Escribe un cliente, una fecha, marca piezas y crea el pedido. En la página del pedido:
  - Pasa el estado a «Imprimiendo».
  - Añade una línea libre y pon el envío.
  - Añade un pago menor que el total: sale «Señal».
  Vuelve a la lista y crea otro pedido para el mismo cliente escrito en minúsculas: en «Clientes» sigue habiendo uno solo, con dos pedidos. Recarga y todo sigue ahí.

### 2026-11-04, Pedidos y clientes: modelo, adaptador y contrato (paso 1 de 3)
- Archivo y sitio: src/orders.js, src/customers.js y src/ordersStore.js (nuevos), src/orders.test.js (nuevo, 15 tests), src/backup.js (claves `orders`, `customers` y `orderCounter` en `KEYS`, `buildBackup`, `parseBackup`, `planRestore`, `readSettings`, `hasStoredSettings`, `applyRestore`), docs/PEDIDOS.md (nuevo), docs/MAPA.md, CLAUDE.md.
- Qué cambió: existe el modelo de datos de pedidos y clientes, con un almacén local detrás de un adaptador y dentro de la copia de seguridad. Todavía no hay pantalla: eso es el paso 2. docs/PEDIDOS.md es el contrato y el esquema propuesto para tu base de datos.
- Por qué:
  - **Pedido como entidad propia** (lo decidiste tú): un pedido tiene varias piezas, cliente, entrega, pagos e historial. Las líneas copian nombre, precio y coste del presupuesto, porque un pedido es un compromiso al precio de ese día. Que cambie el presupuesto después no puede cambiar lo vendido.
  - **Estado y pago separados, y el pago derivado:** `orderTotals` calcula sin pagar, señal o pagado a partir de los pagos. Guardarlo sería tener dos fuentes de la misma verdad.
  - **Adaptador (patrón Strategy / interfaz con dos implementaciones):** la pantalla llama a `store.saveOrder(...)` sin saber si detrás hay localStorage o Supabase. Los métodos son asíncronos ya, aunque el local no lo necesite: así tu adaptador entra sin tocar la pantalla. Descarté que la pantalla hablara directamente con localStorage, porque luego habría que reescribirla entera.
  - **El número de pedido nunca baja:** `nextOrderNumber` toma el mayor entre el contador guardado y los números en uso, como el contador de presupuestos. En la base de datos tiene que ser una sola sentencia (`insert … on conflict do update … returning`) para que dos pestañas no saquen el mismo. Está en el documento.
  - **Borrar un cliente es `on delete set null`:** sus pedidos se quedan con el nombre. En local se escriben las dos claves con `writeAtomically` (rollback a mano) para no dejar una referencia colgando.
  - **Fusionar copias:** gana este navegador. Un pedido nuevo con un número ya usado salta por encima del mayor de LAS DOS listas. El primer test lo pilló: subiendo solo por encima de las de aquí, un pedido renumerado le quitaba el número a otro entrante que lo habría conservado.
  - **Migración idempotente:** `migrateQuoteOrders` convierte los presupuestos con estado «pedido» o «vendido» en pedidos y les pone `orderId`. Ejecutarla dos veces no duplica nada. Se usa en el paso 3.
  - Dinero: en el front, números en EUR como el resto de la app, con 4 decimales en precios por pieza y 2 en pagos. En la base de datos, `numeric` y no `float`.
- Concepto nuevo: **idempotencia**. Una operación es idempotente si hacerla una o varias veces deja el mismo resultado. Ejemplo: `migrateQuoteOrders(migrateQuoteOrders(q).quotes)` no crea ningún pedido más, porque los presupuestos ya llevan `orderId`.
- De la carrera: Bases de datos: claves foráneas con `ON DELETE SET NULL` y `CASCADE`, restricción `UNIQUE (user_id, number)` y no guardar atributos derivados (normalización), en docs/PEDIDOS.md y `deleteCustomer`. Programación concurrente: la condición de carrera de leer y luego escribir el contador, resuelta con una sola sentencia atómica (`next_order_number`). Ingeniería del Software: patrón Strategy en src/ordersStore.js.
- Cómo probarlo: `npm test` (291 pasan). Lee docs/PEDIDOS.md antes de escribir las migraciones. En la web no cambia nada todavía.

### 2026-11-04, Otros costes en la calculadora
- Archivo y sitio: src/calculate.js (`MAX_EXTRA_COSTS`, `normalizeExtraCosts`, `extraCostsPerPart` y la capa `extras` dentro de `calculate`), src/App.jsx (componente `ExtraCosts` junto a `ExtraFilaments`, `addCost`, campo `extraCosts` en `INITIAL`, `loadQuote`, capa nueva en `LAYERS` con la fila oculta si vale 0), src/backup.js (`sanitizeQuote` limpia `inputs.extraCosts`), src/exportExcel.js (columna «Otros costes»), src/Report.jsx (capa en la gráfica de coste medio, con `?? 0` para los presupuestos viejos), src/index.css (`.cost-per`), src/i18n/{en,es,fr}.js (`layer.extras`, `cost.extra.*`), tests en calculate.test.js y backup.test.js, docs/MAPA.md, CLAUDE.md.
- Qué cambió: en «Esta impresión», bajo Embalaje, hay un «+ Añadir un coste». Cada línea tiene concepto, importe y si se paga por pieza o por pedido. Suman al coste (capa «Otros costes» en la barra) y, con el margen y la comisión, al precio recomendado.
- Por qué:
  - Lo pediste: cosas que no son filamento ni máquina (imanes, insertos, pintura, llaveros, el diseño).
  - **Por pieza / por pedido:** un imán va en cada pieza, pero el diseño o una caja para todo el pedido se pagan una vez. Lo de por pedido se reparte entre las piezas (`importe / cantidad`), porque toda la calculadora trabaja por pieza y el total del pedido es precio × piezas: así el total sale exacto. Ejemplo: 4 piezas, imanes de 0,50 € por pieza y diseño de 20 € por pedido → 5,50 € por pieza.
  - **Fuera de `failures`:** los fallos encarecen el filamento, la luz y la máquina porque una impresión fallida los gasta. Un imán o el diseño no se tiran cuando falla una impresión, así que no se multiplican por la tasa de fallos.
  - **Mismo patrón que `extraFilaments`:** lista opcional, normalizada en un sitio (`normalizeExtraCosts`), usada al cargar un presupuesto y al restaurar una copia. Un presupuesto viejo no tiene la lista y vale lo mismo al céntimo (hay test), sin migración ni subir `BACKUP_SCHEMA_VERSION`. Máximo 10 líneas y nombres de 40 caracteres, para que un archivo manipulado no meta miles.
  - La fila «Otros costes» del desglose solo sale si hay algo: la mayoría de piezas no tienen y sería ruido. En el Excel, los presupuestos viejos dejan la celda vacía en vez de un 0 que nadie escribió.
  - En el informe PDF, la media usa `?? 0` porque un solo `undefined` en la suma convierte la media en `NaN`.
  - Control segmentado con `aria-pressed` (como en el aspecto del presupuesto) en vez de un `<select>`: son dos opciones y así se ven las dos a la vez.
- Cómo probarlo: `npm test` (276 pasan). En la calculadora pulsa «+ Añadir un coste»: «Imanes», 0,5 €, Por pieza. Otro: «Diseño», 20 €, Por pedido. Pon Cantidad 4: en la barra sale «Otros costes 5,50 EUR» y el precio sube. Guarda, ve al Historial, «Cargar»: vuelven las dos líneas. Exporta el Excel: columna «Otros costes».

### 2026-11-04, Apuntes a mano en el calendario
- Archivo y sitio: src/calendarEvents.js (nuevo) y src/calendarEvents.test.js (nuevo, 13 tests), src/EventDialog.jsx (nuevo), src/Calendar.jsx (botón «+ Añadir» en la lista del día, filas propias que se abren al tocarlas, cuadrado en la rejilla y en la leyenda), src/backup.js (clave `events` en `KEYS`, `buildBackup`, `parseBackup`, `planRestore`, `readSettings`, `hasStoredSettings`, `applyRestore`), src/index.css (`.dot-own`, `.cal-own`, campos de texto en las hojas), src/i18n/{en,es,fr}.js (`cal.add*`, `cal.kind.own`, `cal.storageError`, `event.*`), docs/MAPA.md, CLAUDE.md.
- Qué cambió: en el Calendario puedes apuntar cosas tuyas en cualquier día: qué, hora opcional y nota («Comprar PETG», «Recogida 17:30», «Feria»). Salen con un cuadrado en el mes y en la lista del día. Si tocas uno, se edita o se borra.
- Por qué:
  - **Clave propia en localStorage (`calendarEvents`)** y no como campo de los presupuestos: un apunte no es una pieza, y mezclarlo ensuciaría History, el Excel y las sumas de ventas.
  - **El estado vive en `Calendar`, no en `App`.** Solo lo usa esa pestaña. Se lee al montar, y como la restauración se hace en History, al volver al Calendario se monta otra vez y ya lee lo restaurado. Subirlo a App solo añadiría props.
  - **Validación en un sitio:** `sanitizeEvent` sirve tanto para leer del navegador como para restaurar una copia. Fecha `YYYY-MM-DD` real, hora `HH:MM` de 24 h, título obligatorio. Los textos se recortan (120 y 500 caracteres) en vez de rechazarse, y hay un máximo de 2000 apuntes: así una copia manipulada no puede llenar los ~5 MB de localStorage.
  - **Copia de seguridad sin subir `BACKUP_SCHEMA_VERSION`:** `calendarEvents` es una clave opcional nueva. Una copia vieja no la tiene, y entonces restaurar (Merge o Replace) **no borra** tus apuntes: `null` significa «el archivo no dice nada», no «borra». Es la misma regla que ya tenía `setup`, y hay test.
  - **Merge:** unión por id y, si el mismo apunte se editó en los dos lados, gana el de este navegador. A diferencia de los presupuestos, los apuntes sí se editan, así que el mismo id con otro contenido es una edición y no una colisión.
  - **Id con `crypto.randomUUID()`:** dos dispositivos pueden crear apuntes a la vez, y con `Date.now()` podrían coincidir al fusionar.
  - **Cuadrado en vez de punto:** los apuntes se distinguen de las ventas (punto gris) por la forma y no solo por el color, que no basta para quien no distingue colores (WCAG 1.4.1). El botón «Añadir» va en color de texto y no en oro, que está reservado al precio y al botón principal.
  - Si el navegador no deja guardar (almacenamiento lleno o bloqueado), el apunte se queda en pantalla y sale un aviso de que se perderá al recargar, en vez de fallar en silencio.
- Concepto nuevo: `crypto.randomUUID()` devuelve un identificador aleatorio de 122 bits, por ejemplo `"0549cff1-2f30-45d1-b88d-d56fa5f8054d"`. La probabilidad de que dos coincidan es despreciable, así que no hace falta un servidor que reparta ids.
- De la carrera: Bases de datos: la fusión de la copia es una unión por clave primaria (`id`) con una política de conflicto («gana local», como un `INSERT … ON CONFLICT DO NOTHING`). Se ve en `mergeEvents` de src/calendarEvents.js.
- Cómo probarlo: `npm test` (272 pasan). Abre Calendario, elige un día y pulsa «+ Añadir». Guardar sin título avisa «Escribe qué es». Pon título, hora y nota, y guarda: aparece un cuadrado en el día. Recarga y sigue ahí. Toca la fila para editar; cambia el día a otro mes y el calendario salta a ese mes. Borra. Descarga una copia y comprueba que dentro está `calendarEvents`.

### 2026-11-04, Calendario y cola de impresión con fechas de entrega
- Archivo y sitio: src/schedule.js (nuevo) y src/schedule.test.js (nuevo), src/Calendar.jsx (nuevo, pestaña Calendario), src/OrderDialog.jsx (nuevo, hoja «Pasar a pedido»), src/sales.js (`withOrder`, y `withStatus` borra las fechas al volver a presupuesto), src/History.jsx (al elegir «Pedido» se abre la hoja; botón con la fecha de entrega bajo el estado), src/App.jsx (vista `calendar`), src/NavIcons.jsx (icono), src/backup.js (`dueAt` y `orderedAt`), src/index.css (`.cal-*`, `.queue-*`), src/i18n/{en,es,fr}.js (`nav.calendar`, `cal.*`, `order.*`), docs/MAPA.md, CLAUDE.md.
- Qué cambió: al pasar un presupuesto a «Pedido» se pide la fecha de entrega, ya rellenada con una propuesta. La pestaña Calendario enseña el mes con puntos: entregas, día en que cada pedido estará impreso (estimado) y ventas. Debajo está la cola de impresión con «Va tarde» o «A tiempo».
- Por qué:
  - Lo pediste: un calendario que automatice los pedidos y diga qué hay que entregar y cuándo se vendió algo. Lo automático es la estimación: tú solo pones la entrega, y la app calcula cuándo estará cada pieza con tus horas de impresión por semana (`printHoursPerWeek` de «Tu configuración») y las horas de cada pedido (tiempo × piezas, con la tasa de fallos).
  - **Orden de la cola: EDF** (primero lo que antes se entrega). Con una sola máquina, EDF minimiza el retraso máximo, y si EDF no llega a tiempo con un pedido, ningún otro orden lo habría hecho. Descarté FIFO (orden de llegada), que deja tarde un pedido urgente que entra el último. Los empates se resuelven por `orderedAt` y luego por id, para que el orden sea estable y no salte entre recargas.
  - **La fecha sugerida** (`suggestDue`) mete el pedido nuevo al final de la cola y propone el día en que estaría listo (sin horas por semana configuradas, dentro de una semana). Es una propuesta: la cambias si el cliente pide otra.
  - Las horas por semana se reparten por igual entre los 7 días. Es una simplificación: no sabe que el finde no imprimes. Va escrito debajo de la cola, para que nadie lo tome por una promesa.
  - Fechas como texto `YYYY-MM-DD` y no como `Date` o timestamp: un día de entrega no tiene hora ni zona horaria, y con un timestamp en UTC un pedido «para el 17» podía salir el 16 en Canarias. Además se ordenan bien como texto.
  - `backup.js` solo acepta `dueAt` y `orderedAt` con forma de fecha; cualquier otra cosa se descarta sin romper la restauración. Los campos son opcionales, así que no hace falta subir `BACKUP_SCHEMA_VERSION`.
  - Volver un pedido a «Presupuesto» borra sus fechas: si no, seguiría saliendo en el calendario.
- Concepto nuevo: la planificación EDF (Earliest Deadline First). Ordenas las tareas por fecha límite y las haces en ese orden. Ejemplo: pedidos para el día 10 (20 h), el 6 (10 h) y el 15 (5 h) se imprimen 6 → 10 → 15, y cada uno termina a las 10, 30 y 35 h.
- De la carrera: Sistemas Operativos, planificación de procesos: EDF es el planificador de tiempo real con plazos (la impresora es la CPU y los pedidos, los procesos). Se ve en `planOrders` de src/schedule.js.
- Cómo probarlo: `npm test` (259 pasan). Guarda dos o tres presupuestos con tiempos distintos. En Historial pasa uno a «Pedido»: sale la hoja con una fecha propuesta, cámbiala a mañana y guarda. Abre Calendario: punto dorado en la entrega, punto hueco el día estimado de impresión y «Va tarde» si no llega. Marca otro como vendido: punto gris ese día. Toca un día para ver la lista.

### 2026-11-04, Presupuesto personalizable: color, diseño y letra
- Archivo y sitio: src/quoteStyle.js (nuevo), src/quoteStyle.test.js (nuevo, 5 tests), src/CustomerQuote.jsx (panel «Aspecto del presupuesto» y variables CSS en la hoja), src/backup.js (`sanitizeBusiness` valida `accent`, `docStyle` y `docFont`), src/backup.test.js, src/index.css (`.look-band`, `.look-minimal`, `.font-serif`, muestras de color y arreglo de impresión), src/i18n/{en,es,fr}.js (`quote.look.*`), docs/MAPA.md, CLAUDE.md.
- Qué cambió: en el presupuesto para el cliente hay un panel «Aspecto del presupuesto». Tiene seis colores y un selector para cualquier otro, tres diseños (Líneas, Banda con la cabecera en color, Mínimo sin rayas) y dos letras (Moderna y Clásica). Se guarda con los datos del negocio, así que todos los presupuestos salen igual hasta que lo cambies.
- Por qué:
  - Lo pediste: que cada taller saque presupuestos con su imagen. Es lo que ve el cliente final.
  - **Tres variables CSS en la hoja** (`--acento`, `--acento-tinta`, `--sobre-acento`) en vez de una hoja de estilos por combinación. Las reglas usan las variables, y cambiar el color es cambiar un valor en línea.
  - **Contraste automático:** con un color claro (un amarillo), el título y el total sobre papel blanco no se leerían. `inkOf` lo oscurece hasta 3:1, el mínimo de WCAG para texto grande, y solo para el texto: el relleno sigue siendo el color elegido. En la banda, `textOn` elige blanco o casi negro según cuál contraste más. Los seis colores fijos cumplen 4,5:1 con su texto (hay test).
  - **Seguridad:** el color acaba dentro de un `style` en línea. `sanitizeBusiness` solo deja pasar `#RRGGBB`, así que una copia de seguridad manipulada no puede meter CSS (por ejemplo, `url()` a un servidor ajeno). Hay test con ese caso.
  - Sin migración: un negocio guardado antes no tiene los campos y `quoteStyleOf` le da el aspecto de siempre (líneas, negro, letra moderna).
  - **Fallo que encontré al probarlo:** el PDF salía con un marco gris u oscuro alrededor de la hoja. Dos causas: la regla de impresión `html,body{background}` perdía contra la del tema claro de index.html (`html[data-theme="light"]`, más específica), y en el tema oscuro `color-scheme: dark` hace que Chromium pinte oscuros los márgenes de la página. Ahora en impresión el fondo es papel con `!important` y el esquema de color es claro. `!important` está justificado: es la única regla que tiene que ganar siempre.
  - La letra clásica usa fuentes del sistema (Iowan Old Style, Palatino, Georgia): sin descargar ninguna fuente nueva.
- Concepto nuevo: luminancia relativa y razón de contraste (WCAG). La luminancia convierte un color en un número de 0 (negro) a 1 (blanco) teniendo en cuenta cómo percibe el ojo cada canal; el contraste es (L1 + 0,05) / (L2 + 0,05). Ejemplo: negro sobre blanco = 21:1.
- De la carrera: Informática Gráfica: espacio sRGB, corrección gamma (la potencia 2,4 de `luminance`) y luminancia perceptual con los pesos 0,2126 / 0,7152 / 0,0722.
- Cómo probarlo: `npm test` (250 pasan). En Historial marca dos piezas y abre «Presupuesto para el cliente». En «Aspecto del presupuesto» cambia el color, el diseño y la letra: la hoja cambia al momento. Prueba «Otro color» con un amarillo claro: el título se oscurece para leerse. «Guardar como PDF» con el tema oscuro puesto: la página sale blanca, sin marco.

### 2026-11-04, Historial en el móvil: lista de dos líneas y estado siempre visible
- Archivo y sitio: src/History.jsx (columna de estado visible en el móvil, celda `total-cell`, fuera el botón «Vendido» solo para móvil), src/index.css (tabla como lista con CSS grid por debajo de 600 px, control segmentado a todo el ancho, pestañas que se deslizan de lado), src/i18n/{en,es,fr}.js (fuera `sales.markSold`).
- Qué cambió: en el móvil cada presupuesto del historial ocupa dos líneas: nombre, datos e importe arriba; estado, «Cargar» y borrar abajo. El estado (Presupuesto, Pedido, Vendido) se puede cambiar también desde el móvil. Los cuatro filtros y las cuatro pestañas de arriba caben en 360 px.
- Por qué:
  - En el móvil la columna de estado estaba oculta: no se podía pasar un presupuesto a «Pedido». Al mostrarla, cinco columnas en 360 px partían el nombre letra a letra. La solución es reordenar la misma fila con CSS grid (`grid-template-areas`) en vez de escribir otra lista para el móvil: el marcado sigue siendo una tabla, así que los lectores de pantalla la leen igual y no hay dos versiones que mantener.
  - El reset de las celdas va como `.history-table tr td` porque la regla base `.history-table td` está más abajo en el archivo y, con la misma especificidad, ganaría la última.
  - Con cuatro pestañas (Calculadora, Historial, Planes, Impresoras) la última se cortaba. Ahora la fila se desliza de lado sin barra visible, como las pestañas de las apps de iOS.
  - En el control segmentado del móvil se ocultan los números: sin ellos, los cuatro filtros caben a lo ancho.
- Concepto nuevo: `grid-template-areas`. Das nombre a zonas de una rejilla y colocas cada hijo con `grid-area`. Ejemplo: `grid-template-areas: "check part total" "check status actions"` y `td.part { grid-area: part }`.
- Cómo probarlo: `npm run dev` con el navegador en 360-390 px (modo móvil de las herramientas de desarrollo). Guarda dos presupuestos, ve al Historial: dos líneas por presupuesto, cambia uno a «Pedido» desde el móvil. Desliza las pestañas de arriba hasta «Impresoras».

### 2026-11-04, Plan Taller a 8,99 € al mes o 89 € al año
- Archivo y sitio: src/Plans.jsx (constantes `SHOP_MONTH` y `SHOP_YEAR` y la función `eur`), src/i18n/{en,es,fr}.js (`plans.shop.year` con hueco `{price}`), CLAUDE.md.
- Qué cambió: el plan Taller pasa de 8 € a 8,99 € al mes, y el anual de 79 € a 89 €.
- Por qué:
  - Lo decidiste tú. El anual sigue siendo «dos meses gratis»: 8,99 × 10 ≈ 89 €, frente a 107,88 € pagando mes a mes. Con 79 € el anual habría salido a menos de 9 meses, y la frase «dos meses gratis» ya no sería verdad.
  - Por cada cliente particular de España quedan unos 6,53 € al mes en vez de 5,76 € (quitando el 21 % de IVA incluido y la comisión de Polar, 5 % + 0,50 $): un 13 % más. Hacen falta unos 14 clientes en vez de 16 para cubrir la cuota de autónomo. Son cuentas aproximadas, con el mismo método que el plan de pago.
  - El precio está en una constante y el texto del anual lleva un hueco `{price}`: el número sale de un solo sitio y no puede quedar distinto en los tres idiomas.
  - Se formatea con `fmtNumber` del idioma: «8,99 €» en español y francés, «8.99 €» en inglés.
- Cómo probarlo: `npm run dev`, pestaña Planes en ES, EN y FR: 8,99 € / 8.99 € al mes y «89 €» al año.

### 2026-11-04, Modo demo del agente: dos impresoras simuladas
- Archivo y sitio: agent/demo.js (nuevo), agent/demo.test.js (nuevo, 5 tests), agent/server.js (comando `demo` con `startDemo`; `startAgent` acepta impresoras, drivers, reloj y una limpieza al salir), docs/IMPRESORAS.md, docs/MAPA.md, CLAUDE.md.
- Qué cambió: `npm run agent -- demo` arranca el agente de verdad con dos impresoras simuladas, una P1S y una Voron, que preparan, imprimen, terminan y a veces fallan. Trae tres semanas de trabajos de ejemplo. Abriendo `layercents.com/?agent` se ve la pestaña Impresoras en vivo, el historial con tasa de fallos y tiempos, y «Usar datos reales» en la calculadora.
- Por qué:
  - Me dijiste que aún no has podido probarlo con la impresora. Sin impresora, nadie podía VER funcionar la parte de impresoras. La demo enchufa conductores simulados al agente real: el mismo servidor HTTP, el mismo registro de trabajos (`jobs.js`) y las mismas reglas de qué cuenta como fallo. Solo las impresoras son inventadas. Sirve para revisar un PR, para capturas y vídeos de Reddit, y para enseñárselo a un cliente.
  - No toca tu configuración: todo vive en una carpeta temporal (`LAYERCENTS_HOME` en `os.tmpdir()`) que se borra al pulsar Ctrl+C. Tus impresoras de `~/.layercents` no se leen ni se escriben.
  - **El reloj del registro va acelerado.** `jobs.js` mide una impresión con el reloj (fin − inicio). Con el reloj real, una impresión «de 2 h» que en la demo dura un minuto quedaría apuntada como 1 minuto y estropearía las estadísticas. `demoClock` corre a la misma velocidad que las impresoras simuladas (2 minutos simulados por segundo real) y empieza cuatro días atrás, para que una demo de hasta unos 45 minutos escriba fechas pasadas. `openJobLog` ya aceptaba un reloj (`now`) por parámetro para los tests: se reutiliza.
  - Las impresiones de la demo tardan un 8 % más de lo que «promete» el laminador y una de cada cuatro falla a mitad: así «Usar datos reales» tiene algo que encontrar. Las dos impresoras arrancan desfasadas para que no vayan al unísono.
  - **Lo que NO prueba:** los protocolos (MQTT con TLS de Bambu, HTTP de Moonraker). Eso lo cubren los tests contra impresoras falsas (`fakeBroker.js`, `fakeMoonraker.js`) y, de verdad, solo tu P1S.
  - Sin dependencias y sin cambiar la API del agente (`PROTOCOL` igual).
- Concepto nuevo: inyección de dependencias para simular. `createPrinters(configurados, { drivers })` ya recibía los drivers como parámetro; la demo pasa unos simulados en vez de los reales, y el resto del agente no nota la diferencia.
- De la carrera: Ingeniería del Software: dobles de prueba (*fakes*) e inyección de dependencias. Simulación por eventos discretos: cada impresora es una máquina de estados que avanza un paso de tiempo simulado por tick, con un reloj virtual desacoplado del real.
- Cómo probarlo: `npm test` (244 pasan). `npm run agent -- demo` en una terminal y `npm run dev` en otra; abre `localhost:5173/es/?agent`. En Impresoras verás las dos en «Preparando» y luego «Imprimiendo», con capa y temperaturas, y el historial con 20 trabajos y una tasa de fallos del 13 %. Espera un par de minutos: aparecen trabajos nuevos terminados o fallidos. En la calculadora sale «Datos reales de tus impresoras». Ctrl+C borra la carpeta temporal.

### 2026-11-04, Pestaña «Planes» y medir quién quiere el plan Taller
- Archivo y sitio: src/Plans.jsx (nuevo), public/taller/index.html (nuevo), public/robots.txt (`Disallow: /taller/`), src/App.jsx (pestaña «Planes» tras Historial y la vista `plans`), src/NavIcons.jsx (icono `plans`, una etiqueta de precio), src/index.css (`.plans`, `.plan*`, `.soon`, `.wrap-foot`), index.html y src/theme.js (colores de antes de pintar al día con los tokens nuevos), src/i18n/{en,es,fr}.js (`nav.plans`, `plans.*`), docs/NUBE.md (cobro con Polar), docs/MAPA.md, CLAUDE.md.
- Qué cambió: hay una pestaña «Planes» con Gratis y Taller (8 €/mes o 79 €/año, «Próximamente»), con lo que lleva cada uno según el plan de pago que aprobaste. El botón «Me interesa» lleva a una página de «Gracias, apuntado». El proveedor de cobro pasa a ser Polar en docs/NUBE.md.
- Por qué:
  - Querías saber si la gente lo quiere antes de cobrar. La forma más barata y honesta: «Me interesa» es un enlace normal a `/taller/`, y Cloudflare Web Analytics, que ya está en la web, cuenta las visitas de cada página. **Las visitas a /taller/ son la gente que lo pidió.** No hace falta servidor, formulario ni cookie, y no se guarda nada de la persona.
  - Alternativas descartadas: un formulario con correo (necesita servidor o un servicio de terceros, y un aviso de privacidad porque guardas datos personales) y una tabla en Supabase (llegará con el backend; hoy no existe). El contador responde ya a la pregunta de ahora: ¿alguien quiere pagar? Cuando haya cuentas, se puede añadir «avísame por correo».
  - Es un enlace `<a>` y no un botón con JavaScript: la visita ES la medida, y funciona incluso sin JavaScript.
  - `/taller/` es HTML estático en `public/`, que Vite copia tal cual. Lleva el mismo fragmento de Cloudflare que index.html, `noindex` y está fuera de `robots.txt` para que Google no lo cuente ni lo enseñe. El texto sale en el idioma de la app con `?lang=`.
  - Límite: Cloudflare cuenta visitas, no personas distintas. Si alguien pulsa tres veces cuenta tres, y algún robot que no respete `robots.txt` puede sumar. Para decidir «hay interés o no» basta.
  - **Polar y no Lemon Squeezy:** es *merchant of record* como Lemon Squeezy (cobra y declara el IVA de cada país), con la comisión más baja sin cuota (5 % + 0,50 $), y avisa por webhook firmado, que es lo que pide el diseño de docs/NUBE.md (el plan se comprueba en el servidor). Lemon Squeezy lo compró Stripe y su futuro pasa por Stripe Managed Payments. Pendiente: comprobar al darte de alta que Polar acepta a una persona física en España; si no, Paddle.
  - Precios en EUR fijos y no convertidos a la moneda de la pantalla: es lo que cobrará la página de pago. «IVA incluido», como calcula el plan.
  - El icono de los planes es una etiqueta de precio, con el mismo trazo que los demás.
- Concepto nuevo: medir con analítica de páginas en vez de con una base de datos. Una página que solo existe para ser visitada convierte un clic en un número sin guardar datos de nadie. Ejemplo: `<a href="/taller/">Me interesa</a>`, y en el panel de analítica, visitas a `/taller/`.
- Cómo probarlo: `npm run build && npm run preview`. Pestaña «Planes» en escritorio, claro y oscuro, y móvil. Pulsa «Me interesa»: sale «Gracias, apuntado» en español y el botón vuelve a `/es/`. Tras publicar: en Cloudflare → Analytics & Logs → Web Analytics → layercents.com, mira «Top paths» (o filtra por la ruta) para ver las visitas a `/taller/`.

### 2026-11-04, Registro de ventas: presupuesto, pedido, vendido y beneficio real
- Archivo y sitio: src/sales.js (nuevo), src/sales.test.js (nuevo, 9 tests), src/SaleDialog.jsx (nuevo), src/History.jsx (control segmentado por estado, estadísticas de ventas, columnas «Estado» y «Beneficio real», botón «Vendido» en el móvil, `SaleDialog`; fuera las columnas de coste y precio por pieza), src/App.jsx (`updateQuote` junto a `deleteQuote`; `currency`, `rate` y `onUpdate` a History), src/backup.js (`sanitizeQuote` valida `status` y `sale`), src/backup.test.js, src/exportExcel.js (columnas Estado, Cobrado y Beneficio real), src/index.css (`.segmented`, `.status-select`, `.sheet*`), src/i18n/{en,es,fr}.js (`sales.*`, `sale.*`), docs/MAPA.md, CLAUDE.md.
- Qué cambió: cada presupuesto guardado tiene un estado: Presupuesto, Pedido o Vendido. Al marcarlo como vendido se abre una hoja donde pones lo que cobraste de verdad, las comisiones, dónde lo vendiste y la fecha. El historial se filtra por estado; en «Vendidos» enseña lo cobrado, el beneficio real, el margen real y la diferencia con lo presupuestado. Cada venta muestra su beneficio real en la tabla.
- Por qué:
  - Lo pediste, y es lo que separa una calculadora de un programa de gestión. Al buscar qué piden los que venden impresiones, se repite lo mismo: llevar los pedidos fuera de una hoja de cálculo y saber el beneficio real por pedido. La calculadora dice lo que *debería* pasar; esto guarda lo que pasó: el descuento, el precio pactado en Wallapop, la comisión de verdad.
  - **Beneficio real = cobrado − comisiones − coste por pieza × piezas.** El coste es el del presupuesto: el de fabricarla, ya calculado. Ahora se puede ver si una venta concreta dio dinero o no.
  - **Datos sin migración:** dos campos opcionales en el presupuesto (`status` y `sale`). Un presupuesto antiguo no tiene ninguno y es «Presupuesto». No hay clave nueva en localStorage ni `BACKUP_SCHEMA_VERSION` nueva. `sanitizeQuote` los valida porque antes copiaba cualquier campo desconocido tal cual: un archivo de copia manipulado podía meter un `sale` con texto donde va un número y romper las cuentas. Ahora un estado desconocido se borra, una venta mal formada se borra, y «vendido» sin venta válida pasa a «pedido».
  - Volver de «Vendido» a otro estado borra la venta: una venta que no ocurrió no puede contar en los totales (`withStatus`).
  - **El estado es un `<select>` nativo** con aspecto de pastilla: en el móvil abre el selector del sistema y con teclado funciona sin código extra. Elegir «Vendido» no lo aplica: abre la hoja, porque hacen falta los datos de la venta. Cancelar deja todo como estaba.
  - **La hoja es un `<dialog>` con `showModal()`:** el navegador atrapa el foco dentro, la cierra con Esc y deja el fondo inerte para los lectores de pantalla. Hacerlo a mano con un `<div>` es donde los modales suelen romper la accesibilidad.
  - Arranca rellena con lo presupuestado y la comisión con la que se calculó (`defaultSale`): en el caso normal basta con pulsar Guardar.
  - Los importes se escriben en la moneda de la pantalla y se guardan en EUR, como el presupuesto del cliente.
  - Para que quepan Estado y Beneficio real, la tabla pierde «Coste / pieza» y «Precio / pieza». Siguen en el presupuesto cargado, en el Excel y en el informe PDF.
  - «Aceptados» (pedidos + vendidos sobre el total) sustituye a «Clientes» en las cifras: dice si los presupuestos convierten, que importa más que contar clientes.
  - Control segmentado como el de iOS para filtrar, con el número de cada estado.
- Concepto nuevo: `<dialog>` y `showModal()`. Un elemento HTML que el navegador convierte en ventana modal: `ref.current.showModal()` la abre encima de todo con un fondo (`::backdrop`), y el evento `close` avisa al cerrarse, sea con un botón o con Esc.
- De la carrera: Bases de datos: evolución de esquema con campos opcionales y validación de integridad al importar (estado ∈ dominio, invariante «vendido ⇒ hay venta»). Ingeniería del Software: máquina de estados sencilla (presupuesto → pedido → vendido) con la transición que borra datos dependientes.
- Cómo probarlo: `npm test` (239 pasan). `npm run dev`, guarda tres presupuestos y ve al Historial. Cambia uno a «Pedido» (pastilla dorada). Cambia otro a «Vendido»: se abre la hoja; pon otro importe y un canal y guarda. Pulsa «Vendidos»: cobrado, beneficio real, margen real y diferencia con lo presupuestado. Haz clic en el beneficio de la fila para editar la venta. Recarga: sigue ahí. Descarga una copia de seguridad, restáurala y comprueba que las ventas siguen. Exporta a Excel: tres columnas nuevas al final con sus totales.

### 2026-11-03, El desglose del coste pasa a ser una barra apilada con filas
- Archivo y sitio: src/App.jsx (panel «Coste de fabricarla», justo después del precio; comentario de `LAYERS`), src/index.css (`.cost-breakdown`, `.cost-bar`, `.cost-row`; fuera `.cross-section`, `.cost-symbol*`, `.legend`), borrados src/CostSymbol.jsx, src/symbolChart.js y src/symbolChart.test.js, comentarios de src/Logo.jsx y src/logoGeometry.js, docs/MAPA.md, CLAUDE.md.
- Qué cambió: el símbolo ¢ pintado con los costes se sustituye por una barra horizontal apilada y, debajo, una fila por capa con su color, nombre, porcentaje e importe.
- Por qué:
  - Me dejaste decidir. El símbolo era original, pero era lo más caprichoso de la pantalla y había que leer la leyenda para entenderlo: el largo de cada trozo se repartía entre capas curvas y no se podía comparar a ojo. En una barra recta, la longitud ES la proporción, que es el canal que mejor compara el ojo (Cleveland y McGill).
  - Se añade el porcentaje en cada fila: «mano de obra 48 %» se entiende al instante, cosa que el símbolo no daba.
  - Orden fijo (material primero, como en `LAYERS`) en vez de ordenar por tamaño: mientras escribes, las filas no saltan de sitio.
  - La barra son `<span>` con `flex-grow` igual a la fracción de cada capa. El navegador reparte el ancho y suman el 100 % exacto, sin calcular píxeles. Un hueco de 2 px los separa sin bordes. Un trozo de 0 no se pinta y uno minúsculo tiene 3 px mínimos para que se vea.
  - Al cambiar un número los trozos se deslizan (transición de `flex-grow`); con «reducir movimiento» no se animan.
  - Se borran 3 archivos y unos 200 líneas: menos código que mantener. El logo sigue igual (usa `logoGeometry.js`).
- De la carrera: Interacción Persona-Ordenador / visualización de datos: jerarquía de canales perceptivos (posición y longitud se comparan mejor que ángulo, área o curvatura).
- Cómo probarlo: `npm run build && npm run preview`. Cambia el posprocesado o el precio de la bobina: los trozos de la barra se deslizan y los porcentajes cambian. Mira el móvil a 390 px y el tema claro.

### 2026-11-03, Historial y presupuesto con el mismo estilo sobrio
- Archivo y sitio: src/index.css (`.backup-reminder`, `.controls.primary:disabled`, `.history-table .accent`, `.row-btn`, `.backup-body`, `.quote-editor` sin flechas en los números, `.h2-note`, `.quote-title h1`, `.quote-to .label`, `.quote-totals`), src/CustomerQuote.jsx (título «Tu negocio» con la nota aparte), src/i18n/{en,es,fr}.js (`quote.business` partido en `quote.business` y `quote.businessNote`).
- Qué cambió: el aviso de copia de seguridad ya no es un recuadro dorado sino un grupo normal con un punto de oro. «Presupuesto para el cliente» desactivado sale en gris y no en un oro apagado. El precio por pieza de la tabla ya no va en oro, y «Cargar» y «×» son texto sin caja. En el presupuesto: sin flechas en los campos numéricos, título «Tu negocio» con su nota en gris, «Presupuesto» en letra normal en vez de mayúsculas espaciadas, «Presupuesto para» sin mayúsculas y la raya del total continua.
- Por qué:
  - Las mismas reglas que el formulario: el oro solo donde se decide algo, sin cajas alrededor de cosas que no lo necesitan. En el historial había oro en cuatro sitios a la vez (aviso, botón, columna de precio y punto); ahora el ojo va al botón que hay que pulsar.
  - Un botón dorado desactivado se leía como marrón, es decir, roto. En gris se entiende que aún no se puede usar, y se vuelve dorado al marcar piezas.
  - Las mayúsculas espaciadas en «PRESUPUESTO» y «PRESUPUESTO PARA» eran el sello de plantilla de factura. Con letra normal, más grande y algo apretada, el documento se parece al de un estudio de diseño. Es lo que ve el cliente final, así que es la cara de quien usa layercents.
  - La raya del total estaba cortada en dos (una bajo «Total» y otra bajo el importe) por el hueco entre columnas de la rejilla. Ahora el hueco es relleno de la celda y la raya es continua.
  - El separador « · » dentro de un título era otro rasgo de plantilla. La nota va aparte, en gris.
- Cómo probarlo: `npm run build && npm run preview`. Guarda tres presupuestos y ve al historial: aviso con punto, botón gris hasta marcar una pieza, acciones de fila como texto. Marca dos piezas, abre el presupuesto para el cliente y saca el PDF: título «Presupuesto», sin mayúsculas, raya del total continua.

### 2026-11-03, Formulario como lista agrupada (estilo Ajustes de Apple)
- Archivo y sitio: src/index.css (tokens de los dos temas, `.form-col .panel`, `.field`, `.field input`, `.info`, `.help`, `.controls`, `.text-input`, `.dropzone`, `.extra-add`, `.result`, `.hero-price` en claro, barra móvil con material translúcido, barra lateral sin la marquita dorada), src/App.jsx (clase `form-col` en la columna del formulario; fuera la lista de tres pasos bajo el título), src/i18n/{en,es,fr}.js (borradas `calc.step1-3`), CLAUDE.md (regla de estilo).
- Qué cambió: el formulario se ve como una lista de Ajustes de iPhone o Mac. El título de cada bloque va fuera, pequeño y gris. Las filas son de 48 px con separadores finos y el valor a la derecha como texto, sin recuadro (la caja aparece al pasar el ratón y al editar). Los bloques no tienen borde: se distinguen por el relleno sobre un fondo más oscuro. Títulos más grandes y más aire entre bloques. En el tema claro el precio va en tinta en vez de oro.
- Por qué:
  - Lo que hacía que pareciera «hecho con IA» era el «kit de tarjetas»: cada bloque una caja con borde y su título dentro, un recuadro en cada número, la barrita dorada de la barra lateral, la lista numerada de pasos y los círculos de ayuda marcados. Son los rasgos por defecto que salen en cualquier web generada, sin relación con el contenido.
  - La lista agrupada es el patrón que Apple usa para formularios largos de números (Ajustes, Salud). Funciona porque deja leer la columna de etiquetas a la izquierda y la de valores a la derecha sin que el ojo choque con 17 recuadros. Es justo la forma de esta calculadora: muchos campos numéricos, uno por fila.
  - Valores sin caja: la caja sale al pasar el ratón y al editar, con un anillo dorado. Se sigue viendo qué es editable sin llenar la pantalla de bordes.
  - Botones rellenos sin borde y «Añadir otro filamento» como texto en el color de acento, como la fila de añadir de una lista de iOS.
  - La barra fija del móvil usa material translúcido (`backdrop-filter: blur`), como las barras de iOS: el contenido se intuye por debajo.
  - Fuera los tres pasos numerados bajo el título. Repetían lo que ya dice la zona de soltar el archivo, y cada línea de más antes del primer campo retrasa el primer valor.
  - En claro, el oro fino del precio sobre blanco se veía apagado (es un ocre oscuro para cumplir contraste). El precio en tinta lee mejor; el oro sigue en el botón principal y en la marca. En oscuro el precio sigue en oro.
  - Contrastes (WCAG AA, 4,5:1): `--tenue` 6,6:1 sobre los grupos en oscuro y 5,1:1 en claro.
  - Sin dependencias: Inter sigue siendo la letra (la de Apple, SF Pro, no se puede usar en webs que no sean de Apple).
- Concepto nuevo: `backdrop-filter`. Aplica un filtro a lo que hay DETRÁS de un elemento, no al elemento: `background: rgba(28,28,31,.78); backdrop-filter: blur(20px)` da la barra de cristal esmerilado de iOS.
- De la carrera: Interacción Persona-Ordenador: ley de proximidad de la Gestalt (agrupar por relleno y espacio en vez de bordes), alineación a dos columnas para leer de un vistazo, y evitar la carga visual de elementos que no aportan información.
- Cómo probarlo: `npm run build && npm run preview`. Mira la calculadora en claro y en oscuro: títulos fuera de los grupos, filas con el valor a la derecha. Pasa el ratón por un valor (aparece la caja) y haz clic (anillo dorado). En el móvil, la barra de abajo deja ver el contenido desenfocado al desplazarte.

### 2026-11-03, «Conviene saber»: consejos con cifras bajo el resultado
- Archivo y sitio: src/advice.js (nuevo), src/advice.test.js (nuevo, 10 tests), src/App.jsx (`const tips = adviceFor(d)` junto a `calculate`, y el panel antes de «Guardar este presupuesto»), src/index.css (`.advice`), src/i18n/{en,es,fr}.js (claves `advice.*`), docs/MAPA.md.
- Qué cambió: debajo del veredicto salen hasta tres consejos con números de la pieza. Por ejemplo: «La comisión del 15 % se lleva 1,29 EUR por pieza. Vendiendo directo, el mismo beneficio le costaría al cliente 7,30 EUR», o «Tu precio está un 7 % por debajo del recomendado: tu margen real es del 30 %, no del 40 % que pusiste».
- Por qué:
  - Pediste algo que «ayude y recomiende». Esto es el primer paso sin IA: reglas que miran lo que escribiste y calculan una cifra concreta. Un modelo de lenguaje necesitaría servidor (la clave de la API no puede ir en una web pública), costaría dinero por consulta y podría inventarse números. Las reglas son gratis, inmediatas y se prueban una a una; cuando haya backend, una IA puede partir de ellas.
  - Cada consejo lleva una cifra calculada, no una frase genérica. «Vendiendo directo costaría X» sale de volver a llamar a `calculate` con la comisión a 0, la misma fórmula del precio, así que no puede contradecirla.
  - Como mucho tres, ordenados por importancia: con una pared de avisos la gente deja de leerlos. Si no hay nada que decir, el panel no sale.
  - El de «precio por debajo» no sale cuando ya pierdes dinero: eso ya lo dice la frase en rojo y repetirlo es ruido.
  - Con los valores por defecto sale uno («tu tiempo es el 48 % del coste»): 10 minutos a 15 €/h son 2,50 de 5,22. Es verdad y es útil, así que el test lo fija en vez de esconderlo.
  - El dinero se pasa en EUR y se convierte y formatea en pantalla (`formatMoney`), como el resto de la app; los porcentajes ya van redondeados.
- Concepto nuevo: sistema basado en reglas. En vez de un modelo que «decide», una lista de condiciones `si X entonces consejo Y`, cada una con su prioridad. Ejemplo: `if (d.failRate === 0) tips.push({ id: 'noFailures', priority: 2 })`.
- De la carrera: Inteligencia Artificial: sistemas expertos (reglas de producción con prioridad para resolver conflictos), el punto de partida clásico antes de un modelo aprendido.
- Cómo probarlo: `npm test` (240 pasan). `npm run dev`: con los valores por defecto sale el consejo de la mano de obra. Pon la comisión a 15 y el precio actual a 8: salen tres. Pon la tasa de fallos a 0: sale el de los fallos. Cambia la moneda: las cifras se convierten.

### 2026-11-03, Vista 3D de la pieza: G-code por capas y STL
- Archivo y sitio: src/toolpath.js (nuevo: `parseToolpath`, `parseStl`), src/toolpath.test.js (nuevo, 16 tests), src/preview.worker.js (nuevo), src/PrintPreview.jsx (nuevo), src/ImportFile.jsx (botón «Ver en 3D», estado `file` y `previewOpen`, `React.lazy`), src/index.css (`.preview*`, `.import-file-row`), src/i18n/{en,es,fr}.js (claves `preview.*`), package.json (dependencia `three`), vite.config.js (`chunkSizeWarningLimit: 600`: el único trozo de más de 500 kB es el visor, que ya va aparte y se carga bajo demanda), docs/MAPA.md, CLAUDE.md.
- Qué cambió: al soltar un G-code o un `.gcode.3mf` aparece «Ver en 3D», que enseña el recorrido que hará la impresora, capa a capa, con un deslizador como el de un laminador y la capa actual en oro. Un STL se puede ver como sólido aunque no dé tiempo ni gramos.
- Por qué:
  - Lo pediste: ver lo que se va a imprimir, y dejar de ser «solo una calculadora». Se dibuja el G-code y no el modelo porque es lo que se imprime de verdad (soportes, borde y línea de purga incluidos) y porque es lo que exportan todos los laminadores.
  - **Dependencia nueva, `three` (three.js):** dibujar en 3D con WebGL a mano serían cientos de líneas de shaders, matrices y cámara orbital. three.js es la librería estándar para esto (sin dependencias propias, licencia MIT). Pesa ~139 kB comprimidos, así que se carga con `React.lazy` + `import()` solo al pulsar el botón: Vite la separa en su propio archivo (`PrintPreview-*.js`) y quien no abre la vista no la descarga. Alternativas descartadas: `<model-viewer>` (solo glTF, no dibuja líneas de G-code) y Babylon.js (más pesado).
  - **Web Worker:** leer un G-code de 30 MB tarda ~1,2 s (medido: 900 000 tramos). En el hilo de la página congelaría el scroll y los campos durante ese tiempo. El worker recibe el `File` (puede leerlo él mismo) y devuelve `Float32Array` como *transferables*: la memoria se mueve, no se copia. Vite empaqueta el worker con `new Worker(new URL(..., import.meta.url))` sin configuración.
  - **El parser:** recorre el texto línea a línea con `indexOf` en vez de `split('\n')` (un array de un millón de strings pesa mucho) y escribe en un `Float32Array` que dobla su tamaño cuando se llena, como un vector dinámico. Los arcos G2/G3 (PrusaSlicer y Bambu los usan) se parten en trozos de 11°; con una cuerda recta una pieza redonda saldría como un polígono. Un arco que acaba donde empieza es una vuelta entera.
  - **E relativa o absoluta:** solo M82/M83 cambian el modo de la E, no G90/G91. En Marlin el G90 también pone la E en absoluta, pero en Klipper y RepRapFirmware no. Muchos G-codes de inicio dicen «M83» y luego «G90»: leerlo como Marlin no dibujaría nada. El error contrario solo pinta las retracciones como líneas diminutas. Me pasó con el primer archivo de prueba y hay un test.
  - **Capas sin copiar datos:** los tramos quedan ordenados por capa y `layerEnds[n]` dice cuántos hay al acabar la capa n. Mover el deslizador es cambiar el `drawRange` de la geometría (cuántos vértices se dibujan), sin tocar la memoria. La capa actual es la misma memoria dibujada otra vez en oro.
  - Se dibuja solo cuando algo cambia (arrastrar, deslizador, tamaño), no 60 veces por segundo: una vista quieta no debe gastar batería.
  - Los colores salen de las variables CSS, así que la vista sigue el tema claro u oscuro.
  - Límite de 1,5 millones de tramos (36 MB de coordenadas). Por encima se para y lo dice.
  - El `.bgcode` no se puede ver: está comprimido por bloques (heatshrink y MeatPack) y descomprimirlo pediría otra librería. Da las cifras, pero no la vista.
  - Sin clave nueva en localStorage: el archivo no se guarda en ningún sitio.
- Concepto nuevo: `drawRange`. Una geometría de three.js tiene todos los puntos en la GPU; `geometry.setDrawRange(inicio, cuántos)` dice cuántos se dibujan sin borrar nada. Ejemplo: `geo.setDrawRange(0, 2 * tramosHastaLaCapa10)`.
- De la carrera: Sistemas Operativos: concurrencia con un hilo aparte (Web Worker) y paso de mensajes con transferencia de propiedad de memoria en vez de copia. Estructuras de Datos: vector dinámico que dobla su capacidad (coste amortizado O(1) por inserción) en `parseToolpath`. Informática Gráfica: geometría por vértices, cámara en perspectiva, iluminación hemisférica y direccional, y el cambio de eje vertical (las impresoras usan Z hacia arriba y three.js Y).
- Cómo probarlo: `npm test` (230 pasan). `npm run dev`, suelta un `.gcode.3mf` de tu P1S y pulsa «Ver en 3D»: gira con el ratón, acerca con la rueda y mueve el deslizador de capas. Si tiene varias bandejas, cambia de bandeja y la vista cambia. Suelta un STL: sale el aviso de que no está laminado, pero el botón deja verlo. Con un `.gcode` de PrusaSlicer comprueba que las piezas redondas salen redondas (arcos).

### 2026-11-03, Rediseño sobrio: grafito, superficies planas y el oro solo en el precio
- Archivo y sitio: src/index.css (tokens de `:root` y `:root[data-theme="light"]`, barra lateral, `h1`, `.steps`, `.panel`, campos, `.hero`, `.controls`, `.text-input`, tabla del historial, `.gain`), src/App.jsx (colores de `LAYERS`), index.html y src/theme.js (colores antes de pintar y de la barra del navegador), CLAUDE.md (regla de estilo).
- Qué cambió: la interfaz pasa de «panel con brillo y oro por todas partes» a un estilo de herramienta de trabajo. Fondo grafito, bloques planos sin franja gris en el título, campos un escalón más hundidos que el bloque, botones que se aclaran en vez de volverse dorados, cifras del precio grandes y de trazo fino, y la gráfica en tonos apagados.
- Por qué:
  - Lo pediste: software elegante, no «modo neón». Lo que lo hacía parecer neón eran tres cosas: el oro repetido en bordes, pestañas, ganancias y botones; los colores saturados de la gráfica (turquesa, azul, violeta); y los degradados y filos de luz de los paneles. Ahora el oro solo aparece donde se decide dinero (el precio y «Guardar presupuesto») y en la marquita de dónde estás. Un color que sale en todas partes deja de significar algo.
  - Gráfica: mismos tonos, menos saturación y luminosidad parecida, así se siguen distinguiendo las seis capas sin que la gráfica sea lo más ruidoso de la pantalla. La leyenda da las cifras exactas, así que no depende solo del color.
  - Una sola familia (Inter) para títulos y texto. La Bricolage, más caprichosa, se queda en el nombre de la marca. Alternativa descartada: añadir una tercera fuente. Sería una dependencia más y un peso más para una mejora que da la jerarquía de tamaños y pesos.
  - El precio usa Inter con peso 300 y 5 rem: cifras finas y grandes, como la escala de un instrumento de medida. Es el único momento llamativo de la página; todo lo demás va en voz baja.
  - Las ganancias ya no salen en oro sino en el color del texto (perder sigue en rojo): el oro es del precio.
  - Fondo `#1A1A1C` y no casi negro: un gris carbón con un punto cálido. Tema claro gris neutro, no crema. Radios con jerarquía: 10 px los bloques y 7 px los campos y botones.
  - Fallo que arreglé de paso: `--borde-fuerte:var(--borde-fuerte)` en el tema oscuro se refería a sí mismo, una referencia circular que CSS invalida, así que los campos no cambiaban de borde al pasar el ratón.
  - Las cabeceras de la tabla del historial dejan de ir en mayúsculas con espaciado: era decoración, no información.
  - Contrastes medidos (WCAG AA, 4,5:1 para texto): `--tenue` 6,1:1 sobre los bloques en oscuro y 6,0:1 en claro.
  - El informe y el presupuesto para el cliente (la hoja blanca) no cambian.
- Concepto nuevo: tokens de diseño. Todos los colores, radios y sombras son variables CSS (`--panel`, `--radio-campo`…) definidas una vez en `:root`. El tema claro solo redefine sus valores, y ningún componente sabe en qué tema está. Ejemplo: `.panel{background:var(--panel)}` + `:root[data-theme="light"]{--panel:#FFF}`.
- De la carrera: Interacción Persona-Ordenador: jerarquía visual, contraste mínimo de WCAG y el principio de que la señal (el color de acento) pierde valor si se usa como decoración.
- Cómo probarlo: `npm run build && npm run preview`. Mira la calculadora en oscuro y en claro (botón del sol), el historial y el móvil (390 px). Pasa el ratón por un campo: el borde se aclara (antes no hacía nada). El PDF del presupuesto y el informe deben verse igual que antes.

### 2026-11-02, «Use real data»: tasa de fallos y tiempo reales en la calculadora (paso 9)
- Archivo y sitio: src/RealData.jsx (nuevo), src/jobStats.js (función `realDataSuggestions`, al final), src/App.jsx (`<RealData>` justo encima del panel «Your setup»), src/index.css (`.real-data`, `.real-row`), src/i18n/{en,es,fr}.js (claves `real.*`), src/jobStats.test.js, docs/MAPA.md, CLAUDE.md.
- Qué cambió: si la persona tiene el agente activado y su registro de trabajos tiene suficientes impresiones, la calculadora enseña «El 20 % de tus impresiones falló en los últimos 30 días» con un botón para usar ese porcentaje como tasa de fallos, y «Tus impresiones tardan un 10 % más de lo que dice el laminador» con un botón que ajusta el tiempo de esta pieza.
- Por qué:
  - Es lo que ningún otro calculador puede dar: los datos salen de las impresoras de la persona, no de un valor por defecto. La tasa de fallos del 8 % que trae la app es una suposición; esta es medida.
  - No se aplica nada solo. Con 12 impresiones de un material no se puede asegurar nada de la siguiente, y cambiar un precio sin avisar es peor que no ofrecerlo. El botón se desactiva cuando el valor ya está aplicado.
  - La tasa de fallos es un campo de «Your setup», así que el botón pasa por `set('failRate')` y se recuerda en el dispositivo. El tiempo es de esta pieza: se escribe con `setD` directo, que no toca lo guardado.
  - Una sola lectura de `GET /jobs` al abrir la calculadora, sin sondeo: es un resumen de 30 días, no cambia por minutos. Solo si `agentOn`: quien no activó el agente no hace ninguna petición a 127.0.0.1 (regla de agent.js). Si el agente está apagado, no responde o hay pocos datos, el panel no sale: una caja que diga «sin datos» en cada visita es ruido.
  - Reutiliza `summarize`: las reglas de qué cuenta (cancelados no son fallos, mínimo `MIN_PRINTS`, mediana para el tiempo) ya estaban pensadas para no engañar. `realDataSuggestions` solo añade dos decisiones: el redondeo a un decimal y que una desviación de menos del 2 % no se ofrece (es ruido).
  - El botón del tiempo guarda el valor que escribió (`appliedHours`) y se gasta mientras el formulario lo contenga; sin eso, pulsarlo dos veces aplicaría la corrección dos veces (3,5 → 3,85 → 4,24).
  - Un 0 % de fallos es un resultado real y se ofrece, no «sin datos» (hay un test).
  - Sin clave nueva en localStorage ni dependencias nuevas.
- Concepto nuevo: limpiar un efecto asíncrono con una bandera. `let alive = true; fetch().then(r => alive && setState(r)); return () => { alive = false }`: si el componente se desmonta antes de que llegue la respuesta, no se escribe en un estado que ya no existe.
- De la carrera: Estadística: la mediana frente a la media como estimador robusto (ya estaba en `median`), y una tasa estimada con pocas muestras (por eso el mínimo de impresiones). Sistemas distribuidos / Redes: cliente que sobrevive a que el servidor no esté, con tiempo máximo de espera (`AbortSignal.timeout` en `fetchJobs`).
- Cómo probarlo: `npm test` (214 pasan). Con la P1S: `npm run agent`, entra con `layercents.com/?agent` y, cuando el registro de trabajos tenga 5 impresiones terminadas o falladas, vuelve a la calculadora: el panel sale encima de «Your setup». Sin tu agente puedes verlo simulando `GET /jobs` en el navegador (yo lo probé así en el navegador, con 12 terminadas y 3 falladas: sale el 20 % y un 10 % más de tiempo). Pulsa «Use 20 %» y comprueba que en «Your setup» queda 20 y que sigue al recargar.

### 2026-11-02, Una URL por idioma (/, /es/, /fr/) con hreflang y sitemap
- Archivo y sitio: scripts/prerender.js (nuevo) y scripts/prerender.test.js (nuevo); package.json (`build` = `vite build && node scripts/prerender.js`); src/i18n/index.js (`pathForLang`, `langFromPath`, y `readLang` lee primero la ruta); src/i18n/Provider.jsx (`setLang` actualiza la dirección y un efecto pone `<title>` y descripción); src/i18n/{en,es,fr}.js (claves `seo.*`); index.html (comentario); public/sitemap.xml (borrado, ahora se genera); docs/MAPA.md, CLAUDE.md.
- Qué cambió: la web tiene tres direcciones reales. `/` en inglés, `/es/` en español y `/fr/` en francés, cada una con su título, descripción, `canonical`, etiquetas para compartir, datos estructurados y el texto que ve un buscador dentro de `#root`. Cada página enlaza a las otras con `hreflang`, y el sitemap lista las tres. Al cambiar de idioma en el selector, la dirección cambia a `/es/`.
- Por qué:
  - Una SPA entrega a Google el HTML de index.html y solo después, quizá, ejecuta el JavaScript. Con una sola URL, Google solo ve inglés. Con una URL por idioma y HTML ya escrito, puede indexar cada idioma por separado. Alternativa descartada: `?lang=es`. Google trata las URL con parámetros como la misma página y elige una; los prefijos de ruta son la forma recomendada para sitios multilingües.
  - Prerenderizado propio de ~100 líneas, no una librería de SSR/SSG. Alternativas descartadas: migrar a un framework con SSG (Next, Astro), que cambiaría el proyecto entero para tres páginas casi idénticas, y un plugin de prerender con navegador sin cabeza (dependencia pesada, y lenta). Lo que cambia entre idiomas es solo el `<head>` y un párrafo, así que basta con sustituir texto en el HTML que ya genera Vite. Sin dependencias nuevas.
  - Cada sustitución debe coincidir exactamente una vez, si no la compilación falla. Sin esa regla, editar index.html podría dejar una página en español con el título en inglés y nadie se enteraría. Un test lo comprueba, y otro garantiza que ejecutar el script dos veces no duplica los `hreflang`.
  - `hreflang`: cada página se lista a sí misma y a las otras (Google lo exige para que sea recíproco) y `x-default` apunta al inglés, que es la página para quien no habla ninguno de los tres idiomas.
  - La ruta gana al idioma guardado: quien llega a `/es/` desde Google o un enlace pidió español, aunque la última vez eligiera inglés. Cambiar el selector sí lo guarda. Se usa `replaceState` y no `pushState`, para que Atrás no pase por cada cambio de idioma. Conserva `?query` y `#hash`; `consumeAgentOptIn` ya conservaba el `pathname`.
  - Los textos van en los diccionarios (`seo.*`), no en el script: así hay una sola fuente y `npm test` exige los tres idiomas. El script importa los `.js` de i18n directamente (son módulos ES sin React).
  - El sitemap se genera en cada build, con `lastmod` = fecha del último commit que tocó `src` o `index.html`; sin git, sin fecha (una fecha inventada es peor que ninguna).
  - Límite conocido: el HTML estático de `/es/` solo tiene el título y el párrafo de introducción en español; el resto de la app se pinta con JavaScript. Es el mismo nivel de prerenderizado que ya había para el inglés.
- Concepto nuevo: `hreflang` y URL canónica. `canonical` dice «esta es la dirección oficial de esta página»; `hreflang` dice «esta misma página existe en otro idioma en esta otra dirección». Ejemplo: `<link rel="alternate" hreflang="es" href="https://layercents.com/es/">`.
- De la carrera: Compiladores / Procesadores de lenguajes: transformación de un texto con patrones (expresiones regulares) y comprobación de que cada patrón reconoce exactamente una vez, como un análisis léxico estricto en `replaceOnce`. Ingeniería del Software: pruebas que protegen una plantilla.
- Cómo probarlo: `npm run build` y `npm run preview`. Abre `http://localhost:4173/es/`: sale en español aunque tu navegador esté en inglés, y la pestaña se llama «Calculadora de costes de impresión 3D…». Cambia el selector a FR: la dirección pasa a `/fr/`. Ver el código fuente de `/es/` (Ctrl+U) debe mostrar `lang="es"`, el `<h1>` en español y los cuatro `hreflang`. `dist/sitemap.xml` lista las tres direcciones. Tras publicar: en Search Console, vuelve a enviar `https://layercents.com/sitemap.xml`.

### 2026-11-02, Piezas por semana y días que tarda el pedido
- Archivo y sitio: src/calculate.js (función nueva `capacity`, al final), src/App.jsx (campo `printHoursPerWeek` en la sección `sec-printer` de `SECTIONS`; `const cap = capacity(d)` junto a `calculate`; dos frases dentro del panel `.hero`), src/i18n/{en,es,fr}.js (`field.printHoursPerWeek.*`, `hero.perWeek`, `hero.orderDays`), src/calculate.test.js, docs/MAPA.md, CLAUDE.md.
- Qué cambió: bajo el precio recomendado sale «Con 60 h de impresión a la semana sacas unas 15,8 piezas buenas» y, si el pedido es de más de una pieza, «Este pedido de 20 tarda unos 8,9 días». Las horas por semana son un campo nuevo de «Your setup» (por defecto 60).
- Por qué:
  - Se pidió en Reddit y es la pregunta que se hace quien vende: «¿cuántas puedo sacar?». No cambia ningún precio, por eso es una función aparte (`capacity`) y no parte de `calculate`.
  - Los fallos cuentan: una impresión fallida gasta tiempo de impresora y no da pieza, así que solo `(1 − failRate)` de las impresiones son piezas buenas. Para los días del pedido hacen falta `units / (1 − failRate)` impresiones. El tope de 0,95 es el mismo que usa `calculate` con la comisión: un 100 % no divide entre cero.
  - Horas por SEMANA y no por día: así la persona que solo imprime de lunes a viernes pone sus horas reales sin un segundo campo de «días». Contrapartida: los días del pedido se calculan sobre 7 días (`semana / 7`), no sobre días laborables; el texto dice «días» a secas y no promete una fecha de entrega.
  - Va en «Your setup» y no en «This print» porque es un dato de la persona, no de la pieza. Eso lo hace persistir sin tocar `backup.js`: `sanitizeSetup` es genérico y los campos válidos salen de `SECTIONS`. Un setup guardado antes no tiene la clave y usa el valor por defecto.
  - Alternativa descartada: pedir las horas por día y los días por semana. Dos campos para una cifra que casi nadie sabe con precisión.
  - Sin clave nueva en localStorage, sin `schemaVersion` nueva. Los presupuestos guardados llevan el campo nuevo dentro de `inputs`; los viejos no lo tienen y al cargarlos se rellena con el valor por defecto.
- Concepto nuevo: devolver `null` para «no se puede calcular» y que la interfaz decida qué hacer. Ejemplo mínimo: `const cap = capacity(d); {cap && <p>{cap.goodPerWeek}</p>}`; si no hay horas, no se pinta nada en vez de «Infinity».
- De la carrera: Estadística / Investigación operativa: valor esperado y teoría de colas simple (con probabilidad de éxito `p`, el número esperado de intentos por éxito es `1 / p`, la misma idea que la distribución geométrica). Está en `orderDays` y `goodPerWeek`.
- Cómo probarlo: `npm test` (199 pasan). `npm run dev`: debajo del precio aparece la frase de piezas por semana. Pon «Quantity» en 20: aparece también la de los días. Cambia las horas de la pieza o la tasa de fallos y las cifras se mueven; pon las horas de la pieza a 0 y la línea desaparece. En «Your setup» → Printer cambia «Printing hours per week», recarga y debe seguir ahí.

### 2026-11-02, Varios filamentos por pieza, cada uno con su precio
- Archivo y sitio: src/calculate.js (nuevo: `calculate` sale de App.jsx, más `materialCost`, `pricePerGram`, `totalGrams`, `normalizeExtras`), src/App.jsx (`INITIAL.extraFilaments`, componente `ExtraFilaments`, `addFilament`, `importedExtras` dentro de `applyImport`, `loadQuote`, `Field` con ayuda opcional), src/slicerFile.js (`mergeFilaments` sale de ImportFile.jsx; `formValuesFromPlates` devuelve `extraFilaments`), src/backup.js (`sanitizeQuote`), src/exportExcel.js (columna de peso), src/ImportFile.jsx, src/i18n/{en,es,fr}.js (claves `filament.*` y el texto de `import.note.manyFilaments`), src/index.css (`.extra-filament`), docs/MAPA.md, CLAUDE.md. Tests nuevos: calculate.test.js, slicerFile.test.js y casos en backup.test.js.
- Qué cambió: en «Material» se pueden añadir hasta 7 filamentos más, cada uno con precio de bobina, peso de bobina, gramos usados y un nombre opcional. El coste del material suma cada filamento a su propio precio por gramo. Al soltar un G-code o 3MF con varios filamentos, el primero se queda en «Part weight» y los demás aparecen como extras con sus gramos (precio de bobina = el del primero hasta que lo cambies).
- Por qué:
  - El primer filamento conserva sus campos de siempre (`spoolPrice`, `spoolWeight`, `partGrams`, `purgeGrams`) y los demás van en una lista opcional `extraFilaments`. Alternativa descartada: convertir todo en un array `filaments[]`. Obligaba a migrar los presupuestos guardados en el navegador y las copias de seguridad ya descargadas y a subir `BACKUP_SCHEMA_VERSION`. Así un presupuesto antiguo es «una pieza sin filamentos extra» y da el mismo precio al céntimo (un test lo comprueba), sin migración. Un archivo nuevo abierto en una versión vieja ignora la lista y calcula con un solo filamento.
  - Fallo que habría sido silencioso: `sanitizeQuote` pasaba `inputs` por `numericRecord`, que solo deja números, y habría borrado `extraFilaments` en cada restauración. Ahora esa lista se limpia con su propia función (`normalizeExtras`: forma fija, sin negativos ni NaN, máximo 7, ids renumerados). Un test de ida y vuelta lo cubre.
  - Los gramos no se cuentan dos veces: lo que le queda al primer filamento es `total − purga − otros`, así `partGrams + purgeGrams + extras` suma el total del archivo (con el G-code de PrusaSlicer, 30,5 + 4 de purga + 12,25 = 46,75). La purga se paga al precio del primero: es una mezcla y nadie sabe su precio real.
  - Una bobina sin peso cuesta 0 por gramo (`pricePerGram`), no `Infinity` ni `NaN`: un formulario a medio escribir nunca debe poner «NaN EUR».
  - `calculate` sale de App.jsx a calculate.js: `node --test` no puede cargar un `.jsx`, y la fórmula del precio era justo lo único sin tests.
  - Al cambiar de bandeja o de nº de piezas del mismo archivo se conservan los precios que ya escribiste (por posición); un archivo nuevo vuelve a empezar desde el precio del primero.
  - No hay clave nueva en localStorage ni `schemaVersion` nueva.
- Concepto nuevo: campo opcional con valor por defecto implícito (retrocompatibilidad). Una función que trata «falta» igual que «vacío» acepta datos viejos sin migrarlos. Ejemplo mínimo: `const extras = Array.isArray(inputs.extraFilaments) ? inputs.extraFilaments : []`.
- De la carrera: Bases de datos: evolución de esquema (esquema opcional frente a migración, compatibilidad hacia atrás y hacia delante). Ingeniería del Software: refactorizar para poder probar (extraer `calculate` a un módulo puro) y pruebas de regresión («con cero extras, el resultado es idéntico»).
- Cómo probarlo: `npm test` (194 pasan). `npm run dev`, en Material pulsa «Add another filament», pon precio, peso de bobina y gramos: el coste y el precio recomendado suben. Guarda el presupuesto, recarga, ve a History y «Load»: los extras vuelven. Suelta un G-code con dos filamentos (en PrusaSlicer salen líneas `; filament used [g] = 30.5, 12.25`): aparece el extra con sus gramos y el aviso de poner su precio. Descarga una copia, restáurala y comprueba que siguen.

### 2026-11-01, Agente: sonda de FTPS para saber si hay gramos reales (paso 5, parte 1)
- Archivo y sitio: agent/ftps.js (nuevo), agent/ftps.test.js (nuevo), agent/setup.js (comando `probe-ftps` en `runCommand`), docs/IMPRESORAS.md (pasos 12 a 14 de la checklist de la P1S), docs/MAPA.md.
- Qué cambió: `npm run agent -- probe-ftps <id>` intenta iniciar sesión por FTPS (puerto 990) en una Bambu ya añadida y dice si funciona. No descarga ni escribe nada. `PROTOCOL` no cambia: la web no se entera.
- Por qué:
  - Los gramos reales solo están en el `.gcode.3mf` que recibió la impresora, y ese archivo se baja por FTPS. Hay indicios de que los firmwares nuevos cierran ese puerto en modo normal (docs/IMPRESORAS.md, «Los gramos reales»). Construir la descarga entera (listar, bajar, leer el 3MF, casarlo con el trabajo) sin saber si el puerto abre sería escribir cientos de líneas a ciegas. La sonda cuesta ~100 líneas y responde sí o no con la impresora real.
  - Se reutiliza `openPinnedTls` (la misma huella de certificado que MQTT): la huella se comprueba ANTES de mandar el usuario y el código, así un aparato que se hace pasar por la impresora no recibe nada. Un test lo comprueba: el servidor falso no recibe ni una línea.
  - FTPS «implícito» (TLS desde el primer byte, puerto 990), no «explícito» (`AUTH TLS` sobre el puerto 21): es lo que usa Bambu. Con `tls.connect` basta; no hace falta ninguna librería de FTP.
  - Sin dependencias nuevas: el protocolo FTP es de líneas de texto (`USER`, `PASS`, `QUIT`), y las respuestas pueden ocupar varias líneas (`220-` … `220 `, RFC 959). Un test cubre el saludo multilínea.
  - Se despide con `socket.end('QUIT')` y espera al cierre en vez de `destroy()`: `destroy()` justo después de `write()` puede tirar el QUIT sin enviarlo (lo encontró un test).
  - Si FTPS usara otro certificado que MQTT, la sonda se para y lo dice en vez de fiarse a ciegas; con el dato real se decide.
- Concepto nuevo: FTP «implícito» frente a «explícito». Ejemplo mínimo: `tls.connect({ host, port: 990 })` ya habla TLS; el servidor contesta `220 ...` y desde ahí es FTP normal, línea a línea, con `\r\n` al final.
- De la carrera: Redes / Sistemas de comunicaciones: FTP (RFC 959) separa canal de control y de datos, y sus códigos de respuesta (`220`, `331`, `230`, `530`) son una máquina de estados; aquí solo se usa el canal de control. Seguridad: fijar el certificado (certificate pinning) para no confiar en una cadena que no existe.
- Cómo probarlo: `npm test` (7 tests nuevos con un servidor FTPS falso y un certificado de openssl). Con la P1S: `npm run agent -- list` para ver el id y `npm run agent -- probe-ftps <id>`.

### 2026-11-01, Se enciende el selector de idioma (EN / ES / FR)
- Archivo y sitio: src/i18n/index.js (`READY = true`), src/i18n/i18n.test.js (el test «selector oculto» pasa a comprobar que está encendido y la detección del navegador), CLAUDE.md y docs/MAPA.md.
- Qué cambió: el selector EN/ES/FR de la barra es visible para todo el mundo. Sin elección guardada, la web usa el idioma del navegador (`navigator.languages`) y cae a inglés si no es es/fr. `?lang=` sigue mandando sobre todo.
- Por qué:
  - Va en un PR aparte, de una línea, para poder revertirlo sin tocar las traducciones si algo falla en producción. Los pasos 1 a 4 ya estaban mergeados, pero con el interruptor apagado.
  - Es una elección en tiempo de ejecución en el cliente. Google sigue viendo el HTML estático en inglés (título, descripción, texto de `#root`), así que esto NO mejora el SEO de español y francés: eso es la siguiente tarea, una URL por idioma con HTML prerrenderizado y `hreflang`.
  - Se elige el idioma del navegador y no el de la IP: la IP dice dónde estás, no qué idioma lees (un francés en España, un turista…).
- Concepto nuevo: feature flag (interruptor de funcionalidad). Una constante que enciende o apaga una función ya construida, para integrar el código pronto y activarlo cuando esté lista. Ejemplo mínimo: `if (FLAGS.newCheckout) renderNew() else renderOld()`.
- De la carrera: Ingeniería del Software: integración continua y despliegue por etapas (feature flags, rollback con un solo cambio). Redes: negociación de contenido, la cabecera HTTP `Accept-Language` que el navegador envía y de donde sale `navigator.languages`.
- Cómo probarlo: abre layercents.com con el navegador en español: la web sale en español sin hacer nada y el selector marca ES. Cambia a FR y recarga: se recuerda (clave `lang`). Borra la clave `lang` y pon el navegador en alemán: sale en inglés.

### 2026-11-01, Traducción, paso 4: presupuesto del cliente, informe PDF y Excel
- Archivo y sitio: src/CustomerQuote.jsx y src/Report.jsx (todo el texto, fechas e importes), src/exportExcel.js (`buildColumns(currency, t)` y parámetro `lang`), src/i18n/dicts.js (nuevo: `DICTS`, `translatorFor`), src/DocLangSelect.jsx (nuevo), src/i18n/format.js (`fmtLongDay`, `fmtMonthShort`, `fmtMoney`), src/i18n/{en,es,fr}.js (claves `doc.*`, `quote.*`, `report.*`, `excel.*`), src/App.jsx (Report recibe `rate` en vez de `formatMoney`; el Excel recibe `lang`), src/index.css (`.doc-lang`).
- Qué cambió: el presupuesto para el cliente y el informe tienen su propio selector «Idioma del documento», que empieza en el idioma de la interfaz: quien trabaja en español puede mandar el presupuesto en inglés o francés. El formulario (botones, campos) sigue el idioma de la pantalla; solo la hoja que se imprime usa el del documento. El Excel sale en el idioma de la interfaz.
- Por qué:
  - `translatorFor(lang)` en un módulo sin React: `useI18n()` solo sabe el idioma de la pantalla. Un traductor de idioma fijo sirve a los componentes (`doc.t(...)`) y a `exportExcel.js`, que no es un componente y no puede usar hooks. Alternativa descartada: un segundo `I18nProvider` anidado alrededor de la hoja; funciona, pero obliga a partir cada componente en «formulario» y «hoja» y a cambiar de contexto en medio del JSX.
  - Importes de la hoja con `Intl.NumberFormat` (`fmtMoney`), con dos decimales y sin separador de miles, como `formatMoney` de la app. Los céntimos siguen siendo enteros: el texto («93,00 EUR» o «93.00 EUR») es lo único que cambia, así que las líneas siguen cuadrando con el total.
  - El porcentaje de cada capa usa `Intl.NumberFormat(locale, { style: 'percent' })`: en francés lleva espacio («38 %»), en inglés no.
  - La hoja lleva `lang={doc.lang}`: un lector de pantalla pronuncia bien y el navegador no ofrece «traducir esta página» a quien ya la tiene en su idioma.
  - Los nombres de capa del informe y de las columnas del Excel reutilizan las claves `layer.*` y `history.col.*` de la pantalla: una columna se llama igual en la tabla, el informe y la hoja de cálculo.
  - El Excel no tiene selector propio: es un documento tuyo, no del cliente, y un botón con un menú encima no compensa. Si alguien lo pide, `exportQuotesToExcel` ya acepta cualquier idioma.
  - No se toca el campo `date` que `saveQuote` guarda con `toLocaleDateString()`: nadie lo lee (todo usa `createdAt`) y cambiarlo exigiría tocar la validación de `backup.js`.
- Concepto nuevo: función que devuelve un objeto de funciones (cierre). `translatorFor('es')` devuelve `{ t, tp, locale }` donde `t` «recuerda» el idioma. Ejemplo mínimo: `const sumaCon = n => x => x + n; const mas2 = sumaCon(2); mas2(5) // 7`.
- De la carrera: Programación / Paradigmas: cierres (closures) y funciones de orden superior. Ingeniería del Software: separar lo que se muestra al usuario (interfaz) de lo que se entrega a un tercero (documento), dos «vistas» con requisitos distintos sobre los mismos datos.
- Cómo probarlo: `npm test` y `npm run build`. Abre `/?lang=es`, guarda un par de presupuestos, ve a History, marca piezas y pulsa «Presupuesto para el cliente»: cambia «Idioma del documento» a Français y comprueba que solo cambia la hoja (fecha larga, «Devis», «93,00 EUR»). Haz lo mismo con «Informe PDF». «Exportar a Excel» y abre el archivo: columnas en el idioma de la pantalla.

### 2026-11-01, Traducción, paso 3: pestaña Printers
- Archivo y sitio: src/Printers.jsx (todo el texto y las fechas), src/printerView.js (`STATE_KEYS`, `CONNECTION_KEYS`, `badgeText`; `fmtMinutes` y `detailLine` reciben `t`), src/jobStats.js (`describeEstimateError` recibe `t`), src/i18n/{en,es,fr}.js (claves `printers.*`) y los tests `printerView.test.js`, `jobStats.test.js` e `i18n.test.js`.
- Qué cambió: la pestaña Printers (agente, impresoras en vivo, historial de impresión) se ve en inglés, español y francés, con fechas, horas decimales («8,5») y plurales («1 fallida» / «7 terminadas») según el idioma.
- Por qué:
  - Las funciones puras (`fmtMinutes`, `detailLine`, `describeEstimateError`) reciben el traductor `t` como último parámetro, en vez de importar el contexto de React: así siguen siendo puras y se prueban pasando un `t` real hecho con `translate()`. Alternativa descartada: que devolvieran un objeto `{ clave, variables }` y la pantalla lo tradujera. Es más «puro», pero añade una capa para cuatro funciones pequeñas.
  - Los diccionarios que traducen estados (`STATE_KEYS`, `CONNECTION_KEYS`, `RESULT_KEYS`) guardan la clave, no el texto. Se consultan con `Object.hasOwn`: el agente manda el estado como string, y un valor como `"constructor"` no debe sacar nada del prototipo del objeto; un estado desconocido (de un agente más nuevo) cae en «—» o se enseña tal cual.
  - Un test nuevo en `i18n.test.js` busca todo literal `'printers.…'` del código y comprueba que existe, porque las claves de esas tablas no se escriben como `t('…')` y el escáner anterior no las veía.
  - Los comandos (`npm run agent -- add`) son huecos de `tr()`: en cada idioma la frase los coloca donde le toca.
  - Lo que NO se traduce: `printer.error` y `printer.printMessage`, que llegan escritos por el agente (o por Klipper, con sus palabras). Traducirlos pide códigos de error en el agente y subir `PROTOCOL`; queda para un PR propio.
- Concepto nuevo: inyección de dependencias por parámetro. Una función no importa su traductor, lo recibe. Ejemplo mínimo: `const saludar = (nombre, t) => t('hola', { nombre })`; en un test se le pasa un `t` falso o uno real, y en la app el de `useI18n()`.
- De la carrera: Ingeniería del Software: inyección de dependencias y funciones puras (testeables sin entorno). Programación: el prototipo de JavaScript y por qué `Object.hasOwn` evita que una clave externa elija un método heredado (`constructor`, `toString`).
- Cómo probarlo: `npm test` y `npm run build`. Con la web abierta en `/?agent&lang=fr` (o `es`) y el agente corriendo (`npm run agent`), mira la pestaña Printers: estados, «Couche 120 sur 300», historial, fechas y horas con coma. Sin agente: la pestaña explica en el idioma elegido cómo arrancarlo.

### 2026-10-31, Traducción, paso 2: History, copia de seguridad e importar
- Archivo y sitio: src/History.jsx, src/BackupPanel.jsx y src/ImportFile.jsx (todo el texto pasa a `t()`). src/i18n/index.js (`translatePlural`), src/i18n/format.js (nuevo), src/i18n/Provider.jsx (`tp`), src/i18n/{en,es,fr}.js (claves `count.*`, `history.*`, `backup.*`, `backupError.*`, `import.*`, `importError.*`). src/backup.js (clase `BackupError`) y src/slicerFile.js (clase `ImportError`): llevan ahora un `code`.
- Qué cambió: las pantallas History, copia de seguridad (aviso, panel y restauración) e importar del laminador se ven en inglés, español y francés (con `?lang=es` o `?lang=fr` hasta que se active el selector). Las fechas, los números (coma o punto decimal) y los plurales («1 presupuesto» / «5 presupuestos») siguen las reglas de cada idioma.
- Por qué:
  - Plurales con `Intl.PluralRules`, no con `n === 1 ? 'quote' : 'quotes'`: la regla de «1 = singular» es del inglés. En francés el 0 también es singular («0 devis») y «devis» no cambia; en español se concuerdan verbo y adjetivo («ya estaba aquí» / «ya estaban aquí»). Cada texto con número tiene dos claves, `.one` y `.other` (categorías CLDR); si un idioma tiene más categorías (el español tiene «many» para millones), cae en `.other`. Un test comprueba que todo `.one` tiene su `.other`.
  - Los errores de `backup.js` y `slicerFile.js` llevan un `code` (`notBackup`, `damaged`…) además del `message` en inglés. La pantalla traduce por el código y usa el mensaje solo si no conoce el código. Alternativa descartada: meter `t()` dentro de esos módulos: son lógica pura, sin React, con sus tests, y no deben depender de la interfaz. Los tests existentes siguen comprobando los mensajes en inglés y no han cambiado.
  - Fechas y números en `src/i18n/format.js` con el `locale` como parámetro, en lugar de un `toLocaleDateString('en-GB', …)` suelto por pantalla. Los títulos de mes llevan mayúscula inicial («Octubre de 2026»): en español el mes va en minúscula dentro de una frase, pero en un título no.
  - Las frases con un trozo en negrita («**Merge** conserva todo…») usan `tr()` con huecos, porque el orden de las palabras cambia según el idioma.
  - La clave de agrupar por mes sigue siendo `AAAA-MM`; solo la etiqueta que se ve depende del idioma.
- Concepto nuevo: `Intl.PluralRules`. Dice a qué categoría gramatical pertenece un número en un idioma. Ejemplo mínimo: `new Intl.PluralRules('fr').select(0)` devuelve `"one"` y `new Intl.PluralRules('en').select(0)` devuelve `"other"`.
- De la carrera: Compiladores / Teoría de lenguajes: las categorías de plural son una función de números a un conjunto finito de casos, igual que un autómata que clasifica una entrada. Ingeniería del Software: separar lógica (códigos de error) y presentación (texto traducido) es el principio de separación de responsabilidades.
- Cómo probarlo: `npm test` (nuevos tests de plurales, fechas y números). `npm run dev` y abre `/?lang=fr`: guarda un par de presupuestos, mira History (importes con coma, «Octobre 2026», «1 devis»), la copia de seguridad, y suelta un archivo `.stl` en el panel de importar: el error sale en francés. Repite con `?lang=es`.

### 2026-10-29, Traducción, paso 1: núcleo y calculadora (en / es / fr)
- Archivo y sitio: src/i18n/ (nuevo: index.js, context.js, Provider.jsx, en.js, es.js, fr.js, i18n.test.js). src/main.jsx, `<I18nProvider>` alrededor de `<App />`. src/App.jsx: `CALC_NAV`, `SECTIONS`, `LAYERS`, `Field`, `SiteFooter`, `moneyParts`/`formatMoney` y todo el JSX de la barra, el historial (solo la cabecera) y la calculadora. src/SubNav.jsx, la etiqueta de la lista.
- Qué cambió: la calculadora entera se puede ver en inglés, español y francés. Hay un selector EN/ES/FR en la barra, junto al tema y la moneda, pero está oculto (`READY=false` en src/i18n/index.js): solo aparece con `?lang=es` o `?lang=fr` en la dirección, para probar. Se enciende cuando todas las pantallas estén traducidas (History, copia de seguridad, importar, Printers, presupuesto, informe y Excel van en los PRs siguientes).
- Por qué:
  - Diccionarios planos `clave -> texto` en JS, sin librería (react-i18next, FormatJS): son tres idiomas y unos cientos de textos; una dependencia añadiría peso y una API para hacer lo que aquí son ~40 líneas (buscar y sustituir `{huecos}`). Si algún día hacen falta plurales complejos o género gramatical, se migra.
  - El inglés es la referencia y el respaldo: si a un idioma le falta una clave se ve el texto en inglés, no la clave en crudo. `translate` usa `Object.hasOwn`, no `dict[key]`, para que una clave como `constructor` no devuelva una función heredada de `Object.prototype`.
  - Los huecos (`{amount}`) los rellena el idioma, no el código: en francés el orden de la frase cambia. Para huecos que son elementos (el `<strong>` del importe) está `tr()`, que parte el texto en piezas (`splitSlots`) y coloca el elemento donde el idioma lo pone. Descartado montar el JSX a mano alrededor de `t()`: fija el orden inglés.
  - `SECTIONS`, `LAYERS` y `CALC_NAV` guardan claves y no textos: son constantes de módulo y deben valer para cualquier idioma. Los ids de sección eran derivados del título en inglés (`section.title.toLowerCase()…`); ahora son explícitos, porque un título traducido rompería los enlaces del `SubNav`.
  - El separador decimal sale de `Intl.NumberFormat(locale).formatToParts` y no está escrito a mano. Solo cambia el separador (7,94 / 7.94); los importes guardados siguen siendo números, así que los presupuestos no dependen del idioma. Sin separador de miles, como antes.
  - `<html lang>` se actualiza al cambiar: lo usan los lectores de pantalla (pronunciación) y el traductor automático del navegador.
  - La elección se guarda en la clave `lang` de localStorage, fuera de la copia de seguridad: es una preferencia del dispositivo, igual que `theme`.
  - Una sola dirección con selector, no `/es` y `/fr`: de momento el SEO sigue en inglés y no hay que mantener tres sitios. Descartado.
  - Efecto secundario conocido: el nombre por defecto de un presupuesto («Untitled part» / «Pieza sin nombre») se guarda en el idioma activo al guardar; es un dato del usuario, no se retraduce.
- Concepto nuevo: `Intl`, la API del navegador para formatear según el idioma. Ejemplo mínimo: `new Intl.NumberFormat('es-ES').format(1234.5)` devuelve `"1234,5"` (con separador de miles según el idioma) y `formatToParts` devuelve cada trozo por separado para quedarte solo con el decimal. Y `React.createContext`: pasa un valor (aquí `t`) a todo el árbol sin ir pasándolo por props.
- De la carrera: Programación / Compiladores: `splitSlots` es un analizador léxico mínimo (parte el texto en tokens: texto y huecos) y `fill` lo evalúa. Estructuras de Datos: el diccionario es una tabla hash (`Object.hasOwn` es la búsqueda por clave). Ingeniería del Software: el test de paridad de claves y huecos es una prueba de contrato entre idiomas.
- Cómo probarlo: `npm test` (nuevos tests en src/i18n/i18n.test.js: mismas claves y huecos en los tres idiomas, toda clave usada en el código existe, fallback). `npm run dev` y abre `http://localhost:5173/?lang=fr`: la calculadora, la barra, el precio con coma y los textos de ayuda (la «i» de cada campo) están en francés; cambia con el selector EN/ES/FR. Sin `?lang=`, el selector no se ve y todo sigue en inglés. El panel «Import from your slicer» sigue en inglés a propósito: va en el paso 2.

### 2026-10-29, Barra lateral de dos niveles: «On this page»
- Archivo y sitio: src/SubNav.jsx (nuevo). src/App.jsx, constante `CALC_NAV` encima de `SECTIONS`, los `id="sec-…"` de los bloques del formulario y la línea `{view === 'calculator' && <SubNav … />}` dentro de `<nav className="tabs">`. src/index.css, bloque `.subnav` antes de «Portatil estrecho: solo iconos».
- Qué cambió: bajo la pestaña Calculator de la barra lateral aparece una lista con los bloques del formulario (Import file, Material, This print, This sale, Your setup). Pulsar uno salta a él y la lista marca en cuál estás mientras haces scroll. Solo en pantallas de 1140 px o más.
- Por qué:
  - La calculadora es larga y el formulario ocupa varias pantallas; el segundo nivel resuelve un problema real en vez de ser decoración. Es el patrón que se reutilizará en Printers cuando la flota venga de la nube (lista de impresoras con su estado).
  - Scrollspy con `IntersectionObserver` y no con un listener de `scroll`: el navegador avisa solo cuando un bloque entra o sale de una franja de la ventana (del 10 % al 40 % de la altura), sin calcular posiciones en cada evento ni bloquear el hilo principal.
  - `CALC_NAV` es una constante fuera del componente a propósito: `SubNav` recrea el observador cuando cambia el array de `items`, y un array nuevo en cada render lo haría en cada render.
  - La columna del resultado (precio, costes, guardar) NO está en la lista: es `position:sticky`, y `scrollIntoView` sobre un elemento pegado no hace nada útil. En pantallas de menos de 1140 px o en móvil el segundo nivel no se muestra.
  - `scrollIntoView` con `behavior:'auto'` si el sistema pide menos movimiento (`prefers-reduced-motion`), igual que el resto de la web.
  - Los saltos usan botones y no enlaces `#ancla`: el hash cambiaría la URL y la pestaña no es una ruta.
  - Descartado un panel lateral fijo con contenido propio (segundo nivel «de verdad»): hoy habría poco que poner en Printers e History, y quedaría vacío. Se hará con la flota.
- Concepto nuevo: `IntersectionObserver`. Vigila elementos y llama a tu función cuando cambia cuánto se ven dentro de una región. Ejemplo mínimo: `new IntersectionObserver(es => console.log(es[0].isIntersecting)).observe(el)`. Y `rootMargin:'-10% 0px -60% 0px'` encoge la región de vigilancia por arriba y por abajo.
- De la carrera: Estructuras de Datos: el `Set` de `SubNav` guarda qué bloques están dentro de la franja (inserción y borrado en O(1)) y se recorre `items` en orden para elegir el primero. Sistemas Operativos/Concurrencia: observar eventos con una callback en vez de hacer polling.
- Cómo probarlo: `npm run dev` con la ventana a más de 1140 px. Bajo Calculator verás la lista; pulsa «This sale»: salta a ese bloque y se marca. Sube con la rueda: la marca vuelve a «Import file». Cambia a History: la lista desaparece. Reduce la ventana a menos de 1140 px: desaparece también.

### 2026-10-29, Fuentes alojadas en el propio sitio
- Archivo y sitio: src/main.jsx (imports de fuentes, antes de `./index.css`). index.html, quitadas las tres líneas de fonts.googleapis.com / fonts.gstatic.com. src/index.css, las pilas `font-family`. package.json y package-lock.json.
- Qué cambió: Inter y Bricolage Grotesque se sirven desde layercents.com y no desde Google. La web ya no hace ninguna petición a Google.
- Por qué:
  - Con la hoja de Google, el navegador de cada visitante le manda su IP a Google. En la UE eso se considera un tratamiento de datos personales (un tribunal de Múnich condenó a un sitio por exactamente esto en 2022) y exige base legal o aviso. Alojándolas nosotros desaparece el problema, que importa antes de cobrar y de redactar la política de privacidad.
  - Dependencias nuevas, explicadas como pide CLAUDE.md: `@fontsource-variable/inter` y `@fontsource-variable/bricolage-grotesque` (licencia OFL, la de las propias fuentes). Alternativa descartada: bajar los `.woff2` a mano a `public/` y escribir los `@font-face`: funciona igual, pero hay que mantener a mano los subconjuntos de alfabeto y las rutas. Los paquetes ya traen los `@font-face` con `unicode-range` y Vite pone el hash al nombre del archivo.
  - Variables en lugar de una fuente por peso: un solo archivo de Inter cubre 400, 500 y 600, y Bricolage conserva el eje de tamaño óptico (`opsz`) que ya pedía la URL de Google.
  - El nombre de familia cambia a `'Inter Variable'` y `'Bricolage Grotesque Variable'`; se dejó `'Inter'` detrás por si el equipo la tiene instalada.
  - Comprobado: al cargar solo se bajan `inter-latin` (48 kB) y `bricolage-grotesque-latin` (77 kB); el resto de alfabetos solo si aparece un carácter suyo.
  - Lo que sigue saliendo del navegador, para la política de privacidad: la API de tipos de cambio (api.frankfurter.dev, manda la IP) y el script de estadísticas que Cloudflare inyecta por ser el proxy del dominio. No tocado aquí.
- Concepto nuevo: `unicode-range` en un `@font-face`. El navegador solo descarga ese archivo si la página contiene algún carácter dentro del rango. Ejemplo mínimo: `@font-face{font-family:X;src:url(x-cyr.woff2);unicode-range:U+0400-04FF}` no se baja en una página sin cirílico.
- De la carrera: Redes: la IP viaja en cada petición HTTP a un tercero. Y Derecho/Ética informática, si la cursas: el RGPD y los datos personales (una IP lo es).
- Cómo probarlo: `npm run build && npm run preview`, abre la web con las herramientas de desarrollo en Network y filtra «font»: los archivos vienen de tu dominio y no hay ninguna petición a googleapis ni gstatic. Los títulos siguen en Bricolage y el texto en Inter.

### 2026-10-29, Tema claro
- Archivo y sitio: src/theme.js (nuevo). index.html, `<script>` en el `<head>` antes del `<style>` de arranque. src/App.jsx, estado `theme` y botón en `.topbar-end`. src/index.css: tokens de `:root`, bloque nuevo `:root[data-theme="light"]` y sustitución de los colores escritos a mano. src/NavIcons.jsx (sol y luna).
- Qué cambió: la web tiene tema claro además del oscuro. Si la persona no ha elegido, manda el sistema (`prefers-color-scheme`); el botón de sol/luna en la barra guarda su elección en este dispositivo.
- Por qué:
  - El tema se cambia con variables: `[data-theme="light"]` solo redefine valores y ningún componente sabe en qué tema está. Alternativa descartada: una segunda hoja de estilos o clases `.light` por componente (duplicaría 700 líneas).
  - Se decide en un `<script>` de index.html ANTES de pintar. Si se hiciera al cargar React, quien usa el claro vería un parpadeo oscuro. El mismo cálculo está en `readTheme` (theme.js); si cambias uno, cambia el otro.
  - Texto dorado: el oro claro (#F7C96A) sobre blanco da 1,5:1. Nueva variable `--oro-texto` (oro claro en oscuro, #8A5A00 en claro). Los botones siguen en oro con texto oscuro (9,7:1). Se cambiaron solo las reglas con `color:`; `border-color` y `background` siguen con `--oro`.
  - Contrastes del tema claro medidos (WCAG, mínimo 4,5:1): `--tenue` 6,4 sobre `--panel` y 5,5 sobre `--panel-alto`; `--oro-texto` 5,9 y 5,1; `--rojo` (#C4262E) 5,7 y 4,9.
  - De paso se cierra el hallazgo P2 de la auditoría sobre tintes de oro sin variable: ahora son `rgba(var(--oro-rgb),.15)` y se pueden cambiar en un sitio.
  - `theme` NO va en la copia de seguridad (backup.js): es una preferencia del aparato, como `lastBackupAt`; restaurar en otro dispositivo no debe cambiarle el tema. Por eso no se toca `BACKUP_SCHEMA_VERSION`.
  - Límite conocido: los colores de la gráfica por categorías son los mismos en los dos temas (el amarillo de «Material» sobre blanco tiene poco contraste como marca). Las etiquetas con texto sí lo cumplen. Se mira en un PR aparte si molesta.
  - El informe y el presupuesto ya eran de papel blanco con sus propias variables (`--papel`, `--tinta`): no cambian.
- Concepto nuevo: variables CSS con ámbito. `:root{--x:1}` define un valor para toda la página y `:root[data-theme="light"]{--x:2}` lo sustituye cuando el atributo está presente, sin tocar las reglas que usan `var(--x)`. Y `rgba(var(--oro-rgb),.15)` funciona porque la variable guarda solo los tres números `242,179,61`.
- De la carrera: Ingeniería del Software, separar el dato (el tema) de la presentación para que ningún componente dependa de él. Y de Sistemas Operativos, la idea de leer una preferencia del sistema (`prefers-color-scheme`) y dejar que la persona la sobrescriba.
- Cómo probarlo: `npm run dev`. En la barra, pulsa el icono de sol/luna: cambia de tema, y al recargar se mantiene. Borra `theme` en Application > Local Storage y recarga: manda el tema de tu sistema (cámbialo en los ajustes del sistema para verlo). Mira Calculator, History y Printers en claro; en History abre un informe y «Guardar como PDF»: sale igual que antes.

### 2026-10-29, Barra lateral y superficies con relieve
- Archivo y sitio: src/NavIcons.jsx (nuevo). src/App.jsx, en el `return` de la función App: el `<header className="topbar">` con las pestañas. src/index.css: tokens de `:root` (`--radio`, `--brillo`, `--filo`, `--rail-w`), `.panel`, `.tab` y un bloque nuevo «Barra lateral (escritorio)» tras la media query de 520 px.
- Qué cambió: en pantallas de 861 px o más la barra superior pasa a ser una barra lateral fija con iconos (solo iconos entre 861 y 1139 px); en móvil queda igual que antes. Los paneles ganan radio de 12 px, un brillo tenue arriba y un filo de luz de 1 px.
- Por qué:
  - Un solo marcado y dos disposiciones por CSS (`position:fixed` en escritorio). La alternativa era un componente `Sidebar` aparte y otro `TopBar`: dos menús que mantener, y los lectores de pantalla leerían dos. La pestaña activa, el contador y el punto de copia siguen funcionando sin tocar la lógica.
  - En móvil NO hay barra inferior: ya existe la barra fija del precio (`.mobile-total`) y dos barras fijas se comerían media pantalla de 844 px.
  - El contenido se desplaza con `padding-left` en `body`, no con un contenedor nuevo, para no tocar la estructura de ninguna pantalla. Se anula en `@media print`; comprobado emulando `print` (padding 0 y barra oculta).
  - Iconos SVG en línea en vez de una librería (lucide, heroicons): son tres dibujos y una dependencia nueva pesaría más que ellos. Con `stroke="currentColor"` toman el color del texto.
  - El oro solo marca dónde estás (borde, velo y marquita a la izquierda), como único acento.
  - Contraste: la cabecera de panel ahora es `rgba(255,255,255,.03)` sobre el brillo. Recalculado: `--tenue` da 4,78:1 ahí (mínimo 4,5:1).
  - Se cambia `--radio` de 8 a 12 px en vez de crear otro token: lo usan 6 reglas y deben ir a juego. Descartado un colapso manual de la barra (más estado que guardar) a favor de estrecharla sola por ancho.
  - `<div>` pasa a `<header>`: de paso es un punto de referencia para lectores de pantalla (hallazgo P3 de la auditoría).
- Concepto nuevo: `position:fixed` saca un elemento del flujo y lo ancla a la ventana; por eso hay que reservar su hueco con `padding-left`. Ejemplo mínimo: `.rail{position:fixed;left:0;width:216px} body{padding-left:216px}`. Y `currentColor` es la palabra clave de CSS que vale «el color de texto de este elemento».
- De la carrera: Fundamentos de Computadores / Ingeniería del Software en lo de separar contenido y presentación (un HTML, dos disposiciones por CSS). No hay nada más de la carrera en este cambio.
- Cómo probarlo: `npm run dev` y abre la web. Con la ventana a más de 1140 px verás la barra con nombres; entre 861 y 1139, solo iconos (el nombre sigue ahí para lectores de pantalla); por debajo de 861 vuelve la barra de arriba. Cambia entre Calculator y History: el oro marca la activa. En History pulsa un informe y «Guardar como PDF»: no debe haber hueco a la izquierda.

### 2026-10-28, Auditoría de diseño guardada en docs/
- Archivo y sitio: docs/AUDITORIA-2026-10-28.md (nuevo). docs/MAPA.md, en la tabla de documentación, debajo de `docs/IMPRESORAS.md`.
- Qué cambió: la auditoría técnica de `/impeccable audit` queda por escrito tal cual se hizo: nota 15/20, las cinco áreas, los hallazgos P1/P2/P3 con sus cifras, lo que el detector marcó sin ser un fallo, lo que está bien y el orden recomendado. Los dos P1 de contraste figuran como hechos (PR #30); el resto, como pendientes.
- Por qué:
  - La auditoría solo existía en el chat. En docs/ sirve como lista de tareas de diseño y como punto de partida para comparar cuando se repita.
  - La nota se deja en 15/20, la del día de la auditoría, aunque el PR #30 ya arregle dos fallos: si se recalculara a mano, ya no se sabría con qué se compara la siguiente pasada. El estado de cada hallazgo va al lado de cada uno.
  - La fecha va en el nombre del archivo para que cada auditoría futura sea un archivo nuevo y no se pise el histórico.
- Cómo probarlo: abre docs/AUDITORIA-2026-10-28.md; los dos P1 dicen «Hecho (PR #30)» y el resto «Pendiente». `npm run build` sigue pasando (no toca código).
### 2026-10-28, Contraste: gris secundario y rojo que pasan WCAG AA
- Archivo y sitio: src/index.css, en los tokens de `:root` (`--tenue` y `--rojo`) y en `.printer-badge.bad`. DESIGN.md y .impeccable/design.json, con los valores nuevos y la letra monoespaciada declarada.
- Qué cambió: `--tenue` pasa de #8E8E98 a #9A9AA4 y `--rojo` de #E5484D a #FF6369. El tinte de fondo de la insignia «Failed» usa el rojo nuevo.
- Por qué:
  - La auditoría encontró dos fallos de WCAG 1.4.3 (contraste mínimo, 4,5:1 para texto normal). El gris daba 4,4:1 sobre `--panel-alto`, que es el fondo de la cabecera de cada panel y de las ayudas. El rojo daba 4,1:1 sobre `--panel` y 3,6:1 sobre `--panel-alto`, justo en la frase que te dice que pierdes dinero, que es lo último que alguien debería no poder leer.
  - Ahora el gris da 5,1:1 sobre `--panel-alto` y 4,8:1 en el peor caso (el aviso de copia, oro sobre `--fondo`). El rojo da 4,9:1 sobre `--panel-alto` y 4,5:1 en la insignia «Failed». Probé cuatro grises y cinco rojos: elegí el más oscuro que pasa en todos los fondos donde se usa, para que el aspecto casi no cambie.
  - Se cambia el valor de la variable, no se crea otra: hay un solo rojo y un solo gris secundario, y todo lo que los usa (unos 40 sitios) mejora a la vez. Un `--rojo-texto` aparte habría dejado dos rojos casi iguales que alguien acabaría mezclando.
  - Descartado un rojo más rosado (#F2777A): pasaba con más margen, pero ya no se leía como «error».
  - En DESIGN.md se añade la letra monoespaciada (`mono`), que ya se usaba para los comandos de la pestaña Printers pero no estaba declarada; el aviso del detector era por eso.
- Concepto nuevo: el contraste de WCAG es `(L1 + 0,05) / (L2 + 0,05)`, donde L es la luminancia relativa de cada color (el sRGB pasado a lineal y ponderado 0,2126 R + 0,7152 G + 0,0722 B, porque el ojo es mucho más sensible al verde). Va de 1:1 (mismo color) a 21:1 (negro sobre blanco).
- De la carrera: Interacción Persona-Ordenador: accesibilidad y la norma WCAG. Informática Gráfica: luminancia y corrección gamma de sRGB, que es el paso a lineal de la fórmula.
- Cómo probarlo:
  1. `npm run build` y `npm run dev`.
  2. Mira la cabecera de cualquier panel y abre una ayuda (i): el gris se lee un poco mejor.
  3. Para ver el rojo: pon un precio de venta por debajo del coste; la frase del veredicto sale en rojo y se lee sin esfuerzo.
  4. `/impeccable audit` ya no da avisos de contraste en la calculadora.

### 2026-10-28, DESIGN.md: el sistema visual por escrito
- Archivo y sitio: DESIGN.md (nuevo, en la raíz) y .impeccable/design.json (nuevo). docs/MAPA.md, en la tabla de documentación, debajo de `PRODUCT.md`.
- Qué cambió: DESIGN.md recoge el sistema visual que ya existe en src/index.css: los 22 colores con nombre y para qué sirve cada uno, la tipografía (Bricolage Grotesque para la marca y el precio, Inter para todo lo demás), radios, espaciado, capas de profundidad, componentes y una lista de lo que se hace y lo que no. design.json es su complemento para la skill `impeccable`: escalas de tono de cada color, movimiento, breakpoints y fragmentos HTML/CSS de 8 componentes.
- Por qué:
  - Cualquier pantalla nueva (la pestaña Printers, las cuentas de docs/NUBE.md) tiene que parecer de la misma app; con las reglas escritas no hace falta deducirlas del CSS cada vez.
  - Documenta lo que hay, no lo que me gustaría: cada valor sale de index.css, App.jsx (colores de la gráfica) o exportExcel.js. No he cambiado ningún estilo.
  - Tu respuesta («elegante, que transmita paz, bonito y cómodo»; componentes «cálidos y táctiles») se recoge como la metáfora «The Quiet Workshop» y como dirección futura: hoy los componentes son sobrios (bordes finos, 5 px de radio). Lo dejo escrito como hacia dónde ir al retocar, sin rehacer pantallas que nadie ha pedido tocar.
  - La cabecera YAML sigue el formato estándar de DESIGN.md (colores, tipografía, radios, espaciado, componentes), que pueden leer otras herramientas. Lo que no cabe ahí (sombras, movimiento, breakpoints) va en el JSON, para no inventar claves que el formato no acepta.
  - Los nombres de los colores (Layer Gold, Night Workshop…) son descriptivos y en inglés, como el resto del código; las variables CSS siguen siendo las de siempre (`--oro`, `--fondo`), y el documento dice cuál es cuál.
- Concepto nuevo: OKLCH, el espacio de color de las escalas de design.json. `oklch(72% 0.12 79)` es luminosidad, croma (saturación) y tono en grados. A diferencia del hex o del HSL, subir la luminosidad en OKLCH se percibe igual en todos los tonos, por eso sirve para generar escalas de un color: misma `H`, distinta `L`.
- De la carrera: Ingeniería del Software: es la documentación de diseño del sistema (la vista de interfaz), separada de los requisitos que van en PRODUCT.md. Informática Gráfica: espacios de color (sRGB a OKLab y OKLCH) en las escalas de tono.
- Cómo probarlo: abre DESIGN.md y compara dos o tres valores con src/index.css (por ejemplo `layer-gold` con `--oro`). Corrige nombres o reglas que no te convenzan. `npm run build` sigue pasando (no toca código).

### 2026-10-28, PRODUCT.md: contexto de producto para el diseño
- Archivo y sitio: PRODUCT.md (nuevo, en la raíz). docs/MAPA.md, en la tabla de documentación, junto a `CLAUDE.md, DEV_LOG.md`.
- Qué cambió: un documento con la verdad de producto (usuarios, propósito, posicionamiento, contexto de uso, restricciones, compromisos de marca, evidencia y principios), escrito con `/impeccable init` a partir del repositorio y de tus tres respuestas: vendedor pequeño ahora y granja después, los cuatro diferenciadores, y uso en escritorio junto al laminador.
- Por qué:
  - La skill de diseño `impeccable` lo lee antes de cualquier trabajo de interfaz; sin él, cada sesión de diseño volvería a preguntar lo mismo o adivinaría el usuario.
  - Solo hechos de producto, nada visual: paleta, tipografía y componentes van en DESIGN.md (`/impeccable document`), para que cambiar el aspecto no obligue a reescribir quién es el usuario.
  - Precios y qué es de pago se quedan fuera a propósito: el repositorio es público y eso va en el documento privado.
  - Deja escrito lo que no existe (testimonios, cifras de usuarios) para que ningún diseño futuro lo invente.
  - En inglés, como la interfaz: el tono y los ejemplos de copy sirven tal cual para escribir textos de la web.
- De la carrera: Ingeniería del Software: es una especificación de requisitos (actores, contexto de uso y restricciones) separada del diseño, como se separan requisitos y diseño en el ciclo de vida.
- Cómo probarlo: lee PRODUCT.md y corrige lo que no encaje. `npm run build` sigue pasando (no toca código).

### 2026-10-28, Pestaña Printers: historial, tasa de fallos y tiempo real frente al estimado
- Archivo y sitio:
  - src/jobStats.js (nuevo): `summarize`, `summarizeByPrinter`, `median`, `describeEstimateError`. src/jobStats.test.js (nuevo): 11 tests.
  - src/agent.js: `fetchJobs()`, junto a `fetchPrinters`. src/agent.test.js: 2 tests contra el handler real del agente.
  - src/Printers.jsx: componente `PrintHistory` y un efecto que pide `/jobs` cada 20 s; el texto de «sin impresoras» ya no dice que solo hay Bambu.
  - src/index.css: tres reglas pequeñas (`.printers-stats`, `.printers-subtitle`, `.printers .stat .muted`). docs/MAPA.md, docs/IMPRESORAS.md y CLAUDE.md al día.
- Qué cambió: debajo de las impresoras sale «Print history»: impresiones de los últimos 30 días, tasa de fallos, tiempo medio y cuánto se desvía el tiempo real del que dijo el laminador; una tabla por impresora si hay más de una y las 10 últimas impresiones.
- Por qué:
  - Es lo que una calculadora normal no puede enseñar: los números salen de impresiones reales, no de estimaciones.
  - La tasa de fallos es `fallidas / (terminadas + fallidas)`. Las canceladas son decisión de la persona y las «desconocidas» (no se vio cómo acabaron) y la que está en marcha no son ni éxito ni fallo: contarlas inflaría o desinflaría la tasa con cosas que no lo son.
  - Con menos de 5 impresiones no se enseña ningún porcentaje, sino «Needs 5 finished prints». Un fallo en dos impresiones saldría como «50 %» y no significa nada. Los contadores sí se enseñan siempre.
  - Para «real frente a lo que dijo el laminador» se usa la mediana del cociente real/estimado, no la media: una impresión que se atascó un día entero arrastraría la media y no dice nada de la impresión típica.
  - Solo cuentan tiempos medidos. Una impresión cuyo inicio se estimó (`startedApprox`) no tiene `realMinutes` y se marca con «~» en la tabla: un tiempo calculado no se promedia como si fuera medido.
  - Cada impresora tiene su propia tasa: una vieja que falla más no puede esconderse detrás de una nueva que no falla nunca.
  - El registro se pide cada 20 s y no cada 3 s como el estado: solo cambia al empezar o acabar una impresión y puede tener cientos de entradas. Y solo con la pestaña visible, igual que el estado.
  - En el móvil la tabla pierde fecha, impresora y «Slicer said» (la fecha y la impresora pasan debajo del nombre) y reutiliza las clases `.wide` y `.row-sub` de History, para no inventar otro sistema.
  - Es solo la pantalla de los datos. El diseño bonito de esta pestaña lo haces tú con Codex, como dijiste: la lógica está separada en `jobStats.js`, que no sabe nada de cómo se pinta.
- Concepto nuevo: la mediana frente a la media. `median([100, 101, 99, 5000])` da 100,5, mientras que la media da 1325. Con datos que pueden tener un valor extremo, la mediana describe al caso típico. Se calcula ordenando una copia (`[...values].sort((a, b) => a - b)`) y cogiendo el valor del medio.
- De la carrera: Estadística: mediana frente a media, tamaño de muestra mínimo antes de dar una proporción, y qué entra en el denominador de una tasa. Interfaces de usuario / Ingeniería del Software: separar el cálculo (`jobStats.js`, puro y con tests) de la presentación (`PrintHistory`).
- Cómo probarlo:
  1. `npm test` (146 pasan) y `npm run build`.
  2. Con el agente corriendo y la pestaña Printers abierta (`layercents.com/?agent`, o `npm run dev` con `?agent`): tras unas impresiones sale el panel. Con menos de 5, los porcentajes salen como «—» con la nota.
  3. Para verlo lleno sin impresoras: el agente lee `~/.layercents/jobs.json`; copia ahí unas 10 entradas de ejemplo (el formato está en `agent/jobs.js`) y reinicia el agente.

### 2026-10-28, Agente paso 6: impresoras Klipper (Moonraker)
- Archivo y sitio:
  - agent/drivers/moonraker.js (nuevo): `createMoonrakerDriver`, `getJson`, `printerStatus`, `historyToJobs`, `probeMoonraker`, `explain`. agent/fakeMoonraker.js (nuevo): impresora de mentira. agent/moonraker.test.js y agent/setup.test.js (nuevos).
  - agent/config.js: `checkPrinter` valida por marca (`BRAND_CHECKS`): `bambu` como antes y `moonraker` con `port` y `apiKey` opcionales.
  - agent/printers.js: `moonraker` entra en `DRIVERS`; cada driver recibe `onStatus` y `onHistory`.
  - agent/jobs.js: `importHistory()` y el resultado `cancelled`. agent/setup.js: `npm run agent -- add` pregunta la marca. agent/handler.js: `PROTOCOL` 4, `VERSION` 0.4.0. agent/drivers/bambu.js: `printMessage` en el estado y `Object.hasOwn`.
  - src/agent.js (`AGENT_PROTOCOL` 4), src/printerView.js (etiqueta «Cancelled») y src/Printers.jsx (una línea con el mensaje de Klipper cuando falla). supabase/migrations: `cancelled` entre los resultados válidos.
- Qué cambió: el agente entiende impresoras Klipper con Moonraker (Creality K1/K2, Elegoo Neptune 4, Qidi, Sovol, Voron…): estado en vivo y su historial de trabajos. Se añaden con `npm run agent -- add`, eligiendo la opción 2.
- Por qué:
  - Una sola API cubre muchas marcas. Y Moonraker guarda su propio historial con el inicio y el final reales, aunque el agente estuviera apagado. Por eso el registro no se adivina mirando cambios de estado, como en Bambu: el historial se copia (`importHistory`). Los tiempos de estas impresoras son medidos siempre (`startedApprox: false`).
  - Se pregunta cada 2 s (polling) y no por WebSocket: no hay conexión que mantener ni que reconectar, un fallo es solo una pregunta fallida, y no hace falta ninguna dependencia (`fetch` ya viene en Node). El coste es una petición pequeña cada 2 s a una máquina de la red local. Descartado el WebSocket por más código para el mismo resultado visible.
  - El historial se vuelve a leer solo cuando una impresión empieza o acaba, no en cada pregunta. Si Moonraker aún no ha cerrado el registro justo al acabar, se mira otra vez en la siguiente vuelta; si no, el trabajo se quedaría abierto para siempre.
  - Solo GET, sin seguir redirecciones (`redirect: 'manual'`) y con tope de 2 MB por respuesta. La API key se manda en `X-Api-Key`: si la impresora redirigiera a otra dirección, un cliente que sigue redirecciones se la entregaría. Y un aparato equivocado en ese puerto no puede hacer que el agente lea gigas en memoria.
  - Solo HTTP, porque así viene Moonraker en la red local. Si una persona lo tiene detrás de HTTPS, el driver dice que esa dirección no responde como Moonraker en vez de fallar callado.
  - `cancelled` es un resultado propio. Klipper dice sin ambigüedad cuándo una impresión se canceló, y cancelar es una decisión de la persona, no un fallo de la impresora: si contara como fallo, la tasa de fallos (que es lo que se quiere enseñar) saldría inflada. `interrupted` y `server_exit` (se paró Moonraker, no la impresión) quedan como `unknown`.
  - El tiempo restante de Klipper es una estimación por el ritmo (`print_duration × (1−p) / p`), porque Moonraker no da ninguno. Se avisa en la checklist para que se compare con el del laminador.
  - La API key se guarda en `printers.json` (permisos 600, fuera del proyecto) igual que el código de las Bambu, nunca sale en el estado ni en `list`, y el comando no la repite en pantalla.
  - `Object.hasOwn(TABLA, valor)` en vez de `TABLA[valor]`: con `TABLA['constructor']` JavaScript devolvería el método de `Object` y se tomaría por un estado válido. Los datos vienen de un aparato de la red, no de una fuente de confianza.
  - Los tests sacaron un fallo real: `importHistory` se rompía con una entrada nula. Ahora cualquier entrada mala se salta.
  - Límite honesto: lo probado es contra una impresora de mentira que habla como dice la documentación de Moonraker. No sé cómo se comporta una K2 o una Neptune 4 reales (firmware, puertos, si exigen clave). Hace falta una persona con una: checklist en docs/IMPRESORAS.md.
- Concepto nuevo: polling con retroceso exponencial. En vez de preguntar cada 2 s siempre, tras cada fallo se espera el doble (2, 4, 8… hasta 60 s) y al primer éxito se vuelve a 2 s. Ejemplo: `espera = backoffMs[Math.min(intento - 1, backoffMs.length - 1)]`.
- De la carrera: Redes: HTTP, códigos de estado (401, 503, 3xx) y el porqué de no seguir redirecciones al enviar credenciales. Sistemas Operativos / Programación concurrente: un bucle asíncrono con temporizador que se cancela con `stop()` sin esperar. Ingeniería del Software: el patrón «una interfaz, un driver por marca» (`printerStatus` común) y probar contra un doble de prueba (`fakeMoonraker.js`). Estadística: separar `cancelled` de `failed` es decidir qué cuenta como éxito en una tasa.
- Cómo probarlo:
  1. `npm test` (133 pasan, 16 se saltan sin Postgres) y `npm run build`.
  2. Sin impresora: no se puede ver más allá de los tests. Con una Klipper, la checklist de docs/IMPRESORAS.md («Qué probar con una impresora Klipper»).
  3. Para ver el asistente sin impresora: `npm run agent -- add` y elige 2 con una IP que no responda: debe decirte qué falló y no guardar nada.

### 2026-10-28, Esquema de Supabase con seguridad por filas y sus tests
- Archivo y sitio:
  - supabase/migrations/20261028000000_init.sql (nuevo): 8 tablas, 3 triggers, permisos y políticas.
  - supabase/tests/prelude.sql (nuevo) y supabase/rls.test.js (nuevo): 16 tests contra un Postgres de verdad.
  - docs/MAPA.md al día. La web y el agente no cambian todavía: nada usa estas tablas.
- Qué cambió: queda definido dónde vivirá todo lo de la nube (presupuestos, negocio, agentes, impresoras, estado, trabajos, suscripciones y códigos de emparejamiento) y quién puede leer o escribir cada cosa.
- Por qué:
  - La `anon key` de Supabase va en el JavaScript de la web y es pública. Lo único que separa los datos de un usuario de los de otro es RLS. Por eso es lo primero que se escribe y se prueba, antes de que haya una sola línea de interfaz.
  - Dos cerrojos, no uno. Supabase da por defecto todos los permisos de tabla a `anon` y `authenticated`; el archivo empieza quitándolos todos y devuelve solo lo necesario. Aunque se olvide una política, la tabla no queda abierta. Y un test comprueba que todas las tablas tienen RLS.
  - Las tablas que un usuario no debe poder falsear (estado, trabajos, impresoras, suscripciones) no tienen permiso de escritura para la web: las escriben Edge Functions con la clave de servicio. Si no, cualquiera podría ponerse un historial de 0 % de fallos.
  - `token_hash` no se puede leer desde la web (permisos por columna) y se guarda como SHA-256: ni un volcado de la base de datos ni una cuenta robada permiten suplantar al agente. Un agente revocado no se puede reactivar (trigger); se vincula uno nuevo.
  - Borrado con marca (`deleted_at`) en los presupuestos: con dos dispositivos, una fila que desaparece parece «este dispositivo nunca la tuvo» y reaparece en la siguiente sincronización.
  - Los trabajos llevan `jobs_real_needs_measured_start`: un inicio estimado no puede tener tiempo «real». La regla de `agent/jobs.js` queda también garantizada en la base de datos.
  - `local_id` de las impresoras solo admite el formato de identificador del agente (`p1s-taller`), así que ni una IP ni un número de serie caben ahí por error.
  - Un tope de 20 impresoras por cuenta en un trigger, además del de la función de subida: un fallo allí no debe poder llenar la tabla.
  - `(select auth.uid())` en vez de `auth.uid()` en las políticas: Postgres lo calcula una vez por consulta y no una vez por fila.
  - Descartado: guardar los presupuestos en columnas. Cambian de forma con la app; `payload jsonb` con `schema_version` evita una migración por cada campo nuevo, igual que `BACKUP_SCHEMA_VERSION` en backup.js.
  - Los tests no tocan Supabase: usan un Postgres local con un `prelude.sql` que imita lo que Supabase ya trae. Para comprobar que los tests sirven, se rompió la seguridad a propósito (RLS apagado, permisos sin quitar, `token_hash` legible, escritura abierta en `jobs`) y cada ruptura hizo fallar tests. Una cosa no se detecta, y es correcta: quitar `with check` de una política `for all` no cambia nada, porque Postgres reutiliza `using`.
  - Límite honesto: esto demuestra que las políticas hacen lo que digo en un Postgres 16 normal, no que el panel de Supabase no tenga una configuración que las anule. Eso se comprueba una vez con el proyecto real.
- Concepto nuevo: permisos por columna. `grant select (id, name) on agents to authenticated` deja leer solo esas columnas; `select *` falla con «permission denied» porque incluye una que no se concedió. Es lo que esconde `token_hash`.
- De la carrera: Bases de datos: restricciones `check`, claves primarias compuestas, `on delete cascade`, triggers y transacciones. Seguridad informática: mínimo privilegio (todo cerrado, se abre lo necesario), separación de privilegios (la web lee, la función escribe) y no guardar secretos en claro (solo el hash del token).
- Cómo probarlo:
  1. `npm test`: 103 pasan y 16 se saltan (los de la base de datos).
  2. Con un Postgres a mano: `LAYERCENTS_TEST_PG=postgres://usuario:clave@localhost:5432/postgres npm test`. Deben pasar los 16. Crea y borra una base de datos temporal. Necesita `psql` instalado.
  3. Rompe algo a propósito en el .sql (por ejemplo, borra una línea `enable row level security`) y mira cómo fallan los tests.

### 2026-10-28, Diseño de cuentas, nube y cobro (solo documentación)
- Archivo y sitio: docs/NUBE.md (nuevo) y CLAUDE.md, regla «No metas backend…», «Pendiente» punto 5 e «Ideas futuras».
- Qué cambió: no hay código. Queda escrito el diseño de las cuentas con Supabase, la subida de estado y trabajos de las impresoras a la cuenta, el cobro con Lemon Squeezy, el modelo de seguridad y el orden de PRs. CLAUDE.md pasa a permitir esa excepción, con condiciones.
- Por qué:
  - Julen decidió ir a un producto de pago con cuentas, y eso rompe una regla que estaba para evitar justamente esto. Mejor cambiarla por escrito, con sus límites, que que cada sesión la interprete a su manera.
  - Supabase en vez de un servidor propio: Postgres, login y funciones sin un servidor que parchear, copiar y reiniciar, para alguien que trabaja a jornada completa. Descartado el backend propio por ese mantenimiento.
  - El agente sube estado y trabajos, pero nunca el código de acceso, la serie, la IP ni la huella. Un token robado solo debe poder escribir datos de impresoras de esa cuenta, no leer presupuestos: por eso el agente usa su propio token y no la sesión de la persona.
  - El token del agente se guarda hasheado (SHA-256) en la base de datos: un volcado no permite suplantar agentes. Es el mismo motivo por el que no se guardan contraseñas en claro.
  - Lo de pago se comprueba en el servidor. El código es público, así que ocultar un botón en el cliente no protege nada. Por eso Excel y PDF no sirven como función de pago.
  - Qué es de pago y el precio quedan fuera del repositorio (es público) y van en el documento privado.
  - Descartado: dejar los datos de impresoras solo locales. Es más privado, pero «ver todo desde cualquier sitio» es lo que se puede cobrar.
- Concepto nuevo: Row Level Security (RLS). Es una regla dentro de la base de datos que filtra las filas según quién pregunta, así que aunque la web tuviera un fallo, un usuario no puede leer filas de otro. Ejemplo: `create policy "own rows" on quotes using (user_id = auth.uid());`.
- De la carrera: Seguridad informática / Redes: el emparejamiento del agente es el «device flow» de OAuth, y guardar solo el hash del token es el mismo principio que el almacenamiento de contraseñas. Bases de datos: control de acceso por filas (RLS) y `on delete cascade` para el borrado de cuenta. Ingeniería del Software: decisiones de arquitectura escritas con sus alternativas descartadas.
- Cómo probarlo: no cambia la app. Léelo y dime qué no te cuadra antes del siguiente PR, que son las tablas y las políticas RLS.
### 2026-10-28, Agente paso 4: registro de trabajos de Bambu
- Archivo y sitio:
  - agent/jobs.js (nuevo): `openJobLog()` con `observe(status)`, `list()` y `flush()`; `checkJob()` valida cada entrada del archivo. agent/jobs.test.js (nuevo): 15 tests con reloj falso.
  - agent/drivers/bambu.js: opción `onStatus` de `createBambuDriver`, llamada dentro de `onReport`; `jobId()` y el campo `job.id` en `printerStatus`.
  - agent/printers.js: `createPrinters` recibe `jobLog` y se lo pasa a cada driver como `onStatus`.
  - agent/handler.js: ruta `GET /jobs`; `PROTOCOL` pasa a 3 y `VERSION` a 0.3.0. agent/server.js: abre el registro, se lo da al handler y espera a `flush()` en Ctrl+C. src/agent.js: `AGENT_PROTOCOL` = 3.
  - agent/config.js: `writePrivateJson()` sacada de `writeConfig` para que la usen las impresoras y los trabajos.
  - docs/IMPRESORAS.md (checklist 7-11), docs/MAPA.md y CLAUDE.md al día.
- Qué cambió: el agente apunta en `~/.layercents/jobs.json` cada trabajo que ve en una Bambu (impresora, nombre, inicio, fin, resultado, minutos estimados y reales, código de error) y lo sirve en `GET /jobs`, el más nuevo primero.
- Por qué:
  - La Bambu no guarda historial: cuando un trabajo acaba, lo olvida. Sin este registro no se puede comparar lo presupuestado con lo que pasó de verdad, que es lo que ninguna calculadora de la competencia hace.
  - El driver avisa con un callback (`onStatus`) en cuanto llega un mensaje, en vez de que el registro pregunte cada X segundos: no se pierde ningún cambio ni se hace trabajo en vacío. Se llama dentro de un `try/catch`, porque un fallo del registro no debe dejar sin estado en vivo a la web.
  - Solo se escribe en disco cuando un trabajo empieza o acaba, no con cada porcentaje: la P1S manda varios mensajes por segundo.
  - Resultado `unknown` cuando no se vio cómo acabó (el agente estaba apagado, la impresora pasó a reposo, otro trabajo ocupó su sitio). Descartado asumir `finished`: un éxito inventado falsea la tasa de fallos.
  - Si el agente arranca con una impresión a medias, el inicio se estima con el progreso y el tiempo restante que da la propia impresora, se marca `startedApprox` y no se calcula `realMinutes`. Un tiempo calculado nunca se presenta como medido, o "presupuestado frente a real" sería un círculo.
  - El reloj empieza en `PREPARE` si se vio, porque la estimación de la Bambu incluye el calentamiento y la calibración.
  - La clave del trabajo (id de Bambu o nombre del archivo) se guarda en el archivo. Si solo estuviera en memoria, tras reiniciar el agente un trabajo nuevo se confundiría con el que quedó abierto.
  - Un archivo roto se aparta como `jobs.json.broken-<hora>` en vez de sobrescribirse, y las entradas dañadas se saltan y se avisan. Un fallo al guardar se registra pero no se lanza: una promesa rechazada sin atender detiene un programa de Node.
  - Las escrituras se encadenan (`saving = saving.then(...)`) para que dos no se pisen en el mismo archivo temporal.
  - `PROTOCOL` sube a 3 porque la API cambia (ruta nueva y `job.id`), como pide CLAUDE.md. Con la comparación estricta de la web, un agente viejo saldrá como "outdated" hasta que lo actualices.
  - Descartado: guardar los trabajos en el navegador (el agente puede llevar días sin web abierta) y SQLite (una dependencia más para un archivo que crece unas decenas de filas a la semana).
- Concepto nuevo: encadenar promesas para serializar escrituras. `let cola = Promise.resolve(); cola = cola.then(() => escribir())` hace que cada escritura espere a que acabe la anterior, aunque se pidan a la vez. Y `.catch` al final de la cadena evita que un error rompa las siguientes.
- De la carrera: Autómatas / Teoría de la computación: `observe()` es un autómata finito por impresora (estados: sin trabajo y abierto; las transiciones están en el dibujo de la cabecera de jobs.js). Bases de datos: `writePrivateJson` escribe en un temporal y hace `rename`, que es atómico; el archivo es el anterior o el nuevo entero, igual que un commit o un rollback. Sistemas Operativos: los permisos 600 del archivo y esperar a `flush()` antes de salir en la señal SIGINT.
- Cómo probarlo:
  1. `npm test` (103 tests) y `npm run build`.
  2. Con la P1S: sigue la checklist de docs/IMPRESORAS.md (puntos 7 a 11). Lo más importante: lanza una impresión corta y mira `http://127.0.0.1:31415/jobs`, y **cancela otra a mitad** para ver cómo la cuenta Bambu.
  3. Sin impresora: `npm run agent` y abre `/jobs`; debe salir `{"jobs":[]}`.

### 2026-10-26, El PDF ya no sale con un bloque negro debajo de la hoja
- Archivo y sitio: src/index.css, sección "Informe (PDF)", dentro de `@media print`, en la regla del fondo (antes solo `body`, ahora `html,body`).
- Qué cambió: al imprimir, el fondo blanco se pone también en `html`. Desde el PR del SEO (#16), el informe y el presupuesto para el cliente salían con un bloque negro desde la última línea hasta el final de la hoja. No llegó a la web publicada: layercents.com se desplegó el 22 y el SEO entró después.
- Por qué:
  - El SEO (commit 5b6b732) puso en index.html un `<style>` que pinta `html` y `body` de oscuro antes de que cargue index.css, para que no haya un destello blanco al abrir la web. Al imprimir, index.css volvía a poner `body` en blanco, pero nadie tocaba `html`.
  - El fondo de `html` no es solo el de su caja: es el de todo el lienzo, la hoja entera. Y `*{print-color-adjust:exact}`, que hace falta para que salgan las barras de oro, obliga a imprimir los fondos aunque el diálogo de impresión tenga desactivados los gráficos de fondo. Así que el oscuro de `html` llegaba al papel por debajo del `body` blanco.
  - Descartado quitar `html` del `<style>` de index.html: también lo arreglaría (sin fondo propio, `html` toma el de `body`), pero dejaría el arreglo lejos de las reglas de impresión, y se rompería otra vez el día que alguien le diera fondo a `html`. Mejor decirlo donde se decide cómo se imprime.
  - Descartado quitar `print-color-adjust:exact`: arregla el fondo, pero se pierden las barras de oro de las gráficas del informe.
- Concepto nuevo: el fondo del lienzo. El navegador pinta toda la ventana (o toda la hoja, al imprimir) con el fondo de `html`; si `html` no tiene, usa el de `body`. Por eso el fondo de `body` llena la pantalla aunque el `body` mida menos. Ejemplo: con `html{background:red}` y `body{background:white;height:100px}`, la página es roja con una franja blanca arriba, que es justo lo que pasaba en el papel con el oscuro.
- De la carrera: Introducción a la Ingeniería del Software, las pruebas de regresión. Esto es una regresión, un cambio (el SEO) que rompe algo que ya funcionaba (imprimir) en una parte que el cambio ni tocaba. Ningún test imprime, así que nadie lo vio; el "Cómo probarlo" de abajo hace de prueba de regresión a mano.
- Cómo probarlo:
  1. `npm run dev` y guarda dos presupuestos con cliente.
  2. History, marca los dos y pulsa "Customer quote"; luego "Save as PDF". En la vista previa de impresión, debajo de "Quote made with layercents" la hoja sigue blanca hasta abajo. Antes, ahí empezaba el bloque negro.
  3. Lo mismo con "PDF report": blanco hasta el final y las barras de oro siguen saliendo.

### 2026-10-25, CLAUDE.md: cada cambio dice de qué asignatura de la carrera viene
- Archivo y sitio: CLAUDE.md, sección "Regla principal: registro de cambios", en el formato de las entradas.
- Qué cambió: las entradas de este registro tienen una línea nueva, "De la carrera", que dice qué asignatura explica lo que usa el cambio y dónde se ve en el código. Si no hay ninguna, no se pone.
- Por qué: la carrera enseña los conceptos y el proyecto las herramientas, pero nadie une las dos cosas. Con esta línea, cada PR es un ejemplo práctico del temario: la codificación de longitudes de MQTT es de Sistemas digitales, `writeAtomically` es una transacción de Bases de datos, el Ctrl+C del agente es una señal de Sistemas Operativos, y el arreglo pendiente de las impresiones fallidas (base / (1 − p)) es la esperanza de una distribución geométrica de Estadística. Va en CLAUDE.md porque es lo que lee cada sesión nueva de Claude Code; si solo se dijera en una conversación, se perdería.
- Cómo probarlo: no cambia la app. En el próximo PR que toque código, su entrada del DEV_LOG debe llevar la línea "De la carrera".

### 2026-10-25, Pestaña Printers: cada impresora en vivo
- Archivo y sitio:
  - src/agent.js: `fetchPrinters()`, junto a `checkAgent`.
  - src/printerView.js (nuevo): etiquetas, tiempo restante ("1 h 15 min"), porcentaje, color de la insignia y la línea de capa y temperaturas. src/printerView.test.js (nuevo): 4 tests.
  - src/Printers.jsx: componente `PrinterCard` y, dentro de `Printers`, el estado `printers` y un efecto que refresca la lista cada 3 s mientras el agente está conectado. El panel "Your printers" va encima del panel del agente.
  - src/agent.test.js: 2 tests de `fetchPrinters` contra el `handler.js` real del agente.
  - src/index.css, al final de "Impresoras (beta)": `.printers-body` y `.printer-*`.
  - docs/MAPA.md y CLAUDE.md: archivos, flujo y estado de hoy.
- Qué cambió: con el agente conectado, la pestaña Printers enseña cada impresora con su estado (Printing, Idle, Finished…), el nombre del trabajo, una barra de progreso con el %, el tiempo que falta, la capa y las temperaturas. Si la impresora no responde o el código está mal, la tarjeta lo dice con el mensaje del agente. Sin impresoras, explica cómo añadir una.
- Por qué:
  - Refresco cada 3 s con `fetch`, no con WebSocket ni Server-Sent Events: el agente contesta de memoria (no pregunta a la impresora en cada petición), así que es barato, y es el mismo `fetch` que ya usa `checkAgent`, con su timeout y su CORS. Un canal abierto sería más inmediato, pero el progreso de una impresión cambia más o menos una vez por minuto: no compensa la complejidad.
  - Solo pregunta mientras se ve: el efecto se limpia (`clearInterval`) al salir de la pestaña, y cada vuelta se salta si la pestaña del navegador está oculta (`document.visibilityState`). Mantiene la regla del paso 2: nada llama a 127.0.0.1 si nadie está mirando. Comprobado: al salir de la pestaña, cero peticiones.
  - Si `/printers` falla, se vuelve a comprobar el agente con `checkAgent`: así la pantalla pasa a "The agent isn't running" en vez de quedarse con datos viejos.
  - `cancelled` en el efecto: si la respuesta llega después de salir de la pestaña, no se toca el estado de un componente que ya no existe.
  - Las tarjetas no son una "live region": sus números cambian cada pocos segundos y un lector de pantalla no pararía de hablar. La barra sí lleva `role="progressbar"` con su valor, así que se lee bajo demanda.
  - La insignia lleva texto además de color ("Printing", "Offline", "Access code refused"), porque el color solo no lo distingue todo el mundo. Oro mientras trabaja, rojo si falló o el código está mal, gris si no se sabe; nada de verde, por la regla de la marca.
  - La lógica de presentación va en `printerView.js`, sin React, como `calculate()`: se prueba sola y el componente solo pinta.
- Concepto nuevo:
  - Limpieza de un efecto: la función que devuelve `useEffect` se ejecuta cuando el componente desaparece o cuando cambian sus dependencias. Ahí se paran los temporizadores; si no, seguirían vivos llamando al agente aunque ya no se vea la pestaña.
  - `document.visibilityState`: vale `'hidden'` cuando la pestaña del navegador no se ve (otra pestaña delante, el móvil bloqueado).
- Cómo se probó: 84 tests; y en Chromium sobre el build, con el agente real conectado a una impresora de mentira con TLS: la tarjeta pasa de 45 % a 60 % en 3,5 s, enseña "1 h 15 min left" y "Layer 12 of 300 · Nozzle 220 °C · Bed 60 °C", a 1440 y a 390 px; al ir a Calculator no hay más peticiones; al apagar la impresora de mentira, la tarjeta dice "Offline" con el motivo y sin la IP. Y por casualidad salió la prueba del certificado: la impresora de mentira genera uno nuevo cada vez que arranca, así que al reiniciarla la tarjeta dijo "Needs attention" y pidió volver a añadirla, sin mandarle el código. Tras `npm run agent -- add` de nuevo, volvió a conectar.
- Cómo probarlo:
  1. Con tu P1S añadida (`npm run agent -- add`), `npm run agent`.
  2. `npm run dev` y abre `http://localhost:5173/?agent`, pestaña Printers.
  3. Debe salir "P1S" con su estado. Lanza una impresión corta: la barra avanza sola.
  4. Apaga la impresora (o desconéctala de la red): en unos segundos la tarjeta dice "Offline" y que está reintentando. Al encenderla, vuelve sola.

### 2026-10-25, Agente, paso 3: estado en vivo de las Bambu por MQTT
- Archivo y sitio:
  - agent/mqtt.js (nuevo): cliente MQTT 3.1.1 mínimo, sin dependencias.
  - agent/drivers/bambu.js (nuevo): `openPinnedTls`, `createBambuDriver`, `explain`, `printerStatus` y `probeBambu`.
  - agent/config.js (nuevo): la lista de impresoras en `~/.layercents/printers.json`.
  - agent/printers.js (nuevo): un driver por impresora.
  - agent/setup.js (nuevo): `npm run agent -- add`, `list` y `remove`.
  - agent/server.js: distingue arrancar el agente de los comandos de `setup.js`; carga las impresoras, las conecta y las para con Ctrl+C.
  - agent/handler.js: ruta `GET /printers`; `/health` deja de llevar la lista de impresoras; `PROTOCOL` pasa a 2 y `VERSION` a 0.2.0.
  - src/agent.js: `AGENT_PROTOCOL` pasa a 2, para que la web y el agente sigan hablando la misma versión (el test de contrato lo exige).
  - agent/fakeBroker.js (nuevo) y agent/mqtt.test.js, agent/bambu.test.js, agent/config.test.js (nuevos): 32 tests. agent/handler.test.js: 2 más.
  - package.json: `npm test` con `--test-timeout=20000`.
  - docs/MAPA.md: archivos y flujo del agente.
- Qué cambió: el agente se conecta a las impresoras Bambu que se le añadan y mantiene su estado en vivo (imprimiendo o no, progreso, minutos restantes, capa, temperaturas). La web puede leerlo en `http://127.0.0.1:31415/printers`. Las impresoras se añaden con `npm run agent -- add`, que prueba la IP, el código y el número de serie antes de guardar nada. La pantalla de la web llega en el PR siguiente.
- Por qué:
  - **Solo lectura.** Desde 2025 Bambu exige autorización (o LAN only + Developer Mode) para controlar la impresora, pero leer su estado sigue permitido en modo normal (fuentes en docs/IMPRESORAS.md). El agente solo se suscribe y pide `pushall`; nunca manda órdenes. Así funciona sin que la persona pierda Bambu Handy.
  - **Un cliente MQTT propio en vez del paquete `mqtt` de npm.** El paquete trae unas 15 dependencias más a un programa que guarda los códigos de acceso de las impresoras, y en 2025 hubo varios ataques a la cadena de suministro de npm (paquetes populares secuestrados para robar secretos). Necesitamos 7 de los 14 tipos de paquete de MQTT 3.1.1: son unas 200 líneas, con cada byte comprobado en los tests contra la especificación. Lo que se pierde: QoS 2, reconexión automática y TLS ya hechos; lo primero no hace falta y lo demás está en el driver.
  - **El certificado de la impresora, fijado por su huella (como SSH).** Las Bambu presentan un certificado que no firma ninguna autoridad pública, así que la verificación normal de TLS siempre falla. Desactivarla sin más (lo que hacen muchas integraciones) dejaría que cualquiera en la misma red se hiciera pasar por la impresora y se llevara el código de acceso. Al añadir la impresora se guarda la huella SHA-256 de su certificado, y después solo se acepta ese. La comprobación ocurre ANTES de mandar el login MQTT: con un certificado distinto, el código no sale del ordenador (hay un test con TLS de verdad que lo comprueba). Si la huella cambia, el agente para y pide volver a añadirla; no reintenta solo, porque eso sería aceptar el cambio sin que nadie lo vea.
  - **La configuración fuera del proyecto** (`~/.layercents/printers.json`, carpeta 700 y archivo 600). Dentro del proyecto, un código de acceso podría acabar en un commit por error. Se escribe en un archivo temporal y se renombra (`rename` es atómico): si algo falla a medias, no se pierde la lista. Cada campo se valida al cargarla, porque el archivo se puede editar a mano.
  - **Añadir impresoras desde la terminal, no desde la web.** El código de acceso va del teclado al archivo sin pasar por una pestaña del navegador, y el agente no necesita ninguna ruta que cambie cosas (una ruta que escribe es una puerta mucho más grande que una que solo lee). Se pregunta en un prompt y no como argumento porque los argumentos quedan en el historial de la terminal. Antes de guardar se prueba todo (`probeBambu`): IP (responde TLS), código (el login MQTT se acepta) y número de serie (llega un estado por ese tema), y si algo falla se dice cuál.
  - **Actualizaciones parciales.** Las P1 y A1 solo mandan lo que cambia; el driver va fusionando (`{ ...anterior, ...nuevo }`) y pide `pushall` una vez por conexión, porque es pesado para la impresora.
  - **Reconexión con esperas crecientes** (2, 4, 8… hasta 60 s; 60 s si el código está mal): una impresora apagada toda la noche no recibe un intento cada segundo. El keepalive de MQTT (un PINGREQ cada 30 s) detecta una impresora que desaparece sin cerrar la conexión.
  - **Un estado común para todas las marcas** (`printerStatus`): la web no sabe qué marca es cada impresora, y añadir Moonraker o Prusa será añadir un archivo de driver. Nunca incluye la IP, el número de serie ni el código (hay un test).
  - **Los mensajes de error tampoco llevan la IP.** El texto de error de Node incluye la dirección (`connect ECONNREFUSED 192.168.1.50:8883`), así que `explain` usa solo el código del sistema (`ECONNREFUSED`) traducido a palabras ("is it switched on?"). Lo vi en la prueba de la pantalla, al apagar la impresora de mentira, y tiene su test.
  - **`PROTOCOL` 2.** La API cambió (ruta nueva y `/health` sin lista), y el test de contrato exige que web y agente digan el mismo número, así que `AGENT_PROTOCOL` sube en el mismo PR. Un agente viejo con la web nueva sale como "desactualizado" en vez de fallar raro.
  - **`--test-timeout=20000`:** con tests de red, un test que se quedara esperando un evento que nunca llega bloquearía `npm test` para siempre. Así falla a los 20 s con su nombre.
  - **Tests con una impresora de mentira** (`fakeBroker.js`): habla MQTT de verdad por un puerto aleatorio y graba lo que recibe. Los de TLS crean un certificado temporal con `openssl` y se saltan donde no está instalado (Windows, normalmente).
- Concepto nuevo:
  - **TLS y huella de certificado:** TLS cifra la conexión y el servidor enseña un certificado. La huella (`fingerprint256`) es un hash SHA-256 de ese certificado: si cambia un solo bit, cambia la huella. Comparar huellas es como comprobar la matrícula de un coche que ya conoces.
  - **Trust on first use (TOFU):** la primera vez se confía en lo que hay y se recuerda; después solo se acepta lo mismo. Es lo que hace `ssh` con el "The authenticity of host … can't be established".
  - **EventEmitter:** un objeto que avisa de cosas (`session.on('message', fn)`). Ojo: si se emite `'error'` y nadie escucha, Node lanza la excepción y para el programa; por eso todo el que usa `MqttSession` escucha `'error'`.
  - **Framing en TCP:** TCP entrega bytes, no mensajes. Un paquete puede llegar en tres trozos o tres paquetes en uno. `PacketReader` guarda lo que sobra y solo devuelve paquetes completos.
- Cómo se probó: 78 tests (`npm test`), y un recorrido completo con una impresora de mentira escuchando con TLS en 127.0.0.1:8883: `npm run agent -- add` con un código malo (dice que el código está mal y no guarda nada), con el bueno (guarda, carpeta 700 y archivo 600, número de serie en minúsculas y con espacio corregido), `list`, `npm run agent` y `/printers` devolviendo "printing" con el progreso subiendo, sin código ni serie en la respuesta, y Ctrl+C. Falta lo que solo puede hacer Julen: probarlo con su P1S.
- Cómo probarlo (con la P1S):
  1. En la impresora, apunta la IP, el número de serie (Ajustes > Dispositivo) y el código de acceso (Ajustes > WLAN, abajo).
  2. `npm run agent -- add` y contesta. Debe decir "✓ Connected. The printer says: IDLE" (o lo que esté haciendo).
  3. `npm run agent` y abre `http://127.0.0.1:31415/printers` en el navegador: tu P1S con `"connection": "online"`.
  4. Lanza una impresión: `state` pasa a `printing` y `progress` sube. Bambu Handy debe seguir funcionando.
  5. Si algo falla, copia lo que imprime la terminal del agente (no lleva el código).

### 2026-10-25, Guía de conexión de impresoras por marca (docs/IMPRESORAS.md)
- Archivo y sitio:
  - docs/IMPRESORAS.md (nuevo): la investigación completa, con 33 fuentes.
  - CLAUDE.md, sección "Conexión con impresoras": el plan pasa de 7 a 9 pasos y apunta a la guía. En "Pendiente", la prueba con un 3MF de Bambu queda hecha (la hizo Julen el 22 de octubre).
  - docs/MAPA.md: el archivo nuevo en la tabla.
- Qué cambió: hay un documento que explica, marca por marca, cómo se habla con cada impresora (protocolo, puerto, credencial), qué se puede leer sin cambiarle nada a la impresora, si guarda historial, de dónde salen los gramos reales, y en qué orden lo vamos a implementar.
- Por qué:
  - El paso 3 del plan decía "antes de nada, comprobar qué deja leer sin Developer Mode". La respuesta: leer el estado de una Bambu está permitido en todos los firmwares; lo restringido desde 2025 es controlarla. Eso decide el diseño: el agente solo lee, y así funciona con la impresora en modo normal sin quitarle a su dueño la app del móvil.
  - Orden por cuota de mercado y por trabajo: Bambu (la más vendida en 2025 y la de Julen), después Moonraker (un solo driver cubre media docena de marcas y trae el historial hecho), después Prusa (muy común en talleres europeos). Las marcas con protocolos sin documentar, solo cuando alguien que las tenga pueda probarlas.
  - Va en el repositorio y no en un documento aparte porque es la referencia técnica del agente: el código de cada driver la necesita, y cada sesión de Claude Code la encuentra desde CLAUDE.md. No tiene nada privado; el plan de pago, que sí lo es, no va aquí.
- Concepto nuevo: MQTT es el protocolo estándar del IoT industrial y doméstico. Un servidor (broker) recibe mensajes publicados en "temas" (`device/123/report`) y los reparte a quien esté suscrito. Ejemplo: la impresora publica su estado en su tema; el agente se suscribe a ese tema y recibe cada cambio sin tener que preguntar.
- Cómo probarlo: no cambia la app. Léelo en GitHub (se ve con formato) empezando por la tabla "Resumen" y la sección de Bambu.

### 2026-10-25, Copia de seguridad: un solo botón dorado y un texto que se entiende
- Archivo y sitio: src/BackupPanel.jsx, dentro de `BackupPanel`: el texto del panel y la clase del botón "Download backup".
- Qué cambió:
  - El texto decía "Download a backup now and then and keep it somewhere safe", que en inglés se lee a trompicones. Ahora: "Download a backup from time to time and keep it somewhere safe". Además nombra "setup", que va dentro de la copia desde que se guarda "Your setup".
  - Cuando toca hacer copia, el aviso de arriba ya tiene su botón dorado "Download backup". El del panel de abajo pasa a ser gris en ese caso, y sigue dorado cuando no hay aviso.
- Por qué: en el móvil se veían dos botones dorados iguales en la misma pantalla, y dos botones idénticos con el mismo peso visual parecen dos acciones distintas. El dorado es "lo que deberías hacer ahora", y solo debe estar en un sitio. Los dos siguen haciendo lo mismo (`onBackup`). Se usa `status.due`, que el panel ya calculaba con `backupStatus`: es exactamente la condición con la que el aviso aparece, así que no hay dos reglas que puedan contradecirse.
- Cómo probarlo:
  1. `npm run dev` en un navegador sin datos; guarda un presupuesto y abre History.
  2. Arriba sale el aviso con su botón dorado; abajo, en "Backup", el mismo botón es gris y el texto dice "from time to time".
  3. Pulsa cualquiera de los dos: se descarga la copia, el aviso desaparece y el botón de abajo vuelve a ser dorado.

### 2026-10-25, Informe: el mes de la gráfica ya no parece un día
- Archivo y sitio:
  - src/Report.jsx, en "Chart 1: quoted value per month": cada mes guarda `key`, `month` ("Oct"), `year` y si es enero; en el render, el año va debajo del mes en la primera barra y en cada enero.
  - src/index.css, sección de la gráfica de columnas: `.col` con `position: relative`, `.col-label` colgada por debajo del eje con `position: absolute`, `.col-year` y más margen bajo la gráfica.
- Qué cambió: las barras ponían "Oct 26", que se lee como "26 de octubre". Ahora pone "Oct" y debajo "2026" en la primera barra; los meses siguientes solo llevan el mes hasta que cambia el año, y en cada enero vuelve a salir el año.
- Por qué:
  - Formato `{ month: 'short', year: '2-digit' }` daba "Oct 26": ambiguo justo en un informe que se enseña a otros. Con el año entero en cada barra ("Oct 2026") no caben 12 etiquetas en un móvil ni en el ancho de un A4 sin pisarse. Poner el año solo donde empieza es lo que hacen las gráficas de series temporales: se sitúa cada mes sin repetir el año doce veces.
  - La etiqueta pasa a `position: absolute` por debajo del eje. Antes ocupaba sitio dentro de la columna (con un margen negativo que lo compensaba para una sola línea): una etiqueta de dos líneas habría subido su barra unos píxeles respecto a las demás. Comprobado: todas las barras acaban a la misma altura.
  - La `key` de React pasa a ser "2026-10" (año y mes) en vez del texto de la etiqueta: dos barras nunca pueden tener la misma clave, aunque se repita "Oct" en dos años distintos.
- Concepto nuevo: `position: absolute` dentro de un padre con `position: relative` coloca el elemento respecto a ese padre y lo saca del flujo: no empuja a nadie. `top: 100%` lo pone justo debajo del padre, y `left: 50%` con `transform: translateX(-50%)` lo centra.
- Cómo probarlo:
  1. `npm run dev`, guarda presupuestos y ábrelos en History > "PDF report".
  2. Bajo la gráfica: "Oct" y debajo "2026" en la primera barra. Si tienes presupuestos de varios años, "Jan" lleva el año debajo.
  3. Todas las barras arrancan del mismo eje, también en un móvil y al imprimir.

### 2026-10-25, History en el móvil: el importe de cada presupuesto a la vista
- Archivo y sitio:
  - src/History.jsx, en la tabla de cada mes: clase `wide` en las columnas Date, Client, Qty, Cost / part y Price / part (cabecera y celdas), clase `part` en la celda del nombre, y dentro de ella un `<span className="row-sub">` con cantidad, cliente y fecha.
  - src/index.css, junto a `.history-table .actions`: `.row-sub` oculto por defecto y un bloque `@media(max-width:600px)`.
- Qué cambió: en un móvil, cada fila enseña el nombre de la pieza, el importe del pedido y los botones, sin barra horizontal. Debajo del nombre aparece "10 pcs · Marc · 25 Oct 2026". En el ordenador la tabla es la misma de siempre.
- Por qué:
  - Antes, a 390 px solo se veían fecha, pieza y cliente. Los importes quedaban a la derecha, fuera de la pantalla, dentro de un contenedor con desplazamiento horizontal que no se ve. Justo lo que más importa (cuánto cobraste) era lo que no salía.
  - Se esconden columnas con CSS en vez de pintar otra lista para el móvil: el HTML es uno solo, así que los botones, las casillas y la accesibilidad (`aria-label` de cada fila) son los mismos en los dos tamaños, y no hay dos versiones que mantener a la vez.
  - Queda "Order total" y no "Price / part": es lo que vas a cobrar por ese presupuesto. La cantidad aparece en la línea de abajo cuando es más de 1, así se entiende por qué el total es mayor que el precio.
  - El nombre puede partirse en varias líneas (`white-space: normal` en `td.part`), porque la tabla entera hereda `nowrap` para el escritorio.
  - `.filter(Boolean)` quita los trozos vacíos (sin cliente, o 1 pieza), así no salen separadores " · " sueltos.
- Concepto nuevo: `[a, b, c].filter(Boolean).join(' · ')` es una forma corta de unir solo lo que existe. `filter(Boolean)` deja fuera `false`, `''`, `null` y `undefined`; por ejemplo, `[false, 'Marc', '25 Oct'].filter(Boolean)` da `['Marc', '25 Oct']`.
- Cómo probarlo:
  1. `npm run dev`, guarda 3 presupuestos (uno con cliente, uno sin cliente y otro con "Order quantity" 10).
  2. History en modo móvil a 390 y 360 px: cada fila cabe entera, con el importe a la derecha y "10 pcs · Marc · …" bajo el nombre.
  3. En el ordenador (más de 600 px), la tabla tiene todas sus columnas y la línea de abajo no aparece.

### 2026-10-25, Presupuesto en el móvil: la tabla de piezas cabe entera
- Archivo y sitio: src/index.css, sección del presupuesto (`.quote-doc`), dentro de `@media(max-width:700px)`: dos reglas nuevas para `.quote-lines .report-table`.
- Qué cambió: en un móvil, la tabla de piezas del presupuesto ya no se corta. Antes, la columna "Total" salía como "Tota" y los importes como "7.94 EUF", con una barra horizontal escondida. Ahora el nombre de la pieza puede ocupar dos líneas y los márgenes de cada celda son más pequeños.
- Por qué:
  - Es lo que ve un cliente, y se notaba al abrirlo en un móvil. La tabla va dentro de `.table-scroll` (con `overflow-x: auto`): en vez de romperse, se podía desplazar en horizontal, pero nadie lo descubre.
  - La tabla hereda `white-space: nowrap` de `.report-table`, que el informe necesita para sus columnas. Solo en el presupuesto, y solo en la primera columna (el nombre), se vuelve a permitir el salto de línea, con `overflow-wrap: anywhere` para que una palabra muy larga también pueda partirse. Los importes siguen en una línea: un "12.38" partido en dos sería peor.
  - Relleno de 6 px × 4 px en vez de 6 px × 8 px: con 4 columnas son 32 px recuperados, justo lo que faltaba a 360 px.
  - Solo en pantallas de 700 px o menos: el PDF se imprime con el ancho de un A4 (unos 794 px CSS), así que no cambia.
- Cómo probarlo:
  1. `npm run dev` con el navegador en modo móvil a 390 px y a 360 px.
  2. Guarda 3 o 4 presupuestos (uno con un nombre largo), ve a History, marca todos y pulsa "Customer quote".
  3. La tabla del presupuesto se ve entera sin desplazarla: "Total" completo, los importes enteros, y el nombre largo en dos o tres líneas.
  4. "Save as PDF" en un ordenador: el PDF se ve igual que antes.

### 2026-10-23, SEO básico: robots, sitemap, canonical, datos estructurados y contenido sin JavaScript
- Archivo y sitio:
  - index.html, dentro de `<head>`: descripción y título nuevos, `<link rel="canonical">`, `og:type`, etiquetas `twitter:*`, un bloque `application/ld+json` y un `<style>` mínimo. Dentro de `<body>`, el `<div id="root">` ya no está vacío: lleva un `<main>` con el `<h1>` y un párrafo.
  - public/robots.txt (nuevo) y public/sitemap.xml (nuevo): Vite copia `public/` tal cual a la raíz de la web.
  - docs/MAPA.md: fila de `public/` y de `index.html`.
- Qué cambió: la web dice a los buscadores quién es y qué páginas tiene, y su HTML ya contiene texto. Cuando React arranca, sustituye ese texto por la aplicación, y no se nota el cambio.
- Por qué:
  - La web es una SPA: antes, el HTML que descargaba Google era un `<div id="root">` vacío, y todo el texto aparecía al ejecutar JavaScript. Google ejecuta JS, pero en una segunda pasada, más lenta y menos fiable, y otros buscadores y los generadores de vista previa a veces no. Poner el `<h1>` y una descripción real dentro de `#root` da a cualquiera que lea el HTML sin ejecutar nada el contenido esencial. React reemplaza todo el contenido de `#root` al montar (`createRoot(...).render`), así que no hay texto duplicado: comprobado, solo queda un `<h1>`.
  - Título (51 caracteres) y descripción (151) dentro de lo que Google suele mostrar entero (unos 60 y 160), con las palabras que la gente busca ("3D print cost calculator", "quote") en lugar de solo la marca.
  - `canonical`: `layercents.com`, `www.layercents.com` y cualquier dirección con parámetros enseñan la misma página. Sin canonical, Google puede tratarlas como páginas distintas que compiten entre sí.
  - `robots.txt` deja pasar a todos y apunta al sitemap. `sitemap.xml` tiene una sola dirección ahora; cada guía futura añade la suya.
  - JSON-LD de tipo `WebApplication` (schema.org): es la forma estándar de decir "esto es una herramienta web gratuita". Solo lleva hechos verdaderos hoy: no hay valoraciones ni reseñas inventadas, que Google penaliza. Descartado `FAQPage`: desde 2023 Google solo enseña esos resultados para webs de salud y de administraciones.
  - El `<style>` mínimo evita un fogonazo blanco antes de que cargue `index.css`, ahora que hay texto visible en el HTML.
  - No hay lógica, `localStorage` ni `backup.js` tocados.
- Concepto nuevo:
  - Renderizado en cliente (CSR) contra HTML con contenido: en una SPA todo lo que ves lo pinta JavaScript; un buscador ve primero el HTML crudo. Lo que se pone dentro de `#root` en `index.html` se ve antes de que cargue el JS, y React lo reemplaza al arrancar.
  - JSON-LD: JSON dentro de `<script type="application/ld+json">` que los buscadores leen como datos, sin que se vea en la página.
- Cómo probarlo:
  1. `npm run build` y `npm run preview`; abre `/robots.txt` y `/sitemap.xml`: se ven los textos.
  2. En las herramientas de desarrollador, desactiva JavaScript y recarga: sale el título y el párrafo. Actívalo: sale la calculadora.
  3. Pega la dirección en la prueba de resultados enriquecidos de Google (search.google.com/test/rich-results) tras desplegar: debe detectar un `WebApplication`.
  4. Search Console: añade la propiedad de dominio, envía `https://layercents.com/sitemap.xml` y en "Inspección de URLs" pide indexar la portada.

### 2026-10-22, Casillas de números sin flechitas pegadas al valor
- Archivo y sitio: src/index.css, en la sección "Formulario" (después de `.field input`, justo antes de `.field input:hover`): reglas para ocultar los botones de subir y bajar, y el relleno horizontal de 9 a 11 px.
- Qué cambió: las casillas numéricas de la calculadora ya no enseñan las flechitas de subir y bajar, y el número queda con más aire a la derecha.
- Por qué:
  - Las flechas (`<input type="number">` las dibuja el navegador al pasar el ratón) se pintan dentro de la casilla y se comían el relleno: el número quedaba pegado a ellas. Se vio en producción, en un Mac.
  - Casi todos los campos llevan decimales (0.15 €/kWh, 3.5 h, 0.8 €), y el paso por defecto de un `type="number"` es 1, así que las flechas dan saltos que nadie quiere. Ocultarlas no quita nada útil.
  - Se mantiene el tipo `number` (en el móvil sale el teclado numérico, y el valor llega como número), y las teclas arriba y abajo siguen subiendo y bajando el valor. Comprobado. Alternativa descartada: dejar las flechas y subir el relleno derecho, que deja un hueco vacío a la derecha cuando no se ven.
  - Dos reglas porque cada motor usa la suya: `::-webkit-*-spin-button` (Chrome, Safari y Edge) y `-moz-appearance: textfield` (Firefox). `appearance: textfield` es la forma estándar.
  - Solo afecta a `.field input`, o sea la calculadora. No toca lógica, `localStorage` ni `backup.js`.
- Concepto nuevo: pseudo-elementos de proveedor. `input::-webkit-inner-spin-button` apunta a una pieza interna que el navegador pinta dentro de la casilla; no es un elemento del HTML, y por eso solo se puede cambiar con CSS, y con el prefijo del motor.
- Cómo probarlo:
  1. `npm run dev`, abre la calculadora y pasa el ratón por encima de "Part weight": no aparecen flechas.
  2. Haz clic en la casilla y pulsa la flecha arriba del teclado: el valor sube de 1 en 1.
  3. Escribe 0.15 en "Price per kWh": se acepta con decimales.
  4. Comprueba que el número no queda pegado al borde derecho de la casilla.

### 2026-10-22, Barra de precio fija en el móvil: el precio primero
- Archivo y sitio:
  - src/App.jsx, al final del render de la calculadora: el bloque `mobile-total` (la barra fija de abajo). Cambia el orden y los textos.
  - src/index.css, sección "Barra fija abajo en el movil": el precio, más grande y en oro.
- Qué cambió: en el móvil, la barra de abajo empieza por "Recommended price" (grande y en oro), después "Cost", y el botón pasa de "Breakdown" a "See details". Los demás comportamientos de la barra no cambian.
- Por qué:
  - Va con el PR del precio protagonista: en el móvil el resultado sigue estando debajo de todos los campos, y la barra es lo único que enseña la respuesta mientras escribes. Que coincida con la jerarquía de escritorio (precio primero, coste segundo) evita que la persona lea una cosa en el móvil y otra en el ordenador.
  - "See details" en lugar de "Breakdown": el panel al que lleva ya no empieza por el desglose sino por el precio con su explicación, y "Breakdown" ya no es el título de ninguna sección.
  - La barra sigue escondiéndose cuando el panel del resultado entra en pantalla (`IntersectionObserver` sobre `.result`), para no enseñar el precio dos veces. No hizo falta tocar esa lógica: `.result` sigue siendo la columna entera.
  - Alternativa descartada: una tercera cifra (beneficio) en la barra. En 360 px no cabe sin partir líneas, y la barra se come la pantalla.
  - Sin cambios en lógica, `localStorage` ni `backup.js`.
- Concepto nuevo: `position: fixed` con `env(safe-area-inset-bottom)`: la barra se pega al borde de la ventana y el padding inferior respeta la franja de gestos de iPhone y Android, para que el botón no quede bajo ella (ya estaba así; solo se cambia el contenido).
- Cómo probarlo:
  1. `npm run build` y `npm run dev`; abre la web con el modo móvil del navegador a 390 px (y a 360 px).
  2. Arriba de todo, la barra de abajo enseña "Recommended price 7.94 EUR" en grande, "Cost 5.22 EUR" y "See details".
  3. Pulsa "See details": baja hasta el precio y la barra se esconde.
  4. Baja hasta el final: el pie de página no queda tapado y no hay desplazamiento horizontal.
  5. A 360 px los tres elementos de la barra caben en una línea.

### 2026-10-22, "Your setup": lo que se escribe una vez se queda guardado
- Archivo y sitio:
  - src/backup.js: `KEYS.setup`, `sanitizeSetup`, `readSetup`, `saveSetupField`, `clearSetup`; `setup` en `buildBackup`, `parseBackup`, `planRestore` (con `mergeSetup`), `readSettings`, `hasStoredSettings`, `applyRestore` y `downloadBackup`.
  - src/backup.test.js (nuevo): 16 tests.
  - src/BackupPanel.jsx: una línea más en el resumen de la restauración ("Your setup") y el texto "saved settings".
  - src/App.jsx: `SECTIONS` reagrupado (Material, This print, This sale y las dos de "Your setup" con `setup: true`), `SETUP_FIELDS`, `pickSetup`, el estado `d` con inicializador perezoso, `hasSavedSetup`, `setupOpen`, `set` ahora guarda, `resetSetup`, `renderField`, `restoreBackup` actualiza `d`, y el bloque de formulario del render.
  - src/index.css: `.setup-*`; se quita `.toolbar`.
  - docs/MAPA.md y CLAUDE.md: clave nueva, flujo y estado.
- Qué cambió: los números que se escriben una sola vez (precio, vida y consumo de la impresora, luz, fallos, tu tarifa por hora, comisión y margen) están en un bloque "Your setup" que el navegador recuerda campo a campo. Una vez guardado, el bloque aparece plegado con un resumen y botón "Edit"; "Reset to defaults" lo borra. Va también en la copia de seguridad. El botón "Show cost only" desaparece: plegar el bloque hace lo mismo con más sentido.
- Por qué:
  - Qué es "setup" lo decide `SECTIONS` (`setup: true`) y `backup.js` solo valida que sean números no negativos (`sanitizeSetup`): así no hay una segunda lista de nombres que se desincronice del formulario. `App` descarta los nombres que no conoce (`pickSetup`).
  - Se guarda desde el manejador `set`, no desde un `useEffect` sobre `d`: "Load" de un presupuesto viejo y la importación de un laminador llaman a `setD` directamente, así que nunca pisan lo guardado con números antiguos. Con un efecto sobre `d`, cargar un presupuesto de hace un mes sobrescribiría tu configuración actual.
  - Se guarda solo el campo editado, fusionado con lo que ya había (`{ ...guardado, [key]: value }`): un campo que nunca se tocó sigue los valores por defecto de la app, y si algún día cambia un valor por defecto, no se queda fijado un número que la persona nunca escribió.
  - `Field` entrega `0` cuando se vacía el campo (ya era así), por lo que siempre llega un número finito; `saveSetupField` igualmente rechaza negativos y no finitos.
  - Copia de seguridad: `data.setup` es un campo opcional nuevo y por eso `BACKUP_SCHEMA_VERSION` sigue en 1 (el propio backup.js dice que añadir una clave opcional no la sube, porque `parseBackup` ignora lo que no conoce). Un test fija el caso de un archivo v1 de la versión anterior: se restaura con `setup` a `null`.
  - Merge y Replace: Merge rellena, nunca pisa (como `mergeBusiness`). Replace usa el `setup` del archivo, pero si el archivo no tiene (uno anterior a esta función) conserva el de aquí: Replace significa "que este navegador quede como el archivo", y un archivo que no habla de la configuración no debe borrarla.
  - `applyRestore` devuelve `setup` y `restoreBackup` lo vuelca en `d`: el formulario guarda sus números en estado, así que sin eso la restauración solo se vería al recargar.
  - `readSetup`, `saveSetupField` y `clearSetup` buscan `localStorage` dentro de su `try`: con almacenamiento bloqueado, solo leer `window.localStorage` ya lanza una excepción, y como valor por defecto de un parámetro se evaluaría fuera de cualquier `try`. Si falla, la calculadora funciona igual y el número simplemente no se recuerda.
  - Se quita "Show cost only" (escondía las secciones Labor y Selling, aunque seguían contando en el precio). Reorganizar el formulario por "esta pieza" y "tu configuración", con la segunda plegable, resuelve lo mismo sin un botón que nadie entiende. Es un cambio de producto: se puede recuperar si prefieres tenerlo.
  - Alternativa descartada: guardar todo el formulario entre visitas. Los datos de una pieza (gramos, horas) son de esa pieza, y recordar los del último trabajo es más molesto que útil.
- Concepto nuevo:
  - Inicializador perezoso de `useState`: `useState(() => ({ ...INITIAL, ...pickSetup(readSetup()) }))` ejecuta la función una sola vez, en el primer render, en lugar de leer `localStorage` en cada render.
  - Parámetro por defecto que lanza: `function f(x = algo())` evalúa `algo()` en la llamada, antes de entrar en el cuerpo; un `try` dentro de la función no lo cubre. Por eso `storage ?? browserStorage()` va dentro del `try`.
  - `Array.prototype.some`: `[a, b, c].some(key => storage.getItem(key) !== null)` es `true` en cuanto uno cumple, y deja de mirar.
- Cómo probarlo:
  1. `npm test` (44 tests, 16 nuevos) y `npm run build`.
  2. `npm run dev`. Primera visita: "Your setup" aparece abierto. Cambia "Power draw" a 300 y "Hourly rate" a 30: cambia el precio.
  3. Recarga: el bloque sale plegado con "Power draw 300 W" y el precio es el mismo. En DevTools, Application > Local Storage, la clave `setup` vale `{"watts":300,"hourlyRate":30}`: solo lo editado.
  4. Guarda un presupuesto, cambia "Power draw" a 50, ve a History y pulsa "Load": el formulario muestra los números del presupuesto (300) pero `setup` sigue en 50.
  5. History > "Download backup": el JSON lleva `data.setup` y `schemaVersion` sigue siendo 1.
  6. En una ventana de incógnito: History > Restore from file con ese archivo > Merge. En Calculator, "Edit" enseña los números del archivo sin recargar.
  7. Restaura un archivo antiguo (de antes de este PR) con Replace: tu "Your setup" no se borra.
  8. "Reset to defaults": vuelve 110 W y el precio original; la clave `setup` desaparece.

### 2026-10-22, El precio recomendado pasa a ser lo primero que se ve
- Archivo y sitio:
  - src/App.jsx, dentro de `calculate`: nuevo campo `recommendedProfit` en lo que devuelve (la fórmula del coste y del precio no cambia).
  - src/App.jsx, dentro de la función App: `moneyParts` junto a `formatMoney` (que ahora se apoya en ella), y `price` justo después de `const r = calculate(d)`.
  - src/App.jsx, bloque `{/* --- Result --- */}`: ahora son cuatro paneles (precio grande, "Cost to make it" con el símbolo, veredicto con el beneficio por hora, y "Save this quote"). El formulario de guardar, que estaba arriba del todo, se mueve al final de esa columna.
  - src/index.css, sección "Resultado": `.hero*`, `.panel > h2.with-value`, y `.result` deja de ser `sticky` en pantallas de menos de 880 px de alto.
  - docs/MAPA.md: dónde tocar el resultado.
- Qué cambió: el precio recomendado es ahora un número grande en oro, con "You keep X per part after fees" debajo. Después viene el coste con su gráfica, luego qué pasa a tu precio actual (con el beneficio por hora) y al final el formulario de guardar.
- Por qué:
  - El precio es la respuesta que busca la persona; antes el protagonista era el coste, y el precio era una fila más.
  - "Profit per printer hour" estaba pegado al precio recomendado, pero se calcula con tu precio ACTUAL (`profit / hours`). Parecía el beneficio del precio de arriba y no lo era. Pasa al panel del veredicto, que habla del precio actual.
  - `recommendedProfit = recommendedPrice × (1 − f) − cost`, con la misma `f` (comisión ya acotada) que usa el precio: así "You keep" es coherente con la fórmula del precio, y por álgebra sale igual a `cost × margen`. Alternativa descartada: calcularlo en el JSX, que duplicaría la comisión y su acotado (`Math.min`/`Math.max`) en dos sitios.
  - `moneyParts` devuelve entero, céntimos y moneda por separado para poder pintar los céntimos más pequeños. `formatMoney` se construye encima, así que sigue habiendo un único sitio que decide cómo se escribe el dinero y el resto de la web no cambia (se sigue viendo `7.94 EUR`). Alternativa descartada por ahora: pasar a `Intl.NumberFormat` con el símbolo (`7,94 €`); cambiaría el texto de History, informe y presupuestos y es un cambio aparte.
  - Guardar va después del resultado: guardas lo que acabas de ver. En escritorio la columna es `sticky`, pero con todo lo anterior mide unos 820 px; en una pantalla baja (menos de 880 px) se quedaría pegada tapando el botón de guardar, así que ahí se desplaza con la página.
  - No se toca localStorage ni backup.js: el presupuesto guardado es exactamente el mismo (nombre, cliente, entradas, partes, coste, precio).
- Concepto nuevo:
  - `String.prototype.split` con desestructuración: `const [whole, cents] = '7.94'.split('.')` da `whole = '7'` y `cents = '94'` en una línea.
  - `@media (max-height: …)`: igual que `max-width`, pero mira el alto de la ventana; sirve para decidir el diseño según cuánto cabe en vertical.
- Cómo probarlo:
  1. `npm test` y `npm run build`.
  2. `npm run dev`. En Calculator, arriba a la derecha: "Recommended price" 7.94 EUR en grande y "You keep 2.09 EUR per part after fees".
  3. Cambia "Target margin" a 60: el precio sube y "You keep" sube; si lo pones a 0, "You keep" es 0.00 EUR.
  4. Pon "Order quantity" a 10: debajo del precio sale "Order total (10 pcs)".
  5. Escribe un nombre y pulsa "Save quote" (ahora está al final de la columna de la derecha): sale "Saved … · View history" y el presupuesto aparece en History igual que antes.
  6. Con la ventana de menos de 880 px de alto, la columna ya no se queda pegada: baja con la página y se llega al botón.
  7. En 390 px de ancho: el precio no se corta y el resto de la pantalla sigue igual.

### 2026-10-22, La gráfica de costes pasa a ser el símbolo de layercents
- Archivo y sitio:
  - src/logoGeometry.js (nuevo): las coordenadas de las capas del logo (`FULL`, `SMALL`) y su altura. Antes estaban dentro de Logo.jsx.
  - src/symbolChart.js (nuevo): `printOrder` y `symbolPieces`, funciones puras que reparten los costes sobre las capas.
  - src/symbolChart.test.js (nuevo): 11 tests.
  - src/CostSymbol.jsx (nuevo): el componente SVG.
  - src/Logo.jsx: ahora importa la geometría de logoGeometry.js (mismo dibujo).
  - src/App.jsx: import de `CostSymbol`; en `LAYERS` los dos grises se aclaran; en el panel "Breakdown", `<CostSymbol>` sustituye al pilar vertical `.stack`.
  - src/index.css, sección "Resultado": se quitan `.stack` y `.layer`; entran `.cost-symbol`, `.cost-symbol-empty` y `.cost-symbol-piece`; el importe de la leyenda no parte línea.
  - docs/MAPA.md: archivos nuevos y dónde tocar.
- Qué cambió: la gráfica de "Breakdown" ya no es una barra vertical, sino el símbolo ¢ "impreso" con los costes: el material llena las capas de abajo y el embalaje las de arriba, cada coste con su color. Al cambiar un número, las fronteras entre colores se deslizan.
- Por qué:
  - Reparto por longitud: las 11 capas miden lo mismo de alto, así que su largo total (215,08 unidades) es proporcional a su superficie. A cada coste le toca `(coste / total) × 215,08`, y se recorre capa a capa, la de abajo primero y de izquierda a derecha. Es el mismo reparto que una barra apilada, pero desenrollado sobre el símbolo.
  - Función pura aparte (`symbolChart.js`) y componente que solo pinta: es la única parte que puede mentir (si falla una cuenta, la gráfica enseña un reparto falso sin que nada se rompa). Por eso tiene tests: proporciones, que llene el símbolo sin dejar una línea vacía al final, el orden, el hueco entre colores y entradas raras (NaN de un campo vacío, negativos, todo a 0).
  - Una capa compartida por dos costes: se dibuja la barra redondeada como `clipPath` y encima rectángulos de color. Así los extremos siguen redondos y el corte entre colores es recto. Alternativa descartada: calcular el contorno de cada trozo (arco más recta), mucho más código para el mismo resultado.
  - Siempre 6 rectángulos por capa, aunque midan 0: React mueve el mismo elemento en lugar de crear y destruir elementos, y eso es lo que permite que CSS anime `x` y `width` (sin elemento estable no hay transición). Con `prefers-reduced-motion` no se anima.
  - Hueco de 0,6 entre dos colores de una misma capa, quitado a los trozos (no pintado con el color del panel): no depende del fondo. Los extremos de la capa no se recortan.
  - `logoGeometry.js` aparte: el logo y la gráfica necesitan las mismas coordenadas, y con dos copias, cambiar el logo rompería la gráfica sin avisar.
  - `useId` para los `clipPath`: si hay dos símbolos en la misma página, un `id` repetido haría que `url(#id)` cogiera el recorte equivocado.
  - Accesibilidad: el SVG lleva `role="img"` y un `aria-label` con los importes, y la leyenda con las cifras exactas sigue visible. Los colores solos no dicen nada a quien no los ve.
  - Los grises de mano de obra y embalaje se aclaran (`#7E7E8C`→`#A3A3B1`, `#4E4E58`→`#6C6C7A`): el embalaje es la capa de arriba y con el gris oscuro se perdía sobre el panel, y el símbolo perdía la forma.
  - Límite que hay que conocer: un coste muy pequeño (la luz, un 1 %) se queda en una rayita. Por eso la leyenda lleva el importe exacto: el símbolo dice qué domina; la leyenda, cuánto.
  - No se toca `calculate()` ni se guarda nada nuevo: no hay claves de localStorage ni cambios en backup.js.
- Concepto nuevo:
  - `clipPath` (SVG): recorta lo que se dibuja dentro de él a una forma. `<clipPath id="a"><rect .../></clipPath>` y luego `<g clip-path="url(#a)">` pinta solo lo que cae dentro del rectángulo.
  - Transición CSS sobre atributos SVG: en un `<rect>`, `x` y `width` son propiedades CSS en los navegadores modernos, así que `transition: x .35s, width .35s` las anima. Si un navegador no lo soporta, simplemente salta, sin romperse.
  - Ordenar una copia: `[...layers].sort(...)` ordena sin cambiar el array original (`sort` modifica el array sobre el que se llama).
- Cómo probarlo:
  1. `npm test` (28 tests, 11 nuevos) y `npm run build`.
  2. `npm run dev`. En Calculator, el panel "Breakdown" muestra el símbolo: abajo oro (material) y arriba gris (embalaje).
  3. Cambia "Print time" a 30: la depreciación (azul) crece y las fronteras se deslizan. Pon "Part weight" a 0: el oro casi desaparece.
  4. Vacía algún campo: no debe salir ningún error ni un trozo raro.
  5. En el móvil (o con el navegador a 390 px), la leyenda no parte "0.80 EUR" en dos líneas.
  6. Con "reducir movimiento" activado en el sistema, las fronteras saltan sin deslizar.

### 2026-10-22, Agente local, paso 2: la web detecta el agente (pestaña Printers, opt-in)
- Archivo y sitio:
  - src/agent.js (nuevo): `checkAgent`, `isAgentEnabled`, `setAgentEnabled` y `consumeAgentOptIn`, más las constantes `AGENT_URL` y `AGENT_PROTOCOL`.
  - src/agent.test.js (nuevo): 8 tests, entre ellos los de contrato contra el código real de agent/handler.js.
  - src/Printers.jsx (nuevo): la pantalla, con cinco estados (comprobando, conectado, desactualizado, otro programa en el puerto y apagado), "Check again" y "Hide this tab".
  - src/main.jsx: lee y quita `?agent` antes de arrancar React y pasa `agentOptIn` a App.
  - src/App.jsx: imports; la prop `agentOptIn`; `view` puede empezar en `'printers'`; estado `agentOn` y `turnOffAgent` junto a `view`; la pestaña Printers; History se marca activa solo en sus pantallas (`history`, `report`, `quote`); la rama `view === 'printers'` del render.
  - src/backup.js: `KEYS.agentEnabled`, por dispositivo y fuera de las copias.
  - src/index.css, al final: sección "Impresoras (beta)".
  - docs/MAPA.md y CLAUDE.md: archivos, clave nueva, flujo y estado.
- Qué cambió: `layercents.com/?agent` activa en ese navegador una pestaña Printers que dice si el agente está corriendo, con su versión y desde cuándo. Si no lo está, explica cómo arrancarlo. Para quien no la activa, la web es exactamente igual que antes.
- Por qué:
  - Opt-in y no detección automática: desde una web pública, una petición a 127.0.0.1 hace que Chrome pida permiso para acceder a apps y servicios del dispositivo (Local Network Access, la evolución de Private Network Access). Sondear en cada visita le enseñaría ese aviso a todo el mundo, y casi nadie tiene el agente. Además el agente aún no se puede instalar sin Node, así que la pestaña no se anuncia: se llega por enlace.
  - `?agent` se lee en main.jsx y no en un inicializador de `useState`: cambia la URL y el almacenamiento, y StrictMode llama dos veces a los inicializadores en desarrollo; la segunda llamada ya no vería el parámetro. Después se borra con `history.replaceState`, para que un enlace copiado de la página no active la pestaña a quien lo reciba.
  - `checkAgent` nunca lanza y separa cuatro casos. `offline` agrupa puerto cerrado, timeout, CORS rechazado y permiso denegado, porque desde el código de la página todos son el mismo `TypeError` de `fetch`. `wrong` comprueba el nombre `layercents-agent` para no confundir el agente con otro programa en el 31415. `outdated` compara `protocol`.
  - Timeout de 2 s con `AbortSignal.timeout`: un servidor local responde en milisegundos, pero si un firewall descarta el paquete en vez de rechazarlo, el navegador esperaría alrededor de un minuto.
  - En Printers, comprobación al abrir y con un botón, no con temporizador: sondear sin que nadie mire es tráfico inútil a 127.0.0.1. Un contador en `useRef` hace que gane la última comprobación si dos se solapan (doble clic, o el doble efecto de StrictMode en desarrollo).
  - El `setState` de "comprobando" está en el manejador del botón y no dentro del efecto: oxlint (`set-state-in-effect`) avisa porque un `setState` síncrono dentro de un efecto provoca un render extra. Al abrir, el estado ya empieza en `checking`.
  - Tests de contrato: `checkAgent` se prueba contra el handler real del agente en un puerto aleatorio, y hay un test que exige que `AGENT_PROTOCOL` y `PROTOCOL` coincidan. Si un lado cambia el contrato sin el otro, `npm test` falla antes de llegar al navegador.
- Concepto nuevo:
  - `history.replaceState(state, '', url)`: cambia la dirección de la barra sin recargar ni añadir un paso al botón Atrás.
  - `AbortSignal.timeout(ms)`: una señal que cancela el `fetch` sola al pasar ese tiempo, sin tener que crear un `AbortController` a mano.
  - `useCallback(fn, [])`: devuelve la misma función en cada render, así un efecto que depende de ella no se repite en cada render.
- Cómo se probó: los 17 tests de `npm test` (9 del agente y 8 de la web) y un recorrido en Chromium sobre el build de producción con el agente real. Comprobado: una visita normal no hace ninguna petición al agente; `?agent` abre Printers, borra el parámetro y sale "Agent connected"; al recargar la pestaña sigue; con el agente parado salen los pasos y "Check again" vuelve a conectar al arrancarlo; "Hide this tab" la quita, borra la clave y no hay más peticiones; en un móvil de 390 px caben las tres pestañas. También se repitió el recorrido de la copia de seguridad, sin cambios. Falta probar en Safari y en la web publicada, que es https: Chrome puede pedir el permiso.
- Cómo probarlo:
  1. Terminal 1: `npm run agent`. Terminal 2: `npm run dev`.
  2. Abre `http://localhost:5173/?agent`: sale Printers con "Agent connected" y la dirección queda sin `?agent`.
  3. Para el agente con Ctrl+C y pulsa "Check again": salen los pasos para arrancarlo.
  4. "Hide this tab": la pestaña desaparece y, en las herramientas del navegador (pestaña Network), no hay más peticiones a 127.0.0.1.

### 2026-10-22, Agente local, paso 1: servidor HTTP en 127.0.0.1
- Archivo y sitio:
  - agent/handler.js (nuevo): `createHandler`, que decide la respuesta a cada petición, y las constantes `PROTOCOL`, `VERSION` y `ALLOWED_ORIGINS`.
  - agent/server.js (nuevo): arranque, puerto, mensaje si el puerto está ocupado y parada limpia con Ctrl+C.
  - agent/handler.test.js (nuevo): 9 tests con `node:test`.
  - package.json: scripts `agent` (`node agent/server.js`) y `test` (`node --test`).
  - docs/MAPA.md: el agente en la tabla de archivos, una sección propia y los comandos nuevos.
  - CLAUDE.md: la excepción del agente a la regla "sin backend", el estado y el plan de la conexión con impresoras paso a paso.
- Qué cambió: `npm run agent` arranca un servidor HTTP en `http://127.0.0.1:31415` que, por ahora, solo responde a `/health` con nombre, versión, protocolo, hora de arranque y una lista de impresoras vacía.
- Por qué:
  - Las impresoras hablan MQTT sobre TLS y FTPS. El navegador solo habla MQTT por WebSocket y no puede llamar desde una página `https` a una dirección `http` de la red local (mixed content y restricciones de red privada). Hace falta un proceso local que haga de puente. Es el patrón edge → central: el agente cerca de las máquinas y la web consumiendo sus datos.
  - Node y no Python: un solo lenguaje en todo el proyecto, y en el paso 5 el agente reutilizará `parseSliceInfo` de src/slicerFile.js en vez de reescribir el parser del 3MF. Sin dependencias en este paso: `node:http`, `node:test` y `node:assert` vienen con Node.
  - Sin package.json propio en agent/: la raíz ya declara `"type": "module"` y comparte `node_modules`. Descartado por ahora un paquete separado; tendrá sentido cuando haya que empaquetar el agente para gente sin Node instalado.
  - `127.0.0.1` y no `0.0.0.0`: con todas las interfaces, cualquiera en la misma Wi-Fi podría leerlo, y más adelante guardará los códigos de acceso de las impresoras.
  - Comprobación del `Host`: defensa contra DNS rebinding. Una web maliciosa puede hacer que su dominio resuelva a 127.0.0.1; entonces el navegador considera el agente parte de ese mismo origen y CORS ya no protege. Esas peticiones siguen llevando el dominio del atacante en `Host`, y por eso se rechazan con 403.
  - `Origin` desconocido rechazado en el servidor, no solo con CORS: CORS impide que la página lea la respuesta, pero la petición se ejecuta igual. Hoy da igual porque `/health` solo lee; los endpoints futuros harán más.
  - Preflight con `Access-Control-Allow-Private-Network: true`: es lo que pide la Private Network Access de Chrome cuando una página pública llama a una dirección local. Solo se envía si el navegador lo pregunta.
  - `PROTOCOL` en `/health`: la web se actualiza en cada despliegue, pero el agente de cada persona no. Con ese número, la web podrá decir "actualiza el agente" en vez de fallar sin explicación.
  - Puerto fijo 31415: la web necesita saber dónde buscar. Está por debajo de 32768, fuera de los rangos de puertos efímeros de Linux, macOS y Windows, así que ninguna conexión saliente lo ocupará por casualidad.
  - `handler.js` no abre puertos, solo responde: así los tests usan el mismo código en un puerto aleatorio (el 0 le pide uno libre al sistema) sin chocar con un agente real.
- Concepto nuevo:
  - CORS: el navegador deja que una página lea la respuesta de otro origen solo si esa respuesta trae `Access-Control-Allow-Origin` con su origen. Lo aplica el navegador, no el servidor: curl lo ignora.
  - Preflight: antes de ciertas peticiones entre orígenes, el navegador envía un `OPTIONS` preguntando si puede hacerla, y solo sigue si la respuesta lo permite.
  - `node:test`: el test runner que trae Node. `npm test` ejecuta `node --test`, que busca los archivos `*.test.js` del proyecto.
- Cómo probarlo:
  1. `npm run agent`: sale "layercents agent 0.1.0 listening on http://127.0.0.1:31415".
  2. Abre `http://127.0.0.1:31415/health` en el navegador: sale el JSON.
  3. En otra terminal, `curl -i -H "Origin: https://evil.example" http://127.0.0.1:31415/health` devuelve 403.
  4. Con el agente en marcha, `npm run agent` en otra terminal dice que el puerto ya está en uso.
  5. `npm test`: 9 tests en verde.

### 2026-10-22, Mapa del código (docs/MAPA.md)
- Archivo y sitio: docs/MAPA.md (nuevo). En CLAUDE.md, la regla de mantenerlo al día y una línea en el estado.
- Qué cambió: un documento para orientarse antes de leer el código: arquitectura, orden de lectura, qué hace cada archivo, diagrama del flujo de datos, monedas, claves de localStorage con quién las lee y las escribe, la forma de un presupuesto guardado, las fórmulas de `calculate`, los patrones que se repiten y dónde tocar para cada cambio.
- Por qué: con unas 2.900 líneas que Julen no ha escrito, leer archivo por archivo sin un mapa obliga a reconstruir la arquitectura en la cabeza cada vez. El DEV_LOG cuenta la historia en orden cronológico; el mapa cuenta cómo está hecho ahora. Va dentro del repo, y no en notas aparte, para que cambie junto con el código: CLAUDE.md obliga a actualizarlo. No se usan números de línea porque cambian en cada PR: se citan funciones y secciones.
- Dos cosas encontradas al hacerlo, que no se tocan en este PR:
  - `failures` usa `base × p`, cuando el coste esperado con una tasa de fallos `p` es `base / (1 − p)`. Con el 8 % casi no cambia; con el 30 % sí. Está explicado en el mapa.
  - `src/assets/` y `public/icons.svg` son restos de la plantilla de Vite que nada usa.
- Cómo probarlo: abre docs/MAPA.md en GitHub (pinta las tablas y el diagrama) y sigue el "Orden recomendado de lectura". La app no cambia: `npm run build` funciona igual.

### 2026-10-22, CLAUDE.md: explicaciones a nivel de ingeniero y trabajo por pull request
- Archivo y sitio: CLAUDE.md, en "Sobre el dueño", en el formato de este registro ("Por qué") y en "Reglas de trabajo".
- Qué cambió: las explicaciones pasan a nivel de ingeniero (término técnico y porqué de cada decisión) y el flujo de trabajo queda por escrito: rama `feature/...` y pull request contra `main`. Push a `main` y `npm run deploy` siguen siendo solo de Julen.
- Por qué: Julen lo quiere así, y el archivo seguía diciendo "lenguaje de principiante" y "no hagas git push". Cada sesión nueva de Claude Code empieza leyendo CLAUDE.md, así que habría vuelto al estilo anterior. Va en un commit aparte para poder revertirlo sin tocar la copia de seguridad.
- Cómo probarlo: no cambia la app; `npm run build` sigue funcionando.

### 2026-10-22, Copia de seguridad: descargar y restaurar todo en un JSON versionado
- Archivo y sitio:
  - src/backup.js (nuevo): toda la lógica. Arriba, funciones puras sin DOM ni localStorage (`buildBackup`, `parseBackup`, `sanitizeQuote`, `sanitizeBusiness`, `mergeQuotes`, `planRestore`, `backupStatus`); abajo, la capa de almacenamiento (`readSettings`, `readLastBackup`, `writeAtomically`, `applyRestore`, `downloadBackup`, `readBackupFile`), que recibe `storage` como parámetro.
  - src/BackupPanel.jsx (nuevo): `BackupPanel` (panel al final de History: descargar, restaurar y caja de confirmación) y `BackupReminder` (aviso encima de History).
  - src/App.jsx: imports; dentro de App, justo después de `deleteQuote`, el estado `lastBackupAt`, las funciones `backupNow` y `restoreBackup` y `backupDue`; el punto en la pestaña History; en la vista `history`, `<BackupReminder>` encima de `<History>` y `<BackupPanel>` debajo. En `saveQuote`, un comentario que remite a `sanitizeQuote`.
  - src/index.css, al final: sección "Copia de seguridad".
  - README.md: la función en "What it does"; "Private by design" ya no recomienda exportar a Excel para no perder datos.
  - CLAUDE.md: estado, regla sobre claves de localStorage e ideas futuras.
- Qué cambió: History tiene un panel "Backup". "Download backup" baja un `.json` con los presupuestos, los datos del negocio (logo incluido) y el contador de presupuestos. "Restore from file" valida el archivo y enseña un resumen antes de escribir nada; si el navegador ya tiene datos, se elige Merge o Replace. Cuando toca hacer copia sale un aviso encima de History y un punto en la pestaña.
- Por qué:
  - Lo pidió un usuario en Reddit, y con razón: localStorage está ligado al origen y al navegador, así que limpiar los datos del sitio o cambiar de equipo lo borra todo. El Excel es un informe y no sirve para restaurar: reimportarlo pierde tipos, depende del formato regional de los números y no lleva el negocio ni el contador. Sin una copia restaurable, nadie confía la app a su trabajo con clientes.
  - JSON porque es la misma serialización que ya hay en localStorage: el round-trip es exacto (en los tests, lo restaurado es idéntico a lo guardado).
  - Esquema versionado (`app`, `kind`, `schemaVersion`) con una tabla de migraciones, vacía por ahora: cualquier archivo descargado hoy se seguirá restaurando cuando cambie el formato. Un archivo de una versión más nueva se rechaza en vez de interpretarse mal. Los cambios aditivos (una clave opcional nueva) no suben la versión, porque el parser ignora lo que no conoce.
  - El archivo es entrada no confiable, así que se valida antes de tocar nada. Campo obligatorio inválido (id entero positivo, `cost` y `price` finitos): la entrada se descarta y se cuenta, y el resumen lo dice antes de restaurar. Campo opcional con tipo incorrecto: se elimina ese campo, no el presupuesto. Campos desconocidos: se conservan, porque la primera obligación de una copia es no perder datos. `inputs` y `parts` solo admiten números finitos (un `"20"` en texto convierte una suma en concatenación). El logo solo se acepta como data URL raster (png, jpeg, webp, gif), así un archivo no puede apuntar a una URL remota que haría una petición a un tercero cada vez que se abre un presupuesto.
  - Merge es una unión por id. Mismo id y mismo contenido (comparando una forma canónica con las claves ordenadas): es el mismo presupuesto y se queda una vez. Mismo id y distinto contenido (dos `Date.now()` iguales en dos equipos): se guardan los dos; el entrante pasa al siguiente id libre, y antes se fija su `createdAt`, porque History usa el id como fecha cuando falta. En los datos del negocio gana lo de este navegador y solo se rellenan los campos vacíos. Replace deja el navegador igual que el archivo y pide confirmación si va a borrar presupuestos que solo están aquí.
  - El contador de presupuestos toma el máximo en los dos modos. Es una secuencia que ven los clientes (2026-007): si bajara, se repetirían números de presupuesto. Invariante: nunca decrece.
  - `writeAtomically`: localStorage no tiene transacciones. Se hace un snapshot de las claves, se escribe y, si una escritura falla (QuotaExceededError, SecurityError), se deshace todo y se informa de si el rollback funcionó. Se escribe primero el almacenamiento y después el estado de React, así la pantalla nunca enseña un restore que no ha ocurrido.
  - Recordatorio: `lastBackupAt` es de cada dispositivo y no va dentro del archivo. Un presupuesto está pendiente si su `createdAt` es posterior a la última copia. El aviso sale si hay algo pendiente y no hay copia o tiene 7 días o más. Después de restaurar, `lastBackupAt` pasa a la fecha del archivo solo si el navegador no tiene nada que no esté en él, y nunca retrocede.
  - El panel va fuera de `<History>` porque History hace un return temprano cuando está vacío, y un History vacío (un equipo nuevo) es justo donde hace falta "Restore from file".
- Concepto nuevo:
  - Blob + `URL.createObjectURL` + `<a download>`: crea y descarga un archivo en el cliente, sin servidor. La URL se revoca al cabo de un minuto, porque revocarla en el mismo tick puede cancelar la descarga en algunos navegadores.
  - `File.text()`: lee de forma asíncrona el archivo elegido. Antes se mira `file.size` (máximo 10 MB) para no bloquear la pestaña si alguien elige un archivo enorme por error.
  - Live region (`role="status"`): el elemento está siempre en la página y solo cambia su texto, porque los lectores de pantalla no anuncian de forma fiable una región que aparece ya con contenido.
  - Gestión del foco: la caja de confirmación tiene `tabIndex={-1}` y un `useEffect` le hace `focus()` al abrirse, así el foco de teclado llega a la pregunta.
- Cómo se probó:
  - 14 tests con `node:test` sobre las funciones puras y la capa de almacenamiento, con un storage falso que tiene cuota: round-trip exacto; rechazo de JSON ajeno, truncado y de versión nueva; entradas dañadas; colisiones de id; contador que no baja; rollback con la cuota llena y con el almacenamiento bloqueado; `lastBackupAt` que no retrocede.
  - Recorrido completo en Chromium headless sobre el build de producción (`vite preview`): aviso y punto con 3 presupuestos sin copia; descarga y contenido del archivo; navegador vacío → restore → historial, negocio y contador recuperados; "Load" sobre un presupuesto restaurado; Merge del mismo archivo (nada nuevo); Replace con diálogo y contador que no baja; archivos erróneos (Excel, JSON ajeno, truncado, versión nueva); entrada dañada anunciada y Cancel sin escribir nada; presupuesto de cliente con el negocio y el número restaurados; aviso de copia de hace más de una semana; móvil de 390 px sin scroll lateral.
  - Los tests se ejecutaron fuera del repositorio para no añadir dependencias (Vitest, Playwright) sin preguntarlo.
- Cómo probarlo:
  1. `npm run dev`, guarda 2 presupuestos y abre History: arriba sale "No backup yet" y la pestaña tiene un punto.
  2. "Download backup": baja `layercents-backup-AAAA-MM-DD-HHMM.json`. El aviso y el punto desaparecen y el panel dice "Up to date".
  3. Abre una ventana de incógnito (tiene su propio localStorage) en `localhost:5173`, History → "Restore from file" → el archivo → "Restore". Salen los presupuestos, y en "Customer quote" están tu negocio y el número siguiente.
  4. En la ventana normal, guarda otro presupuesto y restaura el mismo archivo: "Merge" no duplica nada; "Replace" avisa de que va a borrar 1.
  5. Elige el .xlsx de "Export Excel": dice que es un informe y que no se puede restaurar.

### 2026-10-16, Portada de GitHub: README con capturas y nombre layercents
- Archivo y sitio:
  - README.md: reescrito entero.
  - screenshots/: carpeta nueva con logo.svg (el logo para el README) y tres capturas: calculator.png, quote.png e history.png.
  - package.json y package-lock.json: el campo "name" de arriba del todo pasa de "coste-3d" a "layercents".
- Qué cambió: el README, que es la portada del proyecto en GitHub, ahora tiene el logo, una frase de qué es, capturas de la calculadora, del presupuesto y del historial, la lista de funciones, cómo se protegen los datos, lo que viene, cómo arrancarlo en tu ordenador y que el código no es de uso libre. Si un archivo del laminador no se importa, pide mandarlo en un .zip, porque GitHub no deja adjuntar .gcode ni .3mf sueltos. La web no cambia, así que no hace falta publicarla con `npm run deploy`.
- Por qué: quien pulsa "Tell me on GitHub" en el pie de la web llega a esta portada, y con el post de Reddit llegará más gente. Con capturas y la marca nueva parece un producto serio, no un ejercicio. El nombre del paquete es una etiqueta interna que nadie ve, pero así todo el proyecto dice layercents. El nombre del repositorio y la caja "About" de GitHub solo se pueden cambiar desde los ajustes de GitHub, y eso lo hace Julen.
- Concepto nuevo:
  - Enlace relativo en un README: `[open an issue](../../issues)` no lleva la dirección completa. GitHub lo calcula desde donde está el archivo (`llopjulen/coste-3d/blob/main/README.md`): sube dos niveles y llega a `llopjulen/coste-3d/issues`. Así sigue funcionando aunque el repositorio cambie de nombre.
  - HTML dentro de Markdown: `<p align="center">…</p>` centra el logo y el título. Markdown no sabe centrar, pero GitHub acepta un poco de HTML en los README.
- Cómo probarlo:
  1. Abre https://github.com/llopjulen/coste-3d: arriba salen el logo, el título centrado y la captura de la calculadora.
  2. Baja: están las capturas del presupuesto y del historial.
  3. Pulsa "open an issue": se abre la lista de issues del proyecto.
  4. `npm run build` funciona igual que antes.

### 2026-10-16, Repaso visual: móvil, tres pasos y pie de página
- Archivo y sitio:
  - src/App.jsx: debajo del subtítulo de la calculadora, la lista `steps` con los tres pasos. Antes del pie, la barra `mobile-total`. Dentro de App, `resultRef`, `resultInView` y `showResult`, justo antes de `currency`. La función nueva `SiteFooter`, encima de "4) APP", que se usa en la calculadora y en el historial. En la nota del resultado se quita la frase "Filament is only…". La ayuda de "Platform fee" ahora explica que la comisión se cobra sobre el precio final.
  - src/History.jsx: la función `fmtDay`, junto a `quoteDate`, para las fechas de la tabla y del aviso de borrar.
  - src/index.css: `h1` con la letra del logo; arreglo de la barra de arriba en el móvil (debajo de `.currency`); estilos `.steps`, `.site-foot` y `.mobile-total`.
- Qué cambió:
  - En el móvil la barra de arriba va en dos filas y ya no sale cortada.
  - Abajo hay una barra fija con el coste y el precio recomendado; se esconde al llegar al resultado.
  - Los títulos usan la letra del logo, debajo del título hay tres pasos y al final un pie con la promesa de privacidad y dónde mandar ideas.
  - Las fechas salen como "12 Oct 2026".
- Por qué:
  - En un móvil de 390 px la barra de arriba medía 401 px: el selector de moneda salía cortado y la página se movía de lado. Casi toda la gente que llega desde Reddit entra con el móvil.
  - En el móvil el resultado quedaba tres pantallas más abajo que las casillas, y quien entraba por primera vez no veía el precio.
  - Los tres pasos cuentan en un vistazo qué hace la app distinto: soltar el archivo del laminador.
  - Con el mes en letras nadie confunde el día con el mes (10/12 es octubre en EE. UU. y diciembre en España).
  - Julen pidió quitar la frase del filamento y el texto de abajo. La idea de la comisión pasa a la ayuda (botón i) de su casilla, y la de que nada sale del navegador, al pie.
- Concepto nuevo:
  - `useRef`: una "etiqueta" para un elemento de la página. `const resultRef = useRef(null)` y `<div ref={resultRef}>`; luego `resultRef.current` es ese div, por ejemplo para hacer `resultRef.current.scrollIntoView()`.
  - `IntersectionObserver`: el navegador avisa cuando un elemento entra o sale de la pantalla, sin tener que vigilar el scroll a mano. Ejemplo: `new IntersectionObserver(([e]) => console.log(e.isIntersecting)).observe(el)`.
  - `@media(max-width:520px){…}`: reglas de CSS que solo valen cuando la pantalla mide 520 px de ancho o menos. Así el móvil tiene su propio diseño sin tocar el del ordenador.
- Cómo probarlo:
  1. `npm run dev` y abre la página con el móvil, o en el ordenador con la vista de móvil del navegador (F12 → icono del móvil).
  2. Arriba se ven la marca y EUR en una fila y las pestañas en otra, y la página no se mueve de lado.
  3. Abajo sale la barra con el coste y el precio. Pulsa "Breakdown": baja hasta el resultado y la barra se esconde.
  4. Al final de la página está el pie con el enlace a GitHub.
  5. En History las fechas salen como "12 Oct 2026".

### 2026-10-16, La web pasa a layercents.com
- Archivo y sitio:
  - vite.config.js: `base` pasa de `'/coste-3d/'` a `'/'`.
  - public/CNAME (archivo nuevo): una sola línea, `layercents.com`.
  - index.html: `og:url` y `og:image` con la dirección completa del dominio nuevo.
  - README.md: el enlace "Live".
  - CLAUDE.md: nombre, dirección, estilo (oro en vez de verde) y estado.
- Qué cambió: la app ya no vive en llopjulen.github.io/coste-3d sino en https://layercents.com.
- Por qué:
  - Una dirección propia es más fácil de recordar y de enseñar, y no depende de tu usuario de GitHub.
  - `base` le dice a Vite en qué carpeta va a estar la web. Antes era la carpeta /coste-3d/ dentro de tu web de GitHub; ahora la app está en la raíz del dominio, así que es `/`. Si no se cambia, la página busca sus archivos en layercents.com/coste-3d/ y sale en blanco.
  - El archivo CNAME es cómo GitHub Pages sabe qué dominio servir. Va en public/ para que Vite lo copie tal cual al publicar.
  - WhatsApp, Reddit y compañía solo enseñan la imagen de vista previa si la dirección está completa, con https:// y el dominio.
  - Es el mejor momento para mudarse: la versión que había en la web no guardaba nada en el navegador, así que nadie pierde presupuestos. A partir de ahora sí guardan, y los datos van ligados a la dirección: por eso no conviene volver a cambiarla.
- Concepto nuevo:
  - DNS: la "agenda" de internet, que traduce un nombre (layercents.com) a la dirección de un servidor. Los registros A apuntan el dominio a los servidores de GitHub Pages (por ejemplo `185.199.108.153`), y el CNAME hace que `www.layercents.com` vaya al mismo sitio.
  - Mismo origen: el navegador guarda localStorage por dirección. Lo guardado en https://layercents.com no se ve desde http://layercents.com ni desde otra dirección; son "cajones" distintos.
- Cómo probarlo:
  1. Abre https://layercents.com: sale la app con el logo nuevo y el candado. El certificado lo pone Cloudflare, porque los registros tienen el proxy activado (nube naranja).
  2. Abre la dirección vieja, llopjulen.github.io/coste-3d: te lleva a layercents.com.
  3. Escribe http://layercents.com (sin la s): debe pasar solo a https://. Si no, activa "Always Use HTTPS" en Cloudflare (SSL/TLS → Edge Certificates).
  4. Pega el enlace en un chat de WhatsApp: debe salir la imagen con el logo.

### 2026-10-16, Nueva marca: layercents, logo y color oro
- Archivo y sitio:
  - src/Logo.jsx (archivo nuevo): el símbolo, un ¢ hecho de capas impresas, dibujado en SVG.
  - src/App.jsx: en la barra de arriba, el punto verde y "Print Cost" pasan a ser el logo y "layercents". En la lista `LAYERS`, el material pasa de verde a oro.
  - src/Report.jsx: cabecera del informe, título de la pestaña ("layercents report AAAA-MM-DD") y pie.
  - src/CustomerQuote.jsx: el pie de la hoja dice "Quote made with layercents · layercents.com".
  - src/exportExcel.js: título del Excel y color de los importes destacados (`ACCENT`).
  - src/index.css, arriba del todo: los colores. `--verde` y `--verde-vivo` pasan a ser `--oro` y `--oro-vivo`, y hay dos nuevos: `--sobre-oro` (texto encima de un botón de oro) y `--oro-papel` (un oro más oscuro para el informe). Estilos nuevos `.brand`, `.logo-layers` y `.logo-stroke`.
  - index.html: título de la pestaña, descripción, tipo de letra Bricolage Grotesque (solo para el nombre) e iconos.
  - public/: favicon.svg, favicon-32.png, apple-touch-icon.png, icon-512.png y social-preview.png (la imagen que sale al compartir el enlace por WhatsApp o Reddit), todos nuevos con el logo.
  - README.md: el nombre y el lema.
- Qué cambió: la app se llama layercents, tiene logo propio y su color es el oro en vez del verde.
- Por qué:
  - "Print Cost" describe la app pero no se puede proteger como marca, y el verde era el de Bambu Lab: con nombre y color propios no parece un producto suyo.
  - Sobre un botón de oro el texto blanco casi no se lee, así que esos botones llevan texto oscuro (`--sobre-oro`).
  - En papel blanco el oro normal se ve flojo; el informe usa `--oro-papel`, más oscuro, para las barras y el logo.
  - El logo tiene dos versiones: la de siete capas para tamaños grandes y la de cuatro (`small`) para la barra, el informe y el favicon, porque siete capas a 16 px se emborronan.
- Concepto nuevo:
  - SVG: una imagen hecha con instrucciones en vez de píxeles, por eso se ve nítida a cualquier tamaño. Ejemplo: `<rect x="10" y="10" width="20" height="14" rx="7" />` dibuja una barra con las puntas redondeadas.
  - `viewBox="0 0 100 100"`: el dibujo se piensa en una caja de 100 × 100 y luego se estira al tamaño que le pidas (`width={20}`).
  - Colorear un dibujo desde CSS: las capas llevan `className="logo-layers"` y el CSS dice `.logo-layers{fill:var(--oro)}`. En el informe, `.report .logo-layers` lo pinta más oscuro sin tocar el dibujo.
- Cómo probarlo:
  1. `npm run dev`: arriba a la izquierda salen el logo y "layercents", y la pestaña del navegador muestra el icono nuevo.
  2. "Save quote" y "Customer quote" son botones de oro con texto oscuro; el material en la gráfica de capas también es de oro.
  3. Abre "PDF report": logo y barras en oro oscuro sobre blanco.
  4. Abre un presupuesto: abajo pone "Quote made with layercents · layercents.com".

### 2026-10-15, Presupuesto para el cliente: varias piezas, logo y PDF
- Archivo y sitio:
  - src/CustomerQuote.jsx (archivo nuevo): la pantalla del presupuesto. Arriba el formulario ("This quote" y "Your business") y abajo la hoja que sale en el PDF.
  - src/History.jsx: casillas para marcar presupuestos (columna nueva al principio de cada tabla), "Select all shown" y el botón "Customer quote (n)" debajo del buscador. Estado nuevo `selected`.
  - src/App.jsx: el import de CustomerQuote; dentro de App, el estado `quoteParts` y la función `openCustomerQuote` (justo antes de `currency`); la cuarta pantalla `view === 'quote'`; History recibe `onCustomerQuote`.
  - src/index.css, al final: sección "Presupuesto para el cliente".
  - README.md: la función nueva en Features y fuera del Roadmap.
- Qué cambió: en History marcas las piezas de un cliente y pulsas "Customer quote". Sale un presupuesto para mandarle, con tu logo, tu nombre y contacto, número, fecha y validez, las piezas con cantidad y precio, envío, impuesto (por ejemplo el 21 % de IVA), total y notas. Puedes cambiar cantidades y precios solo para ese presupuesto, sin tocar el historial. "Save as PDF" lo guarda como PDF, igual que el informe.
- Por qué:
  - Es lo que hace un vendedor cada día: mandar al cliente un presupuesto con varias piezas. MakerQuote y 3DPCC lo cobran en su plan PRO.
  - La hoja del cliente solo enseña precios: nada de costes, márgenes ni comisiones, que son cosa tuya.
  - Los datos de tu negocio (logo, nombre, contacto, notas, impuesto y validez) se guardan en el navegador (clave `business`) y se reutilizan en el siguiente presupuesto. El número sube solo (2026-001, 2026-002…) la primera vez que guardas el PDF (clave `quoteCounter`).
  - Cada importe se redondea al céntimo antes de sumar, así las líneas siempre suman exactamente el total que lee el cliente. Sin esto, con envío e IVA salía un total que no cuadraba por un céntimo.
  - El logo se reduce a 480 × 200 px como mucho antes de guardarlo, porque localStorage tiene poco sitio (unos 5 MB).
  - Abajo de la hoja pone "Quote made with Print Cost": cada presupuesto que manda alguien hace publicidad de la web. Quitar esa línea podría ser una función de pago más adelante.
- Concepto nuevo:
  - `Set`: una colección sin repetidos. `selected.has(id)` dice si una fila está marcada. Para que React lo note se crea un Set nuevo en cada cambio: `const next = new Set(prev); next.add(id)`.
  - Trabajar en céntimos enteros: con decimales el ordenador se equivoca un pelín (`0.1 + 0.2` da `0.30000000000000004`). Con céntimos (`Math.round(n * 100)`) se suman enteros y no hay error: `10 + 20` da `30`.
  - `<canvas>` para encoger imágenes: se dibuja la imagen más pequeña y `canvas.toDataURL('image/png')` la convierte en texto, que sí se puede guardar en localStorage.
  - `defaultValue` + `key`: el precio va en un input "no controlado" (React no lo reescribe a cada tecla, así el cursor no salta). Al cambiar de moneda cambia la `key` y React vuelve a dibujar el input con el número convertido.
- Cómo se probó: recorrido completo en un navegador simulado: marcar piezas, abrir el presupuesto, cliente puesto solo, cantidades, envío, impuesto, totales que cuadran, nombre y notas guardados, número que sube una sola vez, cambio a USD, quitar una línea, volver sin tocar el historial y un segundo presupuesto con el número siguiente. Falta probar en tu navegador subir un logo y sacar el PDF de verdad.
- Cómo probarlo:
  1. `npm run dev` y guarda 2 o 3 presupuestos con el mismo cliente.
  2. En History marca sus casillas: el botón dice "Customer quote (2)". Púlsalo.
  3. Rellena "Your business": sube tu logo y pon nombre y contacto. Recarga, vuelve a abrirlo y siguen ahí.
  4. Cambia la cantidad de una pieza, pon envío y 21 en "Tax (%)": la hoja cambia al momento y el total cuadra con las líneas.
  5. Pulsa "Save as PDF" y elige "Guardar como PDF": solo sale la hoja, sin formulario ni botones, y el nombre propuesto es "Quote 2026-001 Cliente".
  6. Abre otro presupuesto: el número ya es 2026-002.
  7. En el móvil el formulario va en una columna, y la tabla de la hoja se desliza de lado si no cabe.

### 2026-10-15, README al día: funciones y roadmap
- Archivo y sitio: README.md, secciones "Features" y "Roadmap".
- Qué cambió: Features ya incluye la importación del laminador (la primera, en negrita), el historial, el Excel y el informe PDF. En Roadmap se quitaron "borrar presupuestos" y "CSV" (ya hechos; el CSV se cambió por Excel) y entraron las próximas funciones.
- Por qué: el README es lo primero que ve la gente que llega desde Reddit o GitHub, y la importación es lo que nos diferencia de la competencia.
- Concepto nuevo: `**texto**` en Markdown se ve en negrita.
- Cómo probarlo: abre README.md en GitHub (o en VS Code con la vista previa) y comprueba las dos listas.

### 2026-10-15, Importar tiempo y gramos desde el archivo del laminador
- Archivo y sitio:
  - src/slicerFile.js (archivo nuevo): lee el archivo del laminador y saca el tiempo, los gramos, la purga y los filamentos. Son funciones puras: no saben nada de React ni de la pantalla.
  - src/ImportFile.jsx (archivo nuevo): el panel "Import from your slicer", con la zona para soltar, el botón "Choose file", el resumen, "Parts on this plate" y "Undo".
  - src/App.jsx: el import de ImportFile; dentro de la función App, justo después de `set`, el estado `beforeImport` y las funciones `applyImport` y `undoImport`; en el JSX, `<ImportFile />` como primer panel de la columna del formulario.
  - src/index.css, al final: sección "Importar del laminador".
  - package.json: `fflate` pasa a ser dependencia directa (ver "Por qué").
- Qué cambió: encima del formulario hay un panel nuevo. Sueltas en cualquier sitio de la página (o eliges con "Choose file") un .gcode, .bgcode o .gcode.3mf de Bambu Studio, OrcaSlicer, PrusaSlicer o Cura, y se rellenan solos "Print time", "Part weight" y "Purge & waste". Si en la bandeja hay varias piezas, pones cuántas en "Parts on this plate" y se divide. Si el 3MF tiene varias bandejas, eliges una o "All plates". "Undo" devuelve los números de antes.
- Por qué:
  - Ninguna calculadora de la competencia lo hace (MakerQuote, 3DPCC y CraftersQuote te hacen copiar a mano lo que dice el laminador). Quita el paso más pesado y los errores al copiar.
  - El archivo se lee dentro del navegador y no se sube a ningún sitio, así que sigue siendo verdad el "nothing is sent to any server".
  - Del G-code solo se leen el primer y el último mega, que es donde los laminadores escriben estos datos. Así un archivo de 200 MB no congela la página.
  - Purga: PrusaSlicer dice cuánto filamento fue a la torre de purga y se separa del peso de la pieza. Bambu Studio y Orca no lo separan en el archivo: va dentro del total, así que la purga se pone a 0 para no contarla dos veces, y el panel lo avisa.
  - fflate: un 3MF por dentro es un zip y hay que descomprimirlo. No es una librería nueva de verdad: ya estaba en el proyecto porque write-excel-file la usa para crear el .xlsx. Ahora la usamos también directamente (por eso aparece en package.json) y solo se descarga cuando alguien suelta un 3MF (unos 7 KB).
- Concepto nuevo:
  - Expresiones regulares (regex): patrones para buscar trozos de texto. `/total filament used \[g\]\s*=\s*([\d.]+)/` busca esa frase y guarda el número que va detrás. Ejemplo: `'peso = 12.5'.match(/peso = ([\d.]+)/)[1]` da `'12.5'`.
  - `file.slice(inicio, fin).text()`: lee solo un trozo de un archivo. Ejemplo: `await file.slice(0, 1024).text()` lee el primer kilobyte.
  - Un .gcode.3mf es un zip: dentro, `Metadata/slice_info.config` es un texto XML con el tiempo de cada bandeja (`prediction`, en segundos) y sus gramos (`weight`).
  - Arrastrar y soltar: los eventos `dragover` y `drop` de la ventana. `e.preventDefault()` evita que el navegador abra el G-code como una página llena de texto.
  - `useRef`: una "caja" que guarda algo entre renders sin redibujar la pantalla. Aquí guarda el input de archivo escondido (para abrirlo desde el botón) y la versión más nueva de `handleFile` (para los eventos de la ventana, que se crean una sola vez).
  - `class ImportError extends Error`: un tipo de error propio. Si el fallo es de este tipo, su mensaje ya está escrito para la persona; si es de otro tipo, es un bug y además va a la consola.
- Cómo se probó: con G-code real de PrusaSlicer 2.7.2 (una pieza, dos materiales con torre de purga de 14 g y el .bgcode binario), con archivos de muestra con el formato de Bambu Studio, OrcaSlicer y Cura, y con un G-code de 6 MB. También se recorrió el panel entero en un navegador simulado: elegir archivo, piezas por bandeja, Undo, soltar un 3MF de dos bandejas, error con un .stl y guardar presupuesto después de importar. Falta probarlo con un .gcode.3mf real tuyo de Bambu Studio.
- Cómo probarlo:
  1. `npm run dev`.
  2. En Bambu Studio u OrcaSlicer, lamina algo y usa "Export plate sliced file" (sale un .gcode.3mf). Suéltalo en la página: cambian "Print time" y "Part weight", y arriba sale el resumen con el tiempo, los gramos y los filamentos con su color.
  3. Pon 4 en "Parts on this plate": el tiempo y los gramos se dividen entre 4.
  4. Pulsa "Undo": vuelven los números que había antes.
  5. Con un 3MF de varias bandejas aparece "Plate": cambia de bandeja o elige "All plates".
  6. En PrusaSlicer, exporta el G-code de algo multicolor con torre de purga: "Purge & waste" se rellena con lo de la torre.
  7. Suelta un .stl: sale un aviso en rojo (es un modelo, no un archivo laminado) y el formulario no cambia.
  8. En el móvil, "Choose file" abre el selector de archivos.

### 2026-10-14, README nuevo del proyecto
- Archivo y sitio: README.md (todo el archivo; lo escribió Julen).
- Qué cambió: se sustituyó el README de la plantilla de Vite por uno propio, con descripción, enlace a la web, funciones, cómo ejecutarlo en local y roadmap.
- Por qué: el README es lo primero que ve quien entra al repositorio desde Reddit o GitHub.
- Concepto nuevo: no hay.
- Cómo probarlo: abre el repositorio en GitHub y comprueba que la portada muestra el README nuevo. Pendiente: añadir Excel, History y PDF report a la lista de Features.

### 2026-10-14, CLAUDE.md al día: estado actual y pendientes
- Archivo y sitio: CLAUDE.md, secciones "Estado actual" y "Pendiente, por orden".
- Qué cambió: se apuntó todo lo hecho hoy (History, Excel, PDF report) y se reordenaron los pendientes. Lo siguiente es "piezas por semana".
- Por qué: CLAUDE.md es lo primero que lee Claude en cada sesión. Si dice que falta algo que ya está hecho, la próxima vez empezaría por el sitio equivocado.
- Concepto nuevo: no hay.
- Cómo probarlo: abre CLAUDE.md y comprueba que "Pendiente" empieza por "piezas por semana".

### 2026-10-14, Informe en PDF con gráficas ("PDF report")
- Archivo y sitio:
  - src/Report.jsx (archivo nuevo): la pantalla del informe, con sus cálculos y gráficas.
  - src/History.jsx: botón "PDF report" junto a "Export Excel", en la zona de búsqueda.
  - src/App.jsx: import de Report, estado `report` y función `openReport` (junto al estado `view`), la tercera pantalla `view === 'report'` y la clase `no-print` en la barra superior.
  - src/index.css, al final: sección "Informe (PDF)", con los colores de papel como variables (`--papel`, `--tinta`…), los estilos de las gráficas y el bloque `@media print`.
- Qué cambió: en History, "PDF report" abre un informe que parece una hoja blanca. Incluye cabecera con fechas, 5 cifras clave (presupuestos, total, precio medio, coste medio y beneficio medio tras comisiones), una gráfica de columnas con el valor presupuestado por mes, una gráfica de en qué se va el coste de una pieza media, los mejores clientes y la tabla con todos los presupuestos y su total. "Save as PDF" abre la ventana de imprimir del navegador, donde eliges "Guardar como PDF".
- Por qué:
  - Un PDF así se puede mandar a un cliente o usar para ver cómo va el negocio cada mes. Es lo que hace que la app parezca un programa de verdad.
  - Usar la impresión del navegador en vez de una librería de PDF evita una dependencia pesada, y el texto del PDF sale nítido y se puede seleccionar.
  - Cada gráfica tiene un solo color (el verde de la app) y el valor escrito al lado, así se entiende aunque se imprima en blanco y negro.
  - El informe usa lo que se ve en History: si buscas "Ana", el informe es solo de Ana y en la cabecera pone "filtered by “Ana”".
- Concepto nuevo:
  - `@media print { ... }`: estilos que solo se aplican al imprimir. Aquí se esconden la barra superior y los botones (`.no-print`) y se fija el tamaño A4 con `@page`. Ejemplo: `@media print { .menu { display: none } }`.
  - `print-color-adjust: exact`: por defecto el navegador no imprime colores de fondo (para ahorrar tinta), y las barras de las gráficas son fondos. Esta línea lo obliga a imprimirlos.
  - `break-inside: avoid`: le pide a la impresora que no corte un bloque (una gráfica) entre dos páginas. La tabla sí puede partirse, y su cabecera se repite sola en cada página.
  - `window.print()`: abre la ventana de imprimir, igual que pulsar Cmd+P.
  - `document.title`: el título de la pestaña es también el nombre que el navegador propone para el PDF. Mientras el informe está abierto se cambia a "Print Cost report AAAA-MM-DD" y al salir se devuelve el de antes (con la limpieza de `useEffect`, como en el aviso de guardado).
  - Gráficas sin librería: cada barra es un `<span>` con `width` o `height` en %. Si el mes más alto vale 100 € y otro 50 €, el segundo mide `height: 50%`.
- Cómo probarlo:
  1. `npm run dev`. Ten al menos 3 o 4 presupuestos guardados con clientes distintos (si todos son de hoy, la gráfica por meses tendrá una sola columna).
  2. Ve a History y pulsa "PDF report": ves la hoja blanca con las cifras, las 3 gráficas y la tabla con su total.
  3. Pulsa "Save as PDF". En la ventana de imprimir, elige "Guardar como PDF" como destino. En la vista previa no deben salir la barra superior ni los botones, las barras deben verse verdes y el nombre propuesto debe ser "Print Cost report AAAA-MM-DD".
  4. Si tienes más de 10 o 12 presupuestos, la tabla sigue en la página 2 con la cabecera repetida, y el "Total" solo sale al final.
  5. Vuelve con "← Back to history", busca un cliente y abre el informe otra vez: solo salen sus presupuestos, y arriba pone "filtered by".
  6. Cambia la moneda a USD y abre el informe: todo sale en USD.
  7. En el móvil, la hoja cabe en pantalla y la tabla se desliza de lado.

### 2026-10-14, Pantalla de historial (History) con resumen, búsqueda, meses y "Load"
- Archivo y sitio:
  - src/History.jsx (archivo nuevo): toda la pantalla del historial.
  - src/App.jsx: el import de History; dentro de la función App, la carga de `savedQuotes` (ahora con `try/catch`), los nuevos `justSaved` y `loadQuote` junto a `saveQuote`, el estado `view`, y en el JSX la barra superior (pestañas + moneda), el aviso "Saved · View history" y el cambio entre pantallas. La lista de presupuestos que había en la calculadora se ha quitado, porque ahora vive en History.
  - src/index.css: estilos de las pestañas y del selector de moneda en la barra superior, de los botones `.controls` (ahora oscuros, como el resto de la app, y "Save quote" en verde), del aviso de guardado y de toda la sección "Historial". Se borraron los estilos de la lista antigua.
- Qué cambió:
  - Arriba hay dos pestañas, "Calculator" y "History (n)", y el selector de moneda pasa a la barra superior porque afecta a las dos pantallas.
  - History muestra 4 tarjetas resumen (número de presupuestos, total presupuestado, precio medio por pieza y número de clientes), un buscador por pieza o cliente y una tabla agrupada por meses, con el total de cada mes, del más nuevo al más antiguo.
  - Cada fila tiene "Load", que vuelve a cargar ese presupuesto en la calculadora (números, nombre y cliente), y ✕ para borrar, que ahora pide confirmación.
  - "Export Excel" está en History y exporta solo lo que estás viendo: si buscas "Ana", exporta solo los de Ana.
  - Al guardar, sale "Saved “nombre” · View history" durante 5 segundos.
- Por qué:
  - Un programa profesional separa "hacer un presupuesto" de "consultar los antiguos". Tener la lista debajo de la calculadora no escalaba con 50 presupuestos.
  - "Load" sirve para repetir un pedido o hacer una variante sin volver a escribir los 17 datos.
  - El `try/catch` al leer localStorage evita que la app entera se quede en blanco si los datos guardados se corrompen.
  - Los presupuestos antiguos (sin datos de formulario) tienen el botón "Load" desactivado, porque no hay nada que cargar.
- Concepto nuevo:
  - Componente en otro archivo con props: `<History quotes={...} onLoad={...} />`. History no guarda datos propios; recibe la lista y avisa a App con funciones (`onLoad`, `onDelete`). Es como llamar a una función pasándole parámetros.
  - Renderizado condicional con `? :`: `{view === 'history' ? <History/> : <Calculadora/>}` enseña una pantalla u otra según el valor de `view`, sin cambiar de página.
  - `new Set(...)`: una colección que no admite repetidos. `new Set(['Ana', 'Ana', 'Luis']).size` da 2. Se usa para contar clientes distintos.
  - Limpieza en `useEffect`: el `return () => clearTimeout(timer)` cancela el temporizador si guardas otro presupuesto antes de que pasen los 5 segundos, para que no se mezclen los avisos.
  - `.sort((a, b) => b - a)`: ordena de mayor a menor. Restar dos fechas da la diferencia en milisegundos, así que quedan primero las más nuevas.
- Cómo probarlo:
  1. `npm run dev`. Arriba verás "Calculator" e "History" con un número.
  2. En la calculadora, escribe un nombre y un cliente y pulsa "Save quote". Sale el aviso en verde, pulsa "View history".
  3. En History comprueba las 4 tarjetas y que la tabla está agrupada por mes, con el total del mes a la derecha.
  4. Escribe un cliente en el buscador: la tabla, las tarjetas y el número del botón "Export Excel" cambian.
  5. Pulsa "Export Excel" con la búsqueda puesta: el Excel solo trae esos presupuestos.
  6. Pulsa "Load" en una fila: vuelves a la calculadora con sus números, nombre y cliente.
  7. Pulsa ✕: pide confirmación y, si aceptas, desaparece.
  8. Cambia la moneda arriba a la derecha: cambian las dos pantallas.
  9. Borra todos: sale el mensaje "No saved quotes yet" con un botón para volver a la calculadora.
  10. En el móvil (o con la ventana estrecha), la tabla se desliza de lado dentro de su caja y la página no se desborda.

### 2026-10-14, Exportación a Excel (.xlsx) y presupuestos con nombre, cliente y desglose
- Archivo y sitio:
  - src/exportExcel.js (archivo nuevo): todo el código que construye el Excel.
  - src/App.jsx, dentro de la función App: `saveQuote` (ahora guarda muchos más datos), los estados nuevos `quoteName` y `quoteClient`, la función `exportExcel` (sustituye a `exportCSV`), el formulario `save-bar` debajo de la barra de botones y la fila de cada presupuesto en la lista.
  - src/index.css, al final: estilos del formulario (`.save-bar`, `.text-input`) y del nombre en la lista (`.quote-info`, `.quote-name`).
  - package.json: nueva dependencia `write-excel-file`. Al instalarla, npm también arregló las sangrías del archivo.
- Qué cambió:
  - Al guardar un presupuesto puedes escribir el nombre de la pieza y el cliente (este es opcional). Se guarda también una copia de todos los datos del formulario y del desglose de costes.
  - El botón "Export CSV" pasa a ser "Export Excel" y descarga un `.xlsx` de verdad: título, fecha de exportación, cabecera oscura fija al hacer scroll, columnas con ancho ajustado, filas alternas en gris, importes con 2 decimales, margen y comisión en %, y una fila de totales con fórmulas.
  - Columnas: Date, Part, Client, Qty, Weight (g), Print time (h), Material, Power, Depreciation, Failures, Labor, Packaging, Cost / part, Margin, Fee, Price / part y Order total.
- Por qué:
  - Un CSV es solo texto: sin negritas, sin formato de moneda y, en el Excel en español, a veces sale todo en una sola columna. Un .xlsx se abre bien en Excel, Numbers y Google Sheets y tiene aspecto profesional.
  - Guardar el desglose completo es la base para el historial (parte B) y el informe PDF (parte C): sin esos datos no se pueden hacer gráficas después.
  - Nueva dependencia, `write-excel-file`: escribir un .xlsx a mano es muy complejo (por dentro es un zip con varios archivos XML). Esta librería es pequeña, tiene licencia MIT y solo se descarga cuando alguien pulsa el botón, así que la página no carga más lenta.
  - Los presupuestos guardados antes de este cambio siguen funcionando: en el Excel salen con fecha, coste y precio, y el resto de columnas vacías.
- Concepto nuevo:
  - `import()` dinámico: `await import('./exportExcel.js')` carga un archivo solo cuando se ejecuta esa línea, no al abrir la página. Vite lo separa en su propio archivo (`exportExcel-xxxx.js`). Ejemplo: `const { suma } = await import('./mates.js')`.
  - `async` / `await` y `try / catch / finally`: `await` espera a que termine algo lento (cargar el archivo, crear el Excel). `try` intenta hacerlo, `catch` se ejecuta si algo falla (y se muestra un aviso) y `finally` se ejecuta siempre (aquí, para volver a activar el botón).
  - `<form onSubmit>` y `e.preventDefault()`: meter los campos en un formulario hace que pulsar Enter también guarde. Por defecto un formulario recarga la página al enviarse, y `preventDefault()` lo evita.
  - `??` (operador "si no existe"): `q.units ?? 1` significa "usa q.units y, si no existe, usa 1". Sirve para los presupuestos antiguos, que no tienen esos datos.
- Cómo probarlo:
  1. `npm run dev` y abre la URL que aparece.
  2. Debajo de los botones verás dos cajas: escribe "Phone stand" y "Ana" y pulsa "Save quote" (o Enter). Las cajas se vacían y en la lista aparece "Phone stand" con "Ana · fecha" debajo.
  3. Guarda otro sin nombre: aparece como "Untitled part".
  4. Pon "Order quantity" a 3, guarda otro y pulsa "Export Excel". Se descarga `print-quotes-AAAA-MM-DD.xlsx`.
  5. Ábrelo en Excel, Numbers o Google Sheets: título arriba, cabecera oscura, una fila por presupuesto y abajo "Total", con la suma de Qty y de Order total. Haz scroll hacia abajo y la cabecera se queda fija.
  6. Cambia un número de "Order total" en Excel: el total de abajo se recalcula solo, porque es una fórmula.
  7. Cambia la moneda a USD y exporta otra vez: las cabeceras dicen "(USD)" y los importes salen convertidos.
  8. Si tenías presupuestos guardados de antes, salen en la lista como "Untitled part" y en el Excel con fecha, coste y precio.

### 2026-10-14, Botón "Export CSV" para los presupuestos guardados
- Archivo y sitio:
  - src/App.jsx, dentro de la función App: la nueva función `exportCSV` (justo antes de `botonApagarCalculo`) y el botón "Export CSV" al final del panel "Saved quotes".
  - src/index.css, al final: estilo `.quotes-actions`, la franja inferior del panel donde está el botón.
- Qué cambió: debajo de la lista de presupuestos hay un botón "Export CSV" que descarga un archivo `print-quotes-AAAA-MM-DD.csv` con las columnas Date, Cost, Price y Currency.
- Por qué: así puedes llevarte los presupuestos a Excel o Google Sheets para sumarlos o compararlos, sin depender del navegador. Los importes salen en la moneda que tengas elegida en ese momento, igual que en pantalla, y la columna Currency indica cuál es.
- Concepto nuevo:
  - CSV: un archivo de texto donde cada línea es una fila y las comas separan las columnas. Cada valor va entre comillas para que una fecha con coma ("Oct 14, 2026") no se parta en dos columnas.
  - `Blob` y `URL.createObjectURL`: un Blob es un "archivo en memoria" creado desde JavaScript. createObjectURL le da una dirección temporal, y un enlace `<a download>` con esa dirección hace que el navegador lo descargue. Ejemplo: `new Blob(['hola'], { type: 'text/plain' })`.
  - `URL.revokeObjectURL` libera esa dirección temporal cuando ya no hace falta, para no ocupar memoria.
- Cómo probarlo:
  1. `npm run dev` y guarda 2 o 3 presupuestos con "Save quote".
  2. Pulsa "Export CSV" (abajo a la derecha del panel "Saved quotes"): se descarga `print-quotes-2026-10-14.csv`.
  3. Ábrelo con un editor de texto: una línea de cabecera y una línea por presupuesto, con los mismos importes que ves en pantalla.
  4. Cambia la moneda a USD, exporta otra vez y comprueba que los importes cambian y que la columna Currency dice USD.
  5. Ábrelo en Google Sheets (Archivo > Importar): cada dato sale en su columna. En Excel en español puede que todo salga en una sola columna, porque allí el separador esperado es el punto y coma. Google Sheets o "Datos > Desde texto" lo resuelven.
  6. Borra todos los presupuestos: el panel desaparece y con él el botón, así que nunca se exporta un CSV vacío.

### 2026-10-14, CLAUDE.md y DEV_LOG.md pasan a la raíz del proyecto
- Archivo y sitio: CLAUDE.md y DEV_LOG.md, que antes estaban en src/ y ahora están en la carpeta principal (coste-3d/).
- Qué cambió: los dos archivos se movieron a la raíz y claude.md pasó a llamarse CLAUDE.md, en mayúsculas. No se tocó nada de código.
- Por qué: Claude Code solo lee automáticamente el CLAUDE.md de la raíz. El nombre en mayúsculas importa en Linux y en la nube, que sí distinguen mayúsculas de minúsculas (tu Mac no).
- Concepto nuevo: no hay.
- Cómo probarlo: `ls` en la carpeta del proyecto muestra CLAUDE.md y DEV_LOG.md, y src/ ya no los tiene.

### 2026-10-14, Lista de presupuestos guardados: fecha, borrar y nuevo aspecto
- Archivo y sitio:
  - src/App.jsx, dentro de la función App: `deleteQuote` (junto a `saveQuote`) y el bloque JSX que va justo después del subtítulo, antes de `<div className="columns">`.
  - src/index.css, al final, en la sección "Presupuestos guardados".
- Qué cambió: cada presupuesto guardado se ve ahora como una fila de tabla con fecha, coste, precio y un botón ✕ para borrarlo. Los tres controles (Show cost only, Save quote y el selector de moneda) van juntos en una barra, y la lista aparece debajo, ya no metida entre los botones. También se quitó el `console.log('guardando...')`, que era para depurar.
- Por qué: antes la lista salía en mitad de la fila de botones y los datos iban pegados en un solo texto, así que costaba leerla. Sin el botón de borrar, la única forma de limpiar la lista era vaciar el localStorage a mano.
- Concepto nuevo:
  - `.filter` crea un array nuevo solo con los elementos que cumplen una condición. `deleteQuote` se queda con todos los presupuestos menos el que tiene el `id` pulsado. Ejemplo: `[1, 2, 3].filter(n => n !== 2)` da `[1, 3]`. Así no se modifica el array original, que es lo que React necesita para notar el cambio.
  - CSS Grid con `grid-template-columns: 1fr auto auto 26px`: la cabecera y cada fila usan las mismas cuatro columnas (la fecha ocupa el espacio que sobra, coste y precio lo que necesitan, y el botón 26 px), por eso todo queda alineado como en una tabla.
  - `aria-label` en el botón ✕: un lector de pantalla leería solo "✕", y con esto lee "Delete quote from 14/10/2026".
- Cómo probarlo:
  1. `npm run dev` y abre la URL que aparece.
  2. Pulsa "Save quote" dos o tres veces cambiando algún valor entre medias (por ejemplo "Part weight").
  3. Comprueba que debajo de los botones sale "Saved quotes (3)" con una fila por presupuesto: fecha a la izquierda, coste y precio en verde a la derecha, alineados en columna.
  4. Pulsa ✕ en la fila del medio: desaparece solo esa y el contador baja.
  5. Recarga la página: la fila borrada sigue sin aparecer (se guarda en localStorage).
  6. Borra todas: el panel desaparece entero.
  7. Cambia la moneda a USD: los importes de la lista se convierten.
  8. Estrecha la ventana a tamaño móvil y comprueba que la barra de botones baja a otra línea sin desbordarse.
