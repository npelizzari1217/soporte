# Apply Progress: Horario laboral por cliente

## WU-1 — Tabla tenant, migración y seed

**Branch**: `feat/horario-laboral-por-cliente-wu01` · **Base**: `main` · **Status**: Complete

### Completed Tasks
- [x] 1.1 Modelo `CalendarioLaboralDiaCliente` (`calendario_laboral_dias_cliente`) en `backend/prisma_tenant/schema.prisma`, mismo shape/CHECK que `CalendarioLaboralDia` de master.
- [x] 1.2 Migración `backend/prisma_tenant/migrations/20260928150000_calendario_laboral_dias_cliente/migration.sql`: CREATE, los dos CHECK y el seed `ON CONFLICT DO NOTHING` (SQL exacto de D1).
- [x] 1.3 `calendario-laboral-dias-cliente-check.integration.spec.ts`: seed de 7 filas, cada violación de CHECK (incluye `dia_semana = 7` y `-1`), y re-ejecutar el seed no pisa una fila editada.

### Files Changed
| File | Action | What Was Done |
|---|---|---|
| `backend/prisma_tenant/schema.prisma` | Modified | Agrega `model CalendarioLaboralDiaCliente` |
| `backend/prisma_tenant/migrations/20260928150000_calendario_laboral_dias_cliente/migration.sql` | Created | CREATE TABLE + 2 CHECK + seed 7 filas (D1) |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral-dias-cliente-check.integration.spec.ts` | Created | Integration spec, DB tenant efímera, 15 tests |

### Deviations from Design
None — implementation matches design D1.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd backend && pnpm vitest run src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral-dias-cliente-check.integration.spec.ts` → 15/15 passed |
| Runtime harness command/scenario and exact result | DB tenant efímera `soporte_horario_laboral_<rand>_test`, creada vía `PostgresAdminService`, migrada vía `TenantMigrationRunnerAdapter` (subproceso real `prisma migrate deploy`), dropeada en `afterAll`; no toca `soporte_master_test` |
| Rollback boundary | La tabla es aditiva, sin lectores de producción todavía (el swap del repositorio llega en WU-3); revertir el commit no afecta nada en marcha |

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`)
- Current work unit: WU-1
- Boundary: agrega la tabla tenant, su migración y su spec de CHECK/seed; no toca el repositorio ni ningún consumidor
- Estimated review budget impact: ~361 authored lines de código + ediciones de openspec (tasks.md, state.yaml, este archivo)

### Status
3/3 tasks de WU-1 completas. Ready for verify.
