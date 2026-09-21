# Apply Progress: Logo por cliente en el sidebar

> Cubre WU1 (Storage y persistencia) y WU2 (Endpoints). WU3-WU4 quedan
> pendientes para batches posteriores de `sdd-apply`, en orden
> (`stacked-to-main`).

## Mode

**Standard** (`strict_tdd: false`, cambio tipo FEATURE). `rules.apply.tdd: true`
del `openspec/config.yaml` sí aplicó igual: cada tarea `[RED]` se corrió y se
vio fallar por la razón correcta ANTES de escribir el `[GREEN]` correspondiente.

## Completed Tasks — WU1

- [x] 1.1 [RED] Test en `local-disk-file-storage.spec.ts`: `retrieve()` devuelve el `Buffer` de un archivo existente y `null` si no existe (ENOENT), sin lanzar.
- [x] 1.2 [GREEN] `retrieve(key): Promise<Buffer | null>` en `IFileStorage` + `LocalDiskFileStorage`.
- [x] 1.3 Migración Prisma: 3 columnas nullable en `Cliente` (`logo_storage_key`, `logo_mime_type`, `logo_updated_at`).
- [x] 1.4 Migración de reversa (`rollback.sql`) que dropea las 3 columnas.
- [x] 1.5 [RED] Test en `cliente.entity.spec.ts`: `actualizarLogo()`/`quitarLogo()` setean/limpian las 3 props juntas.
- [x] 1.6 [GREEN] `ClienteProps` extendido + `actualizarLogo()`/`quitarLogo()` + getters en `ClienteEntity`.
- [x] 1.7 [RED] Test OBLIGATORIO de round-trip en `cliente.mapper.spec.ts` (nuevo archivo).
- [x] 1.8 [GREEN] Las 3 columnas mapeadas en `toDomain` Y `toPersistence` de `ClienteMapper` (espejo completo, nunca `Omit`).
- [x] 1.9 `pnpm typecheck` y `pnpm test` (backend) verdes; revert limpio confirmado (sin consumidor HTTP todavía).

## TDD Cycle Evidence (WU1)

| Tarea | RED — comando y resultado observado | GREEN — comando y resultado observado |
|---|---|---|
| 1.1/1.2 `retrieve()` | `pnpm vitest run src/shared/infrastructure/storage/local-disk-file-storage.spec.ts` → 3 tests fallan: `TypeError: storage.retrieve is not a function` | mismo comando → 8/8 tests verdes |
| 1.5/1.6 `actualizarLogo()`/`quitarLogo()` | `pnpm vitest run src/clientes/domain/entities/cliente.entity.spec.ts` → 6 tests fallan: getters `undefined` y `TypeError: cliente.actualizarLogo is not a function` / `quitarLogo is not a function` | mismo comando → 27/27 tests verdes |
| 1.7/1.8 round-trip del mapper | `pnpm vitest run src/clientes/infrastructure/persistence/prisma/cliente.mapper.spec.ts` → 5/5 tests fallan: `expected null/undefined to be '...'` (toDomain no hidrataba, toPersistence no incluía las columnas) | mismo comando → 5/5 tests verdes |

## Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado exacto | `pnpm vitest run backend/src/clientes backend/src/shared` (desde `backend/`: `pnpm vitest run src/clientes src/shared`) → **57 test files passed, 483 tests passed** |
| Harness de runtime / escenario y resultado exacto | N/A por diseño de WU1 (design.md, tabla "Suggested Work Units": "sin consumidor HTTP todavía, solo unit/integration de mapper"). El único harness real disponible en WU1 es el suite de integración de Prisma contra Postgres real, que corrió DENTRO del comando anterior (57 test files incluye `*.integration.spec.ts` y `*.e2e.spec.ts` de `clientes`, todos verdes) |
| Rollback boundary | Revert de este batch: `git revert` sobre los 4 commits de WU1 deja el árbol limpio — cero consumidor HTTP referencia las 3 columnas de logo todavía (WU2 es quien las consume). La migración de reversa (`rollback.sql`) es el único paso que el revert de Git no cubre por sí solo — hay que correrla aparte contra Postgres, documentado en su propio encabezado |

## Desviación de diseño: migración aplicada sin `prisma migrate dev`

**Bloqueo ambiental descubierto, no causado por este batch.** `soporte_master` y
`soporte_master_test` tienen una migración `20260805194710_init_tenant` en
estado FAILED desde el 2026-08-24 (repetida el 2026-09-11): alguien corrió,
en algún momento anterior a este ciclo, la migración de INIT del schema
TENANT contra el datasource MASTER. Evidencia:

```
docker exec soporte-postgres-master psql -U soporte -d soporte_master \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20260805194710_init_tenant';"
# 2 filas, finished_at NULL en ambas — logs: "relation \"tipos_componente\" already exists" / "relation \"estados\" already exists" (42P07)
```

Esto deja `prisma migrate dev` y `prisma migrate deploy` bloqueados con
`P3009` contra AMBAS bases (`soporte_master` y `soporte_master_test`),
independientemente de la migración de este cambio.

**Qué se hizo en su lugar:**
1. Se escribió `migration.sql` y `rollback.sql` a mano en
   `prisma_master/migrations/20260921120000_add_cliente_logo/`, siguiendo el
   formato exacto de migraciones previas (`add_cliente_smtp_config`,
   `add_cliente_csat_habilitado`).
2. Se aplicó el `ALTER TABLE` directamente vía `psql` contra `soporte_master`
   Y `soporte_master_test` (columnas confirmadas con `\d clientes` en ambas).
3. Se corrió `pnpm generate:master` (no requiere conexión a DB) para
   regenerar el cliente Prisma con los 3 campos nuevos.
4. **No se tocó** la fila `20260805194710_init_tenant` de `_prisma_migrations`
   ni ningún otro estado de migración preexistente — es una corrupción de
   historial ajena a este ciclo y su arreglo no es parte de WU1.

**Consecuencia para quien continúe el ciclo o despliegue:** un futuro
`prisma migrate deploy` seguirá bloqueado por `P3009` hasta que alguien
resuelva `20260805194710_init_tenant` (candidato: `prisma migrate resolve
--rolled-back 20260805194710_init_tenant` contra ambas bases, después de
confirmar que ninguna tabla tenant relevante depende de que quede
"aplicada"). Ese arreglo es explícitamente fuera de alcance de WU1 y se
reporta acá para que no se pierda.

## Deviations from Design

Ninguna deviation de diseño en el código. La única desviación es de
**mecanismo** (cómo se aplicó la migración), documentada arriba — el
resultado final (3 columnas nullable, sin default, sin CHECK, en `clientes`)
es exactamente el especificado en `design.md`.

## Issues Found (WU1)

Ninguno más allá del bloqueo ambiental documentado arriba.

## Completed Tasks — WU2

- [x] 2.1 [RED] Test en `validar-logo-cliente.spec.ts`: acepta `image/png`, `image/jpeg`, `image/webp` hasta 512 KB; rechaza `image/svg+xml` con 422 aunque empiece con `image/`; rechaza >512 KB y 0 bytes con 422.
- [x] 2.2 [GREEN] `validar-logo-cliente.ts` HERMANO de `validar-archivo-adjunto.ts` (nunca reuso): `MIMES_LOGO` como `Set` exacto de 3 valores, `MAX_LOGO_BYTES = 512 * 1024`.
- [x] 2.3 [RED] Tests de los 3 use cases con mocks de `IFileStorage`/`IClienteRepository`: key nueva (UUID), persistencia, delete best-effort de la key anterior, fallo de delete no rompe la operación.
- [x] 2.4 [GREEN] `ConfigurarLogoCliente`, `QuitarLogoCliente`, `VerLogoCliente` en `application/use-cases/`, con `Result<T, DomainError>`. Nuevo error de dominio `LogoClienteNoEncontradoError` (distinto de `ClienteNoEncontradoError`, ambos → 404).
- [x] 2.5 [RED] Test de `cliente-logo.controller.spec.ts`: instancia el controller directo (sin bootstrap de Nest, mismo criterio que `ciclos.controller.spec.ts`) — cubre el chequeo inline del `GET` (cross-tenant 403, propio 200, ROOT 200) y el mapeo de errores a 404/204.
- [x] 2.6 [GREEN] `ClienteLogoController` NUEVO en `interface/controllers/`, SEPARADO de `ClientesController` (design D1/H1). `POST`/`DELETE`: `JwtAuthGuard + GlobalAdminGuard`. `GET`: solo `JwtAuthGuard` + chequeo inline `is_global_admin || cliente_id === :id` — nunca `TenantGuard`.
- [x] 2.7 [GREEN] `GET` responde con `Content-Type` almacenado, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, molde `@Res({ passthrough: true })` de `equipos.controller.ts`/`tickets.controller.ts`.
- [x] 2.8 Wiring en `clientes.module.ts` (`FILE_STORAGE` inyectado desde `SharedModule`, ya `@Global()`); `pnpm typecheck`, `pnpm lint`, `pnpm test` en backend verdes.

## TDD Cycle Evidence (WU2)

| Tarea | RED — comando y resultado observado | GREEN — comando y resultado observado |
|---|---|---|
| 2.1/2.2 `validarLogoCliente` | `pnpm vitest run src/clientes/interface/pipes/validar-logo-cliente.spec.ts` → `Cannot find module './validar-logo-cliente'` (1 suite fallida, 0 tests) | mismo comando → 8/8 tests verdes |
| 2.3/2.4 `ConfigurarLogoCliente`/`QuitarLogoCliente`/`VerLogoCliente` | `pnpm vitest run src/clientes/application/use-cases/{configurar,quitar,ver}-logo-cliente.use-case.spec.ts` → 3 suites fallidas, `Cannot find module` en cada una (0 tests) | mismo comando → 13/13 tests verdes (5 + 4 + 4) |
| 2.5/2.6/2.7 `ClienteLogoController` | `pnpm vitest run src/clientes/interface/controllers/cliente-logo.controller.spec.ts` → `Cannot find module './cliente-logo.controller'` (1 suite fallida, 0 tests) | mismo comando → 10/10 tests verdes |

## Work Unit Evidence (WU2)

| Evidencia | Valor |
|---|---|
| Comando de test focalizado y resultado exacto | `pnpm vitest run backend/src/clientes/interface backend/src/clientes/application` (desde `backend/`: `pnpm vitest run src/clientes/interface src/clientes/application`) → verde; la corrida completa `pnpm vitest run src/clientes` → **42 test files passed, 279 tests passed** (incluye el `[e2e-forced-failure]` intencional de `crear-cliente.e2e.spec.ts`, ver Known environmental failures del prompt) |
| Harness de runtime / escenario y resultado exacto | `pnpm start:dev` contra Postgres real (`soporte-postgres-master`, contenedor `Up`): la app bootea sin errores y el log mapea las 3 rutas nuevas — `Mapped {/api/clientes/:id/logo, POST}`, `DELETE` y `GET`. `curl` manual sin token a las tres → **401** en las tres (JwtAuthGuard real, sin mockear). **No se completó el round-trip autenticado** (login ROOT → subir → leer → borrar): el único usuario `is_global_admin=true` en `soporte_master` es la cuenta real del dueño del repo (`npelizzari@gmail.com`) y no hay credencial de prueba disponible para generar un JWT válido sin conocer esa contraseña — intentarlo habría significado adivinar una clave real, fuera de alcance. La autorización cross-tenant/ROOT/ADMINISTRADOR queda cubierta por las 13 aserciones de `cliente-logo.controller.spec.ts` (2.5) en su lugar |
| Rollback boundary | Revert de este batch: `git revert` sobre los 4 commits de WU2 (pipe; use cases + error de dominio; controller; wiring del módulo) deja el árbol en el estado de fin de WU1 — ninguna ruta HTTP nueva, `ClientesController` sin tocar (los 10 métodos de ABM conservan su `@UseGuards` de clase intacto) |

## Deviations from Design (WU2)

Ninguna. El corte de contenido de WU2 (controller nuevo en vez de extender
`ClientesController`, whitelist exacta hermana del pipe de adjuntos) es
exactamente el que `design.md` D1/D7 y `tasks.md` prescriben.

## Issues Found (WU2)

Ninguno de código. La única limitación es la cobertura del runtime harness
descrita arriba (round-trip autenticado no ejecutado por falta de
credencial ROOT de prueba) — el flujo HTTP completo con autenticación real
queda para que `sdd-verify` lo confirme con sus propios medios, o para un
seed de usuario ROOT de test si el dueño del repo lo autoriza.

## Remaining Tasks

- [ ] WU3: Propagación y sidebar
- [ ] WU4: Diálogo de carga

## Workload / PR Boundary

- Mode: chained PR slice (`stacked-to-main`)
- Current work unit: WU2 — Endpoints
- Boundary: empieza en `feat/logo-por-cliente-endpoints` (desde
  `feat/logo-por-cliente-storage`, WU1 ya verificada), termina con las 3
  rutas de `ClienteLogoController` funcionando de punta a punta contra
  Postgres real (salvo el round-trip autenticado, ver arriba). WU3 agrega
  la propagación por JWT y el consumo en el sidebar.
- Estimated review budget impact: ~380 líneas estimadas en tasks.md (la
  unidad más ajustada del forecast); el diff real de código+tests de WU2
  queda repartido en 4 commits de work-unit-commits, cada uno bien por
  debajo del presupuesto de 400 líneas por sí solo.

## Status

9/9 tareas de WU1 + 8/8 tareas de WU2 completas (17/34 del ciclo). Ready
for next batch (WU3) — no ready for verify todavía, porque el ciclo
completo (WU1-WU4) sigue en curso.
