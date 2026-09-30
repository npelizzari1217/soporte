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

## WU-3a — Condicion decidida en entrada, salida y ajuste (tareas 3a.1 a 3a.8)

WU-3a excedio 400 lineas (~1.020 entre codigo y specs) y se partio en TRES commits, cada uno verde y con su codigo junto a sus tests: rama `feat/stock-usado-componentes-wu03a` (parte 1), `...-wu03a-2` (parte 2) y `...-wu03a-3` (parte 3). La costura de `tasks.md` (entrada+devolucion / salida+ajuste) se subdividio porque la mitad de entrada sola pasaba de 400.

### Parte 1 (rama wu03a): regla de la condicion y `create()` obligatoria — tareas 3a.1 (entidad) y 3a.2

- `condicion` obligatoria en `MovimientoInsumoEntity.create()`; entrada, salida y ajuste pasan `'NUEVO'` explicito hasta la parte 2 y 3. Los specs que construyen la entidad la reciben explicita.
- `CondicionUsadoNoAdmitidaError` (`CONDICION_USADO_NO_ADMITIDA`) y `validarCondicionAdmitida(familias, insumo, condicion, { admitirFamiliaNoVigente })`. Spec propio `validar-condicion-admitida.spec.ts` con el helper `insumos/testing/familia-repo-fake.ts`.

### Parte 2 (rama wu03a-2): entrada y devolucion de componente — tareas 3a.3, 3a.5 y el cableado de la entrada en 3a.6

- Entrada con `condicion?` (default NUEVO), ADR-6 antes de insertar y familiaRepo como tercer parametro; `registrarDevolucionDeComponente` (cantidad 1, USADO, admite insumo deshabilitado y familia no vigente, rechaza `esRepuesto = false`). `execute()` sigue rechazando insumo deshabilitado con cualquier condicion.
- Recepcion de compra manda `condicion: 'NUEVO'` explicito.

### Parte 3 (rama wu03a-3): salida, ajuste y concurrencia — tareas 3a.4, 3a.6 (salida y ajuste), 3a.7 y 3a.8

- Salida y ajuste con `condicion?` (default NUEVO), ADR-6 antes de la transaccion y decision de no negatividad sobre `calcularSaldos(sumas)[asiento.condicion]` bajo el lock. El ajuste sigue sin exigir insumo habilitado. familiaRepo como ultimo parametro del constructor; `insumos.module.ts` lo inyecta en los tres casos de uso y su spec lo verifica.
- Concurrencia: dos salidas USADO de 1 con saldo USADO 1 (y NUEVO 100) sobre el caso de uso real: una persistida, una `STOCK_INSUFICIENTE`, USADO final 0. Verificacion adversarial local: decidir sobre `.NUEVO` en la salida pone en rojo ese spec y dos specs de aplicacion.
- Gates: `pnpm lint`, `pnpm typecheck` y `vitest run src/insumos src/compras src/equipos` en verde; `pnpm test` completo sobre el arbol final: 484 archivos, 5675 tests en verde.

