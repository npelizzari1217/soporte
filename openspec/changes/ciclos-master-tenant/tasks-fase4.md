# Tasks — ciclos-master-tenant · FASE 4 (backend: tickets/compras/reparaciones/equipos usan el ciclo ACTIVO)

Fuente: `design-fase4.md` (ADR-1..6, ADR-4-Repo). Alcance: SOLO backend, 4 módulos. TDD estricto RED→GREEN.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100-1300 (domain/app compartido + 4 módulos + specs) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 infra compartida → PR2 tickets → PR3 compras → PR4 reparaciones → PR5 equipos |
| Delivery strategy | ask-on-risk (asumido; no especificado en este request) |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `SinCicloActivoError` + `ResolverCicloActivoParaCreacion` + export `CICLO_CLIENTE_REPOSITORY`/resolver desde `TicketsModule` + verificación ValidationPipe | PR1 (base) | ~150-200 líneas. Bloqueante para PR2-5. |
| 2 | Tickets: creación auto-inyecta activo (409) + listado filtra por ciclo | PR2 (base=PR1) | ~300-400 líneas. |
| 3 | Compras: idem creación + listado | PR3 (base=PR1, independiente de PR2) | ~300 líneas. |
| 4 | Reparaciones: idem creación + listado | PR4 (base=PR1, independiente) | ~300 líneas. |
| 5 | Equipos/Soporte: solo creación (sin listado propio) | PR5 (base=PR1, independiente) | ~150-200 líneas, la más chica. |

PR2-5 son independientes entre sí una vez mergeado PR1 (tocan archivos disjuntos por módulo). Pueden ir stacked-to-main en cualquier orden tras PR1.

## Phase 1: Infraestructura compartida (PR1) — [x] COMPLETA

- [x] 1.1 RED→GREEN `tickets/domain/errors/tickets.errors.ts`: agregar `SinCicloActivoError` (name machine-readable, mensaje ADR-2).
- [x] 1.2 RED `tickets/application/services/resolver-ciclo-activo.service.spec.ts`: test `resolver()` retorna `Result.ok(activo)` cuando `findActive()` devuelve ciclo; test `Result.fail(SinCicloActivoError)` cuando `findActive()` retorna null.
- [x] 1.3 GREEN `tickets/application/services/resolver-ciclo-activo.service.ts`: implementar `ResolverCicloActivoParaCreacion` (ADR-1), inyecta `ICicloClienteRepository`.
- [x] 1.4 `tickets/tickets.module.ts`: agregar provider `ResolverCicloActivoParaCreacion` (useFactory + inject `CICLO_CLIENTE_REPOSITORY`, patrón igual a `NumeradorTicket`); exportar `CICLO_CLIENTE_REPOSITORY` y `ResolverCicloActivoParaCreacion` en `exports`.
- [x] 1.5 Verificar (no asumir): confirmar en `backend/src/app.module.ts` que `ValidationPipe` es `{ whitelist: true, transform: true }` SIN `forbidNonWhitelisted`, y que los 4 HTTP DTO de creación son interfaces planas (no class-validator) → un `cicloId` sobrante en body NO dispara 400 (el pipe salta validación por `metatype === Object`); documentar el hallazgo como comentario en cada DTO tocado en Fases 2-5. **Nota de ejecución:** confirmado con test dedicado (`tickets.dto.validation-pipe.spec.ts`) en vez de solo comentario — el comentario detallado del hallazgo en cada DTO específico de compras/reparaciones/equipos queda diferido a sus PRs (2-5) cuando se toquen esos archivos.
- [x] 1.6 Verificar predicado `findActive()` en `PrismaCicloClienteRepository` (tickets-side, ya `activo:true, deletedAt:null`) vs. repo admin — alinear si difiere (R7). No unificar. **Resultado:** ambos repos ya usan `where: { activo: true, deletedAt: null }` — sin divergencia, sin cambio de código necesario.

## Phase 2: Tickets (PR2, base=PR1)

- [ ] 2.1 RED `crear-ticket.use-case.spec.ts`: mock `ResolverCicloActivoParaCreacion`; test sin activo → `SinCicloActivoError`; test con activo → `ticket.cicloId === activo.id` (ignora cualquier valor previo).
- [ ] 2.2 GREEN `crear-ticket.use-case.ts`: quitar `cicloId` de `CrearTicketDto`; inyectar resolver; resolver activo tras validar solicitante, antes de generar número; usar `cicloActivo.id`.
- [ ] 2.3 `tickets.module.ts`: agregar `ResolverCicloActivoParaCreacion` al `inject` de `CrearTicketUseCase`.
- [ ] 2.4 `interface/dtos/tickets.dto.ts`: remover `cicloId` de `CreateTicketHttpDto`; agregar `cicloId?: string` a `ListarTicketsQueryDto`.
- [ ] 2.5 `interface/controllers/tickets.controller.ts`: `POST /tickets` deja de pasar `cicloId`; mapear `SinCicloActivoError → 409 ConflictException`. `GET /tickets` pasa `q.cicloId` al use case.
- [ ] 2.6 RED→GREEN `i-ticket.repository.ts` + `prisma-ticket.repository.ts`: `TicketFiltros.cicloId?`; `findAll` agrega `where.cicloId` cuando viene.
- [ ] 2.7 RED `listar-tickets.use-case.spec.ts`: sin query → usa activo; con `cicloId` → histórico; sin activo ni query → `[]`.
- [ ] 2.8 GREEN `listar-tickets.use-case.ts`: inyectar `ICicloClienteRepository`; resolver `cicloEfectivo = filtros?.cicloId ?? (await cicloRepo.findActive())?.id`; sin ninguno → `Result.ok([])` sin llamar `findAll`.
- [ ] 2.9 `tickets.module.ts`: agregar `CICLO_CLIENTE_REPOSITORY` al `inject` de `ListarTicketsUseCase`.
- [ ] 2.10 RED→GREEN `tickets.controller.spec.ts`: test 409 en creación sin activo; test creación ignora `cicloId` del body; test listado default/histórico/vacío.

## Phase 3: Compras (PR3, base=PR1)

- [ ] 3.1 RED→GREEN `crear-ticket-compra.use-case.spec.ts` / `.ts`: mismo patrón 2.1-2.2 (usa `CrearTicketDto` ya sin `cicloId`).
- [ ] 3.2 `compras.module.ts`: agregar `ResolverCicloActivoParaCreacion` y `CICLO_CLIENTE_REPOSITORY` al `inject` de `CrearTicketCompraUseCase` y `ListarComprasUseCase`.
- [ ] 3.3 `interface/dtos/compras.dto.ts`: remover `cicloId` de `CreateTicketCompraHttpDto`; agregar DTO de query `ListarComprasQueryDto { cicloId?: string }`.
- [ ] 3.4 `interface/controllers/compras.controller.ts`: `POST /compras` no pasa `cicloId`, mapea 409; `GET /compras` acepta `@Query() q` y pasa `q.cicloId`.
- [ ] 3.5 RED `listar-compras.use-case.spec.ts`: default activo / histórico / sin activo ni query → `[]`.
- [ ] 3.6 GREEN `listar-compras.use-case.ts`: `execute(cicloId?: string)`, inyecta `ICicloClienteRepository`, resuelve `cicloEfectivo`, filtra `ticket.cicloId === cicloEfectivo` en el loop (o `[]` si no hay efectivo).
- [ ] 3.7 RED→GREEN `compras.controller.spec.ts`: 409 sin activo; listado filtrado.

## Phase 4: Reparaciones (PR4, base=PR1)

- [ ] 4.1 RED→GREEN `crear-ticket-edilicio.use-case.spec.ts` / `.ts`: mismo patrón (nota: `CrearTicketEdilicioDto extends CrearTicketDto`, ya sin `cicloId`).
- [ ] 4.2 `reparaciones.module.ts`: agregar `ResolverCicloActivoParaCreacion` y `CICLO_CLIENTE_REPOSITORY` al `inject` de `CrearTicketEdilicioUseCase` y `ListarReparacionesUseCase`.
- [ ] 4.3 `interface/dtos/reparaciones.dto.ts`: remover `cicloId` de `CreateTicketEdilicioHttpDto`; agregar `ListarReparacionesQueryDto { cicloId?: string }`.
- [ ] 4.4 `tickets-edilicio.controller.ts`: `POST` no pasa `cicloId`, mapea 409. `reparaciones.controller.ts`: `GET` acepta `@Query() q`, pasa `q.cicloId`.
- [ ] 4.5 RED `listar-reparaciones.use-case.spec.ts`: default activo / histórico / `[]`.
- [ ] 4.6 GREEN `listar-reparaciones.use-case.ts`: `execute(cicloId?: string)`, inyecta `ICicloClienteRepository`, filtra `ticket.cicloId === cicloEfectivo`.
- [ ] 4.7 RED→GREEN `tickets-edilicio.controller.spec.ts` + `reparaciones.controller.spec.ts` (si existe, o crear): 409 sin activo; listado filtrado.

## Phase 5: Equipos/Soporte (PR5, base=PR1) — solo creación — [x] COMPLETA

- [x] 5.1 RED→GREEN `crear-ticket-soporte.use-case.spec.ts` / `.ts`: mismo patrón (`CrearTicketSoporteDto extends CrearTicketDto`). Inyecta `Pick<ResolverCicloActivoParaCreacion, 'resolver'>` como último parámetro del constructor; resuelve el activo tras validar solicitante+equipo, antes de resolver tipoCodigo; usa `cicloActivo.id` (ignora `dto.cicloId`, aunque el campo sigue existiendo en `CrearTicketDto` base — PR2, fuera de alcance).
- [x] 5.2 `equipos.module.ts`: agregado `ResolverCicloActivoParaCreacion` al `inject` de `CrearTicketSoporteUseCase` (resuelto desde `TicketsModule`, ya exportado en PR1).
- [x] 5.3 `interface/dtos/equipos.dto.ts`: removido `cicloId` de `CreateTicketSoporteHttpDto`; agregado el comentario del hallazgo de ValidationPipe (diferido desde PR1, tarea 1.5) directamente en el DTO.
- [x] 5.4 `ticket-soporte.controller.ts`: `POST /tickets-soporte` ya no pasa `cicloId`; mapea `SinCicloActivoError → 409 ConflictException`.
- [x] 5.5 RED→GREEN `ticket-soporte.controller.spec.ts`: test 409 sin activo; test que confirma que un `cicloId` extra en el body (vía tipo `CreateTicketSoporteHttpDto & { cicloId?: string }`, sin `as any`) se ignora y no se reenvía al use case.
- [x] 5.6 (agregado, no en el plan original — riesgo crítico R2 pedido explícitamente): `equipos.module.spec.ts` NUEVO — bootstrapea `EquiposModule` real (+ `SharedModule`) vía `Test.createTestingModule().compile()` y confirma `ResolverCicloActivoParaCreacion` resuelto por DI. Verificado por sanity-check manual: remover el export de `ResolverCicloActivoParaCreacion` en `tickets.module.ts` hace fallar este test con `UnknownDependenciesException` real (confirmado y revertido).

## Phase 6: Verificación cruzada (cierre, tras PR2-5)

- [ ] 6.1 Correr suite completa backend (`pnpm test`, `pnpm lint`, `tsc --noEmit`) — pegar salida real (DoD sección 9 CLAUDE.md).
- [ ] 6.2 Test de bootstrap por módulo (compras/reparaciones/equipos): `Test.createTestingModule({ imports: [XModule] }).compile()` no debe lanzar error de DI (cubre R2 — `tsc` no lo atrapa). **Nota de ejecución:** la porción de `equipos` ya quedó cubierta en PR5 (tarea 5.6, `equipos.module.spec.ts`) — falta compras/reparaciones cuando se apliquen sus PRs respectivos.
- [ ] 6.3 Confirmar que `PATCH /tickets/:id` sigue aceptando `cicloId` sin cambios (fuera de scope, ADR-3).
