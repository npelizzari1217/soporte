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
