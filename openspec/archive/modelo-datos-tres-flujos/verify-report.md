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

---

## Fase 7 (PR-18) — Integración cross-cutting: provisioning completo

> Rama de desarrollo: `feat/pr17b-equipos-interface` (sin commit — ver W3)
> Branch en apply-progress.md: `feat/pr18-integracion`
> Fecha: 2026-06-26
> Veredicto: **PASS-WITH-WARNINGS** — 0 CRITICAL / 4 WARNING / 2 SUGGESTION

---

### Gates (ejecución real, evidencia directa)

| Gate | Resultado |
|------|-----------|
| `jest --config jest.config.ts` | **1446/1446 verdes — 98 suites** (exit 0) |
| `jest --listTests`: smoke.e2e.spec.ts | **PRESENT** — `src/clientes/interface/smoke.e2e.spec.ts` (8 tests) |
| `jest --listTests`: crear-cliente.e2e.spec.ts | **PRESENT** — `src/clientes/infrastructure/crear-cliente.e2e.spec.ts` (14 tests) |
| ESLint sobre archivos Fase 7 (9 archivos `src/`) | **0 errores** (exit 0, sin output) |
| DBs huérfanas post-suite (`soporte_e2e%`, `soporte_test%`) | **0** — query a `pg_database` retorna vacío |
| Tareas 7.A.1–7.C.2 en tasks.md | **8/8 marcadas `[x]`** |

---

### F1 — Análisis adversarial: aislamiento cross-tenant (TenantContext mutable store)

**Diseño verificado correctamente.** El refactor de Batch 4 es el patrón canónico de AsyncLocalStorage:

- `TenantScopeMiddleware.use()` llama `storage.run({ data: null }, next)` — crea un contexto AsyncLocalStorage independiente por request, con su propio objeto `{ data: null }`.
- `TenantGuard.canActivate()` llama `tenantContext.bind(ctx)`, que hace `store.data = ctx` sobre el objeto del scope activo.
- Cada request tiene su propio objeto store (distinto por `run()` independiente). La mutación de `store.data` de la request A nunca afecta el store de la request B — son objetos JavaScript distintos en contextos async distintos.
- La cobertura del middleware en `forRoutes('*')` es total: todas las rutas HTTP pasan por `TenantScopeMiddleware`. Las rutas no-tenant (e.g. `/auth/login`) quedan con `{ data: null }` sin consecuencias.
- `bind()` llama `enterWith()` SOLO como fallback (sin scope previo: unit tests, scripts directos). El path de producción siempre tiene scope previo.

**Veredicto de aislamiento: SEGURO para producción.** No hay fuga cross-tenant posible bajo el modelo de AsyncLocalStorage de Node.js.

**Hallazgo asociado (W1):** los unit tests de `bind()` solo ejercen el fallback. Ver W1.

---

### F2 — PrismaService.onModuleDestroy() pool.end()

Fix real, no regresión. El pool (`masterPool` y `tenantPools`) es privado a PrismaService (no compartido). `$disconnect()` limpia el layer de Prisma; `pool.end()` cierra las conexiones TCP subyacentes. Sin el `pool.end()`, las conexiones idle permanecen abiertas hasta el idle timeout del pool (10 s), lo que impedía `DROP DATABASE` en tests. El `.catch(() => undefined)` hace la operación idempotente ante double-shutdown. Los 2 nuevos tests en `prisma.service.spec.ts` verifican que `pool.end()` se llama correctamente en master y en todos los tenants cacheados.

---

### Hallazgos clasificados

#### WARNING-1 (F1) — Unit tests de TenantContext.bind() solo cubren el path de fallback

**Archivo**: `src/shared/tenancy/tenant-context.spec.ts:119–143`

Los dos tests de `bind()` llaman `tenantContext.bind(ctx)` SIN haber llamado `initScope()` antes. Esto activa el branch `enterWith()` (fallback), NO el branch de mutación del store que es el path de producción.

El path primario de producción — `initScope()` → `bind()` → `store.data = ctx` → `get()` retorna ctx en el scope del controller — NO tiene cobertura de unit test. La búsqueda de `initScope` y `TenantScopeMiddleware` en todos los archivos `.spec.ts` solo aparece en `smoke.e2e.spec.ts` (indirectamente, via HTTP).

No hay test unitario que verifique: `dado un scope creado por initScope(), bind() muta el store y get() retorna el contexto en el mismo scope asíncrono`. El diseño es correcto (AsyncLocalStorage garantiza el aislamiento), pero la cobertura de unit test sobre el path de seguridad crítico es incompleta.

**Impacto**: Si un futuro refactor cambia la lógica de mutación, el smoke e2e es el único net de seguridad. La detección sería tardía.

---

#### WARNING-2 (F3) — dropDatabase() sin pg_terminate_backend / WITH (FORCE)

**Archivo**: `src/shared/infrastructure/persistence/postgres-admin.service.ts:62–65`

`dropDatabase()` ejecuta `DROP DATABASE IF EXISTS "name"` sin antes terminar conexiones activas. La teardown de ambos e2e specs depende de que `prismaService.onModuleDestroy()` (o `nestApp.close()`) hayan cerrado todos los pools antes del drop.

Si cualquier paso de cleanup falla antes de llegar al drop (e.g., `nestApp.close()` interrumpido), el `DROP DATABASE` falla silenciosamente (envuelto en `try/catch`) y la DB queda huérfana.

PG 16 soporta `DROP DATABASE IF EXISTS "name" WITH (FORCE)` que termina conexiones automáticamente. El escenario de fallo es improbable en CI normal, pero el comando es trivial de hacer resiliente.

La run actual muestra 0 DBs huérfanas — evidencia de que el path happy funciona correctamente.

---

#### WARNING-3 (F5) — Todo Fase 7 sin commitear en rama incorrecta

**Git status** (evidencia directa):
- Rama actual: `feat/pr17b-equipos-interface`
- apply-progress.md dice: rama destino `feat/pr18-integracion`
- 12 archivos nuevos (`??`) + 4 archivos modificados (`M`) sin commitear, todos Fase 7

Los archivos nuevos incluyen: `scripts/`, `src/clientes/application/ports/`, `src/clientes/application/use-cases/crear-cliente.use-case.{ts,spec.ts}`, `src/clientes/infrastructure/*.{ts,spec.ts}`, `src/clientes/interface/smoke.e2e.spec.ts`, `src/shared/infrastructure/persistence/postgres-admin.service.{ts,spec.ts}`, `src/shared/tenancy/tenant-scope.middleware.ts`.

Los archivos modificados son: `src/app.module.ts`, `src/clientes/clientes.module.ts`, `src/shared/infrastructure/persistence/prisma.service.{ts,spec.ts}`, `src/shared/tenancy/tenant-context.ts`.

**Bloquea archive**: sin commit en rama correcta, el archive no puede cerrar el change limpiamente.

---

#### WARNING-4 — Rollback compensatorio no verificado con DB real (gap e2e)

El spec requiere: "el sistema MUST quedar en un estado consistente (sin tenant a medio provisionar)". Los 31 unit tests de `crear-cliente.use-case.spec.ts` cubren el rollback con adapters mockeados, pero ningún e2e test simula una falla real de migración o seed con conexiones reales y verifica que el compensatorio `dropDatabase()` efectivamente elimina la DB.

El contrato de "cerrar conexiones antes de retornar" que habilita el rollback está codificado en los adapters (`TenantMigrationRunnerAdapter`, `TenantSeederAdapter`) pero no verificado bajo fallo real. El riesgo es bajo — los adapters tienen `try/finally` explícitos — pero la garantía es solo estructural, no empírica.

---

#### SUGGESTION-1 (F4) — scripts/ sin cobertura ESLint

**Archivo**: `eslint.config.js` — `files: ['src/**/*.ts']` no incluye `scripts/`

`scripts/migrate-tenants.ts` y `scripts/migrate-tenants.runner.ts` no están cubiertos por ninguna regla de ESLint. El código está bien escrito (revisión manual: clean, tipado, idiomático), pero sin enforcement. A medida que crezcan los scripts, los bugs de tipado y estilo quedarán sin detectar automáticamente.

Fix sugerido: agregar `{ files: ['scripts/**/*.ts'], languageOptions: {...}, plugins: {...}, rules: {...} }` a `eslint.config.js`.

---

#### SUGGESTION-2 — Stale JSDoc en TenantGuard

**Archivo**: `src/auth/infrastructure/guards/tenant.guard.ts:9`

```
 *     `bind()` (AsyncLocalStorage.enterWith) para que el contexto persista...
```

Desde Batch 4, `bind()` usa mutación del store mutable en el path primario y `enterWith()` solo como fallback. El comment debería decir `bind()` (mutable store mutation; enterWith como fallback en unit tests/scripts sin scope previo).

---

### Validación de spec clientes-tenancy

| Scenario del spec | Tests que lo cubren | Estado |
|-------------------|---------------------|--------|
| Orden estricto: crear DB → migraciones → seed → alta master → admin con rol ADMIN | `crear-cliente.use-case.spec.ts` (callOrder spy, 31 tests) + `crear-cliente.e2e.spec.ts` (real) | ✓ PASS |
| Rollback compensatorio: drop DB si falla paso intermedio | `crear-cliente.use-case.spec.ts` (5 puntos de fallo) | ✓ PASS (unit only — ver W4) |
| Seed idempotente (ON CONFLICT DO NOTHING) | `crear-cliente.e2e.spec.ts` (3 runs, counts invariantes) | ✓ PASS |
| Usuario admin inicial con rol ADMIN en master | `crear-cliente.e2e.spec.ts` (query directa a master.usuarios + usuariosRoles) | ✓ PASS |
| Catálogos sembrados: 8 estados, 4 prioridades, 3 tipos_ticket, 6 tipo_operacion, 10 tipos_componente | `crear-cliente.e2e.spec.ts` (COUNT por tabla) | ✓ PASS |
| Suspensión mid-sesión → 403 (TenantGuard) | `smoke.e2e.spec.ts` (UPDATE activo=false + GET /tickets/:id → 403) | ✓ PASS |
| Login con credenciales válidas → 200 + JWT | `smoke.e2e.spec.ts` | ✓ PASS |
| Crear ticket SOPORTE + transición ABIERTO→EN_PROGRESO + operaciones timeline | `smoke.e2e.spec.ts` | ✓ PASS |
| Cliente inactivo rechazado en login inicial | `auth` unit tests (PR-05/06, fuera de scope Fase 7) | N/A Fase 7 |

---

### Puntos de riesgo adversariales verificados

| Punto | Estado |
|-------|--------|
| Fuga cross-tenant bajo concurrencia (mutable store vs enterWith) | ✓ SEGURO — AsyncLocalStorage garantiza aislamiento por run() |
| Middleware cubre ALL routes (forRoutes('*')) | ✓ CONFIRMADO — app.module.ts |
| Middleware NO cubre rutas que bypasean NestJS pipeline | ✓ N/A — no hay rutas fuera del pipeline NestJS |
| bind() en fallback (enterWith) es seguro para unit tests / scripts | ✓ CORRECTO — no hay requests concurrentes en ese contexto |
| pool.end() en onModuleDestroy() es idempotente (double-shutdown) | ✓ `.catch(() => undefined)` en ambas llamadas |
| pool.end() no es compartido (pool owned by PrismaService) | ✓ private readonly, no expuesto |
| Teardown e2e: DB dropeada en afterAll aunque tests fallen | ✓ — Jest garantiza afterAll; cada paso en try/catch independiente |
| Teardown e2e: inner afterAll (tenantPool.end) antes de outer (drop) | ✓ — orden Jest correcto |
| Orphan DBs post-suite run (post-merge de la suite completa 1446 tests) | ✓ 0 huérfanas confirmado |
| Branch bookkeeping inconsistente | ⚠ WARNING-3 |

---

### Siguiente fase recomendada

`sdd-archive` — no hay CRITICALs que bloqueen el cierre. Sin embargo, **W3 es un prerequisito hard**: la rama debe ser reconciliada y el work commiteado antes de archivar. Los demás warnings son mejoras de hardening y cobertura, no bloqueos funcionales.
