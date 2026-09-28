# Tasks: Horario laboral por cliente

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530
> palabras; lo supera por la misma causa que `spec.md` y `design.md`: 11 work units
> encadenados, cada uno con sus tareas, comando de test enfocado, comandos de verificación y
> límite de rollback, más los recordatorios operativos que el lanzamiento exige mantener
> visibles. Recortar cobertura para entrar en el presupuesto sería peor que declarar el
> excedente.

> **TDD en este ciclo: deshabilitado.** Es una feature, no una corrección de defecto
> (`~/proyectos/CLAUDE.md` §6.3). La tabla `rules.tasks` de `openspec/config.yaml` data del
> 2026-09-01, antes de esa política; no aplica aquí. El test viaja en el mismo commit que la
> implementación que verifica, sin exigir RED verificado antes del código.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1230-1680 (exploration.md), ~2260 sumando estimaciones de diseño |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 11 PRs encadenadas, orden fijo WU-1 → WU-8b |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Unidades en riesgo** (histórico: el tamaño real corre 1.5-2x la estimación de diseño; toda
unidad ≥200 líneas estimadas puede acercarse a 400 reales): WU-2, WU-5, WU-6a, WU-7, WU-8a y
WU-8b son las de mayor riesgo (~240-260 est.). Si una realizada se acerca a 400, cortar por
clase de error o de escenario dentro de la misma unidad (ya identificado en `design.md`);
nunca separar código de sus tests. WU-3 toca 11 archivos pero la mayoría son docstrings de
1-5 líneas.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Tabla tenant + migración + seed (D1) | PR 1 | ver WU-1 | DB tenant efímera | Tabla aditiva sin lectores de producción |
| 1b | Precondición de deploy (D18) + runbook | PR 2 | ver WU-1b | N/A, script de solo lectura | Retira paso de `deploy.ps1` y el script |
| 2 | VO, errores, constantes del dominio | PR 3 | ver WU-2 | N/A, unitario puro | Retira el módulo `domain/` nuevo, nada lo importa aún |
| 3 | Swap del repositorio, fail-closed, docstrings, deprecación master | PR 4 | ver WU-3 | DB tenant efímera | Revertir vuelve a leer master (comportamiento previo) |
| 4 | E2E SLA: no-recálculo, repriorización, aislamiento | PR 5 | ver WU-4 | E2E con `usarLockMasterTest()` | Retira el spec nuevo, sin tocar producción |
| 5 | Puerto de escritura, `reemplazar`, casos de uso | PR 6 | ver WU-5 | DB tenant efímera | Retira casos de uso y método `reemplazar`, sin consumidores aún |
| 6a | Controller, DTOs, wiring, guards | PR 7 | ver WU-6a | N/A, unitario de guards | Retira el endpoint, sin frontend que lo consuma aún |
| 6b | E2E HTTP de guards y aislamiento | PR 8 | ver WU-6b | E2E, DB tenant efímera | Retira el spec nuevo |
| 7 | Frontend: types, api, límites, minutos, schemas, hooks | PR 9 | ver WU-7 | N/A, unitario/Vitest | Retira el módulo `features/horario-laboral/` de datos |
| 8a | Frontend: `HorarioLaboralForm`/`Fila` presentacionales | PR 10 | ver WU-8a | N/A, Testing Library | Retira los componentes, sin ruta que los monte |
| 8b | Frontend: `HorarioLaboralView`, página, nav | PR 11 | ver WU-8b | N/A, Testing Library | Retira la ruta y el ítem de nav |

## Recordatorios operativos

- **`usarLockMasterTest()`**: obligatorio en `aplicar-sla-habil-feriados.e2e.spec.ts` (ya lo
  requiere) y en el nuevo `aplicar-sla-horario-cliente.e2e.spec.ts` de WU-4 — ambos leen
  feriados de master. `calendario-laboral.repositorios.integration.spec.ts` (WU-3) y
  `horario-laboral.e2e.spec.ts` (WU-6b) usan DB tenant efímera y **no** lo necesitan.
- **Higiene de DB tenant efímera**: en todo e2e HTTP nuevo o migrado, el orden es limpiar
  filas de `clientes` → `app.close()` → `onModuleDestroy()` → `dropDatabase`. Invertirlo hace
  fallar el DROP en silencio.
- **11 docstrings a corregir** (D8, WU-3): ver la tarea 3.4 con la lista completa de archivos.
- **Los dos specs que WU-3 debe migrar en la misma unidad** (H2): `calendario-laboral.repositorios.integration.spec.ts`
  y `aplicar-sla-habil-feriados.e2e.spec.ts`.

---

## WU-1 — Tabla tenant, migración y seed

**Branch**: `feat/horario-laboral-por-cliente-wu01` · **Base**: `main`

- [x] 1.1 Agregar el modelo `CalendarioLaboralDiaCliente` (tabla `calendario_laboral_dias_cliente`) a `backend/prisma_tenant/schema.prisma`, mismo shape y CHECK que `CalendarioLaboralDia` de master. (Req: Default sembrado sin cambio de comportamiento)
- [x] 1.2 Crear `backend/prisma_tenant/migrations/20260928150000_calendario_laboral_dias_cliente/migration.sql` con el CREATE, los dos CHECK y el seed `ON CONFLICT DO NOTHING` del SQL de D1. (Req: Default sembrado sin cambio de comportamiento; Un intervalo por día, dentro de rango)
- [x] 1.3 Escribir `backend/src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral-dias-cliente-check.integration.spec.ts`: seed exacto de 7 filas, cada violación de CHECK, `dia_semana = 7`, y confirmar que re-ejecutar el seed no pisa una fila ya editada. (Req: Un intervalo por día, dentro de rango)

**Test enfocado**: `cd backend && pnpm vitest run src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral-dias-cliente-check.integration.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` (ambos en `backend/`)
**Runtime harness**: DB tenant efímera (barrida automática por el `globalSetup`); no toca `soporte_master_test`.
**Rollback boundary**: la tabla es aditiva y sin lectores de producción todavía; revertir el commit no afecta nada en marcha.

## WU-1b — Precondición de deploy (D18) y runbook

**Branch**: `feat/horario-laboral-por-cliente-wu01b` · **Base**: `feat/horario-laboral-por-cliente-wu01`

- [x] 1b.1 Crear `backend/scripts/check-calendario-master-default.mjs`: solo lectura, `DATABASE_URL_MASTER` vía `process.loadEnvFile()`, exit 1 imprimiendo la diferencia si las 7 filas de `calendario_laboral_dias` (master) no son exactamente el default, o si la tabla no existe. (Req: Default sembrado sin cambio de comportamiento)
- [x] 1b.2 Escribir `backend/scripts/check-calendario-master-default.spec.ts` con la consulta inyectada (precedente `backend/scripts/backfill-correo-clientes.spec.ts`): exit 0 con el default; exit 1 con una fila distinta, con 6 filas y con la tabla ausente. (Req: Default sembrado sin cambio de comportamiento)
- [x] 1b.3 Agregar el paso `Precondicion: calendario master = default` a `deploy.ps1`, después de `Cargar backend/.env` (línea 137) y antes de `Detener servicios` (línea 205), envuelto en `AssertOk`. Mantener el archivo 100% ASCII, sin BOM. (Req: Default sembrado sin cambio de comportamiento)
- [x] 1b.4 Sumar el paso nuevo a "Qué hace, en orden" y la consulta con su salida esperada a "Preflight que conviene correr antes" en `DEPLOY-VPS-runbook.md` (raíz del repo `soporte`), indicando que `deploy.ps1` ya lo verifica y que la consulta manual sirve de diagnóstico si el paso aborta. (Req: Default sembrado sin cambio de comportamiento)

**Test enfocado**: `cd backend && pnpm vitest run scripts/check-calendario-master-default.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` (backend) · el spec de convención ASCII/sin BOM ya existente para `.ps1` (`ps1-ascii.spec.ts`, según indicación del dueño) (read-only)
**Runtime harness**: N/A — script de solo lectura contra Postgres real; se ejercita con la consulta inyectada del spec unitario, no con un harness aplicativo.
**Rollback boundary**: revertir el commit saca el paso de `deploy.ps1` y el script; el deploy vuelve a no tener esta precondición automatizada, sin afectar WU-1.

## WU-2 — Dominio: VO, errores, constantes

**`size:exception`** (criterio del dueño, 2026-09-28): ~440 líneas. Las cuatro validaciones de `crear()` son
pasos del mismo método; partir separaba código de sus tests.

**Branch**: `feat/horario-laboral-por-cliente-wu02` · **Base**: `feat/horario-laboral-por-cliente-wu01b`

- [x] 2.1 Crear `backend/src/calendario-laboral/domain/constants/horario-laboral.constants.ts` (`DIAS_POR_SEMANA`, `MINUTOS_POR_DIA`, etc.).
- [x] 2.2 Crear `backend/src/calendario-laboral/domain/errors/horario-laboral.errors.ts` (`HorarioLaboralDiasInvalidosError`, `VentanaLaboralInvalidaError(dia)`, `HorarioLaboralSinDiasAbiertosError`).
- [x] 2.3 Crear `backend/src/calendario-laboral/domain/value-objects/horario-laboral-semanal.ts`: `crear(dias)` con el orden de validación del diseño (length 7 → `diaSemana` único 0..6 → por día ambos null o `0 <= apertura < cierre <= 1440` → al menos un día abierto) y `aCalendario()`. (Req: Un intervalo por día, dentro de rango; Al menos un día abierto)
- [x] 2.4 Escribir `backend/src/calendario-laboral/domain/value-objects/horario-laboral-semanal.spec.ts`: cada rama de `crear` (6 días, 8 días, lunes repetido + domingo faltante, apertura ≥ cierre, un solo extremo null, 1441, −1, no entero, 7 cerrados) y el `aCalendario()` exacto. (Req: Un intervalo por día, dentro de rango; Al menos un día abierto)

**Test enfocado**: `cd backend && pnpm vitest run src/calendario-laboral/domain/value-objects/horario-laboral-semanal.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` (backend)
**Runtime harness**: N/A — dominio puro, sin infraestructura.
**Rollback boundary**: nada importa este módulo todavía; revertir el commit es inocuo.

## WU-3 — Swap del repositorio, fail-closed, deprecación de master

**Branch**: `feat/horario-laboral-por-cliente-wu03` · **Base**: `feat/horario-laboral-por-cliente-wu02`

- [x] 3.1 Cambiar el constructor de `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository.ts` a `(tenantContext: TenantContext)`, sin `PrismaService`; `obtener()` lanza `CalendarioLaboralSinTenantContextError extends Error` (definida en el mismo archivo) si `tenantContext.get()` es `undefined`; con contexto, `ctx.prismaClient.calendarioLaboralDiaCliente.findMany()`. (Req: Aislamiento por cliente; Lectura falla cerrada sin contexto de inquilino)
- [x] 3.2 Actualizar `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral.mapper.ts` para tipar la fila estructuralmente (`{diaSemana; aperturaMinuto; cierreMinuto}`) y dejar de importar `.prisma/master`. (Req: Aislamiento por cliente)
- [x] 3.3 Actualizar el provider del token `CALENDARIO_LABORAL_SEMANAL_REPOSITORY` en `backend/src/calendario-laboral/calendario-laboral.module.ts` para inyectar `TenantContext` en vez de `PrismaService`.
- [x] 3.4 Corregir los 11 docstrings "global, vive en MASTER" (D8): `backend/src/calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository.ts` (3-5) · `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository.ts` (1-5) · `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral.mapper.ts` (1-4, 30, 48) · `backend/src/calendario-laboral/domain/services/calcular-sla-habil-vence.service.ts` (12-13, 51, 60) · `backend/src/sla/application/use-cases/aplicar-sla.use-case.ts` (59-62, 68-72, 185-187) · `backend/src/sla/sla.module.ts` (87-88) · `backend/src/calendario-laboral/calendario-laboral.module.ts` (2-9) · `backend/prisma_master/schema.prisma` (454-475) · `backend/src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral.repositorios.integration.spec.ts` (1-14) · `backend/src/sla/infrastructure/listeners/aplicar-sla-habil-feriados.e2e.spec.ts` (18-21, 29) · `backend/src/calendario-laboral/domain/services/calcular-sla-habil-vence.service.spec.ts` (26). (Req: La tabla master queda deprecada, no dropeada)
- [x] 3.5 En `backend/prisma_master/schema.prisma` (454-475), reemplazar el comentario por "DEPRECADA desde `horario-laboral-por-cliente`: sin lectores, red de rollback, no dropear" y borrar la promesa del ABM ROOT. (Req: La tabla master queda deprecada, no dropeada)
- [x] 3.6 Migrar `backend/src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral.repositorios.integration.spec.ts` (H2) al constructor nuevo y al patrón de DB tenant efímera (`prisma-feriado-cliente.repository.integration.spec.ts:27-50`); ya no usa `soporte_master_test` ni `usarLockMasterTest()`. Casos: lectura del seed, fila faltante lanza, fail-closed sin `TenantContext`. (Req: Aislamiento por cliente; Lectura falla cerrada sin contexto de inquilino)
- [x] 3.7 Corregir el constructor y la cita de migración en `backend/src/sla/infrastructure/listeners/aplicar-sla-habil-feriados.e2e.spec.ts` (H2, D8: la migración real es `20260830210000`, no `20260824130000`); los vencimientos esperados no cambian.

**Test enfocado**: `cd backend && pnpm vitest run src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral.repositorios.integration.spec.ts src/calendario-laboral/domain/services/calcular-sla-habil-vence.service.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` · `pnpm test` (backend)
**Runtime harness**: `aplicar-sla-habil-feriados.e2e.spec.ts` con `usarLockMasterTest()` (existente); `cd backend && pnpm vitest run src/sla/infrastructure/listeners/aplicar-sla-habil-feriados.e2e.spec.ts`
**Rollback boundary**: revertir el commit vuelve a leer master vía `PrismaService` (comportamiento previo al cambio); ningún consumidor externo quedó a mitad de camino.

## WU-4 — E2E SLA: no-recálculo, repriorización, aislamiento

**Branch**: `feat/horario-laboral-por-cliente-wu04` · **Base**: `feat/horario-laboral-por-cliente-wu03`

- [x] 4.1 Crear `backend/src/sla/infrastructure/listeners/aplicar-sla-horario-cliente.e2e.spec.ts` con tenants A y B, `createdAt` lunes 2031-04-07 12:00Z, prioridad de 8h: ticket en A con el default → `2031-04-07T20:00Z`. (Req: Guardar el horario no recalcula el SLA de tickets abiertos)
- [x] 4.2 En el mismo spec, cambiar A a lun-vie 480-720 por SQL directo y confirmar que el `sla_vence_at` del ticket ya abierto **no cambia**. (Req: Guardar el horario no recalcula el SLA de tickets abiertos)
- [x] 4.3 Repriorizar ese ticket y confirmar `2031-04-09T12:00Z`, anclado al `createdAt` original. (Req: Guardar el horario no recalcula el SLA de tickets abiertos)
- [x] 4.4 Crear un ticket nuevo en A y confirmar que usa el horario nuevo; crear uno en B con el mismo `createdAt` y confirmar `2031-04-07T20:00Z` (aislamiento, sin afectarse entre sí). (Req: Aislamiento por cliente; Zona horaria fija Argentina)

**Test enfocado**: `cd backend && pnpm vitest run src/sla/infrastructure/listeners/aplicar-sla-horario-cliente.e2e.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` (backend)
**Runtime harness**: e2e con `usarLockMasterTest()` **obligatorio** — lee feriados de master y el spec hermano inserta un feriado global el 2031-04-08 dentro de la ventana repriorizada.
**Rollback boundary**: retira el spec nuevo; no toca producción ni otros specs.

## WU-5a — Puerto de escritura y `reemplazar`

**Partida en WU-5a / WU-5b** (criterio del dueño, 2026-09-28): la unidad sumó 468 líneas y tiene un
corte limpio. WU-5a lleva el puerto, `reemplazar()` y su test de integración (5.1, 5.2, 5.3, 5.7);
WU-5b lleva los casos de uso y sus specs (5.4, 5.5, 5.6).

**Branch**: `feat/horario-laboral-por-cliente-wu05` · **Base**: `feat/horario-laboral-por-cliente-wu04`

- [x] 5.1 Crear `backend/src/calendario-laboral/domain/ports/i-horario-laboral-escritura.repository.ts` (`reemplazar(horario): Promise<void>`).
- [x] 5.2 Implementar `reemplazar()` en `backend/src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository.ts`: 7 `upsert` por `diaSemana`, **secuenciales (`for … await`, nunca `Promise.all`)**, en orden fijo `dia_semana` 0→6 ascendente. (Req: Reemplazo atómico de las 7 filas)
- [x] 5.3 Registrar el puerto de escritura en `backend/src/calendario-laboral/calendario-laboral.module.ts` con alias `useExisting` sobre el mismo provider.
- [x] 5.4 Crear `backend/src/calendario-laboral/application/use-cases/obtener-horario-laboral.use-case.ts` y su spec.
- [x] 5.5 Crear `backend/src/calendario-laboral/application/use-cases/guardar-horario-laboral.use-case.ts`: `HorarioLaboralSemanal.crear(dto.dias)`; si falla, `Result.fail` sin tocar la base; si pasa, `txRunner.run(() => repo.reemplazar(horario))`, devuelve el horario leído después del commit. (Req: Al menos un día abierto; Reemplazo atómico de las 7 filas)
- [x] 5.6 Escribir `backend/src/calendario-laboral/application/use-cases/guardar-horario-laboral.use-case.spec.ts`: si el VO es inválido, `txRunner.run` **no se llama**. (Req: Al menos un día abierto; Reemplazo atómico de las 7 filas)
- [x] 5.7 En `calendario-laboral.repositorios.integration.spec.ts`, agregar `reemplazar` dentro de un `PrismaTenantTransactionRunner` real: los 7 `upsert` salen en orden `diaSemana` 0→6, cada uno después de que termina el anterior; si algo lanza a mitad de camino, las 7 filas siguen como estaban. (Req: Reemplazo atómico de las 7 filas)

**Test enfocado**: `cd backend && pnpm vitest run src/calendario-laboral/application/use-cases/guardar-horario-laboral.use-case.spec.ts src/calendario-laboral/infrastructure/persistence/prisma/calendario-laboral.repositorios.integration.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` (backend)
**Runtime harness**: DB tenant efímera (integración de `reemplazar` con transacción real).
**Rollback boundary**: retira los dos casos de uso y el método `reemplazar`; sin consumidores todavía (el controller llega en WU-6a).

## WU-6a — Controller, DTOs, wiring, guards

**Branch**: `feat/horario-laboral-por-cliente-wu06a` · **Base**: `feat/horario-laboral-por-cliente-wu05`

- [ ] 6a.1 Crear `backend/src/calendario-laboral/interface/dtos/horario-laboral.dto.ts`: `@IsArray @ArrayMinSize(7) @ArrayMaxSize(7) @ValidateNested` con `@IsInt @Min(0) @Max(6) diaSemana` y minutos `@ValidateIf(v !== null) @IsInt @Min(0) @Max(1440)`. (Req: Un intervalo por día, dentro de rango)
- [ ] 6a.2 Crear `backend/src/calendario-laboral/interface/controllers/horario-laboral.controller.ts`: `@Controller('horario-laboral') @UseGuards(JwtAuthGuard, TenantGuard)`; `GET` → 200 `{ dias }` abierto a cualquier autenticado del tenant; `PUT` + `@UseGuards(AdminClienteGuard)` por método → 200 `{ dias }`; errores de dominio → 422. (Req: Permisos de edición y lectura; Reemplazo atómico de las 7 filas)
- [ ] 6a.3 Registrar el controller en `calendario-laboral.module.ts`.
- [ ] 6a.4 Escribir `backend/src/calendario-laboral/interface/controllers/horario-laboral.controller.spec.ts`: metadata de guards con `?? []`; `PUT` lleva `AdminClienteGuard`, `GET` no; prueba por mutación (borrar el decorador pone el test en rojo). (Req: Permisos de edición y lectura)

**Test enfocado**: `cd backend && pnpm vitest run src/calendario-laboral/interface/controllers/horario-laboral.controller.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` (backend)
**Runtime harness**: N/A — spec unitario de metadata de guards; el e2e real es WU-6b.
**Rollback boundary**: retira el endpoint; sin frontend que lo consuma todavía.

## WU-6b — E2E HTTP: matriz de guards y aislamiento A/B

**Branch**: `feat/horario-laboral-por-cliente-wu06b` · **Base**: `feat/horario-laboral-por-cliente-wu06a`

- [ ] 6b.1 Crear `backend/src/calendario-laboral/interface/controllers/horario-laboral.e2e.spec.ts` con el harness de `feriados-cliente.e2e.spec.ts`: 401 en `GET`/`PUT` sin token; 200 en `GET` para no-admin; 403 en su `PUT`; 200 para ADMINISTRADOR y ROOT. (Req: Permisos de edición y lectura)
- [ ] 6b.2 En el mismo spec: 422 con 7 días cerrados y 422 con un día repetido; en ambos casos, un `GET` posterior devuelve el horario sin cambios; 400 con 6 días. (Req: Al menos un día abierto; Reemplazo atómico de las 7 filas)
- [ ] 6b.3 En el mismo spec: A guarda un horario propio → el `GET` de B sigue devolviendo el default (aislamiento). (Req: Aislamiento por cliente)
- [ ] 6b.4 Aplicar la higiene de DB tenant efímera: limpiar filas de `clientes` → `app.close()` → `onModuleDestroy()` → `dropDatabase`.

**Test enfocado**: `cd backend && pnpm vitest run src/calendario-laboral/interface/controllers/horario-laboral.e2e.spec.ts`
**Verificación**: `pnpm lint` · `pnpm typecheck` (backend)
**Runtime harness**: e2e HTTP con DB tenant efímera (sin `soporte_master_test`, sin `usarLockMasterTest()`).
**Rollback boundary**: retira el spec nuevo; no toca producción.

## WU-7 — Frontend: contrato de datos

**Branch**: `feat/horario-laboral-por-cliente-wu07` · **Base**: `feat/horario-laboral-por-cliente-wu06a`

- [ ] 7.1 Crear `frontend/src/features/horario-laboral/types.ts` y `frontend/src/features/horario-laboral/api.ts` (GET/PUT `horario-laboral`, sin ruta inicial con `/`).
- [ ] 7.2 Crear `frontend/src/features/horario-laboral/limites.ts` (copia `DIAS_POR_SEMANA`/`MINUTOS_POR_DIA`) con un test centinela contra `horario-laboral.constants.ts`.
- [ ] 7.3 Crear `frontend/src/features/horario-laboral/minutos.ts` (conversión HH:MM ↔ minutos, pura; en cierre `"00:00"` = 1440) y `minutos.test.ts` (ida y vuelta, caso `00:00`). (Req: Contrato observable del frontend)
- [ ] 7.4 Crear `frontend/src/features/horario-laboral/schemas.ts`: `diaFormSchema` + `horarioLaboralFormSchema` con `.length(7)` y `superRefine` (apertura obligatoria si abierto, `apertura < cierre`, `diaSemana` único, al menos un día abierto → error en la raíz). Y `schemas.test.ts` (7 cerrados, apertura ≥ cierre, día repetido). (Req: Contrato observable del frontend)
- [ ] 7.5 Crear `frontend/src/features/horario-laboral/hooks/use-horario-laboral.ts` y `use-guardar-horario-laboral.ts` (React Query; `isLoading` para skeleton, `isError && !data` para `ErrorState`, `invalidateQueries(["horario-laboral"])` al guardar) con sus tests.
- [ ] 7.6 Agregar el ítem "Horario laboral" en `DEFAULT_SECTION_ITEMS` de `frontend/src/shared/nav/nav-config.ts`, justo después de "Feriados", `visible: () => true`, icono `Clock`, y su test confirmando visibilidad para cualquier rol.

**Test enfocado**: `cd frontend && pnpm vitest run src/features/horario-laboral`
**Verificación**: `pnpm lint` · `pnpm type-check` (frontend)
**Runtime harness**: N/A — unitario con React Query y mocks de fetch.
**Rollback boundary**: retira el módulo de datos `features/horario-laboral/`; sin componentes ni ruta que lo monten todavía.

## WU-8a — Frontend: componentes presentacionales

**Branch**: `feat/horario-laboral-por-cliente-wu08a` · **Base**: `feat/horario-laboral-por-cliente-wu07`

- [ ] 8a.1 Crear `frontend/src/features/horario-laboral/components/horario-laboral-fila.tsx` (checkbox "Abierto" + dos `<Input type="time">`) y su test.
- [ ] 8a.2 Crear `frontend/src/features/horario-laboral/components/horario-laboral-form.tsx` (RHF + `zodResolver`, props `valoresIniciales`, `soloLectura`, `guardando`, `errorServidor`, `onGuardar`); en `soloLectura`, inputs `disabled` y sin botón Guardar. (Req: Contrato observable del frontend)
- [ ] 8a.3 Escribir `horario-laboral-form.test.tsx`: admin puede editar; no-admin ve solo lectura; marcar los 7 días cerrados muestra el mensaje de la raíz del schema y **no llama** a `onGuardar`. (Req: Contrato observable del frontend)

**Test enfocado**: `cd frontend && pnpm vitest run src/features/horario-laboral/components`
**Verificación**: `pnpm lint` · `pnpm type-check` (frontend)
**Runtime harness**: N/A — Testing Library, sin red.
**Rollback boundary**: retira los dos componentes; sin ruta que los monte todavía.

## WU-8b — Frontend: vista, página, nav y deuda de Ayuda

**Branch**: `feat/horario-laboral-por-cliente-wu08b` · **Base**: `feat/horario-laboral-por-cliente-wu08a`

- [ ] 8b.1 Crear `frontend/src/features/horario-laboral/components/horario-laboral-view.tsx` (container: `useHorarioLaboral`, `useGuardarHorarioLaboral`, `useSession().esAdminCliente`). Errores de mutación no desmontan el form: conservan valores, alert inline, `notifyError`; botón deshabilitado solo mientras `isPending`; éxito → `reset(nuevos)` + `notifySuccess`. (Req: Contrato observable del frontend)
- [ ] 8b.2 Crear `frontend/src/app/(dashboard)/horario-laboral/page.tsx` (Server Component fino, sin `layout.tsx`, como la página de feriados).
- [ ] 8b.3 Escribir `horario-laboral-view.test.tsx`: skeleton depende de `isLoading` (nunca de `isFetching`); `ErrorState` con `onRetry={refetch}` solo si `isError && !data`; un 422 y un 500 dejan el form con sus valores. (Req: Contrato observable del frontend)
- [ ] 8b.4 Commit y PR de esta unidad anotan la deuda de Ayuda: pantalla nueva sin artículo en `backend/ayuda/*.md` (escritura en pausa desde 2026-09-07).

**Test enfocado**: `cd frontend && pnpm vitest run src/features/horario-laboral/components/horario-laboral-view.test.tsx`
**Verificación**: `pnpm lint` · `pnpm type-check` · `pnpm build` (frontend)
**Runtime harness**: N/A — Testing Library, sin red.
**Rollback boundary**: retira la ruta `horario-laboral` y el ítem de nav; el backend queda sin consumidor de frontend pero funcional por API.

---

## Nota final (no es un work unit — corre en `sdd-archive`)

- [ ] A.1 En `docs/roadmap-comercial.md`, pasar la cláusula "calendario por cliente con default 9-18 lun-vie" del Punto 5 de **Desviación** a **Cumplida**, y confirmar `scripts/check-roadmap-fresco.mjs` en verde. (Req: La viñeta del roadmap declara el cierre)
- [ ] A.2 Corregir la fila de citación en `openspec/specs/feriados-cliente/spec.md` (read-only en este ciclo, línea 28), que hoy declara "Desviación declarada, no implementada": referenciar esta capacidad como Cumplida. (Req: La viñeta del roadmap declara el cierre)

Ninguna de las dos ediciones pertenece a la autoridad de edición de `sdd-apply`: quedan para
`sdd-archive`, en paralelo a mover `openspec/changes/horario-laboral-por-cliente/` al archivo.
