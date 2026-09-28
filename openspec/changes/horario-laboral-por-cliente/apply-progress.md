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

## WU-1b — Precondición de deploy (D18) y runbook

**Branch**: `feat/horario-laboral-por-cliente-wu01b` · **Base**: `feat/horario-laboral-por-cliente-wu01` · **Status**: Complete

### Completed Tasks
- [x] 1b.1 `backend/scripts/check-calendario-master-default.mjs`: solo lectura, `DATABASE_URL_MASTER` vía `process.loadEnvFile()`, exit 1 imprimiendo la diferencia si las 7 filas de `calendario_laboral_dias` (master) no son exactamente el default, o si la tabla no existe.
- [x] 1b.2 `backend/scripts/check-calendario-master-default.spec.ts` con la consulta inyectada (precedente `backfill-correo-clientes.spec.ts`): default exacto pasa; un día cambiado falla y lo reporta; 6 filas fallan; tabla ausente (`42P01`) se traduce a `ok:false` sin propagar la excepción; un error de DB distinto de `42P01` sí se propaga.
- [x] 1b.3 Paso `Precondicion: calendario master = default` en `deploy.ps1`, después de `Cargar backend/.env` (5) y antes de `EMAIL_CRYPTO_KEY` (5b)/`Detener servicios`, envuelto en `AssertOk`; corre con `$NodeExe` (Node 24 fijado), mismo criterio que la invocación del backfill de correo (línea ~252). Archivo verificado 100% ASCII, sin BOM.
- [x] 1b.4 `DEPLOY-VPS-runbook.md`: paso nuevo en "Qué hace, en orden" (renumerado 7-13) y sección nueva "Precondición: calendario master = default" en "Preflight que conviene correr antes", con la consulta de solo lectura y su salida esperada de 7 filas, indicando que `deploy.ps1` ya lo verifica.

### Files Changed
| File | Action | What Was Done |
|---|---|---|
| `backend/scripts/check-calendario-master-default.mjs` | Created | Script de solo lectura D18: `compararConDefault()` puro + `chequearDefaultMaster(query)` con la consulta inyectada + `main()` real contra `DATABASE_URL_MASTER` |
| `backend/scripts/check-calendario-master-default.spec.ts` | Created | 6 tests: default exacto, día cambiado, fila faltante, consulta inyectada default, tabla ausente (42P01), error de DB distinto propagado |
| `deploy.ps1` | Modified | Paso nuevo "Precondicion: calendario master = default" (D18), entre carga de `.env` y `EMAIL_CRYPTO_KEY` |
| `DEPLOY-VPS-runbook.md` | Modified | Paso nuevo en "Qué hace, en orden" + sección "Precondición: calendario master = default" en el preflight, con consulta y salida esperada |

### Deviations from Design
None — implementación matches D18. `ps1-ascii.spec.ts` (spec de convención ASCII/sin BOM para `.ps1`) no existe en esta rama; vive en una cadena sin mergear. Se verificó el archivo directamente: `rg -n '[^\x00-\x7F]' deploy.ps1` sin resultados, primeros 3 bytes distintos de `EF BB BF`, y un parseo sintáctico con `pwsh` portátil (`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`) reportó 0 errores.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd backend && pnpm vitest run scripts/check-calendario-master-default.spec.ts` → 6/6 passed |
| Runtime harness command/scenario and exact result | N/A por diseño — script de solo lectura; ejercitado con la consulta inyectada del spec unitario. Corrido además una vez contra la DB master de desarrollo real: `node backend/scripts/check-calendario-master-default.mjs` → exit 0, `[check-calendario-master-default] OK: master en el default (lun-vie 540-1080, sab/dom NULL)` (local está en 9-18 lun-vie, confirma el default sin cambiar nada) |
| Rollback boundary | Revertir el commit saca el paso de `deploy.ps1`, el script y su spec, y las dos secciones del runbook; el deploy vuelve a no tener esta precondición automatizada, sin afectar WU-1 |

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`)
- Current work unit: WU-1b
- Boundary: agrega el script de precondición de solo lectura, su spec, el paso en `deploy.ps1` y la documentación del runbook; no toca el dominio ni el repositorio (llegan en WU-2/WU-3)
- Estimated review budget impact: 6 files changed, 289 insertions(+), 11 deletions(-) (incluye ediciones de openspec: `tasks.md`, `state.yaml`, este archivo) — dentro del presupuesto de 400 líneas

### Status
4/4 tasks de WU-1b completas. Ready for verify.

## WU-2 — Dominio: VO, errores, constantes

**Branch**: `feat/horario-laboral-por-cliente-wu02` · **Base**: `feat/horario-laboral-por-cliente-wu01b` · **Status**: COMPLETO (`size:exception`, criterio del dueño)

### Implementation (code written, verified, uncommitted)
- 2.1 `backend/src/calendario-laboral/domain/constants/horario-laboral.constants.ts` — `DIAS_POR_SEMANA`, `MINUTOS_POR_DIA`, `MINUTO_MINIMO_DIA`.
- 2.2 `backend/src/calendario-laboral/domain/errors/horario-laboral.errors.ts` — `HorarioLaboralDiasInvalidosError`, `VentanaLaboralInvalidaError(dia)`, `HorarioLaboralSinDiasAbiertosError`, unión `HorarioLaboralInvalidoError`.
- 2.3 `backend/src/calendario-laboral/domain/value-objects/horario-laboral-semanal.ts` — `HorarioLaboralSemanal.crear(dias)` con el orden de validación de D7 (length 7 → `diaSemana` único 0..6 → por día ambos null o `0 <= apertura < cierre <= 1440` → al menos un día abierto) y `aCalendario()`, reusando `VentanaLaboral`/`CalendarioLaboralSemanal` de `calcular-sla-habil-vence.service.ts` sin tocarlos.
- 2.4 `backend/src/calendario-laboral/domain/value-objects/horario-laboral-semanal.spec.ts` — 19 tests: cada rama de `crear` (vacío, 6 días, 8 días, lunes repetido + domingo faltante, `diaSemana` −1 y 7, no entero, apertura ≥ cierre, apertura = cierre, un solo extremo null ×2, cierre 1441, apertura −1, minutos no enteros, apertura 0/cierre 1440 aceptado, 7 días cerrados, un solo día abierto) y `aCalendario()` exacto con entrada desordenada.

### Verification already run (all green)
- `pnpm vitest run src/calendario-laboral/domain/value-objects/horario-laboral-semanal.spec.ts` → 19/19 passed
- `pnpm lint` → 0 errores (post `--fix` de formato Prettier)
- `pnpm typecheck` → 0 errores
- `pnpm test` (suite completa backend) → 467/467 archivos, 5456/5456 tests passed

### Tamaño: `size:exception`

415 líneas de código y tests (más openspec). Las cuatro validaciones de `crear()` son pasos del
mismo método: no hay corte limpio que no separe código de sus tests. Verificación: `pnpm lint` y
`pnpm typecheck` limpios, 19/19 en el spec focalizado, suite completa 5456/5456.
