# Apply Progress: Horario laboral por cliente

## WU-1 — Tabla tenant, migración y seed

**Branch**: `feat/horario-laboral-por-cliente-wu01` · **Base**: `main` · **Status**: Complete

### Completed Tasks
- [x] 1.1 Modelo `CalendarioLaboralDiaCliente` (`calendario_laboral_dias_cliente`) en `backend/prisma_tenant/schema.prisma`, mismo shape/CHECK que `CalendarioLaboralDia` de master.
- [x] 1.2 Migración `backend/prisma_tenant/migrations/20260928150000_calendario_laboral_dias_cliente/migration.sql`: CREATE, los dos CHECK y el seed `ON CONFLICT DO NOTHING` (SQL exacto de D1).
- [x] 1.3 `calendario-laboral-dias-cliente-check.integration.spec.ts`: seed de 7 filas, cada violación de CHECK (incluye `dia_semana = 7`; el `-1` de esta lista original era de `apertura_minuto`, no de `dia_semana` — el caso `dia_semana = -1` se agregó en WU-9, fix W6 de `verify-report.md`), y re-ejecutar el seed no pisa una fila editada.

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

### Implementation
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

## WU-3 — Swap del repositorio, fail-closed, deprecación de master

**Branch**: `feat/horario-laboral-por-cliente-wu03` · **Base**: `feat/horario-laboral-por-cliente-wu02` · **Status**: Complete

### Completed Tasks
- [x] 3.1 `PrismaCalendarioLaboralSemanalRepository` ahora `constructor(tenantContext: TenantContext)`, sin `PrismaService`; `obtener()` lanza `CalendarioLaboralSinTenantContextError extends Error` (mismo archivo) si `tenantContext.get()` es `undefined`; con contexto, `ctx.prismaClient.calendarioLaboralDiaCliente.findMany()`.
- [x] 3.2 `prisma-calendario-laboral.mapper.ts`: `FilaCalendarioLaboralDia` tipada estructuralmente (`{diaSemana; aperturaMinuto; cierreMinuto}`); deja de importar `CalendarioLaboralDia` de `.prisma/master` (el import de `Feriado` se conserva: el feriado global sigue en master, sin cambios de este WU).
- [x] 3.3 Provider de `CALENDARIO_LABORAL_SEMANAL_REPOSITORY` en `calendario-laboral.module.ts`: `useClass` ya resuelve `TenantContext` por el nuevo constructor sin cambio de wiring; se agregó un comentario documentando la nueva dependencia.
- [x] 3.4 11 docstrings corregidos (D8): puerto de lectura, repositorio, mapper (header + 2 mensajes), `calcular-sla-habil-vence.service.ts` (3 citas), `aplicar-sla.use-case.ts` (3 bloques), `sla.module.ts`, `calendario-laboral.module.ts`, `prisma_master/schema.prisma`, el spec de integración migrado (3.6), el e2e SLA (3.7) y `calcular-sla-habil-vence.service.spec.ts`.
- [x] 3.5 `prisma_master/schema.prisma` (454-475): comentario reemplazado por "DEPRECADA desde `horario-laboral-por-cliente`: sin lectores, red de rollback, no dropear"; se borró la promesa del ABM ROOT.
- [x] 3.6 `calendario-laboral.repositorios.integration.spec.ts` migrado al constructor nuevo y al patrón de DB tenant efímera (`prisma-feriado-cliente.repository.integration.spec.ts:27-50`); ya no usa `soporte_master_test` ni `usarLockMasterTest()`. Casos: lectura del seed, fila faltante lanza, fail-closed sin `TenantContext`. El describe de `PrismaFeriadosLaboralesRepository` que vivía en este archivo se retiró (fuera de alcance de este WU; ya cubierto por `prisma-feriados-laborales.repository.spec.ts`, unit con mocks) — ver Deviations.
- [x] 3.7 `aplicar-sla-habil-feriados.e2e.spec.ts`: constructor corregido a `new PrismaCalendarioLaboralSemanalRepository(tenantContext)`; cita de migración corregida a `20260830210000_add_calendario_laboral` (la que existe) y actualizada para explicar que el seed real ahora lo trae la migración de tenant `20260928150000_calendario_laboral_dias_cliente`. Vencimientos esperados sin cambios (`2031-04-11T21:00:00.000Z`, `2031-04-14T21:00:00.000Z`).

Files: los 11 de `backend/` que lista `git diff --stat` (repo, mapper, módulo, puerto,
calculador + su spec, use case, sla.module, schema master, spec de integración migrado, e2e SLA).

### Deviations from Design
El describe de `PrismaFeriadosLaboralesRepository` que compartía archivo con el calendario en
`calendario-laboral.repositorios.integration.spec.ts` se retiró en vez de migrarse: la tarea 3.6
lista solo 3 casos para este archivo (los del calendario) y exige que deje de usar
`soporte_master_test`/`usarLockMasterTest()` — incompatible con conservar ahí los feriados
globales (siguen en master). Esa cobertura (fail-closed, unión, dedup, `@db.Date`) sigue intacta
en `prisma-feriados-laborales.repository.spec.ts` (unit, mocks); no quedó sin cubrir.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm vitest run .../calendario-laboral.repositorios.integration.spec.ts .../calcular-sla-habil-vence.service.spec.ts` → 18/18 passed |
| Runtime harness command/scenario and exact result | `pnpm vitest run .../aplicar-sla-habil-feriados.e2e.spec.ts` → 1/1 passed, `usarLockMasterTest()`; vencimientos idénticos a antes del swap |
| Rollback boundary | Revertir el commit vuelve a leer master vía `PrismaService`; ningún consumidor externo queda a mitad de camino |

### Verification already run (all green)
- `pnpm run migrate:tenants` → 2 tenants locales migrados con `20260928150000_calendario_laboral_dias_cliente`
- `pnpm lint` / `pnpm typecheck` → 0 errores
- `pnpm test` completo → 467/467 archivos, 5452/5452 tests (baja de 5456: -5 del describe de feriados retirado, +3 del nuevo describe de calendario efímero)
- `rg -n 'calendarioLaboralDia\.' src` → 1 resultado (`calendario-laboral-dias-check.integration.spec.ts:178`, test del CHECK master, esperado por D12); con `--glob '!*.spec.ts'` → 0, ningún camino de producción lee el modelo master

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`) · Current work unit: WU-3
- Boundary: swap a `TenantContext` fail-closed, 11 docstrings (D8), master deprecada, los dos specs de H2 migrados
- Review budget: `backend/` 335 líneas autoría + openspec — dentro de 400

### Status
7/7 tasks de WU-3 completas. Ready for verify.

## WU-4 — E2E SLA: no-recálculo, repriorización, aislamiento

**Branch**: `feat/horario-laboral-por-cliente-wu04` · **Base**: `feat/horario-laboral-por-cliente-wu03` · **Status**: Complete

### Completed Tasks
- [x] 4.1 Ticket HABIL en tenant A, `createdAt` lunes 2031-04-07T12:00:00.000Z, prioridad 8h, calendario default (lun-vie 09-18 ART) → `sla_vence_at = 2031-04-07T20:00:00.000Z`.
- [x] 4.2 Horario de A reescrito DIRECTO vía `calendarioLaboralDiaCliente.update` (lun-vie 480-720 = 08-12 ART; el endpoint de escritura no existe hasta WU-5/WU-6a) — el `sla_vence_at` del ticket ya abierto no cambia.
- [x] 4.3 Repriorización del mismo ticket (nueva `prioridadId`, mismas 8h) con el horario nuevo, anclada al `createdAt` original → `2031-04-09T12:00:00.000Z`.
- [x] 4.4 Ticket nuevo en A (mismo `createdAt`) usa el horario nuevo → `2031-04-09T12:00:00.000Z`; ticket nuevo en B (mismo `createdAt`, horario default sin tocar) → `2031-04-07T20:00:00.000Z` — aislamiento confirmado.

### Files Changed
| File | Action | What Was Done |
|---|---|---|
| `backend/src/sla/infrastructure/listeners/aplicar-sla-horario-cliente.e2e.spec.ts` | Created | E2E real, wiring manual (mismo patrón que `aplicar-sla-habil-feriados.e2e.spec.ts`), 2 tenants efímeros A/B, 1 `it` con las 4 escenarios en secuencia, `usarLockMasterTest()` |

### Deviations from Design
None — implementación matches D6/D11 (sin recálculo al guardar) y la fila "E2E SLA" de la Estrategia de testing.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd backend && pnpm vitest run src/sla/infrastructure/listeners/aplicar-sla-horario-cliente.e2e.spec.ts` → 1/1 passed |
| Runtime harness command/scenario and exact result | E2E real contra Postgres, 2 tenants efímeros (`PostgresAdminService`/`TenantMigrationRunnerAdapter`), `usarLockMasterTest()` obligatorio (el spec hermano inserta un feriado global temporal el 2031-04-08 dentro de la ventana repriorizada); corrido junto a `aplicar-sla-habil-feriados.e2e.spec.ts` → 2/2 passed, sin interferencia |
| Rollback boundary | Retira el spec nuevo; no toca producción ni ningún otro spec |

### Verification already run (all green)
- `pnpm lint` → 0 errores
- `pnpm typecheck` → 0 errores
- `pnpm test` completo → 468/468 archivos, 5453/5453 tests (sube de 5452: +1 archivo, +1 test)

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`) · Current work unit: WU-4
- Boundary: agrega el e2e SLA de no-recálculo/repriorización/aislamiento; no toca producción ni consumidores
- Review budget: `backend/` 319 líneas autoría + openspec — dentro de 400

### Status
4/4 tasks de WU-4 completas. Ready for verify.

## WU-5a + WU-5b — Puerto de escritura, `reemplazar`, casos de uso

**Partida por corte limpio** (criterio del dueño): la unidad sumó 468 líneas. WU-5a (`feat/horario-laboral-por-cliente-wu05`, base `wu04`) lleva el puerto, `reemplazar()` y su test de integración (5.1, 5.2, 5.3, 5.7); WU-5b (`feat/horario-laboral-por-cliente-wu05b`, base `wu05`) lleva los casos de uso y sus specs (5.4, 5.5, 5.6). Cada mitad pasa lint, typecheck y sus tests por separado. **Status**: Complete

### Completed Tasks
- [x] 5.1 `i-horario-laboral-escritura.repository.ts` — `IHorarioLaboralEscrituraRepository.reemplazar(horario): Promise<void>`, token `HORARIO_LABORAL_ESCRITURA_REPOSITORY`.
- [x] 5.2 `PrismaCalendarioLaboralSemanalRepository.reemplazar()`: 7 `upsert` por `diaSemana`, secuenciales (`for … await`, nunca `Promise.all`), orden fijo 0→6.
- [x] 5.3 `calendario-laboral.module.ts`: `HORARIO_LABORAL_ESCRITURA_REPOSITORY` registrado con `useExisting` sobre `CALENDARIO_LABORAL_SEMANAL_REPOSITORY` (mismo provider, dos tokens/puertos — ISP).
- [x] 5.4 `ObtenerHorarioLaboralUseCase` + spec (pass-through de lectura, `Result.ok`).
- [x] 5.5 `GuardarHorarioLaboralUseCase`: `HorarioLaboralSemanal.crear(dto.dias)` → si falla, `Result.fail` sin tocar la base; si pasa, `txRunner.run(() => repo.reemplazar(horario))` y luego una lectura aparte, POST-commit, fuera de la transacción (D6).
- [x] 5.6 `guardar-horario-laboral.use-case.spec.ts`: VO inválido (7 cerrados, 6 días) → `txRunner.run` NO se llama; VO válido → `txRunner.run` una vez y lectura post-commit.
- [x] 5.7 `calendario-laboral.repositorios.integration.spec.ts`: `reemplazar()` envuelto en `PrismaTenantTransactionRunner` real — orden secuencial 0→3 probado con un delay artificial en el día 0 (el día 1 arranca ≥140ms después, nunca simultáneo), y un throw forzado en el día 3 confirma rollback real de Postgres (las 7 filas quedan idénticas a las de antes del intento).

### Files Changed
| File | Action | What Was Done |
|---|---|---|
| `backend/src/calendario-laboral/domain/ports/i-horario-laboral-escritura.repository.ts` | Created | Puerto de escritura + token DI |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository.ts` | Modified | Implementa `IHorarioLaboralEscrituraRepository.reemplazar()` |
| `backend/src/calendario-laboral/calendario-laboral.module.ts` | Modified | Alias `useExisting` del puerto de escritura + providers de los dos casos de uso nuevos |
| `backend/src/calendario-laboral/application/use-cases/obtener-horario-laboral.use-case.ts` | Created | Caso de uso de lectura |
| `backend/src/calendario-laboral/application/use-cases/obtener-horario-laboral.use-case.spec.ts` | Created | 2 tests |
| `backend/src/calendario-laboral/application/use-cases/guardar-horario-laboral.use-case.ts` | Created | Caso de uso de escritura atómica |
| `backend/src/calendario-laboral/application/use-cases/guardar-horario-laboral.use-case.spec.ts` | Created | 3 tests |
| `backend/src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral.repositorios.integration.spec.ts` | Modified | +1 test de `reemplazar()` con `PrismaTenantTransactionRunner` real |

### Deviations from Design
None — implementación matches D6/D7 y el mapa de capas.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd backend && pnpm vitest run src/calendario-laboral/application/use-cases/guardar-horario-laboral.use-case.spec.ts src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral.repositorios.integration.spec.ts` → 7/7 passed |
| Runtime harness command/scenario and exact result | DB tenant efímera (integración real de `reemplazar` con `PrismaTenantTransactionRunner`), incluida en el comando de arriba → 4/4 en ese archivo, incluyendo el test de orden/atomicidad |
| Rollback boundary | Revertir el commit retira los dos casos de uso, el puerto de escritura y el método `reemplazar`; sin consumidores todavía (el controller llega en WU-6a) |

### Mutation proof (Promise.all)
Se cambió temporalmente `reemplazar()` a `Promise.all` en el working tree y se corrió el
test de orden/atomicidad: dio ROJO como se esperaba (`ordenInicio` incluyó los 7 días en vez
de cortar en el día 3 — con `Promise.all` los 7 `upsert` se disparan sin esperar el throw).
Se restauró la versión secuencial (`for … await`) inmediatamente después; `git diff` sobre
el archivo no conserva la mutación.

### Verification already run (all green)
- `pnpm lint` → 0 errores
- `pnpm typecheck` → 0 errores
- `pnpm test` completo → 470/470 archivos, 5459/5459 tests (sube de 5453: +6 tests nuevos)

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`) · Current work unit: WU-5
- Boundary: puerto de escritura, `reemplazar` secuencial, los dos casos de uso y sus tests; sin consumidor HTTP todavía
- Review budget: WU-5a 176 líneas; WU-5b el resto, las dos dentro de 400

### Status
7/7 tasks de WU-5 completas. Ready for verify.

## WU-6a — Controller, DTOs, wiring, guards

**Branch**: `feat/horario-laboral-por-cliente-wu06a` · **Base**: `feat/horario-laboral-por-cliente-wu05b` · **Status**: Complete

### Completed Tasks
- [x] 6a.1 `horario-laboral.dto.ts`: `DiaHorarioLaboralDto` (`@IsInt @Min(0) @Max(6) diaSemana`; minutos `@ValidateIf(v !== null) @IsInt @Min(0) @Max(1440)`, precedente `catalogo.dto.ts:95`) y `HorarioLaboralDto` (`@IsArray @ArrayMinSize(7) @ArrayMaxSize(7) @ValidateNested @Type`, precedente `insumos.dto.ts:206-208`).
- [x] 6a.2 `horario-laboral.controller.ts`: `@Controller('horario-laboral') @UseGuards(JwtAuthGuard, TenantGuard)`; `GET` → 200 `{ dias }` abierto a cualquier autenticado; `PUT` + `@UseGuards(AdminClienteGuard)` por método → 200 `{ dias }`; `toHttpException` mapea cualquier `HorarioLaboralInvalidoError` a 422 (D9).
- [x] 6a.3 Controller registrado en `calendario-laboral.module.ts` (`controllers: [..., HorarioLaboralController]`); los providers de los dos use cases ya estaban cableados desde WU-5b.
- [x] 6a.4 `horario-laboral.controller.spec.ts`: metadata de guards con el modismo `?? []` (`GUARDS_METADATA` de `@nestjs/common/constants`, precedente `modelos-equipo.controller.spec.ts:162`); class-level `[JwtAuthGuard, TenantGuard]`; `GET` sin `AdminClienteGuard`; `PUT` con `AdminClienteGuard`. Prueba por mutación: leer la metadata real del handler compilado, no un mock.

### Files Changed
| File | Action | What Was Done |
|---|---|---|
| `backend/src/calendario-laboral/interface/dtos/horario-laboral.dto.ts` | Created | `DiaHorarioLaboralDto` + `HorarioLaboralDto` (body `PUT`) y los tipos de respuesta `DiaHorarioLaboralResponseDto`/`HorarioLaboralResponseDto` |
| `backend/src/calendario-laboral/interface/controllers/horario-laboral.controller.ts` | Created | `HorarioLaboralController` (`GET`/`PUT`) + `toHttpException` |
| `backend/src/calendario-laboral/interface/controllers/horario-laboral.controller.spec.ts` | Created | 3 tests de metadata de guards |
| `backend/src/calendario-laboral/calendario-laboral.module.ts` | Modified | Import + registro de `HorarioLaboralController` en `controllers` |

### Deviations from Design
None — implementación matches D9/D10.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd backend && pnpm vitest run src/calendario-laboral/interface/controllers/horario-laboral.controller.spec.ts` → 3/3 passed |
| Runtime harness command/scenario and exact result | N/A por diseño (spec unitario de metadata de guards; el e2e HTTP real es WU-6b) |
| Rollback boundary | Revertir el commit retira el endpoint (controller, DTOs, spec, registro en el módulo); sin frontend que lo consuma todavía |

### Verification already run (all green)
- `pnpm lint` → 0 errores
- `pnpm typecheck` → 0 errores
- `pnpm test` completo → 471/471 archivos, 5462/5462 tests (sube de 5459: +1 archivo, +3 tests). Los tres bloques `FAIL orden-de-arranque.spec.ts` que imprime la corrida son la salida capturada de ese spec ejercitando a propósito las ramas de error de `construirEntorno` (env vars faltantes) — no afectan el resumen final ni el exit code (0)

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`) · Current work unit: WU-6a
- Boundary: agrega el endpoint HTTP del horario laboral (GET/PUT), su DTO y sus guards; sin frontend que lo consuma todavía (llega en WU-7/WU-8a/WU-8b)
- Review budget: 211 líneas autoría (`git diff --shortstat` sobre los 5 archivos de `backend/`) + openspec — dentro de 400

### Status
4/4 tasks de WU-6a completas. Ready for verify.

## WU-6b — E2E HTTP: matriz de guards y aislamiento A/B

**Branch**: `feat/horario-laboral-por-cliente-wu06b` · **Base**: `feat/horario-laboral-por-cliente-wu06a` · **Status**: Complete

### Completed Tasks
- [x] 6b.1 `horario-laboral.e2e.spec.ts` (harness de `feriados-cliente.e2e.spec.ts`, 2 tenants efímeros A/B): 401 en `GET`/`PUT` sin token; 200 en `GET` para no-admin; 403 en su `PUT`; 200 para ADMINISTRADOR y ROOT.
- [x] 6b.2 422 con 7 días cerrados y 422 con un día repetido (DTO válida en forma, dominio rechaza), cada uno seguido de un `GET` que confirma el horario sin cambios; 400 con 6 días (falla en `ValidationPipe`, antes del use case).
- [x] 6b.3 A guarda un horario propio (600-900) → el `GET` de B sigue devolviendo el default — aislamiento estructural (D4/D10).
- [x] 6b.4 Higiene de DB tenant efímera: borrar filas de `clientes` en `afterAll` → `app.close()` → `prismaService.onModuleDestroy()` → `dropDatabase` de A y B.

### Files Changed
| File | Action | What Was Done |
|---|---|---|
| `backend/src/calendario-laboral/interface/controllers/horario-laboral.e2e.spec.ts` | Created | E2E real, 9 tests: guards (401/403/200×2), 422×2 con `GET` de no-cambio, 400, aislamiento A/B |

### Deviations from Design
None — cubre exactamente la fila "E2E HTTP" de la Estrategia de testing. `usarLockMasterTest()` deliberadamente omitido (recordatorio operativo de `tasks.md`): el spec no lee feriados de master, solo registra clientes.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd backend && pnpm vitest run src/calendario-laboral/interface/controllers/horario-laboral.e2e.spec.ts` → 9/9 passed |
| Runtime harness command/scenario and exact result | E2E HTTP real contra Postgres, 2 tenants efímeros (`PostgresAdminService`/`TenantMigrationRunnerAdapter`), sin `usarLockMasterTest()` (no toca `soporte_master_test` más que el registro de clientes) |
| Rollback boundary | Retira el spec nuevo; no toca producción ni ningún otro spec |

### Verification already run (all green)
- `pnpm lint` → 0 errores
- `pnpm typecheck` → 0 errores
- `pnpm test` completo → 472/472 archivos, 5471/5471 tests passed

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`) · Current work unit: WU-6b
- Boundary: agrega el e2e HTTP de guards y aislamiento; no toca producción
- Review budget: 339 líneas autoría (archivo nuevo) + openspec — dentro de 400

### Status
4/4 tasks de WU-6b completas. Ready for verify.

## WU-7a + WU-7b + WU-7c — Frontend: contrato de datos

**Partida por cortes limpios** (criterio del dueño, 2026-09-29): la unidad sumó 525 líneas. WU-7a
(`feat/horario-laboral-por-cliente-wu07`, base `wu06b`): tipos, api, límites y minutos (7.1-7.3).
WU-7b (`wu07b`): esquemas Zod (7.4). WU-7c (`wu07c`): hooks e ítem de navegación (7.5-7.6). Cada
parte pasa lint, type-check y sus tests por separado. La cadena es lineal: WU-7a sale de `wu06b`
aunque `tasks.md` nombre `wu06a` como base. **Status**: Complete

### Implementation
- 7.1 `frontend/src/features/horario-laboral/types.ts` (`DiaHorarioLaboral`, `HorarioLaboral`, `HorarioLaboralDto`) y `api.ts` (`obtenerHorarioLaboral` GET, `guardarHorarioLaboral` PUT), espejo exacto de `horario-laboral.dto.ts` (backend, WU-6a).
- 7.2 `limites.ts` (`DIAS_POR_SEMANA`, `MINUTOS_POR_DIA`) + `limites.test.ts`, centinela de valor contra `horario-laboral.constants.ts` (backend).
- 7.3 `minutos.ts` (`minutosAHhmm`/`hhmmAMinutos`, puras, `esCierre` distingue `"00:00"` = 0 en apertura vs. 1440 en cierre, D14) + `minutos.test.ts` (ida y vuelta, caso `00:00`).
- 7.4 `schemas.ts` (`diaFormSchema` + `horarioLaboralFormSchema`, `.length(7)` + `superRefine`: apertura/cierre obligatorios si abierto, `apertura < cierre` en minutos, `diaSemana` único, "al menos un día abierto" con `path: []`) + `schemas.test.ts` (7 cerrados, apertura ≥ cierre, día repetido, largo ≠ 7, caso límite `00:00`/`00:00`).
- 7.5 `hooks/use-horario-laboral.ts` (`useQuery`, key `["horario-laboral"]`) y `hooks/use-guardar-horario-laboral.ts` (`useMutation` + `invalidateQueries(["horario-laboral"])` en `onSuccess`; deliberadamente SIN `notifySuccess`/`notifyError` propios — D16 exige `reset(nuevos)` con el `data` de la mutación, que solo el componente de WU-8b puede hacer) + sus tests (msw, incluyendo un caso 422 que confirma que NO se invalida la query).
- 7.6 Ítem "Horario laboral" en `DEFAULT_SECTION_ITEMS` (`frontend/src/shared/nav/nav-config.ts`), justo después de "Feriados", icono `Clock`, `visible: () => true` + 2 tests nuevos en `nav-config.test.ts` (visible para TECNICO sin permisos y para ADMINISTRADOR).

### Verification already run (all green)
- `cd frontend && pnpm vitest run src/features/horario-laboral src/shared/nav/nav-config.test.ts` → 6 archivos, 51/51 tests passed
- `cd frontend && pnpm lint` → sin errores ni warnings
- `cd frontend && pnpm type-check` → sin errores
- `cd frontend && pnpm test` (suite completa) → 204/204 archivos, 1544/1544 tests passed

### Tamaño

525 líneas en total, partidas en tres PRs de 159, 171 y el resto; cada uno dentro de 400.

### Issues Found
Ninguno.

### Status
6/6 tareas de WU-7 completas y commiteadas en WU-7a, WU-7b y WU-7c.

## WU-8a-i + WU-8a-ii — Frontend: componentes presentacionales

**Partida por corte limpio** (criterio del dueño, 2026-09-29): la unidad sumó ~516 líneas. WU-8a-i
(`feat/horario-laboral-por-cliente-wu08a`, base `wu07c`): la fila y su test (8a.1, 216 líneas).
WU-8a-ii (`wu08a2`): el formulario de 7 filas y su test (8a.2, 8a.3). Cada parte pasa lint,
type-check y sus tests por separado. **Status**: Complete

### Implementación
- `frontend/src/features/horario-laboral/components/horario-laboral-fila.tsx` — fila
  presentacional pura (checkbox "Abierto" + dos `<Input type="time">`, sin hooks propios).
  Pista visible de que `"00:00"` en CIERRE = 1440 (D14).
- `frontend/src/features/horario-laboral/components/horario-laboral-fila.test.tsx` — 5 tests.
- `frontend/src/features/horario-laboral/components/horario-laboral-form.tsx` — grilla de 7
  filas, RHF + `zodResolver(horarioLaboralFormSchema)` envuelto en `{ dias }` (el schema de
  WU-7b es un array, no un objeto). Conversión HH:MM↔minutos vía `minutos.ts` al entrar
  (`desdeHorario`) y al salir (`aDto`, en `onGuardar`). `soloLectura` deshabilita las 7 filas
  y oculta "Guardar". Gotcha verificado en runtime: el error agregado de "al menos un día
  abierto" (`superRefine` con `path: []`) llega en `errors.dias.message`, NO en
  `errors.dias.root.message` — esa forma es de `useFieldArray`, que este form no usa.
- `frontend/src/features/horario-laboral/components/horario-laboral-form.test.tsx` — 5 tests
  (admin edita, no-admin ve solo lectura, 7 días cerrados no llama a `onGuardar`, error de
  servidor no desmonta el form, `guardando` deshabilita el botón).

### Verificación ya corrida (todo verde)
- `pnpm lint` (frontend) → sin errores ni warnings
- `pnpm type-check` (frontend) → sin errores
- `pnpm vitest run src/features/horario-laboral/components` → 2 archivos, 10/10 tests passed
- `pnpm test` (suite completa, frontend) → 206/206 archivos, 1554/1554 tests passed (sube de
  204/1544 en WU-7c: +2 archivos, +10 tests)

### Verificación

`pnpm lint` y `pnpm type-check` limpios; 10/10 en los specs de componentes; suite completa del
frontend 1554/1554.

## WU-8b — Frontend: vista, página, nav y deuda de Ayuda

**Branch**: `feat/horario-laboral-por-cliente-wu08b` · **Base**: `feat/horario-laboral-por-cliente-wu08a2` · **Status**: Complete

### Completed Tasks
- [x] 8b.1 `horario-laboral-view.tsx` — container: `useHorarioLaboral`/`useGuardarHorarioLaboral` (WU-7c) sobre `HorarioLaboralForm` (WU-8a-ii); `esAdminCliente` gatea `soloLectura`. Un error de guardado (422/500) nunca desmonta el form: `errorServidor` queda seteado (`ApiError.messages.join(" ")` o fallback genérico) y `notifyError` se dispara en `onError`. El botón queda deshabilitado solo mientras `guardarMutation.isPending`. Al tener éxito, `valoresIniciales = guardarMutation.data ?? horarioQuery.data`: el dato recién commiteado dispara el `reset` interno de `HorarioLaboralForm` (su `useEffect` sobre `valoresIniciales`, ya existente desde WU-8a-ii) sin esperar el refetch de `invalidateQueries`, y `notifySuccess`.
- [x] 8b.2 `frontend/src/app/(dashboard)/horario-laboral/page.tsx` — Server Component fino, sin `layout.tsx`, mismo criterio que `/feriados/page.tsx`. `RUTAS_PUBLICAS` (`middleware.ts`) sin cambios: la ruta exige sesión.
- [x] 8b.3 `horario-laboral-view.test.tsx` — 7 tests: skeleton solo por `isLoading` y nunca reaparece por un refetch de fondo (`isFetching`); `ErrorState` con retry solo cuando `isError && !data` (carga inicial); 422 y 500 al guardar (`it.each`) conservan el form con sus valores, muestran el alert inline y llaman a `notifyError`; el botón Guardar se deshabilita solo mientras `isPending`; éxito resetea la grilla con el horario devuelto por el servidor y notifica éxito; un rol no-admin ve la grilla de solo lectura sin botón Guardar.
- [x] 8b.4 Deuda de Ayuda anotada en este apply-progress y en el mensaje del commit: pantalla nueva (`/horario-laboral`) sin artículo en `backend/ayuda/*.md` — la escritura de Ayuda sigue en pausa desde 2026-09-07 (`soporte/CLAUDE.md`).

### Files Changed
| File | Action | What Was Done |
|---|---|---|
| `frontend/src/features/horario-laboral/components/horario-laboral-view.tsx` | Created | Container de la pantalla (D16) |
| `frontend/src/features/horario-laboral/components/horario-laboral-view.test.tsx` | Created | 7 tests de D16 y el gate de rol |
| `frontend/src/app/(dashboard)/horario-laboral/page.tsx` | Created | Página fina montando el container |

### Deviations from Design
None — implementación matches D13/D16. El ítem de nav ya se agregó en WU-7c (`nav-config.ts`); esta unidad no lo toca.

### Issues Found
None.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd frontend && pnpm vitest run src/features/horario-laboral` → 8 archivos, 37/37 passed |
| Runtime harness command/scenario and exact result | N/A por diseño — Testing Library, sin red (msw simula el backend) |
| Rollback boundary | Revertir el commit retira la ruta `/horario-laboral` (página + container + tests); el backend queda funcional por API, sin consumidor de frontend |

### Verification already run (all green)
- `pnpm lint` (frontend) → sin errores ni warnings
- `pnpm type-check` (frontend) → sin errores
- `pnpm test` (suite completa, frontend) → 207/207 archivos, 1561/1561 tests passed (sube de 206/1554: +1 archivo, +7 tests)
- `pnpm build` (frontend) → compila; ruta `/horario-laboral` listada en el árbol de rutas (5.52 kB, 176 kB First Load JS)

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main, `auto-chain`) · Current work unit: WU-8b (última unidad del ciclo)
- Boundary: agrega el container, la página y sus tests; retira la ruta y deja el backend intacto si se revierte
- Review budget: 3 archivos de `frontend/` + openspec — dentro de 400

### Status
4/4 tasks de WU-8b completas. Ready for verify. Con esto, las 11 work units del ciclo `horario-laboral-por-cliente` quedan completas (WU-1 a WU-8b); solo restan las notas A.1/A.2 de `sdd-archive`.

## WU-9 — Corrección post-verify (PASS WITH WARNINGS)

**Branch**: `feat/horario-laboral-por-cliente-wu09` · **Base**: `feat/horario-laboral-por-cliente-wu08b` · **Status**: Complete

Una única corrección acotada sobre `verify-report.md` (PASS WITH WARNINGS, 0 CRITICAL, 7 WARNING,
4 SUGGESTION). Cubre W1-W7 y S2; S1 y S4 quedan fuera (documentación/PR, no código de este ciclo).

### Completed Tasks
- [x] 9.1 (W1, real) `useGuardarHorarioLaboral.onSuccess` escribe el horario en la cache con `setQueryData` antes de `invalidateQueries`; `HorarioLaboralView.valoresIniciales` sale solo de `horarioQuery.data`. Regresión agregada y probada RED sobre el código previo (ver Work Unit Evidence).
- [x] 9.2 (S3) `horario-laboral-view.test.tsx`: el `it.each` de 422/500 ahora destilda un día antes de guardar y afirma que la edición sobrevive al error.
- [x] 9.3 (W2) `aplicar-sla-horario-cliente.e2e.spec.ts`: reemplazado el `update` directo por `GuardarHorarioLaboralUseCase` real (mismos repos/tx runner que `HorarioLaboralModule` cablea por DI). Probado RED con una mutación scratch (ver Work Unit Evidence).
- [x] 9.4 (W3) `check-calendario-master-default.spec.ts`: casos nuevos para "solo apertura" y "solo cierre" del lunes.
- [x] 9.5 (W4) `aplicar-sla-habil-feriados.e2e.spec.ts`: inserta `FECHA_GLOBAL` también como feriado propio de A (raw insert); la aserción del vencimiento ya existente queda como prueba del dedup real-DB.
- [x] 9.6 (W5) Reescrito el motivo en `DEPLOY-VPS-runbook.md`, `deploy.ps1` (comentario 5a) y el header de `check-calendario-master-default.mjs`: el seed es fijo y nunca lee master; el riesgo es el inverso (una master editada movería el horario de todos los clientes).
- [x] 9.7 (W6) `calendario-laboral-dias-cliente-check.integration.spec.ts`: agregado el caso `dia_semana = -1`. Corregida la afirmación falsa de la línea 10 de este mismo archivo (arriba, sección WU-1).
- [x] 9.8 (W7) Corregidos los comentarios de `prisma_master/schema.prisma:483` (Feriado sigue global) y `aplicar-sla.use-case.spec.ts` (docstring: calendario es de tenant, feriados de master+cliente).
- [x] 9.9 (S2) `horario-laboral.e2e.spec.ts`: caso HTTP nuevo "apertura >= cierre → 422, GET sin cambios".

### Files Changed
Frontend (W1/S3): `use-guardar-horario-laboral.ts`, `horario-laboral-view.tsx`, `horario-laboral-view.test.tsx`.
Backend (W2-W7, S2): `aplicar-sla-horario-cliente.e2e.spec.ts`, `check-calendario-master-default.spec.ts`,
`aplicar-sla-habil-feriados.e2e.spec.ts`, `DEPLOY-VPS-runbook.md`, `deploy.ps1`,
`check-calendario-master-default.mjs`, `calendario-laboral-dias-cliente-check.integration.spec.ts`,
`prisma_master/schema.prisma`, `aplicar-sla.use-case.spec.ts`, `horario-laboral.e2e.spec.ts`. Detalle
por ítem en "Completed Tasks" arriba.

### Deviations from Design
None — ninguna de las nueve correcciones toca una decisión de `design.md`; todas son las de
"Minimal fix" que `verify-report.md` ya proponía.

### Issues Found
None nuevos. `verify-report.md` sigue siendo la fuente de los hallazgos que esta unidad cierra.

### Work Unit Evidence
| Evidence | Value |
|---|---|
| Focused test command and exact result | `(cd backend && pnpm vitest run src/calendario-laboral src/sla/infrastructure/listeners scripts/check-calendario-master-default.spec.ts) && (cd frontend && pnpm vitest run src/features/horario-laboral)` — ver `## Verification` del reporte de retorno de `sdd-apply` |
| Runtime harness command/scenario and exact result | e2e HTTP y de listener contra Postgres real (WU-4/WU-5c/WU-6b); integration spec de CHECK contra DB tenant efímera — ver `## Verification` del reporte de retorno |
| Rollback boundary | Revertir el commit de WU-9 vuelve al estado `PASS WITH WARNINGS` verificado el 2026-09-29; ningún archivo de WU-1 a WU-8b se toca |
| RED proof — W1 | Con el fix revertido, el test "guardado exitoso seguido de un guardado fallido conserva la SEGUNDA edición" falla; restaurado, pasa |
| RED proof — W2 | Un `reemplazar()` que además tocara `ticket` (mutación scratch, disparada DESDE `GuardarHorarioLaboralUseCase`) hace fallar la aserción `venceInicialA` del e2e |
| RED proof — W6 | `dia_semana BETWEEN 0 AND 6` sin el piso (`>= 0`) aceptaría `-1`: razonado del CHECK de `migration.sql:33`, sin editar el archivo aplicado |

### Workload / PR Boundary
- Mode: chained PR slice (stacked-to-main) · Boundary: corrige W1-W7 y S2 de `verify-report.md`; no toca ninguna migración aplicada ni corre DDL destructivo
- Review budget: ver `git diff --shortstat HEAD~1 HEAD` en el reporte de retorno

### Status
9/9 tasks de WU-9 completas. Ready for verify.
