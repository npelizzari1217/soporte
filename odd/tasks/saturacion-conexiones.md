# Saturación de conexiones a Postgres: tope, mensaje al usuario y aviso a ROOT

El Postgres del VPS es compartido; al agotarse las conexiones, el listado de tickets fallaba con
`53300 TooManyConnections` (P2037). Diagnóstico y alivio de infraestructura del 2026-11-09 en L2-L3.

## Specs

- **S1 — Tope de conexiones de soporte:** cada pool tiene un tope ("5 por cliente + espera máx.
  10s"): master 5, tenant 5, ociosas cerradas a los 10 s y espera máxima de una conexión libre de
  10 s. Con 9 tenants, soporte no pasa de 50 conexiones.
- **S2 — Mensaje al usuario:** "Quiuero que cuando se llegue al limite se muestre un mensaje que le
  explique al usuario en forma clara porque no se muestra lo solicitado y los pasos a seguir para
  refrescar la vista." El backend responde la saturación con un error propio (no un 500 genérico) y
  el front lo muestra con la explicación y los pasos, en cualquier pantalla.
- **S3 — Aviso por repetición:** "tambien quiero que exsta alguna forma en la cual si esto se repite
  mucho me de aviso para poder mejorar el servicio y no haya quejas de los cortes o bloqueos."
  Decisiones (L4): "Correo + aviso en pantalla a ROOT"; umbral "5 en 10 minutos (recomendado)", con
  un máximo de un correo por hora.

## Tasks

- [x] T1 — S1 — inline — commit: 7f9c15d8
- [x] T2 — S2 (backend: error de saturación reconocido y mapeado) — inline — commit: 2f7d92bc
- [x] T3 — S2 (front: mensaje claro y pasos en cualquier pantalla) — inline — commit: b1a02e42
- [x] T4 — S3 (conteo, correo a ROOT y aviso en pantalla) — inline — commit: 2f7d92bc + 8d78c3f0

## Log

- **L1 (usuario):** "Me esta sucediendo algo extraño y es que si yo estoy en el listado de tickets y voy en una ventana nueva a otro browser para consultar algo en la web al volver el listado de ticket aparece vasio y me dice que no hay nada para mostrary debo refrescar el browser para que aparezca". Aclaraciones: empezó después del deploy del 08/11; pasa con unos segundos fuera; el texto es "No sepudieron cargar los tickets"; filtros por default.
- **L2 (diagnóstico):** `service-err.log` del VPS: `P2037` / `DriverAdapterError: TooManyConnections` (`53300`) en `ListarTicketsUseCase`. `max_connections=100`, 85 en uso (educandow 51, erp_ml 19). `PrismaService` abre un `pg.Pool` por base sin `max` (default 10): master + 9 tenants llegaban a 100.
- **L3 (decisión e infraestructura):** "Tope + subir max_connections". `max_connections` = 200 en `C:\Program Files\PostgreSQL\16\data\postgresql.conf` (respaldo `postgresql.conf.bak-20261109-053712`), servicio `postgresql-x64-16` reiniciado; verificado `show max_connections` = 200 y todos los servicios del VPS en Running. Educandow (51 ociosas) queda para su repo: se le entregó un prompt.
- **L4 (usuario, decisiones):** tope "5 por cliente + espera máx. 10s"; ociosas a 10 s ("si cambialo a 10"); aviso "Correo + aviso en pantalla a ROOT"; umbral "5 en 10 minutos (recomendado)".
- **L5 (prueba contra la base de test, para T2):** la saturación llega al backend con tres formas distintas, medidas con un pool de 1 conexión ocupada: (a) Postgres sin conexiones → Prisma `P2037`, causa `TooManyConnections` / `53300` (log de producción); (b) pool propio en su tope pasados `connectionTimeoutMillis` → `Error` de `pg`, `message` "timeout exceeded when trying to connect", sin `code`; (c) transacción interactiva sin conexión pasados 2 s (`maxWait` de Prisma) → `PrismaClientKnownRequestError` `P2028`, "Transaction API error: Unable to start a transaction in the given time." `P2028` cubre otros errores de transacción, así que se reconoce por código y mensaje.
- **L6 (exploración T4):** `EMAIL_SENDER` es `TenantAwareEmailSender`: usa el SMTP de cada cliente y, sin contexto de tenant, no envía (`EMAIL_SIN_TENANT_CONTEXT`). Las `SMTP_*` del `.env.example` solo alimentan el backfill. En producción las seis `SMTP_*` están AUSENTES (verificado sin imprimir valores).
- **L7 (usuario):** "Cuenta SMTP del sistema (nueva)": la alerta sale por `SMTP_*` del `.env` del VPS, que carga el dueño. Sin ellas, la alerta queda en el log y en el aviso en pantalla a ROOT.
- **L8 (implementación, pendiente de commit):** T1: `TOPE_POOL_MASTER=5`, `TOPE_POOL_TENANT=5`, `OCIOSA_MS=10_000`, `ESPERA_CONEXION_MS=10_000` en `prisma.service.ts`; RED con el pool construido sin `max`. T2: `origenDeSaturacion` y 503 `SERVICIO_SATURADO` en `prisma-exception.filter.ts`, log `SATURACION_CONEXIONES | origen= | method= | path=`; RED con las tres formas de L5, hermanos (otro `P2028`, otro `Error`) siguen en 500. T3: `shared/lib/saturacion.ts` (aviso con id fijo, pasos y «Reintentar»), `QueryCache.onError` en `query-provider.tsx` y `notifyError`; RED y GREEN, frontend 2840/2840. T4: `MonitorSaturacion` (5 en 10 min, uno por hora, falla de suscriptor al log), `OperacionModule` (correo a ROOT activos por `SMTP_*`, `ALERTA_SATURACION_SIN_SMTP` / `_SIN_DESTINATARIOS` en el log), `GET /operacion/saturacion` con `JwtAuthGuard` + `GlobalAdminGuard`, banner `AvisoSaturacionRoot` en el shell (24 h). El smoke del contenedor atrapó la falta de `AuthModule`. T2 y el backend de T4 van en un mismo commit: el filtro registra en el monitor y no compilan por separado. README y `.env.example` corregidos: `SMTP_*` ya no es «solo para el backfill».
- **L9 (verificación y entrega):** la suite completa local no terminó (tope de 40 min, Postgres compartido con la suite de educandow); sus "FAIL" de `test/fixtures/entorno` son salida esperada de procesos hijos (la config excluye `test/fixtures/**`). El CI de la PR #543 corrió la suite completa con el tope: backend PASS (11m40s), frontend PASS. Revisión nativa (riesgo, resiliencia, confiabilidad) aprobada con advertencias no bloqueantes: el enfriamiento se consume aunque el correo falle; `registrar` recorre la ventana entera en cada evento (acotado a 10 min); el correo usa una sola fecha si el episodio cruza la medianoche; el cableado del módulo lo cubre el smoke. "El correo corta en el primer destinatario" no aplica: `SmtpEmailSender` no lanza. Merge `3b0604bb`; dump `C:\soporte\backups\utc-backfill-20261109-082555`; `DEPLOY OK (3b0604bb)`. Producción: `/api/operacion/saturacion` responde 401 sin sesión; `max_connections`=200, 28 en uso, soporte 1 recién arrancado. Pendiente del dueño: cargar `SMTP_*` en `C:\soporte\backend\.env`.
