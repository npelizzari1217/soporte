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
