# Cuentas, sincronización y flota en la nube

Decisión tomada el 2026-10-28 con Julen. Antes layercents no tenía backend; esto es el diseño de lo que se añade y de por qué. Se lee antes de tocar cualquier cosa con cuentas, `supabase/` o el agente en modo nube.

Lo que **no** está aquí, a propósito: qué es de pago, precios y plan comercial. Esos van en el documento privado (este repositorio es público). Aquí solo hay arquitectura y seguridad, que además conviene que se pueda revisar.

## Decisiones

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Backend | **Supabase** (Postgres + Auth + Edge Functions), región UE | Backend propio en un VPS: parches, copias y caídas serían de Julen, que trabaja a jornada completa. Solo licencias sin cuentas: no da sincronización ni ver las impresoras desde el móvil. |
| Datos de impresoras | **El agente sube el estado y los trabajos a la cuenta de la persona** | Todo local: privacidad total, pero solo se ve la flota desde el PC del agente. Mixto: dos caminos que probar y mantener. |
| Cobro | **Lemon Squeezy** (o Paddle), que actúa de vendedor oficial: cobra, calcula y declara el IVA por país | Stripe directo: menos comisión, pero el IVA de cada país europeo lo declararía Julen. |

## Qué sigue igual

- **La calculadora funciona sin cuenta**, con `localStorage`, como hasta ahora. La cuenta añade cosas; no quita nada. Es lo que mantiene el boca a boca y el SEO.
- La web sigue siendo estática en GitHub Pages. No hay servidor propio: todo lo que necesita lógica va en Edge Functions de Supabase.
- El agente sigue escuchando **solo** en `127.0.0.1` con las mismas defensas (Host, Origin, CORS, `PROTOCOL`).

## Qué cambia en el agente

Hasta ahora el agente no hablaba con ninguna nube. Con la cuenta vinculada, abre además **conexiones salientes** HTTPS a Supabase. No abre ningún puerto nuevo. Es opcional: sin vincular, el agente se comporta exactamente como ahora.

- **Sube**: el estado común (el mismo de `GET /printers`, que ya no lleva IP, serie ni código) y los trabajos de `jobs.js`.
- **Nunca sube**: el código de acceso de la impresora, el número de serie, la IP, la huella del certificado ni vídeo. Esos datos viven solo en `~/.layercents/printers.json`. Un test lo comprueba sobre el cuerpo real de cada petición.
- **Frecuencia**: al cambiar algo, con un mínimo de 5 s entre envíos mientras imprime y un latido de 60 s en reposo. Los trabajos, al abrirse y al cerrarse, con `upsert` por id (reenviar no duplica).
- Si no hay internet, guarda los trabajos pendientes en disco y los envía al volver. El estado en vivo se descarta (un estado de hace una hora no sirve).

El mensaje de privacidad pasa de «nada sale de tu red» a: **los datos de acceso a tus impresoras no salen nunca de tu ordenador; a tu cuenta solo suben el estado y el historial de trabajos, y se borran con un botón.**

## Cómo se vincula un agente (patrón «device flow»)

Es el mismo patrón de `gh auth login` o de la tele que enseña un código: el agente no tiene teclado cómodo ni debe ver la contraseña de la persona.

1. `npm run agent -- link` llama a la función `agent-pair-start`. Devuelve un `device_code` (secreto, largo, solo para el agente) y un `user_code` corto (por ejemplo `K7QX-M2PD`, caduca en 10 min).
2. La persona abre `layercents.com`, entra en su cuenta y escribe el `user_code`. La función `agent-pair-confirm` (con su sesión) lo une a su usuario.
3. El agente consulta `agent-pair-poll` con el `device_code` hasta que le devuelve el **token del agente**: 256 bits aleatorios.
4. El token se guarda **hasheado (SHA-256)** en la tabla `agents` y en claro solo en `~/.layercents/cloud.json` (permisos 600). Un volcado de la base de datos no sirve para suplantar a ningún agente.

El agente usa ese token, **no** la sesión de la persona. Un token robado solo puede escribir estado de impresoras de esa cuenta: no puede leer presupuestos ni datos del negocio. Se revoca desde la web (`agents.revoked_at`).

## Esquema (se concreta en `supabase/migrations/`)

Todas las tablas llevan `user_id` y **Row Level Security activado**: sin política, no se ve ni se escribe nada.

| Tabla | Contenido | Quién escribe |
|---|---|---|
| `profiles` | `user_id`, preferencias | la persona |
| `quotes` | un presupuesto: `id`, `payload jsonb` (el mismo que `savedQuotes`), `schema_version`, `updated_at` | la persona |
| `business` | datos del negocio (nombre, logo, impuesto…) | la persona |
| `agents` | `id`, `user_id`, `name`, `token_hash`, `last_seen_at`, `revoked_at` | funciones |
| `printers` | `id`, `agent_id`, `name`, `brand`, `model`. Sin IP, serie ni código | función `agent-ingest` |
| `printer_status` | último estado de cada impresora (`jsonb`) y `updated_at` | función `agent-ingest` |
| `jobs` | un trabajo (`id` estable, impresora, nombre, inicio, fin, resultado, minutos estimados y reales) | función `agent-ingest` |
| `subscriptions` | plan y estado, según el webhook de pago | solo la función `payments-webhook` |

Política tipo: `using (user_id = auth.uid())`. La web **solo lee** `printers`, `printer_status`, `jobs` y `subscriptions`; escribirlas es cosa de funciones con la clave de servicio.

La flota en vivo se pinta con **Supabase Realtime** sobre `printer_status`: la web se suscribe a cambios en lugar de preguntar cada 3 s.

## Seguridad

- La `anon key` de Supabase es pública por diseño (va en el JavaScript de la web). Lo que protege los datos es RLS, no esconder esa clave. La **`service_role`** salta RLS: solo existe como secreto de las Edge Functions, nunca en el repositorio, nunca en el navegador.
- URL y `anon key` van en `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); `*.local` ya está en `.gitignore`. Como el despliegue se construye en el ordenador de Julen, el `build` las incrusta.
- `agent-ingest` valida el cuerpo campo a campo (tipos, longitudes, tamaño máximo, un máximo de impresoras por cuenta) y limita la frecuencia por token. Un agente roto o malicioso no debe poder llenar la base de datos.
- Las funciones solo aceptan `Origin: https://layercents.com` (más `localhost` en desarrollo) cuando las llama un navegador.
- El webhook de pago comprueba la **firma HMAC** del cuerpo antes de hacer nada. Sin firma válida, 401.
- Lo que se cobra se aplica **en el servidor**: la web solo usa el plan para enseñar u ocultar botones. Nada de pago se protege en el cliente, porque el código es público y cualquiera podría saltárselo.
- Borrar la cuenta borra todas sus filas (`on delete cascade`). La copia de seguridad en JSON sigue existiendo y es el «exportar mis datos».

## Orden de PRs

1. Este documento y la regla nueva de CLAUDE.md.
2. `supabase/migrations/`: tablas, RLS y tests de las políticas contra un Postgres local.
3. Cuenta en la web: entrar con enlace por correo, salir, borrar cuenta. Sin sincronizar aún.
4. Sincronizar presupuestos y datos del negocio (`backup.js` y `MAPA.md` al día).
5. Agente: `link`, subida de estado y trabajos (`PROTOCOL` sube).
6. Pestaña Printers: flota desde la nube, historial, tasa de fallos y tiempo medio.
7. Pago con Lemon Squeezy y webhook.
8. Páginas legales (privacidad, términos, borrado de datos): antes de cobrar el primer euro.

## Lo que solo puede hacer Julen

- Crear el proyecto de Supabase (región UE, Frankfurt) y pasar la URL y la `anon key` (la `service_role` **nunca** por chat ni por el repositorio).
- Revisar el plan gratuito de Supabase antes de lanzar: los proyectos gratuitos se pausan tras un periodo sin actividad. Para algo de pago hay que usar el plan de producción.
- Abrir la cuenta de Lemon Squeezy (pide datos fiscales y bancarios suyos).
- Alta de actividad en Hacienda y mirar si su contrato actual le deja tener otra actividad (pluriempleo, cláusulas de exclusividad). No es consejo legal: es lo que hay que consultar con una gestoría antes de facturar.
- Política de privacidad y términos: los redacta o revisa una persona cualificada. Aquí solo se prepara lo técnico para poder cumplirlos (exportar, borrar, no subir secretos).
