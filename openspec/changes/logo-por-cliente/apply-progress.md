# Apply Progress: Logo por cliente en el sidebar

> Cubre únicamente WU1 (Storage y persistencia). WU2-WU4 quedan pendientes
> para batches posteriores de `sdd-apply`, en orden (`stacked-to-main`).

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

## Issues Found

Ninguno más allá del bloqueo ambiental documentado arriba.

## Remaining Tasks

- [ ] WU2: Endpoints (pipe, 3 use cases, `ClienteLogoController`)
- [ ] WU3: Propagación y sidebar
- [ ] WU4: Diálogo de carga

## Workload / PR Boundary

- Mode: chained PR slice (`stacked-to-main`)
- Current work unit: WU1 — Storage y persistencia
- Boundary: empieza en `feat/logo-por-cliente-storage` (desde
  `docs/logo-por-cliente-planificacion`), termina con el mapper hidratando
  las 3 columnas de logo. Sin consumidor HTTP todavía — WU2 lo agrega.
- Estimated review budget impact: ~280 líneas estimadas en tasks.md; el diff
  real de código+tests de WU1 queda por debajo de eso.

## Status

9/9 tareas de WU1 completas. Ready for next batch (WU2) — no ready for
verify todavía, porque el ciclo completo (WU1-WU4) sigue en curso.
