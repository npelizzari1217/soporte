# Verify Report — modelo-datos-tres-flujos / Fase 5 (Reparaciones-Edilicia)

> Rama verificada: `feat/pr15b-reparaciones-interface`
> Commit código: `0184926` | Commit docs: `359a456`
> Fecha: 2026-06-23
> Veredicto: **PASS-WITH-WARNINGS** — 0 CRITICAL / 2 WARNING / 2 SUGGESTION

---

## Gates

| Gate | Resultado |
|------|-----------|
| `pnpm test` | **1107/1107 verdes** — 226 en reparaciones (14 suites) |
| `pnpm lint` | **0 errores** |
| `tsc --noEmit` | **0 errores** |
| Fitness rule `@prisma/client` fuera de `infrastructure/` | **0 violaciones** |
| Tests `.skip`/`.todo` en reparaciones | **0** |

---

## Hallazgos clasificados

### WARNING-1 — Test de no-auto-transición pasivo (structurally correct, assertively weak)

**Archivo**: `backend/src/reparaciones/application/use-cases/completar-subtarea.use-case.spec.ts:258–283`

El test `'al llegar a 100% el estado del ticket NO cambia (no se llama a transición)'` solo
afirma `result.isOk() === true`. El comentario en el código reconoce explícitamente que la
garantía es implícita (no hay `ticketRepo` en el constructor). No hay ningún spy negativo
(e.g., `expect(mockStateMachineFactory.canTransition).not.toHaveBeenCalled()`).

**Riesgo**: Bajo. La garantía estructural es TypeScript-enforced. Pero si alguien refactoriza el
constructor del use case y agrega lógica de auto-transición accidental, este test no lo detectaría.

---

### WARNING-2 — CTE findSubtree NO integration-tested dentro de `$transaction`

**Archivo**: `backend/src/reparaciones/infrastructure/persistence/prisma/prisma-reparaciones.integration.spec.ts:225–290`

Los tests de integración de `PrismaUbicacionRepository.findSubtree()` se ejecutan via
`withTenant() → tenantContext.run()`, que **no abre una transacción Prisma**. La atomicidad
real (findSubtree + delete + operaciones en la misma `$transaction`) solo está verificada a
nivel unit con repos mockeados. No hay cobertura de integración que confirme que
`$queryRawUnsafe` funciona correctamente sobre el client transaccional de Prisma 7 adapter mode.

**Riesgo**: Bajo (las integration tests del CTE pasan con normalidad; Prisma 7 soporta
`$queryRawUnsafe` en transactions). Existe un gap de cobertura para el flujo completo transaccional.

---

### SUGGESTION-1 — Guard `=== 100` en EdiliciaStateMachine no cubre ruta DB→Decimal→number

**Archivo**: `backend/src/reparaciones/domain/state-machine/edilicia-state-machine.ts:81`

`ctx.porcentajeAvance === 100` usa igualdad estricta. Los tests de la state machine usan literales
enteros. La ruta DB→`NUMERIC(5,2)`→`Decimal.toNumber()`→guard no está cubierta por un test
end-to-end a nivel state machine. Con `NUMERIC(5,2)` el riesgo de floating-point es mínimo,
pero un test explícito con `porcentajeAvance: 100.00` desde el mapper confirmaría la invariante.

---

### SUGGESTION-2 — Deduplicación en EliminarUbicacionUseCase no integration-tested

**Archivo**: `backend/src/reparaciones/application/use-cases/eliminar-ubicacion.use-case.ts:77–95`

La lógica de deduplicación `ticketIdVistos` está cubierta por unit tests con repos mockeados.
No hay integration test que cree un árbol padre→hijo donde ambos nodos sean referenciados por
el mismo `ticket_edilicia.ticket_id` y verifique que se genera una sola `OperacionTicket`.
El schema previene este escenario (1 `ticket_edilicia` tiene 1 `ubicacion_id`), pero la esquina
no está testeada a nivel integration.

---

## Checklist de riesgos adversariales

| Riesgo verificado | Estado |
|-------------------|--------|
| Guard EN_PROGRESO→RESUELTO: false si avance<100, true si =100, false si undefined | ✓ PASS |
| CompletarSubtarea NO auto-transiciona | ⚠ WARNING-1 |
| AvanceCalculator: 33.33, 0, 100.00, división por cero (NULLIF) | ✓ PASS |
| Recálculo en misma tx (callOrder spy) | ✓ PASS |
| Soft-delete excluido del recálculo (numerador y denominador) | ✓ PASS |
| CTE findSubtree: ancla + recursión filtran `deleted_at IS NULL`, SQL parametrizado | ✓ PASS |
| CTE findSubtree ejecutada dentro de `$transaction` | ⚠ WARNING-2 |
| CrearTicketEdilicio atómico + ubicación válida + avance=0 inicial | ✓ PASS |
| UBICACION_ELIMINADA sembrado en tenant-seed + TODO eliminado del código | ✓ PASS |
| Schema: NUMERIC(5,2)+CHECK 0-100, self-ref padre_id nullable, UNIQUE ticket_id (1:1) | ✓ PASS |
| Guard `subtarea:actualizar` en controller + asignado a rol MANTENIMIENTO en seed | ✓ PASS |
| EdiliciaStateMachine registrada via onModuleInit + bootstrap test usa `moduleRef.init()` | ✓ PASS |
| Todas las tareas 5.A–5.D marcadas `[x]` con código real y tests TDD | ✓ PASS |

---

## Siguiente fase recomendada

`sdd-archive` — no hay issues CRITICAL que bloqueen el cierre del change.

---

## Fase 6 — Equipos (verify adversarial)

> Rama verificada: `feat/pr17b-equipos-interface` (tip 7bc088e)
> Fecha: 2026-06-23
> Veredicto: **PASS-WITH-WARNINGS** — 0 CRITICAL / 3 WARNING / 3 SUGGESTION

---

### Gates (verificados por ejecución directa)

| Gate | Resultado |
|------|-----------|
| `pnpm test` | **1324/1324 verdes** (90 suites) — ejecutado directamente |
| `eslint src/equipos` | **0 errores** |
| `tsc --noEmit` | **0 errores** |
| Fitness rule `@prisma/client` fuera de `infrastructure/` | **0 violaciones** |
| Tests `.skip`/`.todo` en equipos | **0** |

---

### Hallazgos

#### WARNING-1 — P2002 no manejado: soft-delete + re-uso de numero_serie → 500 en lugar de 409

**Archivo**: `backend/src/equipos/application/use-cases/crear-equipo.use-case.ts:44-55`
y `backend/src/equipos/infrastructure/persistence/prisma/prisma-equipo-informatico.repository.ts:44-50`

`findByNumeroSerie()` excluye soft-deleted (`deletedAt: null`). El UNIQUE parcial en DB cubre
TODAS las filas incluyendo soft-deleted (explícito en migration.sql: "el índice aplica también
a filas con deleted_at IS NOT NULL"). Secuencia problemática: soft-delete equipo A (SN-001) →
crear equipo B (SN-001). El app-level check retorna null (equipo A excluido), procede al save,
pero la DB lanza P2002 no capturado → 500 en lugar de 409. El integration test solo prueba
dos inserts directos, no el escenario post-soft-delete.

#### WARNING-2 — TicketSoporteController spec no verifica permiso `ticket:crear`

**Archivo**: `backend/src/equipos/interface/controllers/ticket-soporte.controller.spec.ts:195-217`

El controller tiene `@RequirePermissions('ticket:crear')` en `crearTicketSoporte` (confirmado en
ticket-soporte.controller.ts:75), pero el spec solo verifica los 4 guards a nivel de clase.
No hay assertion `Reflect.getMetadata(PERMISSIONS_KEY, TicketSoporteController.prototype.crearTicketSoporte)`.
Si el decorator se borrara accidentalmente, el test suite seguiría verde. Comparar con
EquiposController spec que SÍ prueba permisos por método (líneas 300-324 del spec).

#### WARNING-3 — Sin integration test para: soft-delete equipo → ticket_soporte permanece intacto

**Archivo**: `backend/src/equipos/infrastructure/persistence/prisma/prisma-equipos.integration.spec.ts`

El spec `[SPEC:equipos/"Soft delete de equipo no borra historial de tickets"]` requiere
verificar explícitamente este comportamiento. La implementación es arquitecturalmente correcta
(EliminarEquipoUseCase no inyecta ticketSoporteRepo; FK es ON DELETE RESTRICT en la migration).
Pero no existe un integration test que cree equipo + ticket_soporte, soft-delete el equipo, y
verifique que ticket_soporte filas permanecen.

#### SUGGESTION-1 — Bootstrap test SOPORTE assertion débil

**Archivo**: `backend/src/app.module.spec.ts:76`

`expect(factory.resolve('SOPORTE')).toBeDefined()` solo verifica no-null. Debería ser
`toBeInstanceOf(BaseTicketStateMachine)`. Si la factory cambiara para lanzar en tipos
no registrados, este test igual pasaría.

#### SUGGESTION-2 — Schema diverge del spec en 3 columnas (más ancho, sin riesgo funcional)

**Archivo**: `backend/prisma_tenant/migrations/20260623150000_add_equipos_schema/migration.sql`

- `equipos_informaticos.numero_serie`: spec VARCHAR(100) → migration VARCHAR(255)
- `componentes_equipo.descripcion`: spec TEXT → migration VARCHAR(255)
- `componentes_equipo.numero_serie`: spec VARCHAR(100) → migration VARCHAR(255)

No hay riesgo de datos perdidos (más ancho que spec) pero hay drift documental.

#### SUGGESTION-3 — `ticketSoporteRepo: any` en EquiposModule factory

**Archivo**: `backend/src/equipos/equipos.module.ts:230`

El parámetro `ticketSoporteRepo` en la useFactory de `CrearTicketSoporteUseCase` está tipado
como `any`. Debería ser `ITicketSoporteRepository` para mantener type safety en el wiring.

---

### Puntos de riesgo verificados OK

| Punto | Estado |
|-------|--------|
| Cross-DB AsignarEquipoUseCase: rechazo (false→ASIGNADO_INVALIDO), wiring sin duplicar | ✓ PASS |
| UNIQUE parcial numero_serie: WHERE NOT NULL en SQL, integration test null-null OK, dup→error | ✓ PASS (ver W-1) |
| ticket_soporte sin asignado_a_id espurio (PR-17a-fix confirmado en migration SQL) | ✓ PASS |
| EquipoInformatico.asignadoAId sigue presente (correcto según spec) | ✓ PASS |
| Atomicidad CrearTicketSoporte: callOrder spy confirma 3 saves dentro de txRunner | ✓ PASS |
| equipo_id=null válido: testeado y NO llama a equipoRepo.findById | ✓ PASS |
| TipoComponenteNoEncontradoError (404) separado de TipoComponenteInactivoError (422) | ✓ PASS |
| Soft delete equipo sin cascade: arquitecturalmente imposible + FK RESTRICT en DB | ✓ PASS (ver W-3) |
| Seed 10 tipos ON CONFLICT DO NOTHING: CPU RAM DISCO MONITOR TECLADO MOUSE GPU FUENTE IMPRESORA RED | ✓ PASS |
| State machine SOPORTE: factory.resolve retorna fallback BaseTicketStateMachine | ✓ PASS (ver S-1) |
| equipo:gestionar en RBAC seed + asignado a SOPORTE_IT | ✓ PASS |
| Guards EquiposController: 4 guards en clase + permisos por método | ✓ PASS |
| ticket:crear en TicketSoporteController: código correcto (línea 75) | ✓ PASS (ver W-2) |
| ObtenerEquipo/ListarEquipos/ObtenerComponentes: soft-delete guard + tenant scoping | ✓ PASS |
| Todas las tareas 6.A–6.D marcadas [x] con código real y tests TDD | ✓ PASS |

---

### Siguiente fase recomendada

`sdd-archive` — los 3 WARNING son gaps de test coverage/edge cases sin CRITICAL que bloquee.
