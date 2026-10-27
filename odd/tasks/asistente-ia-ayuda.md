# asistente-ia-ayuda — asistente de IA que responde con la Ayuda

Porta a soporte el agente RAG de sesitec.com.ar (PHP, `C:\Users\Usuario\Downloads\websesitec.com.ar\agente`,
leído con autorización del dueño) y lo alimenta con los artículos de la Ayuda. Rama `feat/asistente-ia-ayuda`.

## Specs

- **S1 — Pedido.** "quiero que tomes la programacion de esa IA, y la copies en el proyecto soporte, pero
  vamos a entrenar a la IA con los datos que tenemos en la Ayuda de forma tal que se pueda consultar por
  la interface web o por la IA" (L1). No se entrena un modelo: RAG sobre los artículos de la Ayuda
  (L2). La Ayuda sigue consultándose igual por su pantalla.
- **S2 — Comportamiento portado de sesitec.** Recupera los fragmentos más parecidos a la consulta
  (búsqueda léxica normalizada, sin embeddings: `usar_embeddings` es `false` en sesitec), y el modelo
  responde SOLO con ese contexto, breve, en texto plano y sin inventar. Consulta de hasta 600
  caracteres, temperatura 0.2, hasta 3 fragmentos. Sin IA o ante un error del proveedor, "modo de
  respaldo": devuelve el fragmento más parecido de la Ayuda.
- **S3 — Base de conocimiento = la Ayuda.** Los artículos de la Ayuda que la persona puede ver,
  divididos por sección. Un artículo que cambia queda al día sin ningún paso extra. Sin panel de carga
  de conocimiento propio.
- **S4 — Configuración por cliente.** "gemini, pero quiero configurarlo en cada cliente con api y key.
  si no configuro ninguno ese cliente no usa ia, lo utiliza directo de la ayuda como lo hace sesitec"
  (L3). Proveedor por defecto Gemini (endpoint compatible con OpenAI); se configura por cliente
  proveedor/URL, modelo y clave. La clave se guarda cifrada (mismo mecanismo que la contraseña SMTP) y
  nunca se devuelve ni se loguea. Lo administra ROOT, como el correo del cliente.
- **S5 — Dónde aparece.** "Botón flotante en todas las pantallas" (L3), para usuarios con sesión.
- **S6 — Respuesta.** En español neutro con "usted". Cita los artículos usados, con enlace a cada uno.
  Si no hay información, lo dice y sugiere crear un ticket.
- **S7 — Seguridad.** Sin claves en el código ni en el repo (la de sesitec está escrita en
  `agente/config.php`: no se copia y se recomienda rotarla). Tope de consultas por usuario. La rotación
  de `EMAIL_CRYPTO_KEY` vuelve a cifrar también las claves de IA.

## Tasks

- [x] T1 — S4, S7: tabla `asistente_ia_config` 1:1 con `clientes` (master, aditiva, `rollback.sql`),
  clave cifrada, casos de uso ROOT ver/configurar/quitar/probar y endpoints `/clientes/:id/ia`.
- [x] T2 — S7: `rotate-email-crypto-key.ps1` re-cifra las claves de IA; runbook.
- [x] T3 — S2, S3, S6, S7: servicio RAG (fragmentación por sección, búsqueda, generación, respaldo) y
  endpoint `POST` del asistente con tope.
- [x] T4 — S4, S5, S6: frontend — botón flotante con el chat y acción "IA" en Clientes.
- [x] T5 — Ayuda del asistente y de su configuración, runbook del deploy.

## Log

- **L1 — Pedido del dueño (2026-10-26):** "En C:\Users\Usuario\Downloads\websesitec.com.ar hay
  programada una IA que sirve de ayuda para el sitio sesitec.com.ar, quiero que tomes la programacion de
  esa IA, y la copies en el proyecto soporte, pero vamos a entrenar a la IA con los datos que tenemos en
  la Ayuda de forma tal que se pueda consultar por la interface web o por la IA. Entiendes que quiero?"
  Luego: "si te autorizo, termina los 6 defectos comitea lo que necesites, y luego comienza con la IA".
- **L2 — Exploración de sesitec.** `agente/agente-api.php`: recuperación léxica (FTS5 en SQLite, o
  puntaje por tokens normalizados), prompt "Usá SOLO la información del contexto", máximo 120 palabras,
  texto plano, respaldo con el fragmento más parecido. Proveedores DeepSeek y Gemini por chat completions
  compatible con OpenAI. La clave de DeepSeek está en el código fuente.
- **L3 — Decisiones del dueño:** dónde: "Botón flotante en todas las pantallas"; proveedor: "gemini, pero
  quiero configurarlo en cada cliente con api y key. si no configuro ninguno ese cliente no usa ia, lo
  utiliza directo de la ayuda como lo hace sesitec".
- **L4 — Diseño de T1 (2026-10-26).** En vez de columnas nulables con CHECK en `clientes` (patrón del
  correo, 2026-08), una tabla `asistente_ia_config` 1:1 con FK en cascada y columnas NOT NULL, como
  `webhook_destinos` (patrón más reciente): la fila existe si y solo si el cliente tiene IA, así que el
  todo-o-nada lo da la estructura. Clave cifrada con `EMAIL_CRYPTO_KEY` y AAD `ia:{clienteId}` (T2 la
  suma a `DESTINOS` de `rotar-email-crypto-key.mjs`). Módulo nuevo `asistente`. Proveedor implícito en
  la URL (chat completions compatible con OpenAI); por defecto la de Gemini.
- **L5 — T1 hecha.** Migración `20261026120000_asistente_ia_config` (con `rollback.sql`), aplicada en
  la base de desarrollo y en `soporte_master_test`. Módulo `asistente`: `ClaveIaCifrada` (AAD
  `ia:{clienteId}`), casos de uso ver/configurar/quitar/probar (la clave omitida conserva el ciphertext
  sin descifrarlo; guardar no llama al proveedor), `OpenAiCompatibleModeloIa` (fetch con plazo de 20 s,
  sin seguir redirecciones, motivos de falla saneados que nunca incluyen el cuerpo ni la clave) y
  `IaClienteController` (`GET/PATCH/DELETE /clientes/:id/ia`, `POST /clientes/:id/ia/probar`, solo
  ROOT). Tests: 8 archivos, 64/64 (unitarios, integración del repositorio, e2e con guards reales: 401
  y 403 en las 4 rutas sin escribir nada; smoke de `app.module`). Lint y typecheck limpios. Feature
  nueva: sin TDD obligatorio (CLAUDE.md §6.1).
- **L6 — T2 hecha.** RED: los 2 casos nuevos de `rotar-email-crypto-key.integration.spec.ts` fallaron
  por la razón correcta (`migradas: 1` en vez de 2: la clave de IA no se rotaba, y una clave movida de
  cliente no revertía la transacción). GREEN: entrada `asistente_ia_config.clave_cifrada` con AAD
  `ia:{cliente_id}` en `DESTINOS`; `--verificar` la recorre. `proceso.spec` reproduce el schema hasta
  la migración nueva. Cabecera de `rotate-email-crypto-key.ps1` (ASCII, CRLF) y runbook §5
  actualizados; la cabecera ya omitía los webhooks. Rotación 42/42, lint limpio.
- **L7 — Verificación independiente de T1+T2 (`gentle-ai-verify`).** S7 PASS (la clave nunca sale,
  solo ROOT, migración y rollback coherentes, AAD consistente con la rotación; T2 sin observaciones).
  S4 FAIL por B1: `modelo: "   "` pasaba `@IsNotEmpty`, el caso de uso lo recortaba y se guardaba vacío
  con 200. Avisos: A1 clave de solo espacios se guardaba; A2 `clave: null` daba un 503 que culpaba a
  `EMAIL_CRYPTO_KEY` (el `catch` se tragaba cualquier error); A3 un id que no es UUID daba 500; A4 el
  mensaje de URL no nombraba el largo.
- **L8 — Corrección de B1 y A1-A4, con TDD.** RED: 16 tests (e2e de modelo y clave de solo espacios,
  `clave: null`, id no UUID en las 4 rutas; `validarModeloIa` y `validarClaveIa`; un error de cifrado
  ajeno no se disfraza de 503) fallaron por la razón correcta. GREEN: `validarModeloIa` y
  `validarClaveIa` en el dominio miden piso y techo sobre el valor recortado; `ValidateIf` en vez de
  `IsOptional` para `clave`; el `catch` solo traduce el error de `EMAIL_CRYPTO_KEY` y propaga el resto;
  `ParseUUIDPipe` en las 4 rutas; el mensaje de URL nombra el tope. `src/asistente` 82/82, lint y
  typecheck limpios.
- **L9 — T3 hecha.** `POST /asistente/consultas` (`KB:LECTURA`, como leer la Ayuda; cupo de 10
  consultas por minuto por persona, tracker = `sub` del JWT, storage en Postgres). La fuente lee
  `kb_articulos` en cada consulta con la regla de visibilidad del listado (sin `KB:VER_TODOS`, solo
  publicados y activos). Búsqueda pura en `busqueda-ayuda.ts`: fragmentos por encabezado de markdown
  (parte por párrafos los de más de 1200 caracteres), texto normalizado, lematizador liviano para
  español (terminaciones, diptongos ue/ie, raíz de hasta 6 letras) y puntaje ponderado por rareza
  (IDF). La primera versión, sin rareza ni lematizador, fallaba contra la Ayuda real: "¿Cómo creo un
  ticket?" no traía "Crear un ticket" porque "ticket" aparece en todos lados y "creo" no coincidía con
  "crear"; con los dos ajustes la trae primera, y "cómo apruebo una compra" trae `compras-estados`.
  Modos: `ia` (el modelo redacta con 3 fragmentos, temperatura 0.2, instrucciones en neutro con
  "usted", cita los artículos), `respaldo` (sin IA, clave indescifrable, ROOT sin cliente o falla del
  proveedor: el fragmento más parecido, recortado a 700 caracteres) y `sin_resultados` (lo dice y
  sugiere crear un ticket; no llama al proveedor). La persona nunca ve un error del proveedor.
  Tests: 11 archivos, 125/125 (e2e con guards, throttler y Prisma reales: 401, 403 sin `KB:LECTURA`,
  un artículo no publicado no llega a quien no tiene `KB:VER_TODOS`, 429 al pasar el cupo y otra
  persona conserva el suyo). Lint y typecheck limpios.
  Hueco de contenido para la próxima tanda de Ayuda: no hay una sección dedicada a dar de alta un
  equipo ("Nuevo equipo" solo aparece mencionado); "cargar un equipo nuevo" trae secciones vecinas.
- **L10 — T4 hecha.** Clientes: acción "IA" (`ConfigurarIaDialog`, molde del de correo) que propone
  Gemini al configurar por primera vez, no prellena nunca la clave, la omite del body si queda vacía,
  muestra el resultado de "Probar" y quita la configuración detrás de una confirmación. El schema
  espeja al dominio: recorta antes de medir (un modelo de solo espacios es vacío), URL https sin
  credenciales, topes copiados en `limites.ts` con su centinela. Asistente: `AsistenteFlotante` en
  `AppShell`, en todas las pantallas para quien tiene `KB:LECTURA` (el mismo permiso que exige el
  backend); conversación local, enlace `/kb/:id` por artículo citado, aviso "Texto tomado de la Ayuda"
  en modo respaldo, "Ir a Tickets para crear uno" sin resultados (no existe una ruta de alta directa:
  el alta es un diálogo de `/tickets`), el 429 del throttler (que llega en inglés) se muestra en
  español dentro de la conversación. Enter envía, Mayús+Enter salta de línea. Copy nuevo en neutro
  con "usted" (el diálogo de correo de `main` sigue en voseo: lo corrige T7 de `fix/defectos-ayuda`).
  Front: lint y type-check limpios; `asistente` + `clientes` + `shell` 159/159.
- **L11 — T5, runbook.** Sección "Asistente de IA de la Ayuda" en `DEPLOY-VPS-runbook.md`: migración,
  sin variables nuevas, rotación, HTTPS saliente al proveedor, cupo, smoke y rollback. Los artículos
  de Ayuda NO se escribieron: la escritura de Ayuda está suspendida (AGENTS.md, retomada al cerrar la
  tanda del 2026-10-26) y solo se levanta con un aviso explícito del dueño. Para la próxima tanda:
  (a) un artículo del asistente (qué responde, de dónde sale, modo de respaldo, el cupo de 10 por
  minuto); (b) en el artículo de clientes, la acción "IA" (URL, modelo, clave que no se muestra,
  Probar, Quitar); (c) una sección sobre dar de alta un equipo (L9).
- **L12 — Verificación independiente de T3+T4 (`gentle-ai-verify`).** Sin blockers: S1, S2, S3, S4
  (front), S5, S6 y S7 PASS; runbook PASS (su sonda contra la Ayuda real confirma el smoke). Avisos:
  A1 `max_tokens` 400 con Gemini 2.5, cuyas fichas de razonamiento cuentan contra el tope: la
  respuesta puede llegar vacía y caer siempre al respaldo sin que se note; A3 sin test de reabrir el
  diálogo; A4 el test comparaba la temperatura contra la propia constante; A5 orden sin desempate por
  id; A6 sin test de artículo inactivo o dado de baja. A2 (el diálogo muestra "Sin IA" mientras carga)
  y A7 (el respaldo devuelve el markdown crudo) quedan como están: A2 es el patrón heredado del
  diálogo de correo y A7 es cosmético (S2 pide texto plano al modelo, no al respaldo).
- **L13 — Corrección de A1, A3-A6.** A1 con TDD: RED con el tope en 400 (`expected 400 to be greater
  than or equal to 2048`), GREEN con 2048; el largo de la respuesta lo acota el prompt y el proveedor
  cobra las fichas usadas. A4: el test fija 0.2 y "como mucho 3 fragmentos" con valores literales de
  la spec. A5: `orderBy` título e id. A6: e2e con un artículo publicado pero inactivo y dado de baja
  que no llega ni con `KB:VER_TODOS`. A3: test de cerrar sin guardar y reabrir. `src/asistente`
  127/127, diálogo 7/7, lint y tipos limpios en back y front.
- **L14 — Pedido del dueño (2026-10-27):** "si" (a levantar la suspensión para escribir los tres
  pendientes de L11 ahora). Se levanta solo para esos tres; al cerrarlos vuelve a regir.
- **L15 — T5, Ayuda.** Artículo nuevo `asistente-de-la-ayuda.md` (dónde está, cómo se usa, de dónde
  salen las respuestas, límite, configuración); sección **IA** en `integraciones-y-clientes.md`;
  sección **Dar de alta un equipo** en `equipos-listado.md` (campos del diálogo real). Neutro con
  "usted". Búsqueda contra la Ayuda real: "cuántas consultas puedo hacer al asistente" trae el
  artículo nuevo, "¿Cómo doy de alta un equipo?" y "¿cómo configuro la IA de un cliente?" traen la
  sección nueva entre los 3 fragmentos. `sync-ayuda` 27/27.
- **L16 — Suites completas (sobre `0bca43dd`).** Frontend 292/292 archivos, 2715/2715. Backend
  815/816 archivos, 10342/10345: fallaron 3 tests de aislamiento entre clientes de
  `src/tickets/interface/controllers/tareas-ticket.e2e.spec.ts`, un módulo que esta rama no toca.
  Solo pasa 29/29, y junto con los e2e del asistente (que crean clientes en la master compartida)
  156/156. El log de la corrida completa estaba filtrado y no guarda el motivo: se registra como
  falla intermitente de la suite completa, no reproducida, sin causa confirmada.
- **L17 — Deploy (2026-10-27).** `1a57be44` en producción por SSH: dump verificado
  (`utc-backfill-20261027-074016`), `DEPLOY OK`, migración master aplicada, `sync-ayuda` 1 insertado y
  7 actualizados, smoke externo correcto. Rollback: volver el VPS a `3d87c0f3` y re-correr `deploy.ps1`.
- **L18 — Validación del dueño:** "ya probe todo y esta ok". Feature cerrada.
- **L19 — Reporte del dueño (2026-10-27):** "al cambiar el modelo IA en un cliente dejo de
  funcionar; En el cliente prueba en desarrollo cambie a gemini-2.5-flash por gemini-2.5-flash-lite y no
  funciona". Reproducido en producción (el cliente Prueba vive ahí) con el código compilado del VPS y
  la clave descifrada en memoria, sin imprimirla: Google responde 404 "This model
  models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use
  models/gemini-3.5-flash-lite". `gemini-2.5-flash`, `gemini-3.5-flash` y `gemini-3.5-flash-lite`
  responden bien con la misma clave. No es un defecto del asistente (cayó al respaldo, como debe),
  pero sí del diseño: Guardar no probaba y limpiaba la prueba anterior, así que la falla fue
  silenciosa. Decisión del dueño ("si hacelo"): Guardar prueba en el acto, y el modelo por defecto
  pasa a `gemini-3.5-flash`.
- **L20 — Guardar prueba el proveedor, con TDD.** RED: 9 tests del backend (caso de uso y e2e:
  prueba con la clave recién cargada o con la guardada, un rechazo guarda igual y devuelve el motivo,
  una clave guardada indescifrable registra el motivo sin llamar al proveedor, una validación fallida
  no llama; centinela del modelo por defecto) y 1 del front (default `gemini-3.5-flash`). GREEN:
  `verificarProveedorIa` compartida por Guardar y Probar; `ConfigurarIaClienteUseCase` prueba después
  de guardar y registra el resultado. Ayuda de Clientes corregida (decía que Guardar no consulta al
  proveedor). Backend `src/asistente` + `sync-ayuda` 161/161, front `clientes` + `asistente` 111/111,
  lint y tipos limpios.
- **L21 — Verificación independiente de `97340c3b`.** PASS sin blockers (sonda RED sobre `main`: los 9
  fallan por la razón correcta). W1: el e2e "probar registra el éxito" pasaba por el `verificadoAt` que
  dejaba el guardado; se agrega un e2e que parte de una prueba de guardado fallida. W2: JSDoc que
  seguía diciendo "sin descifrarlo". W3: import después de una constante. A2: el runbook nombra
  también Guardar. A1 (`max_tokens: 5` en la prueba con modelos que razonan) medido contra Gemini real
  desde el VPS: `gemini-2.5-flash`, `gemini-3.5-flash` y `gemini-3.5-flash-lite` responden "OK" con 5;
  queda como está.
