# Tasks: stock usado y retiro de componentes con dos desenlaces

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530
> palabras; lo supera por la misma causa que el ciclo anterior: 14 work units (WU-1 a WU-13,
> con WU-3 y WU-8 pre-partidos en dos, más WU-12b opcional), cada uno con sus tareas, comandos
> de verificación, escenarios de spec y límite de PR. Recortar cobertura para entrar en el
> presupuesto sería peor que declarar el excedente.

> **TDD en este ciclo: deshabilitado.** Es una feature, no una corrección de defecto
> (`~/proyectos/CLAUDE.md` §6.3). Modo estándar: el test viaja en el mismo commit que el código
> que verifica, sin exigir RED verificado antes de la implementación.

> **Ayuda: escritura suspendida** (`CLAUDE.md` del repo). Ningún WU crea ni actualiza artículos
> de `backend/ayuda/*.md`, con **una excepción**: WU-8a corrige
> `backend/ayuda/permisos-y-roles.md:150-154` (ADR-9), porque el retiro vuelve falso "Sin esa
> casilla la persona no puede registrar ningún movimiento". Los WU que cambian lo que el usuario
> ve o hace (WU-9, WU-10, WU-11, WU-12 y WU-12b) anotan la deuda en el cuerpo del commit y del
> PR: *"Ayuda pendiente: ficha del insumo con saldos NUEVO y USADO y columna de condición,
> selector de condición en entrada, salida, ajuste y alta de componente, retiro de componente
> con dos desenlaces (devolver al stock como usado o descartar con motivo), rótulos de destino
> y 'sin salida registrada del depósito', reactivar oculto tras devolver al stock"*.

> **Specs de `openspec/specs/`: no se editan en apply.** El alta de `stock-insumo-condicion` y
> el delta de `componentes-catalogo-unico` los hace `sdd-archive` a partir de los deltas de este
> ciclo. Este cambio no implementa un punto de `docs/roadmap-comercial.md`.

## Decisiones de planificación que prevalecen sobre el diseño donde difieran

1. **Compilación entre WU-1 y WU-3.** `condicion` es opcional en `MovimientoInsumoEntity.create()`
   (default `NUEVO`) en WU-1 y WU-2; WU-3a la vuelve obligatoria y, en el mismo commit, cada
   llamador la pasa (el compilador los enumera).
2. **Cortes pre-planificados** (lección del ciclo anterior: el tamaño real fue ~2x la
   estimación y un borrado de diálogo más su test rompió el presupuesto): WU-3 se parte en
   3a/3b y WU-8 en 8a/8b **desde el inicio**, en costuras donde cada mitad lleva su código con
   sus tests. Ver "Review Workload Forecast".
3. **Migraciones tenant y bases de test locales.** `soporte_master_test` y `soporte_tenant_test`
   se migran **a mano**. Todo WU que agrega una migración tenant (WU-1 y WU-5) incluye la tarea
   de correr `migrate:tenant` contra `soporte_tenant_test` (con `DATABASE_URL_TENANT` apuntando a
   esa base) y `pnpm migrate:tenants` para la base local de desarrollo. No hay migración MASTER
   en este ciclo.
4. **Estados intermedios no desplegables.** Entre WU-8a y WU-12 el frontend todavía llama al
   `DELETE` retirado (los tests de frontend siguen en verde porque usan MSW). El tracker se
   integra a `main` una sola vez.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~4.000 (+/−) nominal, ya corregidas por diseño; real esperable 1,5-2x en las unidades de riesgo |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Tracker con 16 PR hijos en cadena lineal (WU-1 a WU-13; 3a/3b y 8a/8b pre-partidos; 12b solo si hace falta) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
400-line budget risk: High

**Por qué "No" a la decisión:** el dueño ya confirmó la estrategia (auto-chain,
feature-branch-chain, un solo release del tracker) y la política de tamaño (partir en costura
limpia con código y tests juntos; `size:exception` solo si partir los separa). Los cortes
conocidos están pre-planificados abajo. Lo que exceda en apply se resuelve con esa política,
sin consulta previa; si una WU exige `size:exception`, se declara en su PR con el motivo. El
único punto que puede forzarla desde ya es WU-2 (cambia el tipo de retorno del puerto y rompe
la compilación de todos los llamadores si se separa).

| WU | Estimación (líneas +/−) | Riesgo | Corte previsto si se pasa |
|---|---|---|---|
| 1 | ~250 | Medio | — (migración, schema y su constraint spec no se separan) |
| 2 | ~380 | Alto (fakes) | Sin costura limpia: probable `size:exception` |
| 3a | ~300 | Alto | Entrada/devolución vs. salida/ajuste (cada caso de uso con su spec) |
| 3b | ~130 | Bajo | — |
| 4 | ~300 | Medio | DTOs+controller de movimientos vs. stock/respuestas |
| 5 | ~350 | Alto | Reactivar (ADR-5) con su spec vs. entidad/mapper/migración |
| 6 | ~300 | Medio | — |
| 7 | ~350 | Alto | — (retiro, repo `retirar` e integración viajan juntos) |
| 8a | ~250 | Medio | — |
| 8b | ~150 borrado puro | Bajo | — |
| 9 | ~250 | Medio | — |
| 10 | ~330 | Medio | Un diálogo por PR (entrada / salida+ajuste) |
| 11 | ~250 | Medio | — |
| 12 | ~400 | Alto | Separar rótulos y reactivar en WU-12b (~150) |
| 12b | ~150 | Bajo | Solo si WU-12 se pasa |
| 13 | ~80 | Bajo | — |

## Cadena de PR y dependencias

Ramas: `feat/stock-usado-componentes-wuNN` (`wu03a`, `wu03b`, `wu08a`, `wu08b`, `wu12b`). El
tracker `feat/stock-usado-componentes` ya contiene los commits de planificación. **Cada PR hijo
apunta a la rama del PR inmediatamente anterior**; solo el tracker se integra a `main`, en un
único release, y solo es desplegable entero.

`main` ← tracker ← wu01 ← wu02 ← wu03a ← wu03b ← wu04 ← wu05 ← wu06 ← wu07 ← wu08a ← wu08b ← wu09 ← wu10 ← wu11 ← wu12 ← (wu12b) ← wu13

| WU | Depende de | Motivo |
|---|---|---|
| 1 | — | Esquema y entidad de la bitácora con condición |
| 2 | 1 | El repositorio agrupa por la columna nueva |
| 3a | 2 | Casos de uso deciden sobre `calcularSaldos` |
| 3b | 3a | La consulta usa la regla de alcance y los saldos |
| 4 | 3b | El borde expone lo que la aplicación ya decide |
| 5 | 1 | Migración de componentes; FK a `movimientos_insumo` |
| 6 | 3a, 5 | Instalación con condición y vínculo a la SALIDA |
| 7 | 3a, 5 | Retiro usa `registrarDevolucionDeComponente` y las columnas de retiro |
| 8a | 7 | Publica `POST …/baja` sobre el caso de uso ya existente |
| 8b | 8a | Borrado del `DELETE` cuando el reemplazo ya existe |
| 9 | 4 | Consume `saldos`, `admiteUsado` y `condicion` |
| 10 | 9 | Selector en diálogos usa los tipos y el hook de stock |
| 11 | 6, 9 | Selector en el alta usa contrato de WU-6 y hook de WU-9 |
| 12 | 8b, 11 | Consume `POST …/baja` y el DTO con campos de retiro |
| 12b | 12 | Solo si WU-12 se pasa |
| 13 | 8a | Runbook describe el detector y el rollback del tracker completo |

## Recordatorios operativos

- **`usarLockMasterTest()`**: todo spec nuevo o retargeteado que trunque `soporte_master_test`
  lo llama antes de su `describe` (e2e de movimientos, de stock y de equipos). Los specs de
  integración con base tenant **efímera** no lo necesitan.
- **Higiene de base efímera**: limpiar filas → `app.close()` → `dropDatabase`. Al revés, el DROP
  falla en silencio.
- **Suite completa del backend**: `pnpm test` tarda ~10-15 min. Correrla en cada WU de backend
  como puerta final; durante el desarrollo, solo los archivos afectados con `pnpm vitest run`.
- **Si la suite tira `PrismaClientKnownRequestError` masivo** en los `*.integration.spec.ts`, es
  la base caída (`P1001`) o una migración sin aplicar a `soporte_tenant_test`, no el código.
- **Después de tocar `schema.prisma`**: `pnpm prisma generate --schema prisma_tenant/schema.prisma`.
- **Conventional Commits, sin atribución de IA. No commitear desde esta fase de tasks**; apply
  commitea por WU.
- **Nunca hardcodear el nombre de la base de un tenant real**; consultar `clientes`.
- Ningún test toca un tenant real: usan bases efímeras o `soporte_tenant_test`.

---

## WU-1 — Bitácora con condición: migración, schema, catálogo, entidad, mapper, constraints

**Branch**: `feat/stock-usado-componentes-wu01` · **Base**: tracker
(`feat/stock-usado-componentes`)

- [ ] 1.1 Migración tenant `backend/prisma_tenant/migrations/<timestamp>_movimientos_insumo_condicion/migration.sql`: `ALTER TABLE "movimientos_insumo" ADD COLUMN "condicion" VARCHAR(10) NOT NULL DEFAULT 'NUEVO'` y `CONSTRAINT "movimientos_insumo_condicion_check" CHECK ("condicion" IN ('NUEVO','USADO'))`. El default **se conserva** (ADR-2). Timestamp posterior a la última migración tenant. (Req: Todo movimiento de stock lleva una condición)
- [ ] 1.2 `backend/prisma_tenant/schema.prisma`: campo `condicion String @default("NUEVO") @db.VarChar(10)` en `MovimientoInsumo`. Sin índice nuevo (ADR-2). Regenerar el cliente.
- [ ] 1.3 `tipo-movimiento-insumo.ts`: `CONDICIONES_STOCK = ['NUEVO','USADO'] as const`, `CondicionStock`, `CONDICION_STOCK_POR_DEFECTO = 'NUEVO'`. Sin `calcularSaldos` todavía (WU-2). Spec del catálogo actualizado.
- [ ] 1.4 `movimiento-insumo.entity.ts`: `MovimientoInsumoProps.condicion` siempre presente; `CrearMovimientoInsumoProps.condicion` **opcional**, `create()` aplica `CONDICION_STOCK_POR_DEFECTO`. Mapper (`movimiento-insumo.mapper.ts`) lee y escribe `condicion`. Specs de entidad y mapper. (Escenario: Movimiento sin condición explícita)
- [ ] 1.5 `movimientos-insumo-constraints.integration.spec.ts`: el CHECK real (`pg_get_constraintdef`) se compara contra `CONDICIONES_STOCK`; un INSERT con valor fuera del catálogo falla; un INSERT sin `condicion` queda `NUEVO`. Base tenant **efímera**. (Escenarios: Valor de condición inválido; Movimiento histórico tras la migración: filas previas quedan `NUEVO`)
- [ ] 1.6 Aplicar la migración a las bases locales: `cd backend && DATABASE_URL_TENANT=<url de soporte_tenant_test> pnpm migrate:tenant` y `pnpm migrate:tenants` (desarrollo local). Verificar con `\d movimientos_insumo` que la columna y el CHECK existen.
- [ ] 1.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/domain src/insumos/infrastructure/prisma/movimientos-insumo-constraints.integration.spec.ts` y `pnpm test`.

**Escenarios**: Movimiento histórico tras la migración; Movimiento sin condición explícita
(a nivel entidad); Valor de condición inválido (a nivel base); Migración aditiva (parte de
movimientos).
**PR boundary**: ~250 líneas, base tracker. Revert limpio: la columna tiene default y nadie la
lee salvo el mapper.
**Ayuda**: sin deuda (no cambia lo que el usuario ve).
Commit sugerido: `feat(insumos): condicion NUEVO/USADO en la bitacora de movimientos`.

## WU-2 — Saldo por condición: puerto, repositorio, `calcularSaldos`, llamadores sobre NUEVO

**Branch**: `feat/stock-usado-componentes-wu02` · **Base**: wu01

- [ ] 2.1 `tipo-movimiento-insumo.ts`: `SumasPorCondicionYTipo`, `SaldosInsumo` y `calcularSaldos(sumas)` que aplica `calcularStock` (sin cambios de firma) a cada condición recorriendo `CONDICIONES_STOCK` y suma el total en centésimas (`enCentesimas`), nunca en coma flotante (ADR-1). Spec: saldos independientes, condición vacía en 0, total en centésimas. (Req: El saldo se calcula por insumo y condición con una única fórmula)
- [ ] 2.2 Puerto `i-movimiento-insumo.repository.ts` y `prisma-movimiento-insumo.repository.ts`: `lockAndSumByTipo()` y `sumByTipo()` conservan el nombre y devuelven `SumasPorCondicionYTipo`; `sumarPorTipo()` agrupa por `['condicion','tipo']` y completa los 2x4 ceros desde los dos catálogos. Actualizar el JSDoc.
- [ ] 2.3 Helper de test `backend/src/insumos/testing/sumas-movimiento.ts` (`sumasEnCero()`, `sumasCon({ NUEVO: {...} })`); migrar los fakes de cada spec que implementa el puerto.
- [ ] 2.4 Llamadores existentes (entrada, salida, ajuste, consulta de stock): leer `calcularSaldos(sumas)` y decidir **sobre `NUEVO`** (única condición que se escribe hasta WU-3); conducta idéntica a la de hoy. Specs ajustados con el helper.
- [ ] 2.5 Integración del repositorio (base efímera): `sumarPorTipo` agrupa por condición con movimientos `NUEVO` y `USADO` insertados por SQL directo. Ajustar `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts` al nuevo tipo. (Escenarios: Saldos independientes por condición; Insumo sin movimientos USADO)
- [ ] 2.6 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos` y `pnpm test`.

**Escenarios**: Saldos independientes por condición; Insumo sin movimientos USADO.
**PR boundary**: ~380 líneas, base wu01. Riesgo por el ripple de fakes. Sin costura limpia
(el cambio de tipo del puerto rompe la compilación de los llamadores): si supera 400 reales,
`size:exception` con ese motivo.
**Ayuda**: sin deuda (sin cambio visible).
Commit sugerido: `refactor(insumos): saldo por condicion desde el repositorio de movimientos`.

## WU-3a — Aplicación de insumos: condición decidida en entrada, salida y ajuste; ADR-6; devolución

**Branch**: `feat/stock-usado-componentes-wu03a` · **Base**: wu02

- [ ] 3a.1 `CrearMovimientoInsumoProps.condicion` **obligatoria** en `create()`; cada llamador la pasa (entrada, salida, ajuste, recepción de compra). El compilador enumera los que falten.
- [ ] 3a.2 Error `CondicionUsadoNoAdmitidaError` (`CONDICION_USADO_NO_ADMITIDA`, 422) en `insumos.errors.ts`. `validarCondicionAdmitida(familias, insumo, condicion, opciones?)` en `validar-insumo.service.ts`: `NUEVO` ok **sin consultar**; `USADO` lee la familia y rechaza si no existe, tiene baja lógica o `esRepuesto = false`; la opción `{ admitirFamiliaNoVigente: true }` admite baja lógica o deshabilitada pero rechaza `esRepuesto = false` (ADR-6). Spec del servicio. (Req: La condición USADO solo es válida para insumos de familia repuesto)
- [ ] 3a.3 `registrar-entrada-insumo.use-case.ts`: DTO con `condicion?` (default `NUEVO`); llama `validarCondicionAdmitida` antes de la transacción; suma `Pick<IFamiliaInsumoRepository, 'findById'>`. Nuevo `registrarDevolucionDeComponente({ insumoId, equipoId, usuarioId, motivo })` que fija `cantidad: 1`, `condicion: 'USADO'`, exige `equipoId`, admite insumo deshabilitado y familia no vigente, rechaza insumo inexistente o con baja lógica y `esRepuesto = false` (tabla de guards de ADR-4). `execute()` sigue rechazando insumo deshabilitado con cualquier condición. (Req: ENTRADA y AJUSTE manuales pueden apuntar a USADO; exención del retiro)
- [ ] 3a.4 `registrar-salida-insumo.use-case.ts` y `registrar-ajuste-insumo.use-case.ts`: `condicion?` (default `NUEVO`), ADR-6 antes de la transacción, y la decisión de no negatividad sobre `calcularSaldos(sumas)[condicion]` bajo el `lockAndSumByTipo` existente. Mismo error de stock insuficiente. El ajuste **no** exige insumo habilitado (como hoy). (Req: Una salida o un ajuste negativo no deja negativo el saldo de su condición)
- [ ] 3a.5 `registrar-recepcion-de-item.use-case.ts` (compras): pasa `condicion: 'NUEVO'` explícito. Spec. (Req: La recepción de una compra siempre registra condición NUEVO)
- [ ] 3a.6 Módulo `insumos.module.ts`: provee `IFamiliaInsumoRepository` a los tres casos de uso. Specs de aplicación (con `sumas-movimiento.ts`): salida NUEVO 0 / USADO 5 rechaza; ajuste negativo USADO 2 con saldo 1 rechaza; salida USADO dentro del saldo; USADO en no repuesto da 422 sin consultar con `NUEVO`; entrada USADO sobre insumo deshabilitado rechazada; `registrarDevolucionDeComponente` admite deshabilitado y familia dada de baja o deshabilitada y rechaza `esRepuesto = false`.
- [ ] 3a.7 Concurrencia (molde `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`): dos SALIDA USADO de 1 con saldo USADO 1 ⇒ una sola persistida, saldo USADO final 0. (Escenario: Operaciones concurrentes sobre la misma condición)
- [ ] 3a.8 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application src/compras/application` y `pnpm test`.

**Escenarios**: Salida mayor que el saldo de su condición; Ajuste negativo mayor que el saldo de
su condición; Salida dentro del saldo de su condición; Operaciones concurrentes sobre la misma
condición; Entrada manual de usados; Entrada manual USADO de un insumo deshabilitado sigue
rechazada; Ajuste positivo de usados; USADO sobre un insumo no repuesto; USADO rechazado en
salida y ajuste; NUEVO sobre un insumo no repuesto; Recepción de compra; Retiro al stock de un
repuesto deshabilitado y con familia dada de baja (a nivel método de devolución).
**PR boundary**: ~300 líneas, base wu02. Si crece, dividir entrada+devolución / salida+ajuste.
**Ayuda**: sin deuda (el borde HTTP aún no expone la condición).
Commit sugerido: `feat(insumos): condicion decidida por saldo en entrada, salida y ajuste`.

## WU-3b — Consulta de stock con saldos, `admiteUsado` y reposición sobre NUEVO

**Branch**: `feat/stock-usado-componentes-wu03b` · **Base**: wu03a

- [ ] 3b.1 `consultar-stock-insumo.use-case.ts`: devuelve `{ saldos: { NUEVO, USADO }, stock (total), admiteUsado }`; `admiteUsado` sale de la familia (`esRepuesto`); el estado de reposición se calcula sobre `saldos.NUEVO`. Spec (fakes con `sumasCon`). (Req: El estado de reposición se calcula solo sobre el saldo NUEVO)
- [ ] 3b.2 Specs: `stockMinimo` 5, NUEVO 2 y USADO 10 ⇒ reposición necesaria; NUEVO 8 y USADO 0 ⇒ suficiente; insumo sin movimientos USADO ⇒ USADO 0 y total igual a NUEVO.
- [ ] 3b.3 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application` y `pnpm test`.

**Escenarios**: Usados no ocultan la falta de nuevos; Nuevos suficientes; Consulta de stock
(caso de uso); Insumo sin movimientos USADO.
**PR boundary**: ~130 líneas, base wu03a.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): consulta de stock con saldos por condicion y reposicion sobre nuevos`.

## WU-4 — Borde HTTP de insumos: DTOs, controller, respuestas y e2e

**Branch**: `feat/stock-usado-componentes-wu04` · **Base**: wu03b

- [ ] 4.1 `movimientos-insumo.dto.ts`: `RegistrarMovimientoInsumoHttpDto` con `@IsOptional() @IsIn(CONDICIONES_STOCK) condicion?` (lo hereda el DTO del ajuste); un valor fuera del catálogo da 400. `MovimientoInsumoResponseDto` suma `condicion`. Exportar `transformarMotivo` (lo usa WU-8a). Recepción de compra: el DTO **no** declara `condicion` y el `ValidationPipe` global la descarta (ADR-7). (Req: Todo movimiento lleva una condición; La recepción siempre registra NUEVO)
- [ ] 4.2 `movimientos-insumo.controller.ts`: pasa `condicion` a entrada, salida y ajuste. `insumos.controller.ts`: mapeo explícito de `CondicionUsadoNoAdmitidaError` a 422; `StockInsumoResponseDto` conserva `stock` como total y suma `saldos: { NUEVO, USADO }` y `admiteUsado`.
- [ ] 4.3 Specs de borde: `movimientos-insumo.dto.spec.ts` (condición inválida da 400; omitida válida; `condicion` sobrante en recepción se descarta con `whitelist`), specs de controller.
- [ ] 4.4 E2E (`usarLockMasterTest()` si trunca `soporte_master_test`): entrada USADO en repuesto ⇒ saldo USADO sube; USADO en no repuesto ⇒ 422 en entrada, salida y ajuste; salida NUEVO con saldo NUEVO 0 y USADO 5 ⇒ stock insuficiente; `GET stock` devuelve NUEVO, USADO y total; listado de movimientos informa `condicion`; recepción con `condicion: 'USADO'` en el body queda `NUEVO`.
- [ ] 4.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/interface` y `pnpm test`.

**Escenarios**: Valor de condición inválido; Consulta de stock; Listado de movimientos; El flujo
de recepción no acepta condición; USADO sobre un insumo no repuesto (422 en HTTP); Entrada
manual de usados; Ajuste positivo de usados.
**PR boundary**: ~300 líneas, base wu03b.
**Ayuda**: sin deuda todavía (la interfaz cambia en WU-9/10; el contrato HTTP lo consume esa
unidad).
Commit sugerido: `feat(insumos): condicion en el contrato HTTP de movimientos y stock`.

## WU-5 — Esquema de componentes: migración, schema, entidad, mapper, constraints, reactivar

**Branch**: `feat/stock-usado-componentes-wu05` · **Base**: wu04

- [ ] 5.1 Migración tenant `backend/prisma_tenant/migrations/<timestamp>_componentes_equipo_retiro/migration.sql` (ADR-2): columnas nullable `instalacion_movimiento_id UUID`, `baja_destino VARCHAR(20)`, `baja_motivo TEXT`, `baja_movimiento_id UUID`, `baja_usuario_id UUID`; FK de las dos `*_movimiento_id` a `movimientos_insumo(id)` con `ON DELETE RESTRICT`; `UNIQUE` en cada una; CHECK `componentes_equipo_baja_destino_check` y `componentes_equipo_baja_coherente_check` con el SQL del diseño. Ninguna fila existente se modifica. (Req: El componente conserva el registro de su retiro; Migración aditiva)
- [ ] 5.2 `schema.prisma`: campos nuevos y relaciones en `ComponenteEquipo`; regenerar el cliente.
- [ ] 5.3 `componente-equipo.entity.ts`: `DESTINOS_RETIRO_COMPONENTE`, `DestinoRetiroComponente`; props `instalacionMovimientoId`, `bajaDestino`, `bajaMotivo`, `bajaMovimientoId`, `bajaUsuarioId`; `vincularInstalacion(movimientoId)`; `validarRetiro(destino, motivo)` (motivo normalizado, requerido en `DESCARTE` y en `STOCK_USADO` sin SALIDA vinculada, máximo 500); `retirar({ destino, motivo, usuarioId, bajaMovimientoId })`; `bajaSinSalidaPrevia` **derivada** (`bajaDestino === 'STOCK_USADO' && instalacionMovimientoId === null`), no guardada; `reactivar()` limpia `deletedAt` **y** las cuatro columnas de retiro (ADR-5). Errores `MotivoRetiroRequeridoError` y `ComponenteDevueltoAlStockError` en `equipos.errors.ts` (catálogo de 13 a 15 clases; actualizar su spec).
- [ ] 5.4 Mapper y repositorio: leen y escriben las columnas; `IComponenteEquipoRepository.retirar(componente): Promise<boolean>` (`updateMany` con `WHERE id = ? AND deleted_at IS NULL`, `true` si tocó la fila) y se **elimina** `delete` del puerto y del repo Prisma. Su único llamador de producción es `EliminarComponenteUseCase`, que se borra en WU-8b: hasta entonces mantener `delete` para conservar el build en verde y **retirarlo en WU-8b**. Ajustar `prisma-equipos.integration.spec.ts:363` (fixture de componente dado de baja: `retirar` con `DESCARTE`) en WU-8b junto al borrado de `delete`.
- [ ] 5.5 `reactivar-componente.use-case.ts`: rechaza con `ComponenteDevueltoAlStockError` (`COMPONENTE_DEVUELTO_AL_STOCK`, 422) cuando `bajaDestino === 'STOCK_USADO'`; en `DESCARTE` y en legados reactiva y limpia. Mapear el error a 422 en `equipos.controller.ts`. Specs de entidad, mapper y caso de uso. (Req: Reactivar un componente depende del destino de su retiro)
- [ ] 5.6 Spec de constraints de integración (base efímera reproducida hasta la migración anterior): CHECK de destino contra `DESTINOS_RETIRO_COMPONENTE` con `pg_get_constraintdef`; las tres ramas del CHECK coherente (todo NULL; `DESCARTE` con motivo y usuario y sin movimiento; `STOCK_USADO` con movimiento y usuario); un activo con destino es rechazado; los `UNIQUE` y las FK. (Escenarios: Retiro legado; Migración aditiva)
- [ ] 5.7 Aplicar la migración a las bases locales: `cd backend && DATABASE_URL_TENANT=<url de soporte_tenant_test> pnpm migrate:tenant` y `pnpm migrate:tenants` (desarrollo local). Verificar con `\d componentes_equipo`.
- [ ] 5.8 Verificación adversarial local (no se commitea): quitar `deleted_at IS NOT NULL` del CHECK coherente debe dejar la rama correspondiente del spec en rojo.
- [ ] 5.9 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos` y `pnpm test`.

**Escenarios**: Registro de una devolución y de un descarte (a nivel entidad y base); Retiro
legado; Migración aditiva; Reactivar tras devolver al stock; Reactivar tras descartar; Reactivar
un retiro legado.
**PR boundary**: ~350 líneas, base wu04. Migración, entidad y sus specs no se separan; si crece,
separar reactivar (5.5) con su spec.
**Ayuda**: sin deuda visible todavía (el retiro llega en WU-8a).
Commit sugerido: `feat(equipos): registro de retiro en componentes y reactivar condicionado`.

## WU-6 — Instalación con condición y vínculo a la SALIDA

**Branch**: `feat/stock-usado-componentes-wu06` · **Base**: wu05

- [ ] 6.1 `equipos.dto.ts`: `CreateComponenteHttpDto` con `@IsOptional() @IsIn(CONDICIONES_STOCK) condicion?`. `ComponenteResponseDto` y `ComponenteConTipoResponseDto` suman `bajaDestino`, `bajaMotivo`, `bajaMovimientoId`, `bajaUsuarioId` y `bajaSinSalidaPrevia` (ADR-7). (Req: El componente conserva el registro de su retiro)
- [ ] 6.2 `equipos.controller.ts`: con `descontarStock` verdadero pasa `condicion` al caso de uso; con `false` **no la pasa** (se ignora, ADR-7).
- [ ] 6.3 `instalar-componente-desde-deposito.use-case.ts`: `condicion?` (default `NUEVO`) a la SALIDA; tras el `execute` de la salida, `componente.vincularInstalacion(salida.id)` y `componenteRepo.save(componente)` dentro de la misma transacción (suma `Pick<IComponenteEquipoRepository, 'save'>`). Módulo `equipos.module.ts` alineado. (Req: Un solo flujo de alta con descuento de stock opcional)
- [ ] 6.4 Specs: descuento por defecto ⇒ SALIDA `NUEVO`; condición `USADO` ⇒ SALIDA `USADO`; saldo de la condición insuficiente ⇒ rechazo sin componente ni movimiento; vínculo `instalacionMovimientoId` seteado; `descontarStock: false` con `condicion` ⇒ ignorada y sin movimiento; DTO (`condicion` inválida da 400); controller.
- [ ] 6.5 Concurrencia de instalación (molde existente): dos altas concurrentes sobre saldo USADO 1 ⇒ una sola.
- [ ] 6.6 E2E (`usarLockMasterTest()`): alta con `condicion: 'USADO'` con saldo USADO ⇒ componente y SALIDA USADO; alta sin condición con saldo NUEVO 0 y USADO 5 ⇒ rechazo y nada escrito; alta con `descontarStock: false` no cambia saldos; el componente instalado con descuento informa `bajaSinSalidaPrevia = false` tras retirarse (comprobado en WU-7).
- [ ] 6.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos` y `pnpm test`.

**Escenarios**: Descuento por defecto; Descuento del saldo USADO; Stock insuficiente en la
condición elegida; Falla la SALIDA y se revierte el alta; Alta sin descuento.
**PR boundary**: ~300 líneas, base wu05.
**Ayuda**: sin deuda visible en backend (el selector llega en WU-11).
Commit sugerido: `feat(equipos): instalacion con condicion y vinculo a la salida del deposito`.

## WU-7 — Retiro, aplicación: `RetirarComponenteUseCase`, repo `retirar`, integración atómica y concurrente

**Branch**: `feat/stock-usado-componentes-wu07` · **Base**: wu06

- [ ] 7.1 `retirar-componente.use-case.ts` (`txRunner`, `Pick<IComponenteEquipoRepository, 'findById' | 'retirar'>`, `Pick<RegistrarEntradaInsumoUseCase, 'registrarDevolucionDeComponente'>`), ADR-4: fuera de la transacción, componente existe y pertenece al equipo (`ComponenteNoEncontradoError`, 404), activo (`ComponenteDadoDeBajaError`, 422), `validarRetiro` (`MotivoRetiroRequeridoError`, 422). Dentro de `txRunner.run()`: con `STOCK_USADO`, `registrarDevolucionDeComponente` con el motivo normalizado; luego `componente.retirar(...)` y `componenteRepo.retirar(componente)`. Si la ENTRADA falla o la marca toca 0 filas, `FalloRetiroDeComponente` (clase interna, patrón `FalloSalidaDeStock`) revierte y se desenvuelve a `Result.fail`; otra excepción propaga. `DESCARTE` no toca stock. (Req: El retiro de un componente tiene dos desenlaces)
- [ ] 7.2 `PrismaComponenteEquipoRepository.retirar` implementa la marca condicional (ADR-4). Registrar el caso de uso y sus dependencias en `equipos.module.ts` (importa la entrada de insumos; `registrarDevolucionDeComponente` no se expone por HTTP).
- [ ] 7.3 Spec de aplicación: orden ENTRADA → marca; marca en 0 filas ⇒ rollback (no queda movimiento); destino `DESCARTE` sin motivo, con motivo vacío o solo con espacios y con más de 500 ⇒ rechazo; destino `STOCK_USADO` de un componente sin SALIDA vinculada sin motivo ⇒ rechazo, con motivo ⇒ completa con `bajaSinSalidaPrevia = true`; con SALIDA vinculada sin motivo ⇒ completa y `bajaSinSalidaPrevia = false`; componente ya retirado ⇒ rechazo sin movimiento; insumo deshabilitado y familia no vigente ⇒ completa; `esRepuesto = false` ⇒ rechazo. (Escenarios: ver abajo)
- [ ] 7.4 Integración atómica en base real (efímera): retiro `STOCK_USADO` deja ENTRADA USADO con `equipoId` y saldo USADO 1 sin cambiar NUEVO, y `baja_movimiento_id` apunta a ella; `DESCARTE` no crea movimiento; fallo de la ENTRADA deja el componente activo y sin registro.
- [ ] 7.5 Concurrencia: dos retiros del mismo componente ⇒ **una** ENTRADA y un rechazo (molde `prisma-movimiento-insumo.repository.concurrencia.integration.spec.ts`).
- [ ] 7.6 Verificación adversarial local (no se commitea): quitar `deleted_at IS NULL` de `retirar` debe dejar el spec de concurrencia en rojo.
- [ ] 7.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos` y `pnpm test`.

**Escenarios**: Devolver al stock como usado; Retiro al stock de un repuesto deshabilitado;
Retiro al stock con familia dada de baja; Descartar por rotura; Descarte sin motivo; Motivo
demasiado largo; Falla la ENTRADA y se revierte el retiro; Componente ya retirado; Devolver una
pieza que vino con el equipo (con y sin motivo); Devolver una pieza instalada antes de este
cambio; Pieza instalada con descuento; Registro de una devolución y de un descarte.
**PR boundary**: ~350 líneas, base wu06. Caso de uso, repo e integración viajan juntos.
**Ayuda**: sin deuda visible todavía (sin endpoint).
Commit sugerido: `feat(equipos): retiro de componente con dos desenlaces, caso de uso atomico`.

## WU-8a — Retiro, borde: `POST …/baja`, e2e y corrección de Ayuda

**Branch**: `feat/stock-usado-componentes-wu08a` · **Base**: wu07

- [ ] 8a.1 `equipos.dto.ts`: `RetirarComponenteHttpDto { destino: IsIn(DESTINOS_RETIRO_COMPONENTE); motivo?: IsString + Transform(transformarMotivo) + MaxLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH) }`. Destino ausente o inválido da 400. (Req: dos desenlaces que elige el usuario)
- [ ] 8a.2 `equipos.controller.ts`: `POST :id/componentes/:componenteId/baja` con `@RequiereAcciones('EQUIPOS:BORRADO')` y `@CurrentUser()`, `200` con `ComponenteResponseDto`; mapea `MotivoRetiroRequeridoError` y `ComponenteDadoDeBajaError` a 422 y `ComponenteNoEncontradoError` a 404. El `DELETE` **sigue** hasta WU-8b (esta unidad no borra). `equipos.module.ts` registra la ruta.
- [ ] 8a.3 Specs de DTO y controller (destino inválido 400; sin motivo en `DESCARTE` 422; permiso).
- [ ] 8a.4 E2E (`usarLockMasterTest()`): retiro `STOCK_USADO` con `EQUIPOS:BORRADO` y **sin** permisos de insumos ⇒ completa y saldo USADO +1; retiro sin `EQUIPOS:BORRADO` (con permisos de insumos) ⇒ 403 y nada cambia; `DESCARTE` con motivo ⇒ sin movimiento; sin destino o destino inválido ⇒ 400; componente ya retirado ⇒ 422 sin movimiento; reactivar tras `STOCK_USADO` ⇒ 422; reactivar tras `DESCARTE` y de un retiro legado ⇒ activo con saldo sin cambios. (Escenarios: Usuario sin permiso de borrado; Usuario con borrado y sin permisos de insumos; Reactivar…)
- [ ] 8a.5 **Ayuda (ADR-9)**: corregir `backend/ayuda/permisos-y-roles.md:150-154` (hoy "Sin esa casilla la persona no puede registrar ningún movimiento") nombrando las tres excepciones: instalar con `EQUIPOS:ALTAS`, retirar al stock con `EQUIPOS:BORRADO` y recibir una compra con permisos de compras. No tocar `compras-insumos-stock.md` (sigue siendo verdadero). Es la única edición de Ayuda del ciclo, por corregir una afirmación que el cambio vuelve falsa.
- [ ] 8a.6 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos/interface` y `pnpm test`.

**Escenarios**: Usuario sin permiso de borrado; Usuario con borrado y sin permisos de insumos;
Retiro sin destino o con destino inválido; Componente ya retirado; Reactivar tras devolver al
stock / tras descartar / un retiro legado.
**PR boundary**: ~250 líneas, base wu07.
**Ayuda**: corrección de `permisos-y-roles.md` incluida (8a.5).
Commit sugerido: `feat(equipos): endpoint de retiro con destino y correccion de ayuda de permisos`.

## WU-8b — Borrado del `DELETE` y de `EliminarComponenteUseCase`

**Branch**: `feat/stock-usado-componentes-wu08b` · **Base**: wu08a

- [ ] 8b.1 Borrar la ruta `DELETE :id/componentes/:componenteId` del controller, `eliminar-componente.use-case.ts` y su spec, su provider en `equipos.module.ts` y sus referencias en specs de controller.
- [ ] 8b.2 Quitar `delete` de `IComponenteEquipoRepository` y de `PrismaComponenteEquipoRepository` (su único llamador de producción era el caso de uso borrado; `eliminar-equipo.use-case.ts` usa `equipoRepo.delete`, otro puerto). Ajustar `prisma-equipos.integration.spec.ts:363`: el fixture del componente dado de baja pasa a `componenteRepo.retirar` con destino `DESCARTE`.
- [ ] 8b.3 E2E: `DELETE :id/componentes/:componenteId` ⇒ 404.
- [ ] 8b.4 Verificar sin referencias: `rg "EliminarComponenteUseCase|componenteRepo.delete" backend/src`.
- [ ] 8b.5 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/equipos` y `pnpm test`.

**Escenarios**: Retiro sin destino (el borrado sin destino deja de existir).
**PR boundary**: ~150 líneas, borrado puro, base wu08a. Los borrados cuentan; ~2x real posible,
pero sin costura interna útil: el fixture de integración y el borrado del puerto van juntos.
**Ayuda**: sin deuda adicional.
Commit sugerido: `refactor(equipos): retirar el DELETE de componentes reemplazado por el retiro con destino`.

## WU-9 — Frontend insumos: tipos, ficha con dos saldos y columna condición

**Branch**: `feat/stock-usado-componentes-wu09` · **Base**: wu08b

- [ ] 9.1 `frontend/src/features/insumos/types.ts` y `schemas.ts`: `StockInsumo` con `saldos: { NUEVO; USADO }` y `admiteUsado`; `MovimientoInsumo` con `condicion`; `CONDICIONES_STOCK` espejo del backend (la autoridad es el DTO del backend, regla derivada).
- [ ] 9.2 `hooks/use-stock-insumo.ts` sin cambios de contrato salvo tipos; `insumo-detail-view.tsx`: muestra saldo NUEVO, saldo USADO (solo si `admiteUsado` o mayor que 0) y el total; el estado de reposición se muestra sobre NUEVO; la tabla de movimientos gana la columna "Condición". (Req: La consulta de stock devuelve ambos saldos y el listado muestra la condición)
- [ ] 9.3 Tests (MSW + `renderWithProviders`): ficha con NUEVO 4 y USADO 2 muestra ambos y total 6; ficha sin USADO; cada movimiento muestra su condición; reposición sobre NUEVO con USADO alto.
- [ ] 9.4 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm test`.

**Escenarios**: Ficha del insumo; Consulta de stock; Listado de movimientos; Usados no ocultan la
falta de nuevos (presentación).
**PR boundary**: ~250 líneas, base wu08b.
**Ayuda**: deuda anotada en commit y PR (ver nota de cabecera).
Commit sugerido: `feat(insumos): ficha con saldos nuevo y usado y condicion de cada movimiento`
+ cuerpo con la línea "Ayuda pendiente: …".

## WU-10 — Frontend insumos: selector de condición en los diálogos de movimiento

**Branch**: `feat/stock-usado-componentes-wu10` · **Base**: wu09

- [ ] 10.1 Componente de selector reutilizable de condición (`NUEVO` preseleccionado; visible solo si `admiteUsado`; si exactamente un saldo es mayor que cero se fija en ese saldo y se deshabilita; si la consulta de stock no está disponible, habilitado, sin saldos y en NUEVO, ADR-7 selector a1) con su test.
- [ ] 10.2 `movimiento-*-dialog.tsx` (entrada, salida, ajuste): usan el selector y envían `condicion` en el payload; el diálogo de recepción de compra **no** lo muestra. Invalidan `["insumo", insumoId, "stock"]` y `["insumo", insumoId, "movimientos"]`. Schemas Zod con `condicion` opcional.
- [ ] 10.3 Tests por diálogo: selector oculto sin `admiteUsado`; fijo con un solo saldo; payload con `condicion: 'USADO'`; salida NUEVO con stock insuficiente en la condición muestra el error del backend.
- [ ] 10.4 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm test`.

**Escenarios**: Entrada manual de usados; Ajuste positivo de usados; Salida dentro del saldo de
su condición (interfaz); Selector fijo con un solo saldo (a1).
**PR boundary**: ~330 líneas, base wu09. Si crece, un diálogo por PR (entrada / salida+ajuste),
con su test.
**Ayuda**: deuda anotada en commit y PR.
Commit sugerido: `feat(insumos): selector de condicion en entrada, salida y ajuste de stock`.

## WU-11 — Frontend equipos: selector de condición en el alta

**Branch**: `feat/stock-usado-componentes-wu11` · **Base**: wu10

- [ ] 11.1 `frontend/src/features/equipos/schemas.ts` y `types.ts`: `condicion` opcional en el alta; `Componente` con `bajaDestino`, `bajaMotivo`, `bajaMovimientoId`, `bajaUsuarioId`, `bajaSinSalidaPrevia` (contrato de WU-6).
- [ ] 11.2 `componente-create-dialog.tsx`: con "Descontar del depósito" marcado muestra el selector de condición con los saldos del insumo elegido (reutiliza el de WU-10); el payload incluye `condicion` **solo** con descuento; con la casilla desmarcada no se envía. Sin `INSUMOS:LECTURA` el selector queda habilitado, en NUEVO y sin saldos. `useAgregarComponente` sigue invalidando stock y movimientos.
- [ ] 11.3 Tests: NUEVO preseleccionado y USADO elegible con ambos saldos; fijo con un solo saldo; payload con `condicion` solo con descuento; desmarcar la casilla tras elegir USADO no envía `condicion`.
- [ ] 11.4 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm test`.

**Escenarios**: Selector de saldo en el alta; Un solo saldo disponible; Descuento del saldo USADO
(interfaz); Alta sin descuento.
**PR boundary**: ~250 líneas, base wu10.
**Ayuda**: deuda anotada en commit y PR.
Commit sugerido: `feat(equipos): selector de condicion del saldo en el alta de componentes`.

## WU-12 — Frontend equipos: diálogo de retiro, `useRetirarComponente`, rótulos, reactivar condicionado

**Branch**: `feat/stock-usado-componentes-wu12` · **Base**: wu11

- [ ] 12.1 `hooks/use-equipo-mutations.ts`: `useRetirarComponente` (`POST /equipos/:id/componentes/:cid/baja`) reemplaza a `useEliminarComponente` (se borra); invalida `["equipo", id]`, `["insumo", insumoId, "stock"]` y `["insumo", insumoId, "movimientos"]`.
- [ ] 12.2 `componente-retiro-dialog.tsx` (nuevo): los dos desenlaces "devolver al stock como usado" y "descartar por rotura"; el motivo se exige solo para el descarte (Zod con máximo 500; la autoridad es el backend, que además lo exige para `STOCK_USADO` sin SALIDA vinculada y devuelve 422 que el diálogo muestra). Test: descarte sin motivo bloquea el envío; devolución sin motivo permitida; al confirmar la lista y los saldos se actualizan. (Escenario: Diálogo de retiro)
- [ ] 12.3 `equipo-componentes-section.tsx`: el `<Can permiso="EQUIPOS:BORRADO">` (`:138`) envuelve la acción que abre el diálogo de retiro (la papelera ya no borra directo).
- [ ] 12.4 Rótulos de fila con `deletedAt`: `STOCK_USADO` ⇒ "Devuelto al stock", `DESCARTE` ⇒ "Descartado", `null` ⇒ "Dado de baja" actual; con `bajaSinSalidaPrevia` se agrega "sin salida registrada del depósito". El botón Reactivar se renderiza solo si `bajaDestino !== 'STOCK_USADO'`, además del `<Can permiso="EQUIPOS:MODIFICACION">` (`:154`). Tests en `equipo-componentes-section.test.tsx` con fixtures de los tres destinos más legado. (Escenario: Interfaz de reactivar)
- [ ] 12.5 Borrar el uso y el test del hook viejo; verificar sin referencias: `rg "useEliminarComponente" frontend/src`.
- [ ] 12.6 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm test`.

**Escenarios**: Diálogo de retiro; Interfaz de reactivar; Devolver una pieza que vino con el
equipo (marca visible); Registro de una devolución y de un descarte (presentación).
**PR boundary**: ~400 líneas, base wu11. Riesgo: si se pasa, **sale 12.4** a WU-12b (rótulos y
reactivar condicionado) con sus tests, y WU-12 conserva 12.1-12.3 y 12.5.
**Ayuda**: deuda anotada en commit y PR.
Commit sugerido: `feat(equipos): dialogo de retiro con dos desenlaces en la seccion de componentes`.

## WU-12b — (solo si WU-12 se pasa) Rótulos de destino y reactivar condicionado

**Branch**: `feat/stock-usado-componentes-wu12b` · **Base**: wu12

- [ ] 12b.1 Mover aquí la tarea 12.4 completa (rótulos, marca "sin salida registrada del depósito", Reactivar oculto tras `STOCK_USADO`) y sus tests con fixtures de los tres destinos más legado.
- [ ] 12b.2 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm test`.

**PR boundary**: ~150 líneas, base wu12. Si WU-12 entra en presupuesto, esta unidad no existe.
**Ayuda**: deuda anotada en commit y PR.
Commit sugerido: `feat(equipos): rotulos de destino del retiro y reactivar condicionado`.

## WU-13 — Runbook: rollback del tracker y detector

**Branch**: `feat/stock-usado-componentes-wu13` · **Base**: wu12 (o wu12b si existe)

- [ ] 13.1 `DEPLOY-VPS-runbook.md`: sección "Rollback del tracker `stock-usado-componentes`" (ADR-8) con el detector de solo lectura por tenant (`movimientos_usado` y `retiros_con_destino`), la interpretación de los tres casos (los dos en 0 ⇒ `git reset --hard` al commit de rollback y las migraciones quedan; `movimientos_usado` > 0 ⇒ el binario viejo suma los usados al saldo único; `retiros_con_destino` > 0 ⇒ el binario viejo no puede reactivar componentes con destino, 500 por el CHECK coherente) y la preferencia por corregir hacia adelante o restaurar el dump de `predeploy-dump.ps1`.
- [ ] 13.2 Documentar la verificación post-deploy (`\d movimientos_insumo`, `\d componentes_equipo`, ficha de un repuesto con NUEVO = stock previo y USADO = 0) y la recuperación de una migración fallida (P3009, `prisma migrate resolve --rolled-back` y reintentar `deploy.ps1`, ya documentada).
- [ ] 13.3 No se agrega ningún `.ps1` ni se modifica `deploy.ps1` (no toca la tabla §2.2 de `~/proyectos/CLAUDE.md`).
- [ ] 13.4 Quality gates (backend, solo por el `.md`): `cd backend && pnpm lint && pnpm typecheck` (sin cambios de código; confirman que el árbol sigue en verde).

**PR boundary**: ~80 líneas, base wu12. Sin código ejecutable.
**Ayuda**: sin deuda.
Commit sugerido: `docs(deploy): rollback del tracker stock-usado-componentes y detector de usados`.

---

## Secuencia operativa (no son tareas de apply)

> Estos pasos **no son checkboxes**: no se marcan durante `sdd-apply`, no bloquean
> `sdd-verify` y se ejecutan **después** de integrar el tracker a `main`, en la ventana de
> deploy acordada con el dueño. Se ejecutan en el VPS Windows (`~/proyectos/CLAUDE.md` §2.2).

1. **Antes de la ventana.** Tracker verificado (`sdd-verify` en verde) e integrado a `main` en
   un único release. Confirmar que el árbol de `main` incluye las dos migraciones tenant.
2. **Dump previo.** `soporte/predeploy-dump.ps1 -DryRun` y luego la corrida real: dump verificado
   de master y de cada tenant, servicios detenidos. El dump es la única vuelta atrás fiel una vez
   que exista un USADO (ADR-8).
3. **Deploy.** `soporte/deploy.ps1`: pull de `main`, builds, `migrate:tenants` aplica
   `movimientos_insumo_condicion` y `componentes_equipo_retiro` en cada tenant del registro,
   arranque. Backend y frontend van en la misma corrida. Si una migración falla en un tenant
   (P3009): `prisma migrate resolve --rolled-back <migración>` con la `DATABASE_URL_TENANT` de ese
   tenant y volver a correr `deploy.ps1`.
4. **Verificación posterior, solo lectura**, por tenant (consultar `clientes` para el registro,
   sin hardcodear nombres de base):
   - `\d movimientos_insumo` y `\d componentes_equipo` muestran las columnas y los CHECK nuevos.
   - El detector de ADR-8 devuelve `movimientos_usado = 0` y `retiros_con_destino = 0` justo tras
     el deploy:
     `SELECT (SELECT count(*) FROM movimientos_insumo WHERE condicion = 'USADO') AS movimientos_usado, (SELECT count(*) FROM componentes_equipo WHERE baja_destino IS NOT NULL) AS retiros_con_destino;`
   - La ficha de un repuesto muestra NUEVO = stock previo y USADO = 0.
5. **Rollback por estado (ADR-8), decidido con el detector:**
   - Los dos conteos en 0 en todos los tenants: `git reset --hard` al commit de rollback. Las
     migraciones quedan: el binario viejo no lee las columnas nuevas e inserta con el default.
   - `movimientos_usado` > 0: el binario viejo suma los usados al saldo único y puede
     consumirlos como nuevos; el alcance del error es ese número.
   - `retiros_con_destino` > 0: el binario viejo no puede reactivar componentes con destino
     (500 por `componentes_equipo_baja_coherente_check`); deseable en `STOCK_USADO`, pérdida de
     función acotada en `DESCARTE`.
   - Con cualquiera de los dos > 0: preferir corregir hacia adelante; si el revert es
     inevitable, restaurar el dump de `predeploy-dump.ps1` (se pierde lo escrito después del
     deploy).
6. **Cierre.** `sdd-archive` sincroniza `stock-insumo-condicion` y el delta de
   `componentes-catalogo-unico` a `openspec/specs/`. La Ayuda pendiente (ver cabecera) queda
   registrada para la tanda final.
