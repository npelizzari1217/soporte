# Apply progress: stock-usado-componentes

## WU-1 — Bitacora con condicion (tareas 1.1 a 1.7) — completa

Rama `feat/stock-usado-componentes-wu01`. Modo estandar (feature).

- 1.1 Migracion `20260930120000_movimientos_insumo_condicion` (columna `condicion VARCHAR(10) NOT NULL DEFAULT 'NUEVO'` y CHECK `movimientos_insumo_condicion_check`; el default se conserva).
- 1.2 `schema.prisma`: campo `condicion` en `MovimientoInsumo`; cliente tenant regenerado.
- 1.3 `tipo-movimiento-insumo.ts`: `CONDICIONES_STOCK`, `CondicionStock`, `CONDICION_STOCK_POR_DEFECTO`.
- 1.4 Entidad (`condicion` obligatoria en props persistidos, opcional en `create()` con default NUEVO) y mapper; specs de entidad, mapper y catalogo.
- 1.5 Spec de constraints de integracion (`movimientos-insumo-constraints.integration.spec.ts`, ubicado en `src/insumos/infrastructure/persistence/prisma/`): rechazo fuera de catalogo, aceptacion de cada valor, INSERT SQL sin `condicion` queda NUEVO, CHECK real igual a `CONDICIONES_STOCK`. Usa `soporte_tenant_test` (patron existente del spec), no una base efimera.
- 1.6 Migracion aplicada a `soporte_tenant_test` (`migrate:tenant`) y a las 2 bases tenant locales (`migrate:tenants`); verificado con `\d movimientos_insumo`.
- 1.7 Gates: lint, typecheck, `vitest run src/insumos` (65 archivos, 1095 tests) en verde; suite completa `pnpm test` (483 archivos, 5629 tests) en verde.

## WU-2 — Saldo por condicion (tareas 2.1 a 2.6) — completa

Rama `feat/stock-usado-componentes-wu02`. Modo estandar (feature).

- 2.1 `tipo-movimiento-insumo.ts`: `SumasPorCondicionYTipo`, `SaldosInsumo` y `calcularSaldos()` (aplica `calcularStock` por condicion y suma el total en centesimas). Spec con saldos independientes, condicion vacia, total exacto (0.1 + 0.2) y negativo sin recortar.
- 2.2 Puerto y repositorio Prisma: `lockAndSumByTipo()` y `sumByTipo()` devuelven `SumasPorCondicionYTipo`; `sumarPorTipo()` agrupa por `['condicion','tipo']` y completa los 2x4 ceros. `SumasPorTipoMovimiento` se elimina del puerto (el tipo vive en el dominio). JSDoc actualizado.
- 2.3 Helper `backend/src/insumos/testing/sumas-movimiento.ts` (`sumasEnCero`, `sumasCon`); migrados los specs de entrada, salida, ajuste, consulta y listado.
- 2.4 Salida, ajuste y consulta leen `calcularSaldos(sumas).NUEVO`: conducta identica a la previa.
- 2.5 Integracion (base `soporte_tenant_test`, patron existente del archivo): agrupacion por condicion con filas NUEVO y USADO sembradas por SQL directo, en `lockAndSumByTipo` y `sumByTipo`; insumo sin USADO da USADO en cero; claves contra los dos catalogos. Concurrencia ajustada al nuevo tipo.
- 2.6 Gates: `pnpm lint`, `pnpm typecheck` y `vitest run src/insumos src/compras src/equipos` (138 archivos, 2380 tests) en verde; suite completa `pnpm test` (483 archivos, 5638 tests) en verde.
- Presupuesto: 431 lineas de codigo y specs; `size:exception` declarado (sin costura limpia).
