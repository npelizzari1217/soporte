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


## WU-3b — Consulta de stock con saldos y reposicion sobre NUEVO (tareas 3b.1 a 3b.3)

Rama `feat/stock-usado-componentes-wu03b`. Modo estandar (feature).

- `ConsultarStockInsumoUseCase` recibe `familiaRepo` (`Pick<..., 'findById'>`) como tercer parametro y devuelve `{ stock (total), saldos: { NUEVO, USADO }, admiteUsado, stockMinimo, estadoReposicion }`. `admiteUsado` reutiliza `validarCondicionAdmitida(familias, insumo, 'USADO')` (una sola definicion de la regla ADR-6: familia vigente y de repuestos). La reposicion se evalua sobre `saldos.NUEVO`.
- `insumos.module.ts` inyecta `FAMILIA_INSUMO_REPOSITORY`; su spec pasa de 2 a 3 puertos. El fixture de `toStockInsumoResponseDto` en `movimientos-insumo.dto.spec.ts` suma los campos nuevos (unico ajuste de borde forzado por el typecheck; el DTO HTTP y el controller siguen sin publicar `saldos` ni `admiteUsado`: WU-4).
- Specs: NUEVO 2 + USADO 10 con minimo 5 => BAJO_MINIMO; NUEVO 8 => SUFICIENTE; sin USADO => USADO 0 y total = NUEVO; USADO negativo entra al total; `admiteUsado` true/false/familia inexistente o no vigente.

## WU-4 — Borde HTTP: condicion en movimientos y stock (tareas 4.1 a 4.5)

Rama `feat/stock-usado-componentes-wu04` (base wu03b). Modo estandar (feature).

- 4.1 `RegistrarMovimientoInsumoHttpDto` suma `condicion?` con `@IsIn(CONDICIONES_STOCK)` (lo hereda el ajuste); `MovimientoInsumoResponseDto` publica `condicion`; `transformarMotivo` exportada (WU-8a).
- 4.2 Controller pasa `condicion` a entrada, salida y ajuste sin inventar default (lo resuelve el caso de uso). `toHttpException` mapea `CondicionUsadoNoAdmitidaError` a 422 de forma explicita. `StockInsumoResponseDto`: `stock` total + `saldos` + `admiteUsado`.
- 4.3 Specs de DTO (catalogo, herencia del ajuste, `ValidationPipe` real descarta `condicion` sobre `RegistrarRecepcionDeItemHttpDto`) y de controller (reenvio, 422).
- 4.4 E2E insumos (ya usa `usarLockMasterTest()`): entrada USADO, USADO no repuesto 422 x3, 400 fuera de catalogo, salida NUEVO con USADO 5, GET stock con saldos y reposicion sobre NUEVO, listado con condicion. E2E compras: `condicion: 'USADO'` en la recepcion queda NUEVO.
- Gates: ver reporte del orquestador (lint, typecheck, `vitest run src/insumos src/compras`, `pnpm test`).

## WU-5 — Esquema de componentes: migracion, schema, entidad, mapper, constraints, reactivar (tareas 5.1 a 5.9)

Rama `feat/stock-usado-componentes-wu05` (base wu04). Modo estandar (feature).

- 5.1/5.2 Migracion `20260930130000_componentes_equipo_retiro` (columnas nullable, dos UNIQUE, dos FK RESTRICT, los dos CHECK del diseño) y `schema.prisma` con las cinco columnas y las relaciones `instalacionMovimiento`/`bajaMovimiento` (lado inverso en `MovimientoInsumo`). Cliente regenerado. No se corrio `prisma format`: reescribia alineaciones ajenas al cambio.
- 5.3 Entidad: `DESTINOS_RETIRO_COMPONENTE`, props opcionales (los llamadores existentes de `create`/`reconstitute` no cambian), `vincularInstalacion`, `validarRetiro` (Result; el tope de 500 lanza, mismo criterio que la bitacora), `retirar` (lanza ante violaciones de contrato), `bajaSinSalidaPrevia` derivada, `reactivar` limpia las cuatro columnas y conserva `instalacionMovimientoId`. Errores `MotivoRetiroRequeridoError` y `ComponenteDevueltoAlStockError` (catalogo 13 a 15).
- 5.4 Mapper y repositorio leen/escriben las columnas; puerto `retirar(): Promise<boolean>` con `updateMany WHERE id AND deleted_at IS NULL`. `delete` se MANTIENE (marcado `@deprecated`) hasta WU-8b, segun la tarea.
- 5.5 `ReactivarComponenteUseCase` rechaza `STOCK_USADO` con `ComponenteDevueltoAlStockError`; controller mapea ambos errores nuevos a 422 explicito.
- 5.6 `prisma_tenant/componentes-equipo-retiro.integration.spec.ts` (base efimera reproducida hasta la migracion anterior, con un legado ya dado de baja): 16 casos. Hallazgo: Postgres evalua los CHECK por orden alfabetico, asi que un destino desconocido dispara `..._coherente_check` antes que `..._destino_check`; el spec asserta cualquiera de los dos y fija el catalogo exacto contra la definicion.
- 5.7 Migracion aplicada a `soporte_tenant_test` (`migrate:tenant` con `DATABASE_URL_TENANT`) y a las 2 bases de `migrate:tenants`; `\d componentes_equipo` verificado.
- 5.8 Mutacion local (no commiteada): quitar `deleted_at IS NOT NULL` de la rama DESCARTE del CHECK coherente deja en rojo "un componente ACTIVO con destino de retiro es rechazado". Migracion restaurada byte a byte.
- Specs: entidad, mapper (nuevo), caso de uso reactivar, controller (catalogo 15 clases, dos filas 422, reactivar 422).
- Cortes (regla de tamaño, ~1120 lineas en total): `wu05` = entidad, errores, controller y catalogo (433); `wu05-2` = migracion, schema, mapper y specs de constraints y mapper (542, `size:exception` declarado en el commit); `wu05-3` = puerto y repo `retirar` + reactivar con su spec. Cada parte se verifico sola (lint, typecheck, `vitest run src/equipos prisma_tenant`) regenerando el cliente Prisma con el schema de esa parte.
- Gates: ver reporte del orquestador.

## WU-6 — Instalacion con condicion y vinculo a la SALIDA (tareas 6.1 a 6.7)

Rama `feat/stock-usado-componentes-wu06` (base wu05-3). Modo estandar (feature).

- 6.1 `CreateComponenteHttpDto` suma `condicion?` (`@IsIn(CONDICIONES_STOCK)`); `ComponenteResponseDto` (y por herencia `ComponenteConTipoResponseDto`) publica `bajaDestino`, `bajaMotivo`, `bajaMovimientoId`, `bajaUsuarioId` y `bajaSinSalidaPrevia`.
- 6.2 Controller: `condicion` viaja solo en la rama con descuento; con `descontarStock=false` no se pasa (ADR-7).
- 6.3 `InstalarComponenteDesdeDepositoUseCase`: `condicion?` a la SALIDA; tras ella, `componente.vincularInstalacion(salida.id)` y `componenteRepo.save` en la misma transaccion (puerto `Pick<..., 'save'>` como ultimo parametro). `equipos.module.ts` inyecta `COMPONENTE_EQUIPO_REPOSITORY`. `AgregarComponenteUseCase` ya persiste el componente antes, asi que `save` (upsert) actualiza la fila con el vinculo.
- 6.4 a 6.6 Specs: caso de uso (vinculo y orden, condicion NUEVO/USADO, saldo insuficiente sin guardar), DTO (catalogo y 400), controller (con y sin descuento), respuesta con el registro de retiro, concurrencia real (10 altas USADO con saldo USADO 1 y NUEVO 100: una gana, SALIDA USADO y vinculo) y e2e (USADO con saldo USADO, sin condicion con NUEVO 0 y USADO 5 => 422 sin escrituras, NUEVO, `descontarStock=false` con condicion, condicion invalida 400). El e2e ya usa `usarLockMasterTest()`. La comprobacion de `bajaSinSalidaPrevia = false` tras retirar queda para WU-7 (el retiro aun no existe); aqui se cubre la derivacion en el spec del DTO.
- Corte (regla de tamaño, ~415 lineas en total): `wu06` = campos del registro de retiro en la respuesta del componente y su spec (78); `wu06-2` = resto (instalacion con condicion, vinculo, controller, concurrencia, e2e). Cada parte se verifico sola (lint, typecheck, `vitest run src/equipos`); el arbol final corrio `pnpm test` completo: 486 archivos, 5766 tests en verde.
