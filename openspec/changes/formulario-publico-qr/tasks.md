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

- [ ] 3.1 Schema Zod del slug (espeja `SLUG_REGEX`) y hook de `PATCH` en `frontend/src/features/clientes/`.
- [ ] 3.2 `configurar-formulario-publico-dialog` (molde `configurar-csat-dialog`).
- [ ] 3.3 Tests del diálogo y del schema. Anotar deuda de Ayuda en commit y PR.

## WU-4 — QR del equipo (BE)

- [ ] 4.1 Migración tenant: `equipos_informaticos.qr_token_hash` UNIQUE nullable y `qr_emitido_at`, con `rollback.sql`.
- [ ] 4.2 Test unit de `EmitirQrEquipoUseCase`: sin slug falla, regenerar invalida el anterior, congela antes de escribir.
- [ ] 4.3 `IEquipoInformaticoRepository.findByQrHash/guardarQrHash`, repo Prisma y `EmitirQrEquipoUseCase` (`randomBytes(16)` base64url, URL armada por el backend).
- [ ] 4.4 `POST /equipos/:id/qr` con `@RequiereAcciones('EQUIPOS:MODIFICACION')`.
- [ ] 4.5 Integración `findByQrHash`; e2e 401/403; integración CAS concurrente emitir vs cambiar slug.

## WU-5 — FE: panel QR

- [ ] 5.1 Verificar licencia y tamaño de `uqr` (fallback `qrcode-generator`); agregar dependencia en `frontend/package.json`.
- [ ] 5.2 Panel de QR en `equipo-detail-view` (SVG propio, descarga SVG y PNG, aviso de regeneración).
- [ ] 5.3 Tests del panel: emitir, regenerar, aviso. Anotar deuda de Ayuda.
- [ ] 5.4 Nota operativa en el PR: el lockfile cambia y `deploy.ps1` aborta; instalar a mano con servicios detenidos (no editar scripts de deploy).

## WU-6 — Solicitantes externos (tenant)

- [ ] 6.1 Migración tenant `solicitantes_externos` (id, nombre, email, telefono, email_verificado_at, timestamps, índice email) con `rollback.sql`; no toca `tickets`.
- [ ] 6.2 Test unit de la entidad `SolicitanteExternoEntity`.
- [ ] 6.3 Entidad, `ISolicitanteExternoRepository` (`findNombres`) y repo Prisma.
- [ ] 6.4 Integración del repo. Anotar retención D11 en el PR.

## WU-7 — Solicitante nullable, CHECK y tipos

- [ ] 7.1 Migración tenant: `solicitante_id` nullable, `solicitante_externo_id` FK RESTRICT con índice parcial y CHECK `tickets_solicitante_exactamente_uno`, con `rollback.sql`.
- [ ] 7.2 Tests: integración del CHECK (ambos o ninguno falla; filas viejas intactas); unit de la invariante en `TicketEntity.create`.
- [ ] 7.3 `TicketEntity` y mapper con props nullable.
- [ ] 7.4 Ajustes de solo tipos: `tickets.controller.ts` (salteo del nulo), listeners de estado, comentario y CSAT (guard provisorio sin envío), tipos del SLA, DTO y `types.ts` del FE.
- [ ] 7.5 Tests de dueño con `null` en `obtener-ticket`, `listar-timeline` y `adjuntar-archivo`. El repo debe compilar.

## WU-8 — Lectores con datos del externo

- [ ] 8.1 Test unit del controller (externo y mixto).
- [ ] 8.2 Batch de nombres con `findNombres`; `solicitanteTelefono` solo en el detalle; campos `solicitanteExternoId/solicitanteEsExterno` en `ticket.dto.ts`.
- [ ] 8.3 Tests FE de `ticket-header`: con y sin teléfono, y título con `<script>` como texto.
- [ ] 8.4 `ticket-header.tsx`: teléfono condicional, sin `dangerouslySetInnerHTML`.

## WU-9 — Resolver de contacto y listeners

- [ ] 9.1 Tests: resolver (rama master y externa); comentario público envía un mail, interno ninguno; estado envía mail sin link; CSAT al externo.
- [ ] 9.2 `IContactoSolicitanteResolver` y adaptador; plantillas sin link a `/tickets/:id` para externos.
- [ ] 9.3 Listeners de estado, comentario público y CSAT usan el resolver (reemplaza el guard provisorio de WU-7).

## WU-10 — `CrearTicketSoporteUseCase` para externos

- [ ] 10.1 Test unit de `equipoInvalido` `OMITIR` y `RECHAZAR`.
- [ ] 10.2 DTO: `solicitanteExternoId` y `equipoInvalido`; constante `AUTOR_FORMULARIO_PUBLICO` en `tickets/domain/constants`.
- [ ] 10.3 Integración: carrera con la baja del equipo conserva el `FOR SHARE` (S5).

## WU-11 — Tokens y pendientes

- [ ] 11.1 Migración master `pedido_publico_tokens` (sin PII) y migración tenant `pedidos_publicos_pendientes` (FK equipo SET NULL), con `rollback.sql`.
- [ ] 11.2 Test unit de vigencia (`PedidoPublicoTokenEntity`, `PedidoPendienteEntity`; TTL 24 h).
- [ ] 11.3 Entidades, puertos y repos Prisma (`DELETE ... RETURNING`, purga de vencidos).
- [ ] 11.4 Integración: DELETE concurrente y purga.

## WU-12 — Contexto público

- [ ] 12.1 Tests e2e (`TestHarnessModule`, guards reales): 404 uniforme para slug inexistente, deshabilitado, inactivo y borrado (mismo status, cuerpo y headers sin `Date`); token de B en slug de A da `equipo: null` byte a byte igual a uno inexistente; modos `EXTERNO` y `SESION`.
- [ ] 12.2 Test unit de `ResolverClientePublicoService`.
- [ ] 12.3 Servicio, `ConsultarContextoPedidoUseCase`, `GET publico/c/:slug/pedido/contexto`, `PedidoPublicoThrottlerGuard` (throttler `contexto`) y `FormularioPublicoModule` sin registrar.

## WU-13 — Solicitud de pedido

- [ ] 13.1 Tests: UC no `LISTO` da 404 y no escribe PII en master; plantilla escapa HTML (`<script>`); e2e del throttle (mismo email con XFF distintos comparte cupo y el 4.º da 429; límite por cliente; slug inexistente con contador propio).
- [ ] 13.2 `SolicitarPedidoPublicoUseCase`, `PedidoPublicoDto`, `templateVerificarPedido` con `escaparHtml`.
- [ ] 13.3 `POST publico/c/:slug/pedido/solicitud` (202 constante, mail por `ITareasSegundoPlano`, trackers `email` y `cliente`).

## WU-14 — Confirmación (UC)

- [ ] 14.1 Tests de integración: `Promise.all` de dos confirmaciones da un ticket y un 404; sin ciclo activo da 409, sin ticket y el pendiente sigue válido; `prioridadId` CRITICA se ignora y sale MEDIA.
- [ ] 14.2 `ConfirmarPedidoPublicoUseCase`: `txRunner.run`, DELETE RETURNING, error centinela para rollback, `used_at` post-commit, prioridad `MEDIA` por código.
- [ ] 14.3 Test unit del UC.

## WU-15 — Ruta de confirmación

- [ ] 15.1 Tests e2e: dos tenants con guards reales y `clienteId` inyectado en el body no escribe en A; cliente inactivo, token usado o vencido dan 404; mail con el número.
- [ ] 15.2 DTO, `POST publico/c/:slug/pedido/confirmar` (exige `cliente.slug === :slug`; throttler `confirmacion`), `templatePedidoCreado`.

## WU-16 — FE: página pública

- [ ] 16.1 Tests: middleware (`/c/` público; `/clientes` y `/compras` siguen protegidas), página en modo `EXTERNO` y `SESION`, schema Zod.
- [ ] 16.2 Agregar `"/c/"` a `RUTAS_PUBLICAS` en `frontend/src/middleware.ts`.
- [ ] 16.3 `(publico)/c/[slug]/pedido/page.tsx`, schema (límites del DTO) y hooks; copy en voseo, mapeo de 404 y 429. Anotar deuda de Ayuda.

## WU-17 — BE: `GET /soporte/qr`

- [ ] 17.1 Tests: unit del UC (slug distinto da 404); e2e de orden de rutas (`/soporte/qr` no llega a `:ticketId`), sesión de otro cliente, token de baja da `equipo: null`.
- [ ] 17.2 `ResolverQrAutenticadoUseCase` y `@Get('qr')` declarado antes de `@Get(':ticketId')` en `soporte.controller.ts` (`TICKETS:ALTAS`).

## WU-18 — FE: camino D3

- [ ] 18.1 Tests: `destinoPosLogin` (`//evil`, `https:`, `/tickets` caen a `/`), hook `use-login` (incluye selector multi-cliente), middleware de `/login`, landing (coincide / otra organización).
- [ ] 18.2 `frontend/src/shared/auth/destino-pos-login.ts` (allowlist solo `/pedido-qr`).
- [ ] 18.3 `use-login.ts` y middleware usan `destinoPosLogin`; la página pública redirige a `/login?siguiente=...`.
- [ ] 18.4 `(dashboard)/pedido-qr/page.tsx` y props `equipoInicial`/`abiertoInicial` en `ticket-soporte-create-dialog.tsx`.

## WU-19 — Confirmación FE, registro y cierre de roadmap

- [ ] 19.1 Test de la página de confirmación: lee `#token=`, `replaceState`, consume solo en el POST, 404.
- [ ] 19.2 `(publico)/c/[slug]/pedido/confirmar/page.tsx`.
- [ ] 19.3 Registrar `FormularioPublicoModule` en `backend/src/app.module.ts` (ADR-12).
- [ ] 19.4 Declarar Cumplida o Desviación (con motivo) en la viñeta "Segunda etapa, punto 1" de `docs/roadmap-comercial.md`; correr `node scripts/check-roadmap-fresco.mjs`.
- [ ] 19.5 Anotar deuda de Ayuda y recordar en el PR del tracker: instalación manual de la dependencia QR con servicios detenidos antes del deploy.
