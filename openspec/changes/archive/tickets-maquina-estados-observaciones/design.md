# Design: tickets-maquina-estados-observaciones (Change A)

## Technical Approach

Reemplazar el grafo de `BaseTicketStateMachine` por el flujo real de incidencias (7 estados
activos), endurecer los invariantes de bloqueo en `TicketEntity`, introducir
`CrearObservacionUseCase` como disparador transaccional de transición, y cerrar el bug de
autorización del `PATCH /tickets/:id/estado`. Todo reusa la arquitectura existente
(Strategy + factory, repos por puerto, `ITenantTransactionRunner`, `@RequirePermissions`).
**Hallazgo clave**: el puerto transaccional que el propose marcó como CRÍTICO **ya existe**
(`shared/infrastructure/persistence/tenant-transaction-runner.ts`) — no hay que diseñar Unit of
Work nuevo. Catálogo `estados` y `permisos` viven en DBs distintas (tenant vs master): Change A
toca AMBAS.

## Architecture Decisions

### ADR-1 — Reescritura de `BaseTicketStateMachine`
**Choice**: nuevo `VALID_TRANSITIONS` (solo el flujo activo); `CERRADO/CANCELADO/PENDIENTE_APROBACION`
quedan FUERA del grafo (dead data congelada, siguen en catálogo para tickets viejos).

| desde | hacia |
|-------|-------|
| ABIERTO | APROBADO, RECHAZADO |
| APROBADO | EN_PROGRESO, RESUELTO, SUSPENDIDO, SIN_SOLUCION |
| EN_PROGRESO | RESUELTO, SUSPENDIDO, SIN_SOLUCION |
| SUSPENDIDO | EN_PROGRESO |
| RESUELTO / SIN_SOLUCION / RECHAZADO | (terminal) |

**Alternatives**: nueva clase `SoporteStateMachine` registrada en factory dejando la base intacta.
**Rechazada**: SOPORTE usa el fallback (base) y no está registrado; tocar la base es el camino real.
**Rationale**: mínimo cambio; COMPRAS/EDILICIA tienen Strategy propio y NO se ven afectados (riesgo R3).

### ADR-2 — `CrearObservacionUseCase` transaccional (sin filtrar Prisma)
**Choice**: inyectar el puerto existente `ITenantTransactionRunner`. El use case carga ticket +
estado, valida la máquina, muta `estadoId`, y persiste **una sola** `OperacionTicketEntity` de tipo
`OBSERVACION` con `estadoAnteriorId/estadoNuevoId` poblados — todo dentro de UN `txRunner.run()`.
Destino por defecto `EN_PROGRESO` (desde APROBADO); el técnico puede marcar directo a terminal.
**Alternatives**: (a) componer llamando a `TransicionarEstadoUseCase` → abre un `txRunner.run`
anidado (Prisma `$transaction` anidado / re-bind de contexto) — **rechazada, no atómica segura**;
(b) nuevo Unit of Work / callback transaccional en el repo — **rechazada, ya existe el puerto**.
**Rationale**: el `TenantTransactionRunner` re-bindea `TenantContext` con `tx`, así los repos
escriben en la misma transacción sin que el use case conozca Prisma (clean-arch + repository-pattern).

### ADR-3 — Bloqueo por estado en la entidad
**Choice**: `canEdit()` y nuevo `canDelete()` → `true` SOLO si `estado === 'ABIERTO'` y no soft-deleted.
`TERMINAL_STATES` (invariante de `canTransitionTo`) pasa a `{RESUELTO, SIN_SOLUCION, RECHAZADO,
CERRADO, CANCELADO, PENDIENTE_APROBACION}` (todo lo no-transitable). `EliminarTicketUseCase` ahora
carga el estado y valida `canDelete()` → nuevo `TicketNoBorrableError` (422).
**Alternatives**: blacklist de terminales en `canEdit`. **Rechazada**: la regla es whitelist (solo ABIERTO).
**Rationale**: explicitar la invariante de negocio reduce ambigüedad y dead data.

### ADR-4 — Autorización granular del `PATCH estado` (body-aware guard)
**Choice**: nuevo `TransicionEstadoPermisosGuard` que lee `request.body.nuevoEstadoCodigo` y exige:
`APROBADO→ticket:aprobar`, `RECHAZADO→ticket:rechazar`, resto→`ticket:transicionar`. Las transiciones
del técnico NO pasan por aquí: van por `POST /observaciones` gateado con `@RequirePermissions('ticket:observar')`.
**Alternatives**: (a) endpoints dedicados `/aprobar` `/rechazar` con `@RequirePermissions` estático —
rechazada: más superficie + churn de frontend; (b) check fino dentro del use case — rechazada: authz
es preocupación de presentación, no del dominio. **Rationale**: un endpoint, mapeo arco→permiso
centralizado y unit-testeable; cierra el fallo de menor privilegio (CONSTITUCIÓN §7).

### ADR-5 — Siembra mínima de permisos (master) a roles actuales
**Choice**: migración `prisma_master` con 4 permisos nuevos (`b0…014-017`) y asignación:

| permiso | roles actuales |
|---------|----------------|
| ticket:observar | ADMIN, SOPORTE_IT, MANTENIMIENTO, SOLICITANTE |
| ticket:transicionar | ADMIN, SOPORTE_IT, MANTENIMIENTO |
| ticket:aprobar / ticket:rechazar | ADMIN, APROBADOR_COMPRAS |

ADMIN se asigna explícito (el seed base solo cubrió permisos existentes al momento).
**Rationale**: deny-by-default dejaría a TODOS sin `ticket:*` → DoS del flujo. Change B
(`tickets-rbac-4-roles`) redistribuye estos MISMOS códigos a USUARIO/COLABORADOR/TECNICO/ADMINISTRADOR
(acoplamiento de contrato: los códigos deben coincidir EXACTO — riesgo R1).

### ADR-6 — `fechaResolucion → fechaCierre` + borrado de dead code
**Choice**: migración tenant idempotente con bloque `DO $$ … information_schema` (Postgres no soporta
`RENAME COLUMN IF EXISTS` a nivel columna). `fechaCierre` se setea al entrar a CUALQUIER terminal:
`RESUELTO` mantiene fecha provista por el cliente (back-compat); `RECHAZADO`/`SIN_SOLUCION` → `now()`
del servidor. Se ELIMINA la rama de reapertura (`estadoActual==='RESUELTO' → setFechaResolucion(null)`):
RESUELTO ahora es terminal → rama inalcanzable (dead code).
**Rationale**: RENAME preserva datos; un solo concepto de cierre para los 3 terminales.

### ADR-7 — `OBSERVACION` tipo_operacion + endpoint
**Choice**: agregar `tipo_operacion` `f0…009 OBSERVACION` (migración tenant + `tenant-seed.ts`).
Nuevo `POST /tickets/:id/observaciones` (201) → `CrearObservacionUseCase`. Estados nuevos
`SUSPENDIDO (c0…009)` / `SIN_SOLUCION (c0…010)` también se siembran.

## Data Flow (observación con auto-transición)

    POST /observaciones ─► Guard[ticket:observar] ─► CrearObservacionUseCase
                                                          │
                          txRunner.run(  load ticket+estado ─► factory.resolve ─► puedeTransicionar
                                         ─► ticket.updateEstado ─► (si terminal) setFechaCierre
                                         ─► operacionRepo.save(OBSERVACION{estadoAnt,estadoNuevo}) )

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `…/state-machine/base-ticket-state-machine.ts` | Modify | nuevo `VALID_TRANSITIONS` (ADR-1) |
| `…/state-machine/base-ticket-state-machine.spec.ts` | Modify | reescribir RED→GREEN al nuevo grafo |
| `…/domain/entities/ticket.entity.ts` | Modify | `TERMINAL_STATES`, `canEdit`, `canDelete`, rename fechaCierre |
| `…/use-cases/crear-observacion.use-case.ts` (+spec) | Create | observación transaccional (ADR-2) |
| `…/use-cases/eliminar-ticket.use-case.ts` (+spec) | Modify | cargar estado + `canDelete` (ADR-3) |
| `…/use-cases/transicionar-estado.use-case.ts` (+spec) | Modify | fechaCierre 3 terminales, borrar dead code (ADR-6) |
| `…/guards/transicion-estado-permisos.guard.ts` (+spec) | Create | mapeo arco→permiso (ADR-4) |
| `…/controllers/tickets.controller.ts` | Modify | endpoint observaciones, guard en PATCH estado, rename fechaCierre |
| `…/errors/tickets.errors.ts` | Modify | `TicketNoBorrableError`, `ObservacionNoPermitidaError` |
| `prisma_tenant/migrations/*_add_suspendido_sin_solucion_observacion/` | Create | estados + tipo_operacion (idempotente) |
| `prisma_tenant/migrations/*_rename_fecha_resolucion_cierre/` | Create | RENAME COLUMN guarded (ADR-6) |
| `prisma_tenant/seeds/tenant-seed.ts` | Modify | nuevos estados + OBSERVACION |
| `prisma_master/migrations/*_seed_rbac_ticket_estados/` | Create | 4 permisos + asignaciones (ADR-5) |

## Interfaces / Contracts

```ts
// CrearObservacionUseCase — sin imports de Prisma; reusa ITenantTransactionRunner existente
interface CrearObservacionDto {
  ticketId: string;
  texto: string;
  autorId: string;            // del JWT
  estadoDestinoCodigo?: string; // ausente ⇒ default EN_PROGRESO desde APROBADO
}
execute(dto): Promise<Result<TicketEntity, DomainError>>
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | grafo, `canEdit/canDelete`, mapeo arco→permiso, observación dispara transición | jest puro, mocks de puertos (RED→GREEN) |
| Integration | RENAME idempotente, seeds estados/permisos, atomicidad del runner | DB real / runner real |
| E2E | PATCH estado sin permiso → 403; observación de técnico mueve estado | supertest |

## Migration / Rollout

3 PRs encadenados (auto-chain, <400 líneas c/u): **PR1** máquina+catálogo estados+bloqueo;
**PR2** OBSERVACION+`CrearObservacionUseCase`+endpoint+auto-transición; **PR3** guard de seguridad+
seed de permisos (master)+rename fechaCierre+borrado de dead code. Migraciones idempotentes y seguras
multi-tenant (CONSTITUCIÓN §9).

## Open Questions

- [ ] `fechaCierre` para RECHAZADO/SIN_SOLUCION: ¿`now()` servidor (recomendado) o fecha de cliente?
- [ ] ¿`ticket:cerrar` legacy se deja vivo o se deprecia? (B decide).
