# Tasks: Formulario público por cliente + QR en equipos

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~6.010 (19 WU, cada una ≤ 400; la más cargada es WU-7 con ~390) |
| 400-line budget risk | High (total); Low por WU |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (WU-1) → PR2 → ... → PR19 (WU-19), un PR por WU |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Modo estándar (feature, sin TDD estricto): los tests viajan en el mismo commit que el código.
Rama tracker: `feat/formulario-publico-qr` (PR draft/no-merge). PR de WU-1 apunta al tracker; el
PR de cada WU-N apunta a la rama de la WU-(N-1); solo el tracker mergea a `main` al final. Cada PR
lleva diagrama de dependencia con 📍, inicio/fin, dependencias previas y fuera de alcance.
Ramas sugeridas: `feat/formulario-publico-qr-wu01` ... `wu19`.

Verificación común por WU (lo que aplique): backend `pnpm lint`, `pnpm typecheck`,
`pnpm vitest run <rutas>`, `pnpm test`; frontend `pnpm lint`, `pnpm type-check`, `pnpm test`;
raíz `node scripts/check-casts-en-specs.mjs` (ratchet 627/116, no debe subir) y
`node scripts/check-roadmap-fresco.mjs`. Todo spec que trunca master llama `usarLockMasterTest()`.

Deuda de Ayuda (escritura suspendida): anotar en commit y PR donde el cambio altere lo que ve el
usuario (WU 3, 5, 16, 19); retención de datos D11 en el PR de la WU-6.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Master: slug, habilitación, congelamiento, VO | PR 1 (base tracker) | `pnpm vitest run src/clientes` | Integración con `soporte_master_test` | Migración aditiva; sin consumidores |
| 2 | Configurar formulario (UC + PATCH) | PR 2 (base PR1) | `pnpm vitest run src/clientes` | e2e ROOT 200 / ADMIN 403 | Ruta y UC nuevos |
| 3 | FE diálogo de configuración | PR 3 (base PR2) | `pnpm vitest run <diálogo>` | N/A: componente aislado | Componente sin uso fuera de su vista |
| 4 | QR en equipo (UC + POST) | PR 4 (base PR3) | `pnpm vitest run src/equipos` | Integración `findByQrHash`; e2e 401/403 | Migración tenant aditiva |
| 5 | FE panel QR + `uqr` | PR 5 (base PR4) | `pnpm vitest run <panel>` | N/A: panel aislado | Revertir dependencia y panel |
| 6 | Tabla `solicitantes_externos` | PR 6 (base PR5) | `pnpm vitest run src/solicitantes-externos` | Integración repo | Tabla huérfana, no toca `tickets` |
| 7 | Solicitante nullable + CHECK + tipos | PR 7 (base PR6) | `pnpm vitest run src/tickets` + `pnpm typecheck` | Integración CHECK, filas viejas | `rollback.sql` (falla si hay externos) |
| 8 | Lectores con datos del externo | PR 8 (base PR7) | `pnpm vitest run src/tickets` | N/A: aserciones sobre tipos ya compilados | Solo conducta de lectura |
| 9 | `IContactoSolicitanteResolver` + listeners | PR 9 (base PR8) | `pnpm vitest run src/notificaciones src/csat` | N/A: dobles | Resolver y listeners |
| 10 | `CrearTicketSoporteUseCase` externo + OMITIR | PR 10 (base PR9) | `pnpm vitest run src/equipos` | Integración carrera con baja | Cambios del UC |
| 11 | Tokens master + pendientes tenant | PR 11 (base PR10) | `pnpm vitest run src/publico` | Integración DELETE RETURNING concurrente | Migraciones aditivas |
| 12 | Resolver cliente + GET contexto + módulo | PR 12 (base PR11) | `pnpm vitest run src/publico` | e2e con `TestHarnessModule` | Módulo sin registrar |
| 13 | Solicitar pedido (POST solicitud) | PR 13 (base PR12) | `pnpm vitest run src/publico` | e2e throttle | Módulo sin registrar |
| 14 | Confirmar pedido (UC) | PR 14 (base PR13) | `pnpm vitest run src/publico` | Integración doble confirmación y 409 | UC sin ruta |
| 15 | POST confirmar + mail del número | PR 15 (base PR14) | `pnpm vitest run src/publico` | e2e dos tenants, guards reales | Ruta en módulo sin registrar |
| 16 | FE: `/c/`, página pública | PR 16 (base PR15) | `pnpm vitest run <middleware, página>` | N/A: sin backend registrado | Revertir middleware y página |
| 17 | BE `GET /soporte/qr` | PR 17 (base PR16) | `pnpm vitest run src/soporte` | e2e orden de rutas | Ruta y UC nuevos |
| 18 | FE D3: `destinoPosLogin`, landing | PR 18 (base PR17) | `pnpm vitest run <login, landing>` | N/A: aserciones de unidad | Revertir login y landing |
| 19 | FE confirmación + registro del módulo + roadmap | PR 19 (base PR18) | `pnpm vitest run <confirmar>` | e2e flujo completo; roadmap | Desregistrar módulo en `app.module.ts` |

Orden verificado contra el diseño: sin errores de dependencia; se conserva WU-1..WU-19.

---

## WU-1 — Master: slug, habilitación y congelamiento

- [x] 1.1 Migración master aditiva: `clientes.slug` varchar(63) UNIQUE nullable, CHECK `clientes_slug_formato_check`, `formulario_publico_habilitado` default `false`, `slug_congelado_at`; actualizar `backend/prisma_master/schema.prisma`.
- [x] 1.2 Test: `SlugCliente` rechaza formato inválido y forma de UUID (`SlugInvalidoError`).
- [x] 1.3 Crear `backend/src/clientes/domain/value-objects/slug-cliente.ts` (`SLUG_REGEX`, rechazo UUID).
- [x] 1.4 Test: `configurarSlug` rechaza `slug === id` y `slug === dbName` (normalizado, guion bajo).
- [x] 1.5 `ClienteEntity.configurarSlug/habilitarFormulario` y mapper.
- [x] 1.6 `IClienteRepository.findBySlug/congelarSlug/cambiarSlugSiNoCongelado` + repo Prisma (CAS).
- [x] 1.7 Integración: unicidad del slug y CAS (`congelarSlug` con 0 filas, `cambiarSlugSiNoCongelado` rechazado).

> **WU-1 con `size:exception`** (2026-10-03): 672 líneas en 31 archivos. Separar el spec de integración de los métodos CAS dejaría el código sin el test que lo prueba, y los 18 dobles de `IClienteRepository` son obligatorios para compilar (criterio del dueño del 2026-09-28).

## WU-2 — Configurar formulario público (BE)

- [x] 2.1 Test unit de `ConfigurarFormularioPublicoUseCase`: sin slug no habilita, slug congelado no cambia, revalida `actor.isGlobalAdmin`.
- [x] 2.2 Crear `ConfigurarFormularioPublicoUseCase` en `backend/src/clientes/application/use-cases/`.
- [x] 2.3 `PATCH /clientes/:id/formulario-publico` + DTO en `clientes.controller.ts` (`JwtAuthGuard, GlobalAdminGuard`).
- [x] 2.4 e2e: ROOT 200 y ADMIN 403.

> **WU-2 partida en dos PRs** (2026-10-03, 642 líneas): WU-2a con el caso de uso y su spec, y WU-2b con el controller, el DTO, el spec del controller y el e2e. Cada mitad viaja con sus tests (criterio del dueño del 2026-09-28).

## WU-3 — FE: diálogo de configuración

- [x] 3.1 Schema Zod del slug (espeja `SLUG_REGEX`) y hook de `PATCH` en `frontend/src/features/clientes/`.
- [x] 3.2 `configurar-formulario-publico-dialog` (molde `configurar-csat-dialog`).
- [x] 3.3 Tests del diálogo y del schema. Anotar deuda de Ayuda en commit y PR.

> **WU-3 con `size:exception`** (2026-10-03): 434 lineas en el frontend. Partirla dejaria el hook de `PATCH` sin su propio test (lo ejercita el spec del dialogo), y el criterio del dueño rechaza esa mitad. Lleva ademas un segundo commit de backend: `code` en el cuerpo de los cuatro errores del slug (`SLUG_INVALIDO`, `SLUG_CONGELADO`, `SLUG_DUPLICADO`, `SLUG_REQUERIDO`), para que el aviso del frontend se decida por `ApiError.code` y no por el texto.

## WU-4 — QR del equipo (BE)

- [x] 4.1 Migración tenant: `equipos_informaticos.qr_token_hash` UNIQUE nullable y `qr_emitido_at`, con `rollback.sql`.
- [x] 4.2 Test unit de `EmitirQrEquipoUseCase`: sin slug falla, regenerar invalida el anterior, congela antes de escribir.
- [x] 4.3 `IEquipoInformaticoRepository.findByQrHash/guardarQrHash`, repo Prisma y `EmitirQrEquipoUseCase` (`randomBytes(16)` base64url, URL armada por el backend).
- [x] 4.4 `POST /equipos/:id/qr` con `@RequiereAcciones('EQUIPOS:MODIFICACION')`.
- [x] 4.5 Integración `findByQrHash`; e2e 401/403; integración CAS concurrente emitir vs cambiar slug.

> **WU-4 partida en tres PRs** (2026-10-03, 1.051 lineas en total): 4a migracion tenant, puerto y repo con su integracion, #305 (267); 4b caso de uso, errores y mapeo con sus specs, #306 (293); 4c endpoint, DTO, modulo, spec del controller y e2e 401/403/emision/regeneracion/slug/carrera CAS, #307 (488), con `size:exception`: el e2e solo prueba la ruta de 4c y separarlo dejaria el endpoint sin su prueba de integracion (criterio del dueño del 2026-09-28). Las otras dos partes compilan y pasan solas con sus tests.

## WU-5 — FE: panel QR

- [x] 5.1 Verificar licencia y tamaño de `uqr` (fallback `qrcode-generator`); agregar dependencia en `frontend/package.json`.
- [x] 5.2 Panel de QR en `equipo-detail-view` (SVG propio, descarga SVG y PNG, aviso de regeneración).
- [x] 5.3 Tests del panel: emitir, regenerar, aviso. Anotar deuda de Ayuda.
- [x] 5.4 Nota operativa en el PR: el lockfile cambia y `deploy.ps1` aborta; instalar a mano con servicios detenidos (no editar scripts de deploy).

> **WU-5 partida en dos PRs** (2026-10-03, 495 lineas sin el lockfile; 9 de lockfile): 5a dependencia `uqr` y utilidades de QR (matriz, path SVG, SVG y PNG, schema Zod) con su spec (114); 5b hook de emision, panel y su montaje en `equipo-detail-view` con el spec del panel (381). Cada parte compila y pasa sola con sus tests. Librería: `uqr` 0.1.3 (MIT, sin dependencias, 28 KB de ESM sin minificar, `sideEffects: false`). El lockfile cambia: el proximo deploy necesita `pnpm install` a mano con los servicios detenidos (`deploy.ps1` aborta).

## WU-6 — Solicitantes externos (tenant)

- [x] 6.1 Migración tenant `solicitantes_externos` (id, nombre, email, telefono, email_verificado_at, timestamps, índice email) con `rollback.sql`; no toca `tickets`.
- [x] 6.2 Test unit de la entidad `SolicitanteExternoEntity`.
- [x] 6.3 Entidad, `ISolicitanteExternoRepository` (`findNombres`) y repo Prisma.
- [x] 6.4 Integración del repo. Anotar retención D11 en el PR.

> **WU-6 partida en dos PRs** (2026-10-03, ~610 lineas): WU-6a con la entidad, el error y su spec unitario, y WU-6b con la migracion, el puerto, el repositorio y su spec de integracion. Cada parte viaja con sus tests. **Retencion D11 a revisar**: los datos del externo se conservan mientras exista el ticket; no hay borrado ni anonimizacion. Anotado en la migracion, en `schema.prisma` y en el cuerpo del PR.

## WU-7 — Solicitante nullable, CHECK y tipos

- [x] 7.1 Migración tenant: `solicitante_id` nullable, `solicitante_externo_id` FK RESTRICT con índice parcial y CHECK `tickets_solicitante_exactamente_uno`, con `rollback.sql`.
- [x] 7.2 Tests: integración del CHECK (ambos o ninguno falla; filas viejas intactas); unit de la invariante en `TicketEntity.create`.
- [x] 7.3 `TicketEntity` y mapper con props nullable.
- [x] 7.4 Ajustes de solo tipos: `tickets.controller.ts` (salteo del nulo), listeners de estado, comentario y CSAT (guard provisorio sin envío), tipos del SLA, DTO y `types.ts` del FE.
- [x] 7.5 Tests de dueño con `null` en `obtener-ticket`, `listar-timeline` y `adjuntar-archivo`. El repo debe compilar.

> **WU-7 en un solo commit, `size:exception`** (2026-10-03, ~490 lineas con tests): ensanchar `solicitante_id` a `string | null` en el schema rompe el typecheck de todos los lectores, asi que el schema, la migracion, la entidad, el mapper y los ajustes de tipo no compilan por separado; y partir el spec de integracion del codigo que prueba separaria el codigo de sus tests. Listeners de estado, comentario y CSAT llevan un guard provisorio (`if (!ticket.solicitanteId) return`) que la WU-9 reemplaza por el resolver del contacto del externo.

## WU-8 — Lectores con datos del externo

- [x] 8.1 Test unit del controller (externo y mixto).
- [x] 8.2 Batch de nombres con `findNombres`; `solicitanteTelefono` solo en el detalle; campos `solicitanteExternoId/solicitanteEsExterno` en `ticket.dto.ts`.
- [x] 8.3 Tests FE de `ticket-header`: con y sin teléfono, y título con `<script>` como texto.
- [x] 8.4 `ticket-header.tsx`: teléfono condicional, sin `dangerouslySetInnerHTML`.

## WU-9 — Resolver de contacto y listeners

- [x] 9.1 Tests: resolver (rama master y externa); comentario público envía un mail, interno ninguno; estado envía mail sin link; CSAT al externo.
- [x] 9.2 `IContactoSolicitanteResolver` y adaptador; plantillas sin link a `/tickets/:id` para externos.
- [x] 9.3 Listeners de estado, comentario público y CSAT usan el resolver (reemplaza el guard provisorio de WU-7).

> **WU-9 partida en dos PRs** (2026-10-03, ~410 lineas con tests): 9a puerto `IContactoSolicitanteResolver`, adaptador y su spec (138); 9b plantillas con `sinLink`, listeners de estado, comentario publico y CSAT sobre el resolver, cableado en `NotificacionesModule`/`CsatModule` y sus specs (~270). Cada parte compila y pasa sola con sus tests. **Deuda de Ayuda**: los solicitantes externos ahora reciben mails (estado, comentario publico y encuesta CSAT, sin link al ticket); el articulo de notificaciones debe mencionarlo en la tanda final.

## WU-10 — `CrearTicketSoporteUseCase` para externos

- [x] 10.1 Test unit de `equipoInvalido` `OMITIR` y `RECHAZAR`.
- [x] 10.2 DTO: `solicitanteExternoId` y `equipoInvalido`; constante `AUTOR_FORMULARIO_PUBLICO` en `tickets/domain/constants`.
- [x] 10.3 Integración: carrera con la baja del equipo conserva el `FOR SHARE` (S5).

## WU-11 — Tokens y pendientes

- [x] 11.1 Migración master `pedido_publico_tokens` (sin PII) y migración tenant `pedidos_publicos_pendientes` (FK equipo SET NULL), con `rollback.sql`.
- [x] 11.2 Test unit de vigencia (`PedidoPublicoTokenEntity`, `PedidoPendienteEntity`; TTL 24 h).
- [x] 11.3 Entidades, puertos y repos Prisma (`DELETE ... RETURNING`, purga de vencidos).
- [x] 11.4 Integración: DELETE concurrente y purga.

> **WU-11 partida en cuatro commits** (2026-10-03, ~1.000 lineas con tests, bajo 400 cada uno): 11a entidad, constante de TTL y puerto del token (227); 11b migracion master, schema, mapper, repo y su integracion (285); 11c entidad, error y puerto del pendiente (250); 11d migracion tenant, schema, mapper, repo y su integracion (~400 con docs). Cada parte compila y pasa sola con sus tests. **Deuda de Ayuda**: ninguna (sin pantalla).

## WU-12 — Contexto público

- [x] 12.1 Tests e2e (`TestHarnessModule`, guards reales): 404 uniforme para slug inexistente, deshabilitado, inactivo y borrado (mismo status, cuerpo y headers sin `Date`); token de B en slug de A da `equipo: null` byte a byte igual a uno inexistente; modos `EXTERNO` y `SESION`.
- [x] 12.2 Test unit de `ResolverClientePublicoService`.
- [x] 12.3 Servicio, `ConsultarContextoPedidoUseCase`, `GET publico/c/:slug/pedido/contexto`, `PedidoPublicoThrottlerGuard` (throttler `contexto`) y `FormularioPublicoModule` sin registrar.

> **WU-12 partida en dos commits** (2026-10-03, ~680 lineas con tests): 12a error uniforme, `ResolverClientePublicoService` y su spec (186); 12b caso de uso, guard `contexto`, controller, `FormularioPublicoModule` (sin registrar en `AppModule`) y el e2e. Cada parte compila y pasa sola con sus tests. **Deuda de Ayuda**: ninguna (sin pantalla; la ruta aun no esta expuesta).

## WU-13 — Solicitud de pedido

- [x] 13.1 Tests: UC no `LISTO` da 404 y no escribe PII en master; plantilla escapa HTML (`<script>`); e2e del throttle (mismo email con XFF distintos comparte cupo y el 4.º da 429; límite por cliente; slug inexistente con contador propio).
- [x] 13.2 `SolicitarPedidoPublicoUseCase`, `PedidoPublicoDto`, `templateVerificarPedido` con `escaparHtml`.
- [x] 13.3 `POST publico/c/:slug/pedido/solicitud` (202 constante, mail por `ITareasSegundoPlano`, trackers `email` y `cliente`).

> **WU-13 partida en tres commits** (2026-10-03, ~1.020 lineas con tests): 13a plantilla y su spec (89); 13b caso de uso y su spec (390); 13c DTO, trackers `email` y `cliente`, ruta `POST solicitud`, wiring del modulo (sin registrar en `AppModule`) y el e2e. Cada parte compila y pasa sola con sus tests. `size:exception` para 13c (el e2e es la mitad del commit y separarlo dejaria el wiring sin prueba). **Deuda de Ayuda**: ninguna (sin pantalla; la ruta aun no esta expuesta).

## WU-14 — Confirmación (UC)

- [x] 14.1 Tests de integración: `Promise.all` de dos confirmaciones da un ticket y un 404; sin ciclo activo da 409, sin ticket y el pendiente sigue válido; `prioridadId` CRITICA se ignora y sale MEDIA.
- [x] 14.2 `ConfirmarPedidoPublicoUseCase`: `txRunner.run`, DELETE RETURNING, error centinela para rollback, `used_at` post-commit, prioridad `MEDIA` por código.
- [x] 14.3 Test unit del UC.

> **WU-14 partida en tres commits** (2026-10-03, ~900 lineas con tests): 14a caso de uso y su spec unit de camino feliz y rollback (495); 14b spec unit de los rechazos 404 y del catalogo defensivo (120); 14c integracion contra tenant efimero (~290). Cada parte compila y pasa sola. 14a supera 400 porque el caso de uso (212) y el doble de sus colaboradores (~190) no se pueden separar de su spec. **Deuda de Ayuda**: ninguna (sin pantalla; sin ruta todavia).

## WU-15 — Ruta de confirmación

- [x] 15.1 Tests e2e: dos tenants con guards reales y `clienteId` inyectado en el body no escribe en A; cliente inactivo, token usado o vencido dan 404; mail con el número.
- [x] 15.2 DTO, `POST publico/c/:slug/pedido/confirmar` (exige `cliente.slug === :slug`; throttler `confirmacion`), `templatePedidoCreado`.

> **WU-15 partida en tres commits** (2026-10-03, ~620 lineas con tests): 15a plantilla `templatePedidoCreado` y su spec (65); 15b `NotificarPedidoCreadoService` y su spec (72); 15c DTO, tracker `confirmacion`, ruta `POST confirmar`, wiring del modulo (sin registrar en `AppModule`) y el e2e. Cada parte compila y pasa sola con sus tests. `size:exception` para 15c (el e2e es ~80 % del commit y es la unica prueba del wiring). **Deuda de Ayuda**: ninguna (sin pantalla; la ruta aun no esta expuesta).

## WU-16 — FE: página pública

- [x] 16.1 Tests: middleware (`/c/` público; `/clientes` y `/compras` siguen protegidas), página en modo `EXTERNO` y `SESION`, schema Zod.
- [x] 16.2 Agregar `"/c/"` a `RUTAS_PUBLICAS` en `frontend/src/middleware.ts`.
- [x] 16.3 `(publico)/c/[slug]/pedido/page.tsx`, schema (límites del DTO) y hooks; copy en voseo, mapeo de 404 y 429. Anotar deuda de Ayuda.

> **WU-16 partida en tres commits** (2026-10-04): 16a middleware y su test (30 líneas); 16b schema, tipos y hooks con sus tests (316); 16c container, formulario, página y tests. Cada parte compila y pasa sola. **Deuda de Ayuda**: pantalla pública nueva `/c/<slug>/pedido` (formulario con nombre, email, teléfono, asunto y descripción; aviso de revisar el correo). Hasta la WU-18, el redirect del modo `SESION` a `/login?siguiente=...` aún no vuelve al destino.

## WU-17 — BE: `GET /soporte/qr`

- [x] 17.1 Tests: unit del UC (slug distinto da 404); e2e de orden de rutas (`/soporte/qr` no llega a `:ticketId`), sesión de otro cliente, token de baja da `equipo: null`.
- [x] 17.2 `ResolverQrAutenticadoUseCase` y `@Get('qr')` declarado antes de `@Get(':ticketId')` en `soporte.controller.ts` (`TICKETS:ALTAS`).

## WU-18 — FE: camino D3

- [x] 18.1 Tests: `destinoPosLogin` (`//evil`, `https:`, `/tickets` caen a `/`), hook `use-login` (incluye selector multi-cliente), middleware de `/login`, landing (coincide / otra organización).
- [x] 18.2 `frontend/src/shared/auth/destino-pos-login.ts` (allowlist solo `/pedido-qr`).
- [x] 18.3 `use-login.ts` y middleware usan `destinoPosLogin`; la página pública redirige a `/login?siguiente=...`.
- [x] 18.4 `(dashboard)/pedido-qr/page.tsx` y props `equipoInicial`/`abiertoInicial` en `ticket-soporte-create-dialog.tsx`.

## WU-19 — Confirmación FE, registro y cierre de roadmap

- [x] 19.1 Test de la página de confirmación: lee `#token=`, `replaceState`, consume solo en el POST, 404.
- [x] 19.2 `(publico)/c/[slug]/pedido/confirmar/page.tsx`.
- [x] 19.3 Registrar `FormularioPublicoModule` en `backend/src/app.module.ts` (ADR-12).
- [x] 19.4 Declarar Cumplida o Desviación (con motivo) en la viñeta "Segunda etapa, punto 1" de `docs/roadmap-comercial.md`; correr `node scripts/check-roadmap-fresco.mjs`.
- [x] 19.5 Anotar deuda de Ayuda y recordar en el PR del tracker: instalación manual de la dependencia QR con servicios detenidos antes del deploy.

## WU-20 — Barrido periódico de pendientes vencidos (remediación W2)

- [x] 20.1 Tests (unit, TDD): `PurgaPendientesVencidosScheduler` recorre los tenants activos, bindea `TenantContext` por tenant, aísla el fallo de uno, no propaga si falla la enumeración, loguea el conteo sin PII.
- [x] 20.2 `purga-pendientes-vencidos.scheduler.ts` (`@Cron`, default cada hora, `PURGA_PENDIENTES_CRON`) y su wiring en `FormularioPublicoModule`; el caso de uso de solicitud conserva su purga.

> **Alcance:** el barrido alcanza a los clientes `activo=true` y no soft-deleted (`listActiveTenants`), con el formulario apagado o no. NO alcanza a un cliente dado de baja. **Deuda de Ayuda**: ninguna (sin pantalla).
