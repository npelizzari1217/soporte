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

## WU-7 — Retiro, aplicacion: `RetirarComponenteUseCase` (tareas 7.1 a 7.7)

Rama `feat/stock-usado-componentes-wu07` (base wu06-2). Modo estandar (feature).

- 7.1 `retirar-componente.use-case.ts` segun ADR-4: fuera de la transaccion existe/pertenece (404), activo (`ComponenteDadoDeBajaError`), `validarRetiro`; dentro de `run()`, con `STOCK_USADO` primero `registrarDevolucionDeComponente`, luego `componente.retirar` y `componenteRepo.retirar`. ENTRADA fallida o marca en 0 filas lanzan `FalloRetiroDeComponente` (interna) y se desenvuelven a `Result.fail`; la marca en 0 filas devuelve `ComponenteDadoDeBajaError`. `DESCARTE` no toca stock.
- 7.2 El metodo `retirar` del repo ya existia desde WU-5 (condicional `deleted_at IS NULL`); aqui solo se registra el caso de uso en `equipos.module.ts` (usa `RegistrarEntradaInsumoUseCase`, ya exportado por `InsumosModule`). Sin endpoint (WU-8a). `delete` se mantiene (WU-8b).
- 7.3 Spec de aplicacion (15 casos): orden ENTRADA -> marca, rollback por 0 filas y por ENTRADA fallida, motivos por destino, `bajaSinSalidaPrevia`, ya retirado, ajeno, excepcion ajena.
- 7.4/7.5 `retirar-componente.integration.spec.ts` (base efimera del tenant de test, pool propio instrumentado): ENTRADA USADO con `equipoId` y saldos, DESCARTE sin movimiento, `bajaSinSalidaPrevia = false` tras instalar con descuento y retirar (pendiente de WU-6), ENTRADA fallida, marca en 0 filas sin movimiento residual, y 8 retiros simultaneos => una ENTRADA.
- 7.6 Mutacion local (no commiteada): quitar `deletedAt: null` del `where` de `retirar` deja en rojo el caso de concurrencia (los otros 5 siguen verdes). Repo restaurado.
- Gates: ver reporte del orquestador.

## WU-8a — Endpoint de retiro y correccion de la Ayuda de permisos (tareas 8a.1 a 8a.6)

Rama `feat/stock-usado-componentes-wu08a` (base wu07). Modo estandar (feature).

- 8a.1 `RetirarComponenteHttpDto`: `destino` con `IsIn(DESTINOS_RETIRO_COMPONENTE)`, `motivo` opcional con `transformarMotivo` y `MaxLength` (mide despues del recorte). El tope de 500 evita un 500: `validarRetiro` lanza si el motivo lo excede, asi que el borde lo frena con 400 en ambos destinos.
- 8a.2 `POST :id/componentes/:componenteId/baja` (`EQUIPOS:BORRADO`, `@CurrentUser()`, 200). `MotivoRetiroRequeridoError` y `ComponenteDadoDeBajaError` (422) y `ComponenteNoEncontradoError` (404) ya estaban mapeados en `toHttpException`. El `DELETE` sigue hasta WU-8b. El caso de uso ya estaba registrado en el modulo.
- 8a.3 Specs de DTO (destino, recorte, 501 y 500 caracteres) y de controller (ok, 422 x2, 404, metadata de permiso).
- 8a.4 `equipos-retirar-componente.e2e.spec.ts` (`usarLockMasterTest()`, un actor por test por el UNIQUE de `db_name`): 401; 403 con permisos de insumos y sin BORRADO; `STOCK_USADO` solo con `EQUIPOS:BORRADO` (saldo USADO +1); `DESCARTE` sin movimiento; sin motivo 422; sin destino o invalido 400; motivo de 501 caracteres 400 en ambos destinos; ya retirado 422; reactivar tras `STOCK_USADO` 422; tras `DESCARTE` y de un legado, activo con saldo intacto.
- 8a.5 Ayuda: `permisos-y-roles.md` ya no afirma que sin la casilla de Insumos nadie registra movimientos; nombra las tres excepciones. Unica edicion de Ayuda del ciclo.

## WU-8b — Borrado del `DELETE` de componentes (tareas 8b.1 a 8b.5)

Rama `feat/stock-usado-componentes-wu08b` (base wu08a-2). Modo estandar (refactor).

- 8b.1 Borrados `eliminar-componente.use-case.ts` y su spec; fuera la ruta `DELETE :id/componentes/:componenteId`, su inyeccion y su provider en el modulo, y las referencias en `equipos.controller.spec.ts` (mock, constructor y bloque `describe`). Comentario de `reactivar-componente.use-case.ts` ahora nombra a `RetirarComponenteUseCase`.
- 8b.2 `delete` fuera de `IComponenteEquipoRepository` y del repo Prisma. Fixture de `prisma-equipos.integration.spec.ts` pasa a `entidad.retirar({destino: 'DESCARTE', ...})` + `componenteRepo.retirar`.
- 8b.3 E2E en `equipos-retirar-componente.e2e.spec.ts`: el `DELETE` responde 404 y el componente sigue activo.
- Hallazgo: `equipos-instalar-desde-deposito.e2e.spec.ts` (2 casos, "Retiro sin stock" y "Reemplazo como retiro mas alta") usaba el `DELETE`; pasan a `POST .../baja` con `DESCARTE` (200 en lugar de 204), con las mismas aserciones de stock.
- 8b.4 `rg "EliminarComponenteUseCase|componenteRepo.delete|eliminar-componente" backend/src`: vacio.
- 8b.5 Gates: lint y typecheck en cero; `vitest run src/equipos` verde; `pnpm test` completo 488 archivos, 5811 tests en verde.

## WU-9 — Frontend insumos: ficha con dos saldos y columna condicion (tareas 9.1 a 9.4)

Rama `feat/stock-usado-componentes-wu09` (base wu08b). Modo estandar (feature).

- 9.1 `types.ts`: `CONDICIONES_STOCK` y `CondicionStock` espejo del backend; `StockInsumo` gana `saldos` y `admiteUsado`; `MovimientoInsumo` gana `condicion`.
- 9.2 `insumo-detail-view.tsx`: "Stock nuevo", "Stock usado" (solo si `admiteUsado` o USADO > 0) y "Stock total"; la reposicion sigue leyendo el `estadoReposicion` resuelto por el backend (sobre NUEVO); columna "Condicion" en la bitacora. El hook `use-stock-insumo` no cambia.
- 9.3 Tests en `insumo-detail-view.test.tsx`: NUEVO 4 + USADO 2 = 6, sin usado, admite usado en cero, usado sin admitirlo, reposicion con USADO alto, condicion por movimiento. Los tests previos que buscaban el saldo por texto se pasan a `valorDe("Stock total")` porque NUEVO y total coinciden.
- 9.4 Gates: lint y type-check en cero; `vitest run src/features/insumos` 244 verdes; suite completa ver reporte.

## WU-10 — Frontend insumos: selector de condicion en entrada, salida y ajuste (tareas 10.1 a 10.4)

Rama `feat/stock-usado-componentes-wu10` (base wu09). Modo estandar (feature).

- 10.1 `hooks/use-selector-condicion.ts` (regla a1: visible con `admiteUsado` o con la consulta de stock en error; NUEVO por defecto; fijo y deshabilitado con un solo saldo positivo; `paraEnviar` undefined si no se ve) y `components/condicion-stock-selector.tsx` (presentacional, reutilizable en WU-11).
- 10.2 Los tres dialogos usan el selector via `camposAdicionales` y envian `condicion`; `condicion` opcional en `registrarMovimientoInsumoSchema` y en `RegistrarMovimientoInsumoDto`. Las mutaciones ya invalidaban `["insumo", id, "stock"]` y `["insumo", id, "movimientos"]` (sin cambios). El dialogo de recepcion de compra no se toca.
- Ajuste de `useStockInsumo`: opcion `refetchOnMount: false` para el consumidor secundario; sin ella, montar el selector con la ficha ya cargada provocaba un GET de stock extra (rompia dos tests de refresco de `insumo-detail-view`).
- 10.3 `movimiento-condicion.test.tsx` (describe.each de las tres puertas: oculto, ambos saldos con USADO, fijo, sin acceso a stock) mas el 422 de salida NUEVO sin saldo suficiente.
- 10.4 Gates: lint y type-check en cero; `pnpm test` 211 archivos, 1595 tests en verde.
