# API pública — etapa 1 (punto 8 de la segunda etapa)

## Objetivo
Que un cliente integre sus propios sistemas con soporte por medio de una API autenticada con clave, empezando por tickets.

## Problema
Hoy el backend solo acepta el JWT de una persona:
- `JwtAuthGuard` lee el usuario del token;
- `TenantGuard` saca el tenant de `cliente_id`;
- toda escritura en un ticket exige un usuario de master como autor (`OperacionTicket.autorId` es NOT NULL).

No hay ninguna forma de que otro sistema se autentique. Además, el BFF reconstruye `Authorization` solo desde la cookie `at` y descarta los headers del que llama (`frontend/src/app/api/[...path]/route.ts:59`).

## Por qué
La competencia (GLPI 11, ManageEngine) ya trae API. Es el punto 8 de la segunda etapa del roadmap.

## Decisión de producto citada
`docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 8 — API pública + webhooks", **etapa 1** (decidido el 2026-10-10, commit `947d95af`). Cada viñeta es un criterio de aceptación más abajo.

**Desviaciones declaradas de antemano:** ninguna. Los webhooks (etapa 2) quedan fuera por decisión y se hacen en un documento aparte.

## Alcance
- **Backend:**
  - modelo en master: flag por cliente, usuario de integración y claves;
  - habilitación por ROOT;
  - administración de claves por el ADMINISTRADOR;
  - guard por clave;
  - endpoints `v1` de tickets;
  - límite por clave;
  - OpenAPI.
- **Frontend:**
  - ruta BFF `/api/v1/*`;
  - diálogo de ROOT para habilitar la API;
  - pantalla "Integraciones" del ADMINISTRADOR.
- **Docs:** README y runbook (notas de deploy), y la deuda de Ayuda anotada.

## Fuera de alcance
- Webhooks (etapa 2).
- Transicionar, asignar, equipos y compras por API.
- Auditoría de cada llamada.
- Cambios en IIS.

## Restricciones
- Arquitectura hexagonal: solo `infrastructure/` importa `@prisma/client`. Errores de dominio con `Result`.
- Aislamiento entre inquilinos: una clave nunca ve datos de otro cliente.
- **Nada se sube a GitHub hasta nuevo aviso del dueño** (2026-10-10): commits y ramas solo locales.
- Features sin TDD obligatorio (`~/proyectos/CLAUDE.md` §6.1), pero cada unidad va con sus tests.
- Comandos: backend `pnpm lint`, `pnpm typecheck`, `pnpm test`; frontend `pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`.
- Todo spec que trunque `soporte_master_test` llama a `usarLockMasterTest()`.

## Criterios de aceptación
Salen de la decisión de producto, viñeta por viñeta.
- **CA1:** la API expone solo tickets: listar, ver, crear y comentar. No hay rutas de transición, asignación, equipos ni compras. Ampliación aprobada por el dueño el 2026-10-10: un `GET /api/v1/catalogos` de solo lectura, porque sin él el alta no se puede usar (ver T5c).
- **CA2:** cada cliente con API habilitada tiene un usuario de integración técnico, con su membresía, que figura como autor de lo que hace la API. El modelo de tickets no cambia. Ese usuario no puede entrar por login (ni contraseña ni SSO) y no aparece como persona en las listas de usuarios.
- **CA3:** las claves son por cliente y están atadas a ese usuario. Cada clave lleva un subconjunto de permisos (lectura, alta, comentario), y la API rechaza lo que la clave no permite.
- **CA4:** solo ROOT habilita o deshabilita la API de un cliente. Solo el ADMINISTRADOR (o ROOT) del cliente crea y revoca claves, desde la pantalla "Integraciones". Con la API deshabilitada, ninguna clave funciona.
- **CA5:** la API entra por `/api/v1/*` en el frontend, que reenvía la clave al backend. IIS no cambia.
- **CA6:** hay un límite de pedidos por clave, del orden de 60 por minuto, y al pasarlo se responde 429.
- **CA7:** hay documentación OpenAPI generada solo para las rutas `v1`.
- **CA8:** cada clave guarda su último uso, visible en la pantalla. No se audita cada llamada.
- **CA9:** la clave en claro se muestra una sola vez al crearla y se guarda hasheada (sha256); nunca se puede volver a ver.
- **Transversal:** una clave del cliente A nunca lee ni escribe datos del cliente B, y una clave revocada, inexistente o de un cliente inactivo recibe el mismo 401.

## Estrategia de entrega
- **Pronóstico:** unas 3.000 líneas en 10 tareas.
- **Estrategia:** `ask-on-risk`, con cadena `feature-branch-chain` (elegida por el dueño el 2026-10-10). El tracker es `feat/api-publica` y cada tarea va en `feat/api-publica-tN`, apilada sobre la anterior. Todo local mientras dure la pausa de GitHub.

## Tareas
- [x] **T1 — Modelo en master** (~350): flag `Cliente.apiHabilitada`, marca de usuario de integración en `Usuario` y tabla de claves (prefijo, hash, permisos, nombre, creador, último uso, revocada). Migración con `rollback.sql`, puerto y repositorio, y tests de integración. Ruta: delegada.
- [x] **T2 — Habilitación por ROOT** (~350): `PATCH /clientes/:id/api`. Al habilitar, crea de forma idempotente el usuario de integración y su membresía. El login con contraseña y con SSO rechaza a ese usuario, y las listas de usuarios lo excluyen. Ruta: delegada.
- [x] **T3 — Claves para el ADMINISTRADOR** (~300): crear (devuelve la clave en claro una sola vez), listar y revocar, con `AdminClienteGuard` y validación del subconjunto de permisos. Ruta: delegada.
- [x] **T4 — Guard por clave y módulo `v1`** (~380): resuelve el hash de la clave a cliente activo con API habilitada y clave vigente. Abre el contexto de tenant y arma un actor sintético (el usuario de integración con los permisos de la clave). Actualiza el último uso y aplica el límite por clave. Ruta: delegada.
- [x] **T5 — Endpoints `v1` de tickets** (~380): listar, ver, crear y comentar (comentario público), reusando los casos de uso existentes, con e2e de aislamiento entre clientes. Ruta: delegada.
- [x] **T5c — Catálogos `v1`** (~300, salió en 600): `GET /api/v1/catalogos` con tipos, prioridades y estados, para que el integrador descubra los ids que exige el alta. Aprobado por el dueño el 2026-10-10. Ruta: delegada (trigger de writer: 2 o más archivos no triviales).
- [x] **T5d — El comentario por API no cuenta como primera respuesta** (~50): `CrearComentarioDto.autorEsIntegracion` (por defecto `false`) y `TicketsV1Controller` lo manda en `true`. Decisión del dueño del 2026-10-10, tratada como bugfix con TDD. Ruta: delegada (trigger de writer: 2 o más archivos no triviales).
- [x] **T5e — El alta `v1` rechaza tipos fuera de TICKETS** (~150, salió en 207): `POST /api/v1/tickets` responde 422 si `tipoId` no es un tipo activo del módulo `TICKETS`, el mismo conjunto que publica `GET /api/v1/catalogos`. Decisión del dueño del 2026-10-10, tratada como bugfix con TDD. Ruta: delegada (trigger de writer: 2 o más archivos no triviales).
- [x] **T6 — OpenAPI** (~200, salió en 572): `@nestjs/swagger` solo para los controllers `v1`, con el JSON servido en una ruta `v1`. Ruta: delegada.
- [x] **T7 — Ruta BFF `/api/v1/*`** (~200, salió en 354): reenvía la clave y la IP del que llama, sin cookies. Ruta: delegada.
- [x] **T8 — Diálogo de ROOT** (~250, salió en 300): habilitar o deshabilitar la API por cliente. Ruta: delegada.
- [x] **T9 — Pantalla "Integraciones"** (~380, salió en 821): listar, crear (con la clave mostrada una sola vez) y revocar, con último uso. Ruta: delegada.
- [x] **T10 — Docs y cierre** (~120): README, notas de deploy en el runbook, deuda de Ayuda, verificación completa y `judgment-day`, porque es un cambio grande y de seguridad. Ruta: delegada para la verificación.

## Verificación
Por tarea: lint, typecheck y los tests del módulo. Al cierre: suites completas de backend y frontend, el ratchet de casts y `judgment-day`. RDD está apagado.

## Progreso
- 2026-10-10: decisiones cerradas (`947d95af`). Documento creado en la rama local `feat/api-publica`, que sale de `docs/roadmap-decisiones-punto-8`.
- 2026-10-10: T1 hecha y partida en dos unidades por tamaño (435 líneas en un solo commit). La costura es limpia: cada unidad lleva sus tests.
  - `feat/api-publica-t1` — `de9bc76e`, 103 líneas: schema, migración `20261011120000_api_publica` con `rollback.sql`, y los mappers de Usuario y Cliente, que omiten las columnas nuevas en el upsert.
  - `feat/api-publica-t1b` — `f9a31471`, 332 líneas: puerto, repositorio Prisma con su spec de integración y el generador de claves `sop_`.
  - Decisiones de esquema: `cliente_id` y `usuario_id` en CASCADE, `creada_por_id` en RESTRICT, `prefijo` y `hash` únicos.
  - Verificación en cada punta: typecheck y lint en 0; en `t1`, 159/159 de persistencia de clientes y auth; en `t1b`, 11/11 de `integraciones`. Antes de partir, los casts daban 617 y 726/726 en `src/integraciones`, `src/clientes` y `src/auth/infrastructure`.
  - Se amplió la superficie con el OK del dueño: 4 mappers y specs que Prisma rompía al tipar las columnas nuevas como obligatorias.
- 2026-10-10: T2 hecha, en 4 unidades apiladas (salió en 759 líneas en total, el doble de lo estimado):
  - `t2` — `1c014cd6`, 100 líneas: `esIntegracion` y `apiHabilitada` en las entidades y los mappers, que ahora los espejan completos;
  - `t2b` — `8f33bdaf`, 290 líneas: `ConfigurarApiClienteUseCase`. Habilitar crea el usuario de integración una sola vez (`integracion+<clienteId>@integraciones.invalid`, rol `USUARIO` sin celdas de matriz, contraseña inutilizable). Deshabilitar conserva usuario y claves;
  - `t2c` — `01e5e9e7`, 283 líneas: `PATCH /clientes/:id/api` con `GlobalAdminGuard`, `IntegracionesModule` y e2e;
  - `t2d` — `ebe2e295`, 90 líneas: el login con contraseña y el SSO (motivo `INTEGRACION`, solo en el log) rechazan al usuario de integración con el error genérico, y la lista de usuarios lo excluye (`MembresiaConUsuario.esIntegracion`).
  - Verificación: lint y typecheck en 0 en cada punta; en `t2c`, 1582/1582 del set completo. Control del orquestador en `t2d`: typecheck y lint en 0, e2e más los specs de login, SSO y lista 100/100; casts en 617.
  - El dueño amplió la superficie: membresías, `sso.errors.ts`.
  - Corrección: el writer dijo que el typecheck no cubre los specs, y es falso. `tsconfig.typecheck.json` incluye `src/**/*`, así que los specs de `src` están cubiertos y dan verde.
  - Pendiente para T5: `tickets/.../usuario-master.checker.ts` tiene que aceptar al usuario de integración como autor, y hay que revisar si aparece en los selectores de asignado.
- 2026-10-10: T3 hecha, en 3 unidades apiladas (787 líneas):
  - `t3` — `eb29509d`, 280 líneas: los errores de dominio y `CrearApiClaveUseCase` con su spec;
  - `t3b` — `c73a7717`, 263 líneas: listar y revocar, `ApiClavesController` (`GET`, `POST` y `DELETE /integraciones/claves`, con `JwtAuthGuard`, `TenantGuard` y `AdminClienteGuard`), y el provider `API_CLAVE_REPOSITORY`, exportado;
  - `t3c` — `93ae87d7`, 247 líneas: e2e con dos clientes, y `ParseUUIDPipe` en `DELETE :id`.
  - Contrato para T9:
    - `GET` → `[{id, nombre, prefijo, permisos, creadaAt, ultimoUsoAt, revocadaAt}]`, sin hash;
    - `POST {nombre, permisos[]}` → 201 con `clave` en claro, la única vez. Responde 422 si la API está deshabilitada, si un permiso está fuera del subconjunto o si el nombre es inválido;
    - `DELETE` → 204, idempotente, y 404 si la clave es de otro cliente o no existe.
  - Verificación: lint y typecheck en 0 en cada punta; `integraciones` más los dos e2e, 45/45; casts en 617. Todos los `TRUNCATE usuarios` existentes usan `CASCADE`, así que `api_claves` no los rompe. La suite completa del backend se corre en segundo plano en `t3c`.
- 2026-10-10: T4 hecha, en 2 unidades:
  - `t4` — `cb9ccc8c`, 389 líneas, `size:exception`: el guard tiene 155 líneas y su spec 234. Partirlo separaría el código de los tests que lo prueban, que es el criterio de excepción de la política de tamaño;
  - `t4b` — `9604e787`, 350 líneas: el throttler por clave (60 por minuto, configurable con `API_V1_RATE_LIMIT`, almacenamiento propio en memoria), `ApiV1Module`, el decorador `@ApiV1(ruta)` y un e2e con un controller de prueba.
  - El guard lee solo `x-api-key` (`sop_…`, hasta 128 caracteres) y da el mismo `401 No autorizado` en todos los rechazos; el motivo real va al log con el id de la clave.
  - Abre el tenant con los mismos bloques que `TenantGuard`, sin modificarlo.
  - Actor sintético: `sub` es el usuario de integración; `permisos` son los de la clave, más `VER_TODOS` si tiene lectura; `modulos` es `['TICKETS']`; `request.apiClave` lleva `{id, prefijo}`.
  - El orden es guard de clave, después throttler, después `AccionesGuard`. Un pedido sin autenticar no consume cupo.
  - Verificación: en `t4b`, lint y typecheck en 0, 69/69 y casts en 617. Control del orquestador en `t4`: typecheck y lint en 0, y `integraciones` 49/49.
  - Para T5: los controllers van dentro de `ApiV1Module`, con `@ApiV1('tickets')` y `@RequiereAcciones`, y el actor llega por `@CurrentUser()`. Un harness de test necesita `AuthModule`, `ApiV1Module` y `TenantScopeMiddleware`.
- 2026-10-10: suite completa del backend en `t3c`: 689/691 archivos y 8318/8334 tests. Las 2 fallas (`pedido-publico-confirmar.e2e`, `feriados-cliente.e2e`) fueron contaminación: otra corrida de vitest de un writer, lanzada en paralelo, borró con su barrido de huérfanas las bases efímeras de esta. Corridos solos dan 21/21. Regla: la suite completa nunca se corre en paralelo con otro vitest del repo.
- 2026-10-10: T5 hecha, en 2 ramas y 5 commits (1.112 líneas):
  - `t5`:
    - `968224f8`, 45 líneas: el checker excluye al usuario de integración como asignable (`estaActivoEnTenant`, `listarTecnicosAsignables`) y lo sigue aceptando como autor;
    - `4c674d86`, 284 líneas: DTOs v1 y presentador;
    - `8c981ddf`, 223 líneas: `GET /api/v1/tickets` y `GET /api/v1/tickets/:id`.
  - `t5b`:
    - `6a9add34`, 218 líneas: `POST /api/v1/tickets` y `POST /api/v1/tickets/:id/comentarios`. El comentario es siempre público: el whitelist descarta `esInterno`;
    - `24cf7bc0`, 342 líneas: e2e.
  - Contrato:
    - `TicketV1 = {id, numero, titulo, descripcion, tipoId, estadoId, estado, prioridadId, ticketReferenciaId, solicitante{nombre,apellido}|null, asignado{nombre,apellido}|null, sla{estado,venceAt}, fechaCierre, createdAt, updatedAt}`, sin ids de usuarios de master;
    - el alta toma `{titulo, descripcion?, tipoId, prioridadId, ticketReferenciaId?}`.
  - El detalle nunca trae comentarios internos (viven en `/timeline`, que v1 no expone), y el e2e lo prueba.
  - Verificación: lint y typecheck en 0 en cada punta; en `t5b`, 836/836; casts en 617. Control del orquestador: typecheck en 0 y e2e de tickets v1 6/6.
  - Cableado: `TicketsModule` no exporta `ListarTicketsUseCase` ni `CrearComentarioUseCase`, así que se arman con `useFactory` en `ApiV1Module`. Lo prolijo sería exportarlos desde `tickets.module.ts` (2 líneas, fuera de la superficie).
  - ~~**Abierto, decisión del dueño:** un integrador no puede descubrir los `tipoId` y `prioridadId` que exige el alta, porque v1 no expone catálogos.~~ Resuelto en T5c.
  - ~~**Abierto, decisión del dueño:** un comentario por API sobre un ticket cuyo solicitante no es el usuario de integración cuenta como primera respuesta de SLA.~~ Resuelto por el dueño el 2026-10-10: no cuenta (T5d).

- 2026-10-10: T5c hecha, en la rama `feat/api-publica-t5c` (sale de `t5b`):
  - **Decisión del dueño:** se aprueba un endpoint de catálogos de solo lectura. Amplía el "solo tickets" de CA1, pero sirve al alta de tickets: sin él, `tipoId` y `prioridadId` no se pueden descubrir.
  - `6a267340`, 289 líneas: `CatalogosV1Controller` (`@ApiV1('catalogos')`, `TICKETS:LECTURA`), DTOs y presentador `v1` propios, specs unitarios, y los tres casos de uso de listado armados con `useFactory` en `ApiV1Module` (`TicketsModule` no los exporta; no se tocó `src/tickets/`);
  - `5c00cccc`, 312 líneas: e2e.
  - Contrato:
    - `{ tipos: [{id, codigo, nombre}], prioridades: [{id, codigo, nombre, orden}], estados: [{id, codigo, nombre, orden}] }`;
    - tipos: solo los activos **del módulo `TICKETS`**. El actor de la clave tiene `modulos: ['TICKETS']`, así que un ticket de un tipo de otro módulo (por ejemplo `EDILICIA`) se crearía y la misma clave no lo podría listar;
    - prioridades: solo las activas, ordenadas por `orden` (crece hacia la más urgente);
    - estados: el catálogo fijo de 6, que no tiene altas ni bajas. Se lee con `findAllActive`, el único listado del puerto. `codigo` es el mismo valor que `TicketV1.estado`, así que no hace falta una marca de "final": `CERRADO` y `CANCELADO` lo dicen;
    - `codigo` va porque es estable (el `nombre` lo edita el cliente). Quedan afuera color, SLA, módulo, `activo` y fechas.
  - El e2e prueba: forma exacta, tipo y prioridad dados de baja excluidos, tipos de otro módulo excluidos, que los ids publicados sirven para crear un ticket, 401 sin clave y con clave inexistente, 403 sin `TICKETS:LECTURA`, y que una clave de A no ve ids ni tipos de B.
  - Verificación (writer, en `t5c`): `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run src/integraciones` 62/62; e2e de catálogos, tickets y auth v1 17/17; casts en 617.

- 2026-10-10: T5d hecha, en la rama `feat/api-publica-t5d` (sale de `t5c`):
  - **Decisión del dueño:** un comentario público hecho por la API no cuenta como primera respuesta de SLA. El usuario de integración habla por el cliente, no por soporte.
  - `ef625c97`, 59 líneas (54+, 5−): `fix(tickets)`. `CrearComentarioDto` suma `autorEsIntegracion?: boolean` y la regla queda: no interno, autor distinto del solicitante **y** autor que no es el usuario de integración. `TicketsV1Controller` lo manda en `true`; el `TicketsController` humano no cambia (queda en `false`). Notificaciones, operación del timeline y visibilidad pública siguen igual.
  - TDD:
    - RED (unitario): `primera respuesta (sla-primera-respuesta R1) > un comentario público del usuario de integración no la registra, aunque no sea el solicitante` falló con `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times` (15/16).
    - RED (e2e, con el código de producción en stash): `T5d: un comentario por API sobre el ticket de una persona no cuenta como primera respuesta` falló con `AssertionError: expected 2026-10-10T17:11:06.229Z to be null` (6/7).
    - GREEN: el spec del caso de uso 16/16, con el test existente "comentario público de un técnico registra la fecha" en verde (el camino humano no cambia); el e2e de tickets v1 7/7.
  - El e2e crea el ticket por API, pasa el solicitante a una persona y comenta por API: `tickets.primera_respuesta_at` queda en `NULL`.
  - Verificación (writer, en `t5d`): `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run` del caso de uso, `src/tickets/interface` y `src/integraciones` 205/205; e2e de tickets v1 7/7; casts en 617.
  - ~~Hallazgo abierto: `POST /api/v1/tickets` acepta un `tipoId` de otro módulo (p. ej. EDILICIA); el ticket se crea y la misma clave no lo puede listar. Pendiente de decisión del dueño.~~ Resuelto por el dueño el 2026-10-10: 422 (T5e).

- 2026-10-10: T5e hecha, en la rama `feat/api-publica-t5e` (sale de `t5d`):
  - **Decisión del dueño:** el alta `v1` responde 422 cuando `tipoId` no es un tipo activo del módulo `TICKETS`, exactamente el conjunto que publica `GET /api/v1/catalogos`.
  - `2e38c264`, 207 líneas (192+, 15−): `fix(integraciones)`. `TiposTicketV1Query` (`application/`) es la fuente única de los tipos `v1`: `listar()` alimenta el catálogo y `validarParaAlta(tipoId)` el alta, los dos sobre `ListarTiposTicketUseCase` con el módulo `TICKETS`. La constante del módulo salió del controller de catálogos. `TicketsV1Controller.crear` valida antes de llamar a `CrearTicketUseCase`. No se tocó `src/tickets/`.
  - El error es `TipoTicketV1NoDisponibleError` (`API_TIPO_TICKET_NO_DISPONIBLE`), con el mismo mensaje para un id inexistente, dado de baja o de otro módulo. Cae en 422 por el caso por defecto de `toHttpException`.
  - Hallazgo: el tipo dado de baja también se aceptaba, porque `CrearTicketUseCase` busca con `findById`, que no mira `activo`. La API interna sigue así; queda fuera del alcance de esta tarea.
  - TDD:
    - RED (e2e): `T5e: un tipo de otro modulo, uno dado de baja y uno inexistente dan el mismo 422 y no crean ticket` falló con `AssertionError: expected [ 201, 201, 422 ] to deeply equal [ 422, 422, 422 ]` (7/8).
    - GREEN: el mismo e2e en verde, con el alta válida existente también en verde; e2e de tickets y catálogos v1 13/13.
    - Los unitarios (`tipos-ticket-v1.query.spec.ts`, 4 casos, y 2 casos `T5e` en el spec del controller) se escribieron junto con la implementación: no tienen RED propio.
  - Verificación (writer, en `t5e`): `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run src/integraciones` 68/68; e2e de tickets y catálogos v1 13/13; casts en 617.

- 2026-10-10: T6 hecha, en 2 ramas (572 líneas escritas, sin contar las 86 del lock):
  - `t6` — `3bdd627a`, 361 líneas: `@nestjs/swagger@11.4.7` y anotaciones en los DTOs y controllers v1, más `ErrorV1` (`error-v1.dto.ts`). Son metadatos y no cambian el comportamiento.
  - `t6b` — `cee8f446`, 211 líneas: `openapi-v1.ts`, el llamado en `main.ts` y el e2e.
  - La costura es limpia: `t6` compila y pasa sola (typecheck y lint en 0; `src/integraciones` 68/68).
  - Contrato: `GET /api/v1/openapi.json`, sin clave y sin límite de requests (se registra en el adapter HTTP, no en un controller). No hay Swagger UI (`ui: false`) ni YAML. `include: [ApiV1Module]` sin `deepScanRoutes`: el documento trae solo las 4 rutas v1.
  - **Decisión del dueño:** el JSON queda público en todos los entornos, producción incluida, porque describe el contrato y no expone datos.
  - El e2e (5 casos) levanta el `AppModule` completo, verifica la lista exacta de rutas y que no aparezcan `/integraciones/claves`, `/clientes`, `/auth`, `/usuarios` ni `/publico`.
  - Verificación (worker, en el working tree antes de partir): `pnpm typecheck` y `pnpm lint` en 0; e2e de OpenAPI 5/5; `src/integraciones` y `test/integraciones` 106/106 en 17 archivos; casts en 617. Control del orquestador: `pnpm typecheck` en 0.
  - Gotcha: `scripts/check-casts-en-specs.mjs` se corre desde la raíz del repo. Desde `backend/` imprime un error y sale con 0.

- 2026-10-10: T7 hecha, en la rama `feat/api-publica-t7` (sale de `t6b`):
  - `354ae7f4`, 354 líneas: `frontend/src/app/api/v1/[[...path]]/route.ts` (91), su `route.test.ts` (253) y un caso en `middleware.test.ts` (10).
  - Problema que cierra: antes, `/api/v1/*` caía en el proxy genérico `[...path]`, que descarta `x-api-key` e inyecta el Bearer de la cookie `at`. Un navegador con sesión abierta convertía su cookie en credencial de la API.
  - Precedencia (Next 15.5.19): el segmento estático `v1` le gana a `api/[...path]`. El catch-all opcional `[[...path]]` hace que también `/api/v1` pelado caiga acá. Lo confirman `pnpm build` (tabla de rutas) y una prueba con `next start`.
  - Headers de salida: se arman de cero con una allowlist, `x-api-key` y `x-forwarded-for`. Nunca viajan `authorization` ni `cookie`, y un test lo prueba con los dos presentes.
  - Headers de respuesta: `content-type`, `retry-after` y `x-ratelimit-*`, que son los que manda `@nestjs/throttler` 6. `set-cookie` y el resto se descartan.
  - Métodos: solo `GET` y `POST`. Para el resto Next responde 405 sin tocar el backend.
  - Traversal: 400 para un segmento vacío, `.`, `..` o con `/` o `\` (cubre `..%2F`, que Next no normaliza). Cada segmento se re-encodea. Next ya reescribe `/api/v1/../x` y `%2e%2e` antes del ruteo.
  - Backend caído: 502 con `{statusCode, message}`. El proxy genérico no lo maneja: el fetch tira y Next da 500.
  - Middleware: sin cambios. Su matcher ya excluye `/api/*`, y un test lo fija para v1.
  - Verificación (writer): `pnpm lint` y `pnpm type-check` en 0; `src/app/api` y `src/middleware` 139/139; `pnpm test` 2180/2180 en 265 archivos; casts en 617. Control del orquestador: el spec de v1, 16/16.
  - Nota abierta, sin acción: `x-forwarded-for` pasa tal como llega (igual que `publico/`), así que un cliente puede falsearlo. Hoy no afecta, porque el límite es por clave. Si algún día se audita por IP, IIS tiene que fijarlo.

- 2026-10-10: T8 hecha, en la rama `feat/api-publica-t8` (sale de `t7`), en 2 commits:
  - `0b87b002`, 28 líneas: `feat(clientes)`. `toResponseDto` (`clientes.controller.ts`) no devolvía `apiHabilitada`; ahora va en `ClienteResponseDto`, junto a `formularioPublicoHabilitado`. La misma función alimenta el detalle y el listado. Spec del controller con las dos formas exactas actualizadas y un caso nuevo.
  - `c43358aa`, 272 líneas: `feat(clientes)`. `configurar-api-dialog.tsx` con su test, `useConfigurarApiCliente` (invalida `["clientes"]`), `apiHabilitada` en el tipo `Cliente`, `ConfigurarApiDto` y `ClienteApiEstado`. `clientes/schemas.ts` solo tiene schemas de formularios, así que no hubo cambio de Zod.
  - Flujo: botón "API" en `ClienteAcciones`, que solo se monta bajo `isGlobalAdmin` (el mismo gating que CSAT, con una aserción sumada al test del gate). El diálogo muestra el estado y una sola acción, que pasa por `ConfirmDialog`; deshabilitar va con estilo destructivo.
  - Texto al deshabilitar: las claves dejan de funcionar en el acto, y las claves y el usuario de integración se conservan; al volver a habilitar, "las claves no revocadas vuelven a funcionar". Texto al habilitar: el ADMINISTRADOR crea las claves desde "Integraciones" (se nombra la pantalla, sin enlace, porque es T9).
  - Deuda de Ayuda, anotada en el commit: el artículo de clientes (ROOT) no tiene la acción "API pública", y falta el artículo de Integraciones (T9).
  - Verificación (writer): backend `pnpm lint` y `pnpm typecheck` en 0, `src/clientes` 405/405; frontend `pnpm lint` y `pnpm type-check` en 0, `src/features/clientes` 86/86, `pnpm test` 2185/2185 en 266 archivos; casts en 617. Control del orquestador: el test del diálogo, 5/5.

- 2026-10-10: T9 hecha, en la rama `feat/api-publica-t9` (sale de `t8`), en 2 commits (821 líneas, el doble de lo estimado):
  - `1ef870ea`, 271 líneas: schemas (`features/integraciones/schemas.ts`, permisos `TICKETS:LECTURA`/`ALTAS`/`COMENTAR` como "Ver", "Crear" y "Comentar tickets", y la validación del nombre de 1 a 100 caracteres, igual que el backend) y hooks con sus tests.
  - `96fbc960`, 550 líneas, `size:exception`: la vista, los diálogos, la página `/admin/integraciones` y el ítem del menú, con sus tests. Son unas 330 líneas de componentes más 215 del test de la vista que los cubre; partirlo separaría el código de sus tests.
  - La clave en claro no entra en la caché: `mutationFn` la saca de la respuesta, se la pasa a un callback y devuelve el resto sin ella, porque React Query guarda en su `MutationCache` lo que devuelve una mutación. Vive solo en un `useState` de la vista y vuelve a `null` al cerrar el diálogo, que ignora el clic afuera. Hay tests que pasan las cachés y `localStorage` a texto y verifican que la clave no aparezca.
  - Gating: `<SoloAdminCliente>` en la vista y el mismo filtro `esAdminCliente` en el menú, con tests para TECNICO, ADMINISTRADOR y ROOT.
  - Listado: el prefijo, "Nunca" sin último uso, y las revocadas con un badge "Revocada" y su fecha, el nombre tachado y sin botón de revocar. Revocar pasa por `ConfirmDialog`.
  - API deshabilitada: el ADMINISTRADOR no tiene de dónde leerlo (el JWT no trae la marca y `/clientes/*` exige `GlobalAdminGuard`). El alta muestra el mensaje del 422 en un toast, y una nota en la página dice que ROOT tiene que habilitarla y da `/api/v1`, `X-Api-Key` y `/api/v1/openapi.json`.
  - Deuda de Ayuda, anotada en los dos commits.
  - Verificación (writer, sobre el cambio entero antes de partir): `pnpm lint` y `pnpm type-check` en 0; `integraciones`, `components/shell` y la página 60/60; `pnpm test` 2199/2199 en 268 archivos; casts en 617. Control del orquestador: `1ef870ea` solo, `pnpm type-check` en 0 y `src/features/integraciones` 5/5.
  - ~~**Abierto, decisión del dueño:** ¿el ADMINISTRADOR tiene que ver si la API está habilitada antes de intentar un alta?~~ Resuelto por el dueño el 2026-10-10: queda como está en la etapa 1, con la nota de la página y el 422. Sin cambio de backend.
  - ~~**Abierto, decisión del dueño:** los mensajes de los errores 422 llegan del backend sin tildes.~~ Resuelto por el dueño el 2026-10-10: se corrigen en el backend. `7b08017a`, 20 líneas: 6 mensajes de `integraciones.errors.ts` (el resto del backend ya llevaba tildes, por ejemplo `tickets.errors.ts:139`) y los 2 fixtures del frontend que imitan el 422. Verificación (orquestador): backend `pnpm lint` y `pnpm typecheck` en 0, `src/integraciones` y `test/integraciones` 106/106; frontend `src/features/integraciones` 13/13.

- 2026-10-11: T10 hecha, en la rama `feat/api-publica-t10` (sale de `t9`):
  - Docs, `09a324b7` (85 líneas):
    - README, sección "API pública (v1)" y la variable `API_V1_RATE_LIMIT`;
    - runbook, sección "API pública (v1)": la migración y su rollback, la dependencia, la variable, la ruta BFF sin cambios en IIS y un chequeo rápido post-deploy con `curl`;
    - roadmap: el punto 8 queda "En curso" (faltan los webhooks); la etapa 1 queda "Cumplida, con cinco desviaciones aprobadas por el dueño"; la deuda técnica suma la nueva subsección "Deuda de Ayuda".
  - `7221e662`: el límite en memoria por proceso se suma como deuda, a pedido del dueño.
  - Verificación completa en `09a324b7` (worker), toda verde:
    - backend: `pnpm lint` y `pnpm typecheck` en 0; `pnpm test` 701/701 archivos y 8400/8400 tests (unos 22 minutos);
    - frontend: `pnpm lint` y `pnpm type-check` en 0; `pnpm test` 268/268 y 2199/2199;
    - casts en 617 y roadmap fresco;
    - ningún `.env`, secreto ni clave en el diff.
  - `judgment-day`, con dos jueces ciegos sobre el diff congelado `66865b6d..7221e662` (98 archivos de código). Ningún juez marcó nada como crítico. Los dos confirmaron tres advertencias que rompían criterios de aceptación; el dueño aprobó corregirlas como bugfix con TDD:
    - **JD-1**, `447ac3f3`: el límite contaba por clave **y por ruta** (unas 300 por minuto), porque `generateKey` de `@nestjs/throttler` mete el controller y el método. Ahora hay un solo cupo por clave para todas las rutas v1 (CA6). RED: `[200, 201, 200, 201]`; GREEN: `[200, 201, 200, 429]`.
    - **JD-2**, `d37b9656`: el actor heredaba el rol de la membresía. Si un ADMINISTRADOR subía al usuario de integración a ADMINISTRADOR, todas las claves saltaban su subconjunto de permisos (CA3). Ahora el rol queda fijo en `USUARIO` (`ROL_ACTOR_API`). RED (e2e): una clave de solo lectura creaba tickets (201 en vez de 403).
    - **JD-3**, `46a0a256`: ver, comentar y `ticketReferenciaId` aceptaban tickets de cualquier módulo. `TicketsV1Query` los limita a TICKETS: un ticket de otro módulo da el mismo 404 que uno inexistente, y 422 como referencia. RED: 200 en vez de 404.
    - Verificación del fix: lint y typecheck en 0; `integraciones` 118/118; `tickets` y `auth` 1925/1925; casts en 617.
    - La re-revisión acotada de los dos jueces sobre el delta `7221e662..46a0a256` no encontró nada. **JUDGMENT: APPROVED.**
  - `271d08ee`: el 404 de `ver` y `comentar` en el OpenAPI menciona el módulo TICKETS. `src/integraciones/interface` y el e2e de OpenAPI dan 21/21.
  - `fd2bf63c`: lo que no se corrigió pasa a la deuda técnica del roadmap:
    - JD-4, confirmado como sugerencia: las notificaciones van a la dirección `.invalid`;
    - vistos por un solo juez: JD-5 (un guardado viejo de cliente vuelve a habilitar la API), JD-6 (un segundo `ThrottlerModule` global) y JD-7 (dos habilitaciones a la vez dan un 500).
  - Pendientes para el dueño, fuera de esta feature:
    - `API_V1_RATE_LIMIT` falta en `backend/.env.example` (a Claude se le negó el acceso a ese archivo);
    - `rollback.sql` deja a los usuarios de integración en `usuarios`;
    - el punto 7 (SSO) del roadmap todavía dice "Pendiente", aunque está desplegado;
    - el próximo deploy necesita la instalación manual del runbook ("4. Cambió un lockfile"), porque `@nestjs/swagger` cambió el lockfile.

## Próximo paso
Feature cerrada: T1 a T10 hechas, en ramas locales. Integrar la cadena a `main`, hacer el push y el deploy son decisiones del dueño, y nada sube a GitHub hasta nuevo aviso.
