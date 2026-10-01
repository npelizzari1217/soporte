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
