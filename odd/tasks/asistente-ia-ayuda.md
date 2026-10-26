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

- [ ] T1 — S4, S7: tabla `asistente_ia_config` 1:1 con `clientes` (master, aditiva, `rollback.sql`),
  clave cifrada, casos de uso ROOT ver/configurar/quitar/probar y endpoints `/clientes/:id/ia`.
- [ ] T2 — S7: `rotate-email-crypto-key.ps1` re-cifra las claves de IA; runbook.
- [ ] T3 — S2, S3, S6, S7: servicio RAG (fragmentación por sección, búsqueda, generación, respaldo) y
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
