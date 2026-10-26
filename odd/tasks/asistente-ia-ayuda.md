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
- [ ] T4 — S4, S5, S6: frontend — botón flotante con el chat y acción "IA" en Clientes.
- [ ] T5 — Ayuda del asistente y de su configuración, runbook del deploy.

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
