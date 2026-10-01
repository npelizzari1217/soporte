# Apply progress: baja-equipo-completo

## WU-1 — Migración, schema, entidad, mapper y errores

Partido en tres ramas por la política de 400 líneas (el total pasaba de 800):

| Parte | Rama | Contenido | Tareas |
|---|---|---|---|
| 1 | `feat/baja-equipo-completo-wu01` | Entidad, su spec y los tres specs que usaban `deactivate()` | 1.4, 1.5, 1.8 |
| 2 | `feat/baja-equipo-completo-wu01-2` | Migración, schema, mapper y constraints | 1.1 a 1.3, 1.7, 1.9 |
| 3 | `feat/baja-equipo-completo-wu01-3` | Los cinco errores y la tabla de `toHttpException` | 1.6, 1.10 |

Parte 1: `deactivate()` y `activate()` se eliminan; el spec de integración de `prisma-equipos` pasa a
`darDeBaja()` (WU-2 lo reescribe por completo).

Parte 2: migración `20261001120000_equipos_informaticos_baja` aplicada en `soporte_tenant_test` y en
los tenants de desarrollo (`pnpm migrate:tenants`, 2 migradas); `prisma migrate status` en "up to
date". Los cinco errores salen con la forma `{ componenteId, insumoId, causa }` del diseño.

## WU-2 — Repositorio de equipos: LE, `registrarBaja` y `save()` sin `activo`

Una sola rama, `feat/baja-equipo-completo-wu02` (base wu01-3). Tareas 2.1 a 2.8 completas.

- Puerto: `bloquearParaModificar`, `bloquearParaOperarPiezas`, `registrarBaja` con contrato en JSDoc.
- Repo: ambos locks con `exigirTransaccionActiva` + `SELECT id ... FOR NO KEY UPDATE | FOR SHARE` y
  `findById` por el mapper (devuelve la entidad aun con `deletedAt`); `save()` ya no escribe `activo`
  ni `baja_*` en el UPDATE; `registrarBaja` es un CAS `updateMany`.
- Specs: `prisma-equipos.integration.spec.ts` (4 casos nuevos: ediciones viejas, escritura de los
  cinco campos, segunda baja, borrado lógico) y `prisma-equipo-informatico.locks.integration.spec.ts`
  (contrato y 5 sondas de compatibilidad con `lock_timeout` y `55P03`).
- 2.7: ningún fake implementa el puerto completo (solo `Pick<..., 'findById'>`), no hubo que tocar fakes.


## WU-3 — BUGFIX: el borrado respeta las piezas activas (STRICT TDD)

Una sola rama, `feat/baja-equipo-completo-wu03` (base wu02).

### RED (tareas 3.1 a 3.4) — corrido contra `eliminar-equipo.use-case.ts` SIN tocar

El use case actual lee con `findById` y llama `delete` sin mirar piezas ni baja. Los specs se
armaron para que el código viejo **corra** (el fake del unit lleva un `findById` temporal, que el
REFACTOR retira), de modo que el fallo sea de comportamiento y no de símbolo o de fixture.

| Comando | Resultado RED observado |
|---|---|
| `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.use-case.spec.ts` | 3 failed / 3 passed. Fallan: "con un componente activo falla con EquipoConComponentesActivosError" (`expected false to be true` en `isFail()`: devolvió ok), "con un equipo dado de baja falla con EquipoDadoDeBajaError" (idem), "el chequeo corre dentro de txRunner.run()" (`txRunner.run` llamado 0 veces). Pasan los 3 de regresión (borra sin piezas, inexistente, con `deletedAt`) |
| `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.integration.spec.ts` | 2 failed / 1 passed. Fallan: equipo con componente + unidad `INSTALADA` (`isFail()` false: se borró) y equipo dado de baja (`isFail()` false). Pasa el borrado sin piezas activas |
| `pnpm vitest run src/equipos/interface/controllers/eliminar-equipo.e2e.spec.ts` | 2 failed / 2 passed. Fallan: pieza activa y equipo dado de baja (`expected 204 to be 422`). Pasan: sin piezas 204 + ficha 404 y sin `EQUIPOS:BORRADO` 403 |

3.4 confirmado: los siete fallos son por el comportamiento (hoy borra y devuelve éxito), no por
compilación ni fixture.

### TDD Cycle Evidence

| Tarea | Test | Comando | RED observado | GREEN observado | REFACTOR |
|---|---|---|---|---|---|
| 3.1 | `eliminar-equipo.use-case.spec.ts` (6 casos) | `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.use-case.spec.ts` | 3 failed / 3 passed: pieza activa y equipo dado de baja devolvían ok; `txRunner.run` 0 llamadas | 6 passed | Se retiró el `findById` temporal del fake; `txRunner` tipado como `ITenantTransactionRunner` sin casts (el ratchet baja de 666/121 a 664/120) |
| 3.2 | `eliminar-equipo.integration.spec.ts` (3 casos) | `pnpm vitest run src/equipos/application/use-cases/eliminar-equipo.integration.spec.ts` | 2 failed / 1 passed: con componente + unidad `INSTALADA` y con equipo dado de baja el equipo se borraba | 3 passed | — |
| 3.3 | `eliminar-equipo.e2e.spec.ts` (4 casos) | `pnpm vitest run src/equipos/interface/controllers/eliminar-equipo.e2e.spec.ts` | 2 failed / 2 passed: `expected 204 to be 422` (pieza activa y dado de baja) | 4 passed | — |
| 3.5 | los tres anteriores | idem | — | use case dentro de `txRunner.run()`: `bloquearParaModificar` → `!activo` → `findActiveByEquipoId` → `delete`; cableado en `equipos.module.ts` con `COMPONENTE_EQUIPO_REPOSITORY` y `TENANT_TX_RUNNER` | firma `(equipoRepo, componenteRepo, txRunner)` |
| 3.6 | `equipos.controller.spec.ts` (2 casos nuevos) | `pnpm vitest run src/equipos/interface/controllers/equipos.controller.spec.ts` | n/a: el default ya daba 422 (no era RED) | 79 passed | mapeo 422 explícito de los dos errores; el mensaje informa la cantidad |
| 3.7 | `eliminar-equipo.orden-de-locks.integration.spec.ts` (T5) | `pnpm vitest run src/equipos/infrastructure/persistence/prisma/eliminar-equipo.orden-de-locks.integration.spec.ts` | n/a: testigo del orden de locks, escrito sobre el código ya corregido | 1 passed | — |
| 3.8 | `equipo-detail-view.test.tsx` (3 casos nuevos) | `cd frontend && pnpm vitest run src/features/equipos/components/equipo-detail-view.test.tsx` | n/a (UI) | 7 passed | botón «Eliminar equipo (cargado por error)», toast «Equipo eliminado.» |

3.9 Ayuda: `rg -n -i "dar de baja|borrar|eliminar" backend/ayuda` no encontró ningún artículo que
describa el botón del equipo como baja ni que diga que se puede borrar un equipo con piezas; no
hay nada que quede falso. Deuda: artículo del botón renombrado «Eliminar equipo (cargado por
error)» y del flujo de baja.


## WU-4 — Guards con LE: editar equipo, agregar y reactivar componente

Cinco partes encadenadas por la política de tamaño (la unidad suma ~1.500 líneas con tests): `feat/baja-equipo-completo-wu04` (editar equipo), `-wu04-2` (agregar/instalar/alta sin descuento + demo seed), `-wu04-3` (reactivar), `-wu04-4` (integración de guards), `-wu04-5` (testigo T4 y este registro). Base wu03. Modo estándar (feature): los tests
de comportamiento nuevo se escribieron antes del código y se corrieron contra el código viejo.

### RED observado (guards sobre caminos existentes)

| Comando | RED observado |
|---|---|
| `pnpm vitest run src/equipos/application/use-cases/editar-equipo.use-case.spec.ts` contra `editar-equipo.use-case.ts` SIN tocar | 15 failed: `TypeError: this.equipoRepo.findById is not a function` (el fake nuevo solo expone `bloquearParaModificar`, el contrato de ADR-2/5). Incluye los tests nuevos "equipo dado de baja falla con EquipoDadoDeBajaError" y "lee con bloquearParaModificar dentro de la transacción" |
| `reactivar-componente.use-case.spec.ts` | el test nuevo "equipo dado de baja" falla por comportamiento (el use case sin guard reactiva); se escribió junto al código |
| T4 con mutación | ver "Mutación del testigo" |

### Decisiones y desvíos

- 4.2 `EditarEquipo`: corre entero en `txRunner.run()`; el P2002 se sigue mapeando afuera del `run()`
  (un P2002 aborta la transacción, no se relee adentro).
- 4.4 `AgregarComponente.preparar()` toma `bloquearParaOperarPiezas` como primer lock; `execute()`
  (que llama a `preparar()`) pasó a exigir transacción. Único caller de `execute()`:
  `InstalarComponenteDesdeDeposito` (camino sin unidad), ya dentro de su `run()`. Los tres caminos
  pasan por `preparar()`: `rg -n "preparar\(" backend/src/equipos` (instalar con unidad, `execute()`
  del camino NINGUNO y alta sin descuento).
- 4.5 `ReactivarComponente`: el ctor suma `equipoRepo` (2.º argumento). **Desvío menor de diseño**:
  las lecturas del componente (no encontrado, otro equipo, ya activo, `STOCK_USADO`) siguen
  FUERA de la transacción, igual que antes, porque el delta exige que los 8 tests previos
  sigan verdes sin cambiar sus aserciones (dos de ellos afirman `txRunner.run` no llamado). El LE
  (`bloquearParaOperarPiezas(dto.equipoId)`) es lo primero DENTRO de la transacción, antes de
  `reinstalar` (L1 a L3) y de `save` (L4). El equipo se toma de la URL, no del componente.
- Fixtures nuevos de specs unitarios: `backend/src/equipos/testing/equipos-unit.fixtures.ts`
  (`equipoVigente`, `equipoDadoDeBaja`, `txRunnerDeSpec`, `agregarComponenteSobreEquipoDadoDeBaja`).
- 4.6 Casts: `editar-equipo`, `agregar-componente` y `reactivar-componente` specs quedaron sin
  `as never`: ratchet 664/120 → 629/117 (base actualizada en `scripts/check-casts-en-specs.mjs`).
  `instalar-componente-desde-deposito` y `agregar-componente-sin-descuento` conservan sus casts
  previos (fuera del alcance); los bloques nuevos no agregan ninguno.
- Regresión del delta de reactivar, los 8 tests que cubren los escenarios previos (sin cambiar
  aserciones; solo el fake ganó `equipoRepo` y el orden registrado):
  1. `reactivar-componente.use-case.spec.ts` › "rechaza con ComponenteDevueltoAlStockError si volvió al stock como USADO, y no persiste" (tras devolver al stock)
  2. › "reactiva un DESCARTE y limpia el registro de retiro" (tras descartar)
  3. › "reactiva un retiro LEGADO (sin destino) y persiste, sin tocar ninguna unidad" (retiro legado / legado sin unidad)
  4. › "reinstala la unidad (L1 a L3) ANTES de guardar el componente (L4), todo en una transaccion" (componente con unidad descartada)
  5. › "unidad que ya no esta descartada por este componente (recuperada, ADR-14)…" (unidad recuperada)
  6. › "insumo que dejo de ser SERIE: el error de insumos llega tal cual y no se guarda" (insumo vuelto a NINGUNO)
  7. `retirar-reactivar-unidad.concurrencia.integration.spec.ts` › "tras recuperar la pieza (ADR-14) reactivar se rechaza y no cambia nada"
  8. `retirar-reactivar-unidad.concurrencia.integration.spec.ts` › "con el insumo vuelto a NINGUNO reactivar se rechaza (SeguimientoNoModificable) y no cambia nada"
  (La fila de la interfaz es de frontend y no cambia.) Único cambio en esos specs: se pasó el
  `equipoRepo` real al ctor en el integration.

### Mutación del testigo T4

`baja-equipo.orden-de-locks.integration.spec.ts` (archivo nuevo, dos casos: instalar con unidad y
reactivar con unidad). Mutación local: se quitó el `FOR SHARE` de `bloquearParaOperarPiezas` en
`prisma-equipo-informatico.repository.ts` (el lock se omite). Rojo observado en los dos casos:
`Error: Nadie quedo bloqueado por el backend <pid> en 5000 ms.` (la operación no esperaba al LE).
Revertido con `git checkout`; los dos casos vuelven a verde.

### Ayuda

Sin deuda (la UI no cambia aún).

### Hallazgo en la suite completa

`prisma_master/seeds/demo-seed.ts` llamaba a `AgregarComponenteUseCase.execute()` fuera de una
transacción; con el LE `FOR SHARE` el `exigirTransaccionActiva` lo rechaza
(`demo-seed.integration.spec.ts` rojo en la corrida completa). Corregido: el seed usa
`AgregarComponenteSinDescuentoUseCase` (misma conducta con un insumo `NINGUNO`, ahora dentro de su
propia transacción; firma con `usuarios.usuario`).

## WU-5 — Guards con LE: retirar y ticket; CAS de `EditarComponente`

Rama `feat/baja-equipo-completo-wu05` (base wu04-5), parte 1 de 2 (el CAS de `EditarComponente`, 5.3 a 5.5
y 5.7, va en `feat/baja-equipo-completo-wu05-2`). Modo estándar (feature).

- 5.1 `RetirarComponenteUseCase` recibe `equipoRepo` (`Pick<..., 'bloquearParaOperarPiezas'>`, ctor
  `(txRunner, equipoRepo, componenteRepo, registrarEntrada, operaciones)`): el LE `FOR SHARE` es lo
  primero dentro de `run()`; solo toma el lock (sin guard de `activo`). Las lecturas previas del
  componente quedan afuera de la transacción (igual criterio que WU-4 con reactivar). Wiring en
  `equipos.module.ts` y en los dos integration specs que lo construyen.
- 5.2 `CrearTicketSoporteUseCase`: con `equipoId`, `bloquearParaOperarPiezas` es lo primero dentro de
  `run()`, antes del numerador; `null`/borrado/`!activo` ⇒ `EquipoInvalidoError` sin escribir. Spec:
  fake `bloquearParaOperarPiezas`, test de orden (`tx:inicio`, `lock-equipo`, `numerar`) y de corte antes de numerar.
- 5.6 T7 y T8 en `baja-equipo.orden-de-locks.integration.spec.ts`; la sonda `locksPosteriores` suma `tickets`.
  T8 usa el `NumeradorTicket` y `PrismaTicketRepository` reales (el advisory es lo vigilado) y fakes tipados del resto.
- Callers fuera de `src/equipos`: `demo-seed.ts` y `soporte.controller` solo llaman
  `CrearTicketSoporteUseCase.execute()`, que ya abre su propia transacción: sin cambios. Los specs
  `prisma_master/seeds` pasan.

### RED observado (guards sobre caminos existentes, antes de tocar el código)

Comando: `pnpm vitest run src/equipos/application/use-cases/retirar-componente.use-case.spec.ts src/equipos/application/use-cases/crear-ticket-soporte.use-case.spec.ts`
- `crear-ticket-soporte.use-case.spec.ts`: 7 de 11 rojos (el use case seguía llamando `findById`, el fake solo
  expone `bloquearParaOperarPiezas`; el test de orden no veía `lock-equipo`).
- `retirar-componente.use-case.spec.ts`: 24 de 24 rojos (el ctor aún no recibía `equipoRepo`; los casts
  del spec desplazan los argumentos). GREEN tras implementar: ambos specs verdes.

### Mutaciones de los testigos

- T7: se quitó `await this.equipoRepo.bloquearParaOperarPiezas(...)` de `retirar-componente.use-case.ts`.
  Rojo: `Error: Nadie quedo bloqueado por el backend <pid> en 5000 ms.` Revertido.
- T8: se movió el bloque del LE después de `numerador.generarNumero`. Rojo:
  `expected { insumos: 0, advisory: 1, … } to deeply equal { insumos: 0, advisory: 0, … }`. Revertido.

### Ayuda

Sin deuda.

### WU-5 parte 2 — CAS de `EditarComponente` (`feat/baja-equipo-completo-wu05-2`)

- 5.3 `ComponenteDadoDeBajaError` ya existía (y su mapeo 422): no se creó nada. Puerto:
  `IComponenteEquipoRepository.editar(componente): Promise<boolean>`.
- 5.4 `editar()` = `updateMany WHERE id AND deleted_at IS NULL` sobre `descripcion`, `numero_serie`,
  `capacidad`, `updated_at`. Con unidad `numero_serie` se escribe NULL (CHECK
  `componentes_equipo_unidad_sin_serie_texto_check`, igual que el mapper): lo expuso el e2e de
  `equipos-instalar-desde-deposito` en la corrida amplia. `EditarComponenteUseCase` usa `editar()`;
  `false` ⇒ `ComponenteDadoDeBajaError`; nunca `save`.
- 5.5 `editar-componente.integration.spec.ts` (4 casos): edición normal (tres columnas), componente
  con unidad (serial NULL), entidad leída antes de un retiro individual, entidad leída antes de la baja del equipo.
- 5.7 Ningún fake implementa el puerto completo (todos usan `Pick`): nada que agregar.
- Casts: `editar-componente.use-case.spec.ts` perdió un `as never`: ratchet 629 → 628 (117 archivos).

## WU-6 — Insumos: clasificador, `serialesExistentes` y `devolverDesdeEquipo`

Rama `feat/baja-equipo-completo-wu06` (6.1 y 6.2) y `feat/baja-equipo-completo-wu06-2` (6.3 a 6.5).

### Parte 1 — 6.1 y 6.2

- 6.1 `clasificar-pieza-devuelta.ts`: `CAUSAS_PIEZA_NO_DEVOLVIBLE`, `CausaPieza` y `clasificarPiezaDevuelta()` pura.
  Recibe hechos ya leídos (`insumoVigente`, `familiaEsRepuesto`, `seguimiento`, `tieneUnidad`, `numeroSerie`,
  `serialRepetidoEnElLote`); `SERIAL_DUPLICADO` no sale de acá (exige la base, bajo L2). Con `DESCARTE` devuelve `null`.
  El insumo deshabilitado y la familia no vigente se admiten porque no son hechos de entrada.
- 6.2 `serialesExistentes(insumoId, normalizados)` en el puerto y en `PrismaUnidadInsumoRepository`
  (`findMany` por `numero_serie_normalizado`, sin lock; lista vacía sin consulta). Integración de 4 casos.

### Parte 2 — 6.3 a 6.5 (`feat/baja-equipo-completo-wu06-2`)

- 6.3 `devolverDesdeEquipo(conUnidad, legados, o, causasPrevias = [])` devuelve `Map<componenteId, UnidadConMovimiento>`.
  Orden: fotos sin lock (`fotografiarLote`) → L1 y L2 de la unión ordenada → `serialesExistentes` bajo L2 por insumo →
  unión con `causasPrevias` y `DevolucionConPiezasProblematicasError` (nuevo, en `unidades-insumo.errors.ts`) ANTES de L3 →
  L3 (`bloquearUnidades`) → validación de transiciones → escrituras (`RETIRO_A_DEPOSITO` e `INGRESO`, ambos con `equipoId`
  y `componenteId`). Sin unidades ni legados y con causas previas falla sin tomar locks. `devolverAlDeposito` delega con `legados = []`.
  `leerLoteEnEquipo` se partió en `fotografiarLote` + `bloquearInsumos` + `bloquearUnidades` (comportamiento intacto).
  El P2002 residual (ya con la transacción abortada) se relanza como `FalloOperacionDeUnidad(DevolucionConPiezasProblematicasError)`
  con `SERIAL_DUPLICADO` de la pieza cuyo serial chocó; `SerialDuplicadoError` ahora expone `serial`.
- 6.4 `operaciones-unidad-insumo.service.spec.ts`: bloque nuevo `devolverDesdeEquipo` (11 casos) y regresión de `devolverAlDeposito` (2).
  El fake suma `serialesExistentes`, `existentes` y `chocaAlInsertar`. Los dos bloques existentes de `devolverAlDeposito` y
  `descartarInstaladas` ya cubrían varias unidades, lote que falla y unidad en otro equipo; no se tocaron.
- Ayuda: sin deuda.

## WU-7 — Insumos: `registrarDevolucionesDeEquipo` y `diagnosticarDevolucionesDeEquipo`

Ramas: `feat/baja-equipo-completo-wu07` (7.1 + 7.3, registrar), `-wu07-2` (7.2, diagnosticar), `-wu07-3` (7.4 integración).

- 7.1 `RegistrarEntradaInsumoUseCase.registrarDevolucionesDeEquipo({ equipoId, usuarioId, motivo, piezas })`, dentro de la
  transacción del llamador y SIN `run()` propio (un P2002 residual sale como `FalloOperacionDeUnidad` y lo desenvuelve la baja).
  Orden: L1 de todos los insumos distintos por id (también `NINGUNO`) → clasificación bajo L1 con los helpers de la devolución
  de un componente (`validarInsumoElegible` sin `exigirHabilitado`, `validarCondicionAdmitida(USADO, admitirFamiliaNoVigente)`)
  → todas las causas como `causasPrevias` → `devolverDesdeEquipo` (unidades y legados `SERIE`) → ENTRADA USADO de cantidad 1
  por pieza `NINGUNO` (`asentar`, sin L2). Devuelve `Map<componenteId, movimientoId>`; una pieza sin insumo no figura.
  Con causas devuelve `DevolucionConPiezasProblematicasError` (la traducción a `BajaEquipoConPiezasProblematicasError` es de WU-8).
- 7.2 `diagnosticarDevolucionesDeEquipo(piezas)` sin transacción ni locks, con la misma clasificación; `SERIAL_DUPLICADO` por
  `serialesExistentes` sin lock, agrupado por insumo. Desvío menor del diseño: el servicio `OperacionesUnidadInsumo` expone
  `serialesExistentes` (delegando en su `unidadRepo`) para no sumar un sexto parámetro al constructor, que habría tocado 35 sitios.
- 7.3 spec unitario con fakes `Pick` tipados y registro común de llamadas (L1 por id → `devolverDesdeEquipo` → ENTRADAs).
  Mutación local: sin `.sort()` de los insumos y L1 salteado para todo menos el primero ⇒ el test de orden de locks falla; revertido.
- 7.4 integración sobre `soporte_tenant_test` con PREFIJO (5 casos): lote mixto de dos unidades + `NINGUNO` + deshabilitado,
  legado `SERIE`, insumo borrado sin cambios, `INSUMO_BORRADO` + `SERIAL_DUPLICADO` juntos sin cambios y `diagnosticar…`. El
  invariante `SERIE` se verifica tras cada caso.
- Ayuda: sin deuda.

## WU-8 — `DarDeBajaEquipoUseCase`: atomicidad, leyenda y wiring

Rama: `feat/baja-equipo-completo-wu08` (un solo commit, `size:exception`).

- 8.1 Fuera de `run()`: equipo existe y no borrado (`EquipoNoEncontradoError`), `!activo` (`EquipoDadoDeBajaError`), destino y
  categoría del catálogo, `OTRA` con texto recortado y largo del texto contra `largoMaximoTextoBaja` (`MotivoBajaEquipoInvalidoError`
  con `largoMaximo`; se valida, no se trunca). Con `STOCK_USADO`, `diagnosticarDevolucionesDeEquipo` y, si hay causas,
  `BajaEquipoConPiezasProblematicasError` con todas.
- 8.2 Dentro de `run()`: LE `bloquearParaModificar` + recheck (no borrado, activo) → leyenda recompuesta con el nombre bloqueado
  (el nombre pudo cambiar) → relectura de piezas (conjunto de ids distinto ⇒ `EquipoModificadoDuranteLaBajaError`) → stock A
  (`registrarDevolucionesDeEquipo`) o B (`descartarInstaladas` con items ordenados por `unidadId`) → componentes por id con
  `retirar()` + CAS → `darDeBaja` + `registrarBaja` (CAS). Todo `fail` se lanza como `FalloBajaDeEquipo`; `FalloOperacionDeUnidad`
  se deja propagar; ambos se desenvuelven afuera y `DevolucionConPiezasProblematicasError` se traduce a la del equipo. Cero piezas
  ⇒ solo se marca el equipo. El reloj se inyecta como `ahora` (por defecto `new Date()`).
- 8.3 `equipos.module.ts` registra el provider; `equipos.module.spec.ts` fija sus cinco dependencias (el resto del arbol lo
  resuelven los e2e que compilan `EquiposModule`).
- 8.4 Spec unitario (31 casos): orden LE → stock → L4 por id → equipo (A y B), misma leyenda en piezas/stock/equipo, seriales por
  componente solo para legados, DESCARTE sin diagnóstico ni stock, rollback por cada `fail`/CAS en falso, traducción y
  desenvoltura de errores, conjunto cambiado, cero piezas, equipo de baja/borrado/inexistente (afuera y bajo LE), `OTRA`, categoría
  y destino inválidos, 500 y 501 con `largoMaximo`, nombre que crece bajo el lock.
- Ayuda: sin deuda (sin ruta ni UI).


## WU-9 — Integración de la baja: opción A, opción B, leyenda y registro

Ramas: `feat/baja-equipo-completo-wu09` (helper + leyenda, 388 líneas) -> `-wu09-2` (opciones A y B, 285) -> `-wu09-3` (registro, R16, artefactos, 253). Corte de 926 líneas en tres partes, cada una verde en lint, typecheck y sus specs. WU-10 basa en wu09-3.

- 9.1 `backend/src/equipos/testing/baja-equipo.fixtures.ts`: clase `BajaEquipoFixtures` (wiring real de `DarDeBajaEquipoUseCase`
  sobre `soporte_tenant_test` con PREFIJO por corrida, no tenant efímero: es el patrón de los demás specs de integración de la
  baja). Insumos `NINGUNO`, `SERIE`, deshabilitado y borrado; `crearEquipo`, `agregarComponente` (legados incluidos),
  `agregarUnidadInstalada` (entrada con serial + `operaciones.instalar` + componente), `saldos`, `sembrarSaldo`, `foto()`,
  `exigirInvarianteSerie()`, `limpiar()` y `cerrar()`. El pool sale de `conUtc()` (regla de lint: `new Pool` solo en el helper).
- 9.2 `dar-de-baja-equipo.opcion-a.integration.spec.ts` (5 casos): NINGUNO, dos NINGUNO, unidad "S1", insumo deshabilitado, ROTURA sin texto.
- 9.3 `dar-de-baja-equipo.opcion-b.integration.spec.ts` (5 casos): tres componentes, NINGUNO + "S1", sin asiento negativo, insumo
  borrado, legado SERIE sin serial.
- 9.4 `dar-de-baja-equipo.leyenda.integration.spec.ts` (4 casos): leyenda idéntica en los tres lugares, sin texto, 500 y 501.
- 9.5 `dar-de-baja-equipo.registro.integration.spec.ts` (7 casos): registro de la baja, dos unidades por cada destino, sin piezas,
  todas retiradas, segunda baja, borrado lógico.
- 9.6 R16: el spec unitario `cambiar-seguimiento-insumo.use-case.spec.ts` ("rechaza con unidades instaladas", `it.each`
  `['instaladas', { INSTALADA: 1 }]`) cubre la regla con fakes y el integration `orden-de-locks.concurrencia.integration.spec.ts`
  caso 3 la cubre con unidades `EN_DEPOSITO`; ninguno con una unidad `INSTALADA` real. Se agregó
  `backend/src/insumos/application/use-cases/cambiar-seguimiento-insumo.integration.spec.ts` (1 caso): el cambio se rechaza con
  `SeguimientoNoModificableError`, el insumo sigue `SERIE` y la baja posterior descarta la unidad.
- 9.7 Gates: `pnpm lint`, `pnpm typecheck`, `check-casts-en-specs.mjs` (628/117), `vitest run src/equipos src/insumos` (150 archivos, 2530 tests) y `pnpm test` completo (545 archivos, 6802 tests) en verde; el único FAIL del log es el ruido conocido `orden-de-arranque.spec.ts`.
- El invariante `SERIE` corre en `afterEach` de los cuatro specs de la baja y al final del caso R16.
- Ayuda: sin deuda.


## WU-10 — Integración: atomicidad, legados, causas juntas y testigos T1–T3, T6

Ramas: `feat/baja-equipo-completo-wu10` (10.1 a 10.6: atomicidad, legados y causas juntas) -> `-wu10-2` (10.7: testigos T1, T2, T3 y T6). Corte pedido por tasks.md.

- 10.1 a 10.4 `dar-de-baja-equipo.atomicidad.integration.spec.ts` (6 casos): insumo borrado (por el diagnóstico de afuera y por el camino
  transaccional con el diagnóstico salteado con `vi.spyOn`), dos borrados + legado sin serial (los tres componentes con su causa, por los
  dos caminos), falla al marcar el equipo (`registrarBaja` => `false`; dentro del `run()` el saldo `USADO` ya subió y después todo
  revierte) y serial legado ya existente que falla bajo L2 sin escribir. Todos comparan `fx.foto()` antes/después.
- 10.5 y 10.6 `dar-de-baja-equipo.legados.integration.spec.ts` (7 casos): "LEG-1" crea la unidad `EN_DEPOSITO` `USADO` con su ENTRADA;
  sin serial => `SERIAL_REQUERIDO`; "x1" y "X 1" => ambos por `SERIAL_REPETIDO` (dentro del lote el clasificador usa esa causa, no
  `SERIAL_DUPLICADO`, que es contra la base); "a1" con "A1" existente => `SERIAL_DUPLICADO`; insumo borrado => `INSUMO_BORRADO`; causas
  juntas `INSUMO_BORRADO` + `SERIAL_DUPLICADO` por los dos caminos. Ninguna unidad queda con `numero_serie` nulo.
- 10.2: los "dos insumos borrados" son dos componentes del mismo insumo borrado del fixture (el error es por componente).
- Fixture: `pool` pasa a ser público (los testigos de locks lo usan) y `agregarUnidadEnDeposito(serial)`.
- 10.7 `baja-equipo.orden-de-locks.integration.spec.ts`: `esperarBloqueadoPor`, `locksPosteriores` y el nuevo `conLockExterno` (externo retiene un
  lock, espera acotada con `pg_blocking_pids`, aserciones sobre `pg_locks` del que espera, COMMIT, resultado) pasan a nivel de módulo;
  `conLeRetenido` es ahora un envoltorio de `conLockExterno` (T4, T7 y T8 sin cambios de comportamiento). Segundo `describe` con
  `BajaEquipoFixtures` y la baja real: T1 (externo con LE `FOR SHARE`: la baja espera sin `insumos` ni advisory), T2 (advisory
  `insumo-stock:<serie>` retenido: la baja espera ese advisory, tiene `RowShareLock` en `equipos_informaticos` e `insumos`, ningún
  `RowExclusiveLock` en `componentes_equipo`/`movimientos_insumo`/`unidades_insumo` y `FOR UPDATE NOWAIT` sobre los componentes
  tiene éxito), T3 (unidad retenida `FOR NO KEY UPDATE`: advisory del insumo `SERIE` ya tomado, ninguna ENTRADA `NINGUNO` ni escritura de
  componentes antes de L3) y T6 (baja retenida en L2: un `INSERT` en `movimientos_insumo` con `equipo_id` y `lock_timeout` de 500 ms no se bloquea).
- Mutaciones locales (cada una revertida): `bloquearParaModificar` con `FOR SHARE` => T1 rojo; con `FOR UPDATE` => T6 rojo (55P03 por la FK
  `FOR KEY SHARE`); escritura de un componente antes del stock => T2 y T3 rojos (`RowExclusiveLock`); ENTRADA `NINGUNO` antes de L3 =>
  T2 y T3 rojos; L2 omitido (`bloquearStock` sin efecto) => T2, T3 y T6 rojos.
- 10.8 Gates: `pnpm lint`, `pnpm typecheck`, `check-casts-en-specs.mjs` (628/117), `vitest run src/equipos src/insumos` (152 archivos, 2547 tests), `pnpm test` completo (547 archivos, 6819 tests) en verde; el testigo corrido tres veces seguidas: 8/8 cada vez. El único FAIL del log es el ruido conocido `orden-de-arranque.spec.ts`.
- Ayuda: sin deuda.


## WU-11 — HTTP: resumen y baja, tickets abiertos, errores y DTO

Ramas: `feat/baja-equipo-completo-wu11` (11.1 conteo de tickets abiertos) -> `-wu11-2` (11.2 resumen) -> `-wu11-3` (11.3 DTO) -> `-wu11-4` (11.4 a 11.6 endpoints, errores y Ayuda). Corte por el presupuesto de 400 lineas (el WU completo rondaba 1170).

- 11.1 El puerto `ITicketSoporteRepository` ya vivia en `equipos` (el satelite `ticket_soporte` es de este modulo), asi que `contarAbiertosPorEquipo(equipoId, estadosTerminales)` queda ahi, sin cruzar a `tickets`. Integracion con estados propios de la corrida (`T11_<prefijo>_RESUELTO`...) pasando como terminales los de CERRADO y CANCELADO: RESUELTO cuenta, los terminales y los borrados (ticket o satelite) no, otro equipo no.
- 11.2 `ResumenBajaEquipoUseCase`: el diagnostico de `causaQueImpideDevolver` se delega en `registrarEntrada.diagnosticarDevolucionesDeEquipo` (el mismo de la baja, que usa `clasificarPiezaDevuelta`) pasando el `serialSugerido` como serial de los legados `SERIE`; un legado sin serial valido sale con `SERIAL_REQUERIDO`. Los insumos se leen por `insumoRepo.findById` (nombre y seguimiento); un insumo borrado igual aparece con su nombre y la causa `INSUMO_BORRADO`.
- 11.3 `DarDeBajaEquipoHttpDto`. El serial por pieza NO usa `@EsSerialDeUnidad`: un serial invalido o repetido es una causa por pieza (422 con `piezas[]`), no un 400. `EquipoResponseDto.baja` es `null` mientras `bajaDestino/bajaCategoria/bajaFecha` no estan completos.
- 11.4 `POST /equipos/:id/baja` responde la ficha (`ObtenerEquipoUseCase` despues de la baja, fuera de la transaccion). Un id que no es UUID da 404 en las dos rutas. `toHttpException`: `EquipoModificadoDuranteLaBajaError` 409; `BajaEquipoConPiezasProblematicasError`, `MotivoBajaEquipoInvalidoError` (con `largoMaximo` si hay) y `EquipoConComponentesActivosError` (con `cantidad`) devuelven un cuerpo objeto con `statusCode`, `message`, `code`; `EquipoDadoDeBajaError` 422.
- 11.5 Spec del controller: TABLA ampliada a `404 | 409 | 422`, cuerpos de los cinco errores, reflexion `EQUIPOS:BORRADO` en los dos handlers y `EQUIPOS:LECTURA` en `listar`. Los casos de uso nuevos van como dobles tipados (`Object.create(Clase.prototype)` + `vi.spyOn(.., 'execute')`), sin ningun cast: el ratchet queda en 628/117.
- 11.6 Ayuda `permisos-y-roles.md`: "tres trabajos" pasa a cuatro y suma la baja completa con `BORRADO` de Equipos; "esos tres casos" pasa a cuatro. `rg -n "tres trabajos|esos tres" backend/ayuda` sin resultados. Ojo: `prettier --write` sobre ese `.md` lo reformatea entero; se aplico a mano.
- Ayuda: deuda, articulo del flujo de baja de equipo.



## WU-12 — e2e HTTP de la baja

Ramas: `feat/baja-equipo-completo-wu12` (arnes + permisos, validacion, piezas problematicas; 628 lineas, `size:exception`) -> `-wu12-2` (resumen, tickets abiertos, ficha, ticket nuevo). WU-13 bases on wu12-2.

- 12.1 `dar-de-baja-equipo.e2e.spec.ts` (24 casos, tenant efimero, `usarLockMasterTest()`; higiene filas -> `app.close()` -> `dropDatabase`). Las piezas, unidades y tickets se siembran por SQL; `POST /soporte` para el ticket nuevo exige sembrar `tipo_operacion CAMBIO_ESTADO`, estado `NUEVO`, tipo `SOPORTE`, prioridad y un ciclo activo (sin ese catalogo el caso da 500 antes de llegar a la validacion del equipo).
- Observado: `baja.motivo` en la respuesta es el texto recortado (sin leyenda); la leyenda `Baja del equipo «<nombre>» — <Etiqueta>[: <texto>]` vive en `componentes[].bajaMotivo` y en movimientos/eventos. Con texto de N caracteres la leyenda mide 500.
- El 409 `EQUIPO_MODIFICADO_DURANTE_LA_BAJA` no se prueba por HTTP (exige una carrera): lo cubre WU-13.
- 12.2 Gates: `pnpm lint`, `pnpm typecheck`, `check-casts-en-specs.mjs` (628/117), spec solo dos veces (24/24), `vitest run src/equipos` (51 archivos, 740 tests) y `pnpm test` completo (549 archivos, 6879 tests; unico FAIL del log: ruido conocido `orden-de-arranque.spec.ts`) en verde.
- Ayuda: sin deuda.


## WU-13 — Concurrencia de resultado (a)-(e)

Rama: `feat/baja-equipo-completo-wu13` (una sola, solo tests; base wu12-2).

- 13.1 `baja-equipo.concurrencia.integration.spec.ts` (8 casos, 10 iteraciones cada uno, filas limpias entre iteraciones sobre `soporte_tenant_test` con PREFIJO; los tickets usan catalogo propio de la corrida). Helper `escalonar`: un cliente externo retiene un lock, las operaciones se lanzan de a una (el orden del arreglo es el orden de llegada), se espera con `pg_stat_activity`/`pg_blocking_pids` a que queden en la cola y recien entonces el COMMIT del externo. `resultados()` exige que ninguna operacion termine rechazada (cualquier `40P01` o error de sistema la rechazaria) y cada caso cierra con `exigirInvarianteSerie` de los dos insumos `SERIE`.
- Orden de llegada alternado por iteracion (pares: baja primero; impares: la otra primero): en (b)/(c) salen 5 bajas y 5 entradas ganadoras por variante, en (e) 5 tickets creados y 5 rechazados; se afirma que ambos caminos ocurren.
- 13.2 (a) E1 con unidades de X e Y contra dos instalaciones en E2 (Y y X); el externo retiene L1 del insumo de id mas alto. Las tres terminan OK y, por insumo y condicion, las unidades `EN_DEPOSITO` igualan el saldo del libro.
- 13.3/13.4 (b) y (c), cuatro variantes (instalar con unidad, instalar `NINGUNO`, alta sin descuento `SERIE` y `NINGUNO`): exactamente una gana; si gana la baja la entrada da `EquipoDadoDeBajaError`, si gana la entrada la baja da `EquipoModificadoDuranteLaBajaError` y la pieza queda activa en el equipo vigente. Un equipo dado de baja nunca conserva componentes activos ni unidades `INSTALADA`.
- 13.5 (d) dos bajas: una OK, la otra `EquipoDadoDeBajaError`, exactamente 2 ENTRADA (una por pieza).
- 13.6 (e) baja vs `CrearTicketSoporte` (repos de ticket reales; solo catalogos y ciclo como fakes tipados con ids reales de filas propias): la baja siempre termina; o el ticket existe (`ticket_soporte` activo, `contarAbiertosPorEquipo` = 1) o se rechaza con `EquipoInvalidoError` sin filas.
- Caso 409 determinista (extra): el externo toma el LE `FOR SHARE` como una alta, inserta una pieza y comitea con la baja ya en cola: la baja da `EquipoModificadoDuranteLaBajaError` y la foto de unidades, movimientos, eventos y equipos no cambia.
- Fixture `BajaEquipoFixtures`: segundo insumo `SERIE` (`serie2Id`, entra en `todosLosInsumos`), `agregarUnidadInstalada` / `agregarUnidadEnDeposito` / `exigirInvarianteSerie` aceptan `insumoId`; pool de 6 a 10 conexiones.
- 13.7 Gates: `pnpm lint`, `pnpm typecheck`, `check-casts-en-specs.mjs` (628/117), spec solo tres veces seguidas (8/8 cada vez), `vitest run src/equipos src/insumos` (155 archivos, 2615 tests) y `pnpm test` completo (550 archivos, 6887 tests; unico FAIL del log: ruido conocido `orden-de-arranque.spec.ts`) en verde.
- Ayuda: sin deuda.


## WU-14 — Lista y exportacion con `incluirBajas`

Rama: `feat/baja-equipo-completo-wu14` (base wu13).

- 14.1 Puerto + repo Prisma: `findAllIncluyendoDadosDeBaja()` (`deletedAt: null`, orden `createdAt desc`). `findAllActive()` queda intacto (`activo: true`). El unico consumidor de `findAllActive` de equipos es `ListarEquiposUseCase`; los selectores de otras pantallas consumen `GET /equipos` sin parametro, es decir, solo vigentes. Ningun use case de tickets, preventivo o compras importa el repo de equipos para listar.
- 14.2 `ListarEquiposUseCase.execute({ incluirDadosDeBaja = false })` y `ExportarEquiposUseCase.execute({ incluirDadosDeBaja })` (la exportacion delega en la lista). La columna de estado ya decia "Baja" (`e.activo ? 'Activo' : 'Baja'`, columna `Estado`). JSDoc actualizado; el comentario del frontend (`equipos-list-view.tsx`) ya no dice "sin filtros": WU-15 lo reescribe con el filtro visible. El spec de la lista deja de usar `as never` (casts 628 -> 627 en 116 archivos).
- 14.3 `ListarEquiposQueryDto { incluirBajas?: boolean }` (`parsearBooleanQuery` + `@IsBoolean`, un valor no booleano da 400) en `GET /equipos` y `GET /equipos/export`, ambos `EQUIPOS:LECTURA`. `EquipoResponseDto.baja` ya existia (WU-11).
- 14.4 `equipos-incluir-bajas.e2e.spec.ts` (12 casos): lista por defecto / `false` / `true` con `baja`, borrado logico excluido, 400, 403; exportacion con y sin filtro ("Baja" en Estado); PATCH, POST componentes con y sin descuento y reactivar sobre equipo dado de baja => 422 sin cambios. El equipo se da de baja por HTTP (`DESCARTE`).
- 14.5 Gates: `pnpm lint`, `pnpm typecheck`, `check-casts-en-specs.mjs` (627/116), `vitest run src/equipos src/tickets src/preventivo` (122 archivos, 1421 tests), e2e nuevo 12/12 y `pnpm test` completo (551 archivos, 6903 tests; unico FAIL del log: ruido conocido `orden-de-arranque.spec.ts`) en verde.
- Ayuda: sin deuda en este WU (WU-15 corrige `equipos-listado.md` junto con el filtro visible).


## WU-15 — Filtro de la lista y Ayuda del listado

Rama: `feat/baja-equipo-completo-wu15` (base wu14-2).

- 15.1 `types.ts`: `CATEGORIAS_BAJA_EQUIPO`, `CategoriaBajaEquipo`, `BajaEquipo` y `Equipo.baja?` (opcional para no obligar a cada fixture). `schemas.ts`: `bajaEquipoSchema` (nullable) con su test.
- 15.2 `use-equipos.ts`: `useEquipos(enabled = true, { incluirBajas })`, clave `["equipos", { incluirBajas }]` (colgada de `["equipos"]`); `queryStringEquipos()` compartido con la exportacion: devuelve `incluirBajas=true` solo con la casilla tildada, si no `undefined` (la peticion no manda el parametro). Los demas callers (`useEquipos()` / `useEquipos(open)`) siguen pidiendo solo vigentes.
- 15.3 `equipos-list-view.tsx`: casilla «Mostrar equipos dados de baja», apagada por defecto, guiada por la URL (`?incluirBajas=true`, via `useUrlFilters` con `resetPage: false`); la columna Estado ya mostraba la etiqueta «Baja» para `activo = false`; `ExportarCsvButton` recibe el mismo `queryString`; comentario reescrito.
- 15.4 Tests en `equipos-list-view.test.tsx` (5 casos nuevos): por defecto solo el vigente y sin parametro; al tildar navega con `?incluirBajas=true`; con el parametro se piden ambos y el dado de baja lleva «Baja»; la exportacion pide lo mismo que la lista (sin y con filtro); invalidar `["equipos"]` refresca la variante activa y marca la inactiva.
- 15.5 Ayuda `equipos-listado.md` editada a mano (sin prettier): la seccion «Sin filtros» pasa a describir la casilla; la exportacion sigue el filtro; se ajusta el parrafo del aviso de volumen. `rg "no tiene filtros"` sin resultados.
- Ayuda: corregida en este WU; deuda restante: articulo nuevo sobre el flujo de baja de equipo, el boton renombrado y la ficha de un equipo dado de baja.
