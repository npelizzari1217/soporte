# Apply progress — repuestos-numero-de-serie

## WU-1 — Migración única, schema, catálogos de dominio, seed de `entera`, spec de constraints (completo)

Tareas 1.1 a 1.7 hechas. Modo estándar (`strict_tdd: false`). Rama `feat/repuestos-numero-de-serie-wu01`.

- Migración `20260930140000_unidades_insumo_serie`: `unidades_medida.entera`, `insumos.seguimiento`,
  `unidades_insumo`, `movimientos_insumo.unidad_id`, `componentes_equipo.unidad_id`,
  `eventos_unidad_insumo`, con todos los CHECK, FK RESTRICT e índices parciales de ADR-1 y ADR-9.
- `schema.prisma`: `UnidadInsumo`, `EventoUnidadInsumo`, campos nuevos y relaciones con nombre.
  Los índices únicos parciales y los CHECK viven solo en el SQL (Prisma no los modela).
- Dominio: `unidad-insumo.entity.ts` con los catálogos y `normalizarSerial()` (+ spec).
- Seeder de tenants: `entera: true` en `UNI` y `PAR` (+ spec unitario e integración).
- Mappers: los `toPersistence` excluyen las columnas nuevas (`seguimiento`, `entera`, `unidadId`)
  para no pisarlas; las puebla WU-2. Los fixtures de los specs de mappers suman los campos.
- `unidades-insumo-constraints.integration.spec.ts` (tenant efímero): 58 casos.
- Bases locales migradas a mano: `soporte_tenant_test` y las 2 tenants de desarrollo.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos/infrastructure/persistence/prisma/unidades-insumo-constraints.integration.spec.ts src/insumos/domain/entities/unidad-insumo.entity.spec.ts`: 2 files, 66 tests passed |
| Runtime harness | Base tenant efímera con replay de migraciones previas, filas legadas y la migración del ciclo; `pnpm vitest run src/insumos src/clientes prisma_tenant`: 122 files, 1638 tests passed |
| Rollback boundary | Revertir el commit; la migración es aditiva con defaults inertes (la migración ya aplicada en bases locales queda, sin efecto) |

## WU-2 — Dominio: unidad, evento, errores, `seguimiento`, `entera`, `unidadId`, mappers

Modo estándar (`strict_tdd: false`). Se entrega en dos commits por la costura de `tasks.md`:
rama `feat/repuestos-numero-de-serie-wu02` (2.1, 2.2, 2.5) y `feat/repuestos-numero-de-serie-wu02-2` (2.3, 2.4, 2.6).

### Parte 1 (wu02): 2.1, 2.2, 2.5 hechas

- `UnidadInsumoEntity` con la máquina de estados de ADR-1 como tabla única (`TRANSICIONES_UNIDAD`,
  un `Record` sobre `OPERACIONES_UNIDAD`). Transiciones inválidas devuelven `UnidadNoDisponibleError`
  sin mutar. `cargarSerial` solo acepta `EN_DEPOSITO` sin serial; `corregirSerial` devuelve el
  serial anterior. Una `INSTALADA` siempre tiene serial (`crearInstalada`, `INSTALAR`, `REINSTALAR`
  lo exigen). El CHECK estado/equipo se espeja: el equipo se fija al entrar a `INSTALADA` y se
  borra al salir.
- Arrastre (b) de WU-1: el largo se valida sobre la forma recortada **y** la normalizada
  (`'ß'.repeat(128)` cabe cargado pero mide 256 normalizado); es un `throw` de contrato, como el
  resto de los guards de largo. **Riesgo para WU-8a**: el DTO mide 1–255 sobre lo crudo, así que
  el borde debe medir también el largo normalizado y responder 400, o ese caso sale como 500.
- `EventoUnidadInsumoEntity` append-only, `componenteId` opcional, `usuarioId` obligatorio
  (arrastre (c): la columna es NOT NULL). `CORRECCION_SERIAL` exige motivo (backstop por `throw`).
- Errores de ADR-8: 11 en insumos (`unidades-insumo.errors.ts` nuevo y `unidades-medida.errors.ts`)
  y 2 en equipos. Sin mapeo HTTP; el spec del catálogo de `EquiposController` (conteo y tabla) suma
  los dos de equipos, que caen en el 422 por defecto.

### Work Unit Evidence (parte 1)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos/domain src/equipos`: verde (ver el resultado en el reporte de la parte) |
| Runtime harness | N/A: dominio puro y errores; sin frontera de runtime |
| Rollback boundary | Revertir el commit de la parte 1: solo agrega archivos y dos entradas al spec del catálogo de equipos |

### Parte 2 (wu02-2): 2.3, 2.4, 2.6 hechas

- `InsumoEntity.seguimiento` (por defecto `NINGUNO`, `actualizar()` no lo toca) y
  `puedeCambiarSeguimiento(destino, conteos)`: pura, recibe los conteos ya leídos (saldo total,
  unidades `EN_DEPOSITO` e `INSTALADA`, `entera`); pedir el valor actual es un no-op válido.
- `UnidadMedidaEntity.entera` (por defecto `false`, editable en `actualizar()`).
  `MovimientoInsumoEntity.unidadId` opcional con `unidadId => cantidad = 1` (`throw` de contrato,
  espeja el CHECK). `saldosDesdeUnidades(conteo)` en `tipo-movimiento-insumo.ts`; `calcularStock()`
  y `calcularSaldos()` no cambian.
- `reconstitute()` de las tres entidades acepta los campos nuevos como opcionales (`NINGUNO`,
  `false`, `null`) para no tocar cada spec que arma entidades; los mappers los mandan siempre y sus
  specs lo verifican.
- Mappers: `InsumoMapper.toPersistence()` devuelve `seguimiento` (rama `create`; quitarlo de la rama
  `update` es WU-3a: hasta entonces un `save()` con entidad vieja lo reescribiría, pero ningún camino
  lo cambia todavía). `UnidadMedidaMapper` y `MovimientoInsumoMapper` mandan `entera` y `unidadId`.
  Mappers nuevos `UnidadInsumoMapper` y `EventoUnidadInsumoMapper` (append-only, sin `createdAt`).

### Work Unit Evidence (WU-2 completo)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos src/equipos/domain`: verde en cada parte (parte 1 aislada, parte 2 sobre la parte 1) |
| Runtime harness | N/A: dominio puro y mappers sin IO; la persistencia real de estos campos la ejerce WU-3a con la base efímera |
| Rollback boundary | Revertir la parte 2 (entidades existentes y mappers) y luego la parte 1 (archivos nuevos); cada una es revertible por separado |


## WU-3a — Persistencia de unidades, `exigirTransaccionActiva`, lecturas con lock, `save()` sin `seguimiento`

WU-3a se entregó en tres partes por el presupuesto de 400 líneas (cortes por el costado que separa
cada código de sus pruebas): parte 1 (`wu03a`) = 3a.1 y 3a.3; parte 2 (`wu03a-2`) = 3a.2, 3a.5 y
3a.6; parte 3 (`wu03a-3`) = 3a.4.

### Parte 1 (wu03a): 3a.1 y 3a.3 hechas

- `exigirTransaccionActiva(tenantContext, operacion)` en `shared/infrastructure/persistence/`: lo llaman
  `bloquearStock`, `lockAndSumByTipo` (vía `bloquearStock`) y todas las lecturas con lock nuevas. El
  mensaje conserva "requiere una transacción activa" (lo afirma el spec existente).
- L0: `IUnidadMedidaRepository.leerParaUso` (`FOR SHARE`, devuelve `{ entera }`) y
  `bloquearParaEdicion(id, 'CAMBIA_CODIGO' | 'SIN_CAMBIO_DE_CODIGO')` (`FOR UPDATE` /
  `FOR NO KEY UPDATE`, devuelve la entidad; lo usa WU-12b).
- L1: `IInsumoRepository.leerSeguimientoParaMovimiento` (`FOR SHARE`) y `bloquearParaCambioDeSeguimiento`
  (`FOR NO KEY UPDATE`, devuelve `seguimiento` y `unidadMedidaId`).
- L2: `IMovimientoInsumoRepository.bloquearStock`; `lockAndSumByTipo` pasa por ella.
- Cada lock se prueba desde una sesión testigo con `NOWAIT` (`55P03`) o `pg_try_advisory_xact_lock`,
  con su caso hermano compatible que sí pasa, y cada lectura falla fuera de una transacción.

### Work Unit Evidence (WU-3a parte 1)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/shared/infrastructure src/insumos`: verde (ver el reporte de la parte) |
| Runtime harness | Base `soporte_tenant_test` real y sesión testigo con `NOWAIT` desde afuera de la transacción |
| Rollback boundary | Revertir el commit de la parte 1: agrega métodos a tres puertos y un helper; `lockAndSumByTipo` mantiene su comportamiento |

### Parte 2 (wu03a-2): 3a.2, 3a.5 y 3a.6 hechas

- `IUnidadInsumoRepository` (`domain/ports/i-unidad-insumo.repository.ts`, token
  `UNIDAD_INSUMO_REPOSITORY`, registrado en `insumos.module.ts` sin exportar) y
  `PrismaUnidadInsumoRepository`: `insertar`, `bloquearPorIds` (`ORDER BY id FOR NO KEY UPDATE`),
  `guardarConEstadoEsperado` (CAS con `updateMany`; 0 filas lanza `Error`), `contarEnDepositoPorCondicion`,
  `contarPorEstado` (insumo de `puedeCambiarSeguimiento`), `listarPorInsumo`, `findById`.
- `FalloOperacionDeUnidad` (exportada) vive en `domain/errors/fallo-operacion-de-unidad.ts`, en archivo
  propio y no en `unidades-insumo.errors.ts`: no es un `DomainError` y ese archivo lo enumera su spec.
- Un P2002 se traduce a `SerialDuplicadoError` solo si la unidad tiene serial (el índice es parcial);
  sin serial el error pasa tal cual, para no disfrazar un choque de PK.
- Integración en base real con pool instrumentado (máximo observado reiniciado antes del bloque
  concurrente y afirmado > 1 antes de los asserts de negocio): mismo serial en seis inserciones
  simultáneas ⇒ una; misma unidad en seis salidas simultáneas ⇒ una entrega y las demás la ven ya
  entregada, sin ningún CAS de 0 filas.

### Mutación adversarial local de 3a.5 (revertida)

| Mutación | Resultado observado |
|---|---|
| Quitar `FOR NO KEY UPDATE` de `bloquearPorIds` | ROJO en 2 tests: el de modos de lock (`{ exclusivo: true, keyShare: true }` en vez de `exclusivo: false`) y la concurrencia sobre la misma unidad (5 de 6 transacciones llegaron a un CAS de 0 filas) |

### Work Unit Evidence (WU-3a parte 2)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/shared/infrastructure src/insumos`: verde (ver el reporte de la parte) |
| Runtime harness | Base `soporte_tenant_test` real, pool instrumentado y sesión testigo con `NOWAIT` |
| Rollback boundary | Revertir el commit de la parte 2: archivos nuevos y un provider sin exportar en `insumos.module.ts` |

### Parte 3 (wu03a-3): 3a.4 y 3a.7 hechas

- W3: `PrismaInsumoRepository.save()` escribe `seguimiento` en el CREATE y NO en el UPDATE (quita la
  clave del shape de la rama `update`); `IInsumoRepository.cambiarSeguimiento(id, valor)` es el único
  escritor y lanza si el insumo no existe (`updateMany` con conteo 0).
- Integración (`lecturas-con-lock-de-fila.integration.spec.ts`, describe W3): una entidad leída antes del
  cambio no pisa el `SERIE` nuevo al guardarse; el resto de los campos sí se actualiza; el CREATE sí
  escribe el seguimiento de la entidad nueva; `cambiarSeguimiento` de un insumo inexistente lanza.
- 3a.7: las compuertas se corrieron sobre el árbol completo de la WU (las tres partes juntas) y sobre
  cada parte por separado.

### Mutación adversarial local de 3a.4 (revertida)

| Mutación | Resultado observado |
|---|---|
| Escribir `seguimiento` en la rama `update` de `save()` (`...data` en vez de `...dataSinSeguimiento`) | ROJO: `expected 'NINGUNO' to be 'SERIE'` en "una entidad leída antes del cambio no pisa el seguimiento nuevo al guardarse" (1 failed / 16 passed) |

### Work Unit Evidence (WU-3a parte 3 y WU completa)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/shared/infrastructure src/insumos`: 87 archivos, 1515 tests verdes sobre el árbol completo |
| Full suite | `pnpm test`: 499 archivos, 6067 tests verdes (los `FAIL orden-de-arranque` del log son la salida esperada de subprocesos que el spec provoca a propósito; el archivo pasa) |
| Rollback boundary | Revertir el commit de la parte 3: `save()` vuelve a escribir `seguimiento` en el UPDATE y desaparece `cambiarSeguimiento` |

## WU-3b — repositorio de eventos de unidad de insumo (3b.1 a 3b.3 hechas)

- 3b.1: puerto `IEventoUnidadInsumoRepository` (solo `insert` y `listarPorUnidad`, token
  `EVENTO_UNIDAD_INSUMO_REPOSITORY`) y `PrismaEventoUnidadInsumoRepository`, que reutiliza el
  `EventoUnidadInsumoMapper` de WU-2. `insert` usa `create` (un id o `movimiento_id` repetidos rebotan
  con P2002) y conserva el id generado por la entidad; `listarPorUnidad` ordena por `(created_at, id)`.
  Provider registrado en `insumos.module.ts`, sin exportar.
- 3b.2: integración sobre `soporte_tenant_test`: lista vacía, round-trip de los 12 tipos, orden
  cronológico y desempate por id con `created_at` idéntico, `movimiento_id` UNIQUE (el primero
  sobrevive), `componente_id` sin FK.
- 3b.3: lint y typecheck sin errores; `pnpm vitest run src/insumos/infrastructure`: 22 archivos, 338
  tests verdes; `pnpm test`: 500 archivos, 6072 tests verdes.

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos/infrastructure`: 338 verdes |
| Rollback boundary | Revertir el commit: archivos nuevos y un provider sin exportar |

## WU-4a parte 1 — `OperacionesUnidadInsumo`: contrato común e `ingresar` (4a.1 y 4a.2 hechas)

- 4a.1: `application/services/operaciones-unidad-insumo.service.ts`. Toma L1 (`leerSeguimientoParaMovimiento`,
  que también exige la transacción activa) y L2 (`bloquearStock`) antes de cualquier otra cosa; el insumo
  inexistente da `InsumoNoEncontradoError` y uno que no es `SERIE` da `UnidadNoAdmitidaError`. Arma todas las
  entidades (unidad, movimiento, evento) y recién después escribe en el orden unidad, movimiento, evento
  (FK). `CantidadNoEnteraError` no aplica dentro del servicio: cada movimiento es de cantidad 1 por
  construcción; la validan los casos de uso que reciben una cantidad del usuario. Registrado en
  `insumos.module.ts` sin exportar.
- 4a.2: `ingresar()` valida serial vacío, serial repetido dentro del lote (normalizado) y motivo del ajuste
  positivo antes de escribir; devuelve `UnidadConMovimiento[]` en el orden de `piezas`.
- Specs: unitario con fakes que registran el orden de llamadas (`service.spec.ts`) e integración de lote
  (`operaciones-unidad-insumo.integration.spec.ts`): 3 piezas en una transacción y P2002 en la tercera que
  revierte las tres.
- Corte por tamaño (regla de la orquestación): parte 1 = contrato común + `ingresar`; parte 2 (rama `-2`) =
  `sacarDelDeposito`, sus specs, la concurrencia y la mutación adversarial de 4a.5.

## WU-4a parte 2 — `sacarDelDeposito`, concurrencia y mutación adversarial (4a.3 a 4a.6 hechas)

- 4a.3: `sacarDelDeposito()` toma L1, L2 y L3 (`bloquearPorIds` con los ids ordenados), valida por unidad (existe,
  es del insumo, condición pedida, transición de la entidad: `SALIDA` exige serial, `AJUSTE_NEGATIVO` admite
  pendiente) y recién después hace CAS + movimiento + evento. Un id repetido en el lote se rechaza con
  `UnidadNoDisponibleError`. El destino (`equipoId`, `sectorId`, `motivo`) queda en el movimiento.
- 4a.4: la parte unitaria cubre lote de N, fallo en la unidad 2 sin escribir la 1, unidad de otro insumo o
  inexistente, pendiente en SALIDA (rechazada) y en AJUSTE_NEGATIVO (admitida), condición que no coincide,
  motivo faltante del ajuste y orden L1, L2, L3 antes de la primera escritura.
- 4a.5: integración: un lote con una unidad ya entregada se devuelve como `Result.fail` y, aun confirmando la
  transacción, no escribe la válida; seis `sacarDelDeposito` simultáneos sobre la misma unidad dan una
  entrega y cinco `UnidadNoDisponibleError` (paralelismo instrumentado > 1 tras reiniciar el máximo).

### Mutación adversarial local de 4a.5 (revertida)

| Mutación | Resultado observado |
|---|---|
| Escribir cada unidad dentro del bucle de validación de `sacarDelDeposito` (antes de validar las siguientes) | ROJO: 6 tests (5 unitarios: "un fallo en la unidad 2 no escribe la 1", unidad de otro insumo o inexistente, pendiente en SALIDA, repetida o no `EN_DEPOSITO`, y el resultado de SALIDA; y la integración `movimientos: 4` en vez de 3) |

### Work Unit Evidence (WU-4a)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos`: 77 archivos, 1435 tests verdes |
| Full suite | `pnpm test`: 502 archivos, 6091 tests verdes |
| Rollback boundary | Revertir cada commit: archivos nuevos y un provider sin exportar en `insumos.module.ts` |

## WU-4b parte 1 — `devolverEntregas` (4b.1 hecha)

- 4b.1: `devolverEntregas(insumoId, unidadIds, { condicion })` toma L1, L2 y L3 (ids ordenados) y valida antes de
  escribir: unidad existente, del insumo, `ENTREGADA` (`UnidadNoDisponibleError` si no) e id no repetido. Escribe
  CAS desde `ENTREGADA`, ENTRADA de cantidad 1 en la condición elegida y evento `DEVOLUCION_DE_ENTREGA`. Con el
  insumo en `NINGUNO` devuelve `SeguimientoNoModificableError` (ADR-13) mediante un parámetro nuevo de
  `bloquearInsumo`. El servicio NO exige el insumo habilitado: la exención de G2 la decide el caso de uso (WU-8c).
- Corte por tamaño (regla de la orquestación), tres partes: parte 1 (esta) = `devolverEntregas`; parte 2 (rama `-2`)
  = `cargarSerial` y `corregirSerial` con su error nuevo; parte 3 (rama `-3`) = helper del invariante y su spec.

## WU-4b parte 2 — `cargarSerial` y `corregirSerial` (4b.2 hecha)

- 4b.2: ambas leen la unidad sin lock para conocer su insumo, toman L1 y L2 de ese insumo y releen con L3. Sin
  movimiento. `cargarSerial` asienta `SERIAL_CARGADO` (sin motivo); `corregirSerial` exige motivo (error nuevo
  `MotivoCorreccionSerialInvalidoError`, vacío o de más de 500) y rechaza `INSTALADA`; asienta `CORRECCION_SERIAL`.

## WU-4b parte 3 — helper del invariante (4b.3 a 4b.5 hechas)

- 4b.3: `insumos/testing/invariante-serie.ts`: `verificarInvarianteSerie` (función pura: conteo `EN_DEPOSITO` contra
  `calcularSaldos(libro)` por condición, y último evento que mueve el estado contra el estado de cada unidad;
  `SERIAL_CARGADO` y `CORRECCION_SERIAL` no mueven el estado) y `leerYVerificarInvarianteSerie` (lee los repos).
  El integration de devolución lo usa tras el lote.
- 4b.4: specs unitarios e integración de `devolverEntregas`, `cargarSerial` (pendiente y serial repetido) y
  `corregirSerial` (válida, sin motivo, a un serial existente, sobre `INSTALADA`); los `Result.fail` se prueban con
  commit posterior.

### Work Unit Evidence (WU-4b)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos` verde; `pnpm test`: 503 archivos, 6117 tests verdes |
| Rollback boundary | Revertir cada commit: sin migraciones ni cambios de módulo |

## WU-5 parte 1 — `instalar` (5.1 hecha)

- Corte por tamaño (regla de la orquestación), tres partes: parte 1 (rama `wu05`) = `instalar` con los helpers del lote
  (`leerLoteEnEquipo`, `bloquearInsumos`); parte 2 (rama `-2`) = `devolverAlDeposito` y `descartarInstaladas`; parte 3
  (rama `-3`) = `reinstalar`, `altaInstalada`, el error nuevo y el spec de orden de locks con la mutación adversarial.
- 5.1: `instalar(items, o)` admite un lote que abarca varios insumos: lee cada unidad sin lock solo para conocer su
  insumo, toma L1 de todos los insumos, L2 de todos, L3 de todas las unidades (ids ordenados) y recién entonces valida y
  escribe: CAS `EN_DEPOSITO → INSTALADA`, SALIDA de cantidad 1 con `equipoId` y evento `INSTALACION` con `equipoId` y
  `componenteId`. Una serie pendiente, una unidad repetida, inexistente o no `EN_DEPOSITO` se rechazan sin escribir nada
  del lote. `bloquearInsumo` pasó a delegar en `bloquearInsumos` (mismo orden L1, L2 para un insumo).

## WU-5 parte 2 — `devolverAlDeposito` y `descartarInstaladas` (5.2 hecha)

- 5.2: ambas reutilizan `leerLoteEnEquipo` (L1 y L2 de todos los insumos, L3 de todas las unidades) y exigen la unidad
  `INSTALADA` en el equipo del item (`UnidadNoDisponibleError` si está en otro equipo o en otro estado). El lote comparte
  un motivo. `devolverAlDeposito`: `INSTALADA → EN_DEPOSITO` USADO, ENTRADA USADO con `equipoId` y evento
  `RETIRO_A_DEPOSITO` (equipo y componente). `descartarInstaladas`: `INSTALADA → DESCARTADA` sin movimiento y evento
  `DESCARTE` (equipo y componente), el que `reinstalar` busca como último. Un fallo en cualquier unidad no escribe ninguna;
  el spec de integración lo prueba con commit posterior al `Result.fail` y verifica el invariante de serie tras la devolución.

## WU-5 parte 3 — `reinstalar`, `altaInstalada`, orden de locks (5.3 a 5.6 hechas)

- 5.3: `reinstalar(items, o)` usa el mismo lote (L1, L2, L3). Con un insumo que ya no es `SERIE` devuelve
  `SeguimientoNoModificableError`. Exige la unidad `DESCARTADA` y que el último evento de `listarPorUnidad` (leído bajo L3)
  sea el `DESCARTE` del mismo `componenteId`; si no, `UnidadDelComponenteNoDisponibleError`. Transición
  `DESCARTADA → INSTALADA` en el equipo del item, sin movimiento, evento `REACTIVACION`.
- 5.4: `altaInstalada(insumoId, numeroSerie, equipoId, o)` toma L1 y L2, crea la unidad `INSTALADA` con la condición
  indicada, sin movimiento, con evento `ALTA_INSTALADA` (equipo, componente y serial). El P2002 lo lanza el repositorio
  como `FalloOperacionDeUnidad` (`SerialDuplicadoError`).
- Desvío menor: `UnidadDelComponenteNoDisponibleError` ya existía en `equipos.errors.ts`, pero `insumos` no puede importar
  `equipos` (ciclo, mismo criterio que `ModeloEquipoInexistenteError`). Se duplicó en `unidades-insumo.errors.ts` con el
  mismo nombre y `code`; el caso de uso de reactivar (WU-11) la traduce por `code`.
- 5.5: specs unitarios de lote (N unidades, fallo en una no escribe ninguna, reinstalar tras recuperación o con otro
  componente, insumo vuelto a `NINGUNO`, alta con serial repetido) e integración con commit posterior a cada
  `Result.fail`. Dos clientes con lotes en orden opuesto: uno instala y el otro ve la unidad instalada, sin `40P01`. Spec de
  orden: un cliente externo tiene L3 de la unidad, el servicio queda esperando y un testigo comprueba que el advisory L2
  del insumo ya está tomado (`pg_try_advisory_xact_lock` devuelve `false`); espera acotada a 5 s.

### Mutación adversarial local de 5.5 (revertida)

| Mutación | Resultado observado |
|---|---|
| Tomar L3 (`bloquearPorIds`) ANTES de L1/L2 en `leerLoteEnEquipo` | ROJO: 3 tests. El de integración de orden (el testigo obtiene el advisory L2 con el servicio bloqueado en L3: `expected true to be false`) y 2 unitarios de orden de llamadas (`instalar` L1, L2, L3 y `reinstalar`). El spec de dos clientes en orden opuesto NO lo detecta (con L3 siempre en orden de id no hay ciclo), así que la detección la da el testigo de L2. |

### Work Unit Evidence (WU-5)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos`: 78 archivos, verdes en cada parte (1469, 1476 y el total final en el informe) |
| Rollback boundary | Revertir cada commit: sin migraciones ni cambios de módulo; `OperacionesUnidadInsumo` sigue sin llamadores |


## WU-6 — Cambio de seguimiento, L0 y LC en crear, guard en editar (6.1 a 6.5 hechas)

- 6.1: `CambiarSeguimientoInsumoUseCase` en `txRunner.run()`: lectura sin lock, L0 `leerParaUso` (al pasar a `SERIE`),
  L1 `bloquearParaCambioDeSeguimiento`, re-lectura W1 (`UnidadMedidaCambiadaError` si la unidad cambió, sin L0 nuevo),
  L2 `bloquearStock`, y recién entonces la entidad se relee y se cuentan saldo (`sumByTipo`) o unidades
  (`contarPorEstado`). Decide con `puedeCambiarSeguimiento` y escribe con `cambiarSeguimiento` (no-op si no cambia).
  Desvío menor respecto de ADR-3 paso 1: L0 se toma siempre que el destino es `SERIE` (también si el insumo ya lo era),
  para no depender de una lectura sin lock del seguimiento; es inocuo (mismo orden, `FOR SHARE`). Registrado en el módulo
  de Nest, sin borde HTTP.
- 6.2: `CrearInsumoUseCase` acepta `seguimiento`; dentro de `run()` toma L0 (`leerParaUso`) ANTES de `generarCodigo`
  (que toma LC) y rechaza `SERIE` con unidad no entera (`UnidadMedidaNoEnteraError`). `EditarInsumoUseCase` recibe
  `txRunner`; si `unidadMedidaId` cambia corre en transacción con L0 sobre la unidad destino y L1, y decide con el
  `seguimiento` de la lectura con L1 (`UnidadMedidaNoEnteraError` si es `SERIE` y la unidad no es entera).
- 6.3: specs unitarios del caso de uso nuevo (10) y casos nuevos en los specs de crear y editar; los mocks de unidades
  ganaron `leerParaUso`, y los de editar `bloquearParaCambioDeSeguimiento` y `txRunner`.
- 6.4: `orden-de-locks.concurrencia.integration.spec.ts` con los casos 1 y 2 (compuerta que retiene a la primera
  transacción con sus locks; `pg_blocking_pids` acotado a 5 s, sin bucles residuales) y dos TESTIGOS de orden: bloqueado
  en L1 el servicio NO tiene L2 (`pg_try_advisory_xact_lock` devuelve `true`), bloqueado en L0 NO tiene L1
  (`FOR NO KEY UPDATE NOWAIT` libre).

### Mutación adversarial local de 6.4 (revertida)

| Mutación | Resultado observado |
|---|---|
| `bloquearStock` (L2) ANTES de `bloquearParaCambioDeSeguimiento` (L1) | ROJO: el testigo de integración (`expected false to be true`: el servicio ya tenía L2 mientras esperaba L1) y 3 unitarios de orden. Los casos 1 y 2 (dos clientes) siguen verdes: no detectan la inversión, la detecta el testigo. |

### Work Unit Evidence (WU-6)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos`: 80 archivos, 1508 tests verdes |
| Rollback boundary | Revertir el commit: el caso de uso nuevo no tiene borde HTTP; `CrearInsumoUseCase` y `EditarInsumoUseCase` vuelven a su firma anterior |


## WU-7a — Entrada y ajuste positivo por serie, devolución de componente (partido en tres ramas)

Rama `wu07a` (7a.1):

- `RegistrarEntradaInsumoUseCase` siempre corre en `txRunner.run()` (re-entrante). Primer lock: L1
  `leerSeguimientoParaMovimiento` (`null` => `InsumoNoEncontradoError`); el `seguimiento` de esa lectura decide la
  rama. `NINGUNO`: como hoy (un INSERT, sin L2) y `seriales` => `UnidadNoAdmitidaError`. `SERIE`: `ingresarPorSerie`
  (nuevo, `application/services/ingresar-por-serie.ts`, compartido con el ajuste): cantidad entera
  (`CantidadNoEnteraError`), `seriales.length === cantidad` salvo `completarConPendientes` (rellena con `null`, ADR-6;
  opción interna, no está en el DTO HTTP), y delega en `OperacionesUnidadInsumo.ingresar`. El `FalloOperacionDeUnidad`
  (P2002) se desenvuelve afuera del `run()`.
- Constructor nuevo: `(insumoRepo, movimientoRepo, familiaRepo, txRunner, operaciones)`. Cableado en `insumos.module.ts`.
- `execute()` devuelve el PRIMER movimiento (contrato de `Result<MovimientoInsumoEntity>` intacto para el controller y la
  recepción); con `SERIE` y N piezas los demás quedan en la bitácora. Lo amplía WU-8a (respuestas del borde).
- Helpers de test nuevos: `insumos/testing/tx-runner-fake.ts` y `insumos/testing/entrada-insumo-real.ts` (la entrada con
  colaboradores Prisma reales, para los specs de integración de compras y equipos).

Rama `wu07a-2` (7a.2):

- `RegistrarAjusteInsumoUseCase` lee L1 (`leerSeguimientoParaMovimiento`) como primer lock dentro del `run()` (las
  validaciones sin lock y el armado del asiento siguen antes, como hoy). `SERIE` + `AJUSTE_POSITIVO` => `ingresarPorSerie`
  con `tipo: 'AJUSTE_POSITIVO'` (el motivo lo sigue exigiendo la entidad, antes de entrar); `NINGUNO` con `seriales` =>
  `UnidadNoAdmitidaError`. El ajuste NEGATIVO no cambia: su rama `SERIE` es de WU-7b. Constructor nuevo: 5to argumento
  `operaciones`. P2002 desenvuelto afuera del `run()`.

Rama `wu07a-3` (7a.3 a 7a.5):

- `registrarDevolucionDeComponente` corre en `txRunner.run()` (re-entrante: el retiro ya tiene la suya) con L1 primero.
  Suma `unidadId?`, `componenteId?` (obligatorio con `unidadId`: lo necesita el evento `RETIRO_A_DEPOSITO`) y
  `numeroSerie?`. Con unidad => `operaciones.devolverAlDeposito`; componente legado de un insumo hoy `SERIE` =>
  `numeroSerie` obligatorio e `ingresar` USADO con `equipoId`, y sin serial (ausente o en blanco) =>
  `SerialRequeridoError` sin cambiar nada; `NINGUNO` como hoy. La exención de G2 (insumo deshabilitado) vive solo acá:
  nunca se pide `exigirHabilitado`, y la entrada manual sigue rechazando el insumo deshabilitado (test de entrada SERIE).
  `RetirarComponenteUseCase` todavía NO pasa `unidadId`/`componenteId`/`numeroSerie` (el componente no tiene `unidadId`
  hasta WU-10/11): queda para el WU de equipos.

### Work Unit Evidence (WU-7a)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos src/compras src/equipos` verde en cada rama; `pnpm lint` y `pnpm typecheck` en cero |
| Rollback boundary | Revertir cada commit por separado (el de 7a.3 no depende de 7a.2): sin migraciones ni borde HTTP |


## WU-7a2 — Casos 3 a 5 de `orden-de-locks` (rama `wu07a2`)

Solo specs, en `orden-de-locks.concurrencia.integration.spec.ts` (base `soporte_tenant_test`, prefijo por corrida):

- Caso 3 (`SERIE -> NINGUNO` contra entrada `SERIE` retenida), caso 4 (`NINGUNO -> SERIE` contra entrada `NINGUNO`
  retenida), casos 5a y 5b (el cambio comitea primero; la entrada da `SerialesNoCoincidenError` /
  `UnidadNoAdmitidaError`). Helper `retenerYEsperar`: primera operacion retenida con outer `txRunner.run` + compuerta,
  segunda lanzada y confirmada bloqueada con `pg_blocking_pids` acotado.
- Testigos nuevos de la entrada (SERIE y NINGUNO): mientras espera L1 el try-lock de L2 del testigo se obtiene.
- Limpieza de eventos/movimientos/unidades del insumo en `beforeEach`/`afterAll` (FK `Restrict`).

### Mutacion adversarial (7a2.2)

- Entrada toma L2 antes que L1 (`bloquearStock` antes de `leerSeguimientoParaMovimiento`): casos 3 a 5 siguen VERDES
  (el orden de los pedidos no cierra ciclo, sin `40P01`); los 2 testigos de la entrada se ponen ROJOS
  (`expected false to be true`). Revertida.
- Cambio toma L2 antes que L1: rojo el testigo previo de WU-6 ("mientras espera L1 ... NO tiene L2"). Revertida.

### Work Unit Evidence (WU-7a2)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos/infrastructure/persistence/prisma/orden-de-locks.concurrencia.integration.spec.ts` 10/10; lint y typecheck en cero |
| Rollback boundary | Revertir el commit: solo specs |


## WU-7b — Salida y ajuste negativo con L1, consulta `SERIE`, invariante, caso 6 (rama `wu07b`)

- `RegistrarSalidaInsumoUseCase(insumoRepo, movimientoRepo, txRunner, familiaRepo, operaciones)` y rama negativa del
  ajuste: primer lock L1 (`leerSeguimientoParaMovimiento`) dentro de la transaccion. `NINGUNO`: como hoy, `unidadId` =>
  `UnidadNoAdmitidaError`. `SERIE`: `unidadId` obligatorio (`UnidadRequeridaError`), cantidad 1 (si no,
  `SerialesNoCoincidenError(cantidad, 1)`), `sacarDelDeposito` (`SALIDA` => `ENTREGADA`; `AJUSTE_NEGATIVO` => `DESCARTADA`,
  admite pendiente). Un `AJUSTE_POSITIVO` SERIE con `unidadId` => `UnidadNoAdmitidaError`. Sin comparar saldo.
- `ConsultarStockInsumoUseCase(insumoRepo, movimientoRepo, familiaRepo, unidadRepo)`: unico lector que ramifica;
  `StockDeInsumo` suma `seguimiento` y `pendientesDeSerie` (la respuesta HTTP NO los expone todavia: WU-8).
- Helpers de test: `insumos/testing/operaciones-unidad-real.ts` (servicio con repos Prisma) y
  `operaciones-unidad-en-memoria.ts` (servicio REAL sobre unidades en memoria, para specs unitarios).
  Call sites de `RegistrarSalidaInsumoUseCase` en specs de equipos/insumos actualizados.
- Specs: unitarios de salida/ajuste/consulta; `invariante-serie.integration.spec.ts` (secuencia con invariante tras
  cada paso, dos salidas de la misma unidad, salida rechazada conserva L3); `orden-de-locks` casos 6a/6b y testigos
  "sin L2 mientras espera L1" para salida y ajuste negativo (NINGUNO y SERIE).
- La recuperacion (ADR-14) no esta en la secuencia: se agrega en WU-8d.

### Mutaciones adversariales (7b.5), todas revertidas

- (a) `contarEnDepositoPorCondicion` cuenta tambien `ENTREGADA`: ROJOS la secuencia y la concurrencia de `invariante-serie`.
- (b) `SALIDA` deja `DESCARTADA` (`descartarDeDeposito` en vez de `entregar`): ROJOS invariante (2) y 2 unitarios de salida.
- (c) `bloquearPorIds` sin `FOR NO KEY UPDATE`: ROJO solo "salida rechazada conserva L3"; las dos salidas concurrentes de la
  misma unidad siguen VERDES porque L2 (advisory por insumo) ya las serializa y el CAS es el respaldo: el lock de fila L3
  solo se observa con un testigo NOWAIT sobre la fila.
- (d) salida toma L2 antes que L1: ROJOS los testigos de salida (NINGUNO y SERIE).

### Work Unit Evidence (WU-7b)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/insumos src/equipos src/compras`; `pnpm lint`; `pnpm typecheck` |
| Runtime harness | `invariante-serie.integration.spec.ts` y `orden-de-locks.concurrencia.integration.spec.ts` sobre `soporte_tenant_test` |
| Rollback boundary | Revertir el commit: casos de uso, wiring del modulo y specs; sin migraciones ni borde HTTP |

## WU-8a — Borde de movimientos (parte 1 de 2: DTOs, respuestas y lectura del serial)

Rama `feat/repuestos-numero-de-serie-wu08a`. Tarea 8a.1 hecha; 8a.2-8a.4 en `wu08a-2`.

- `RegistrarMovimientoInsumoHttpDto`: `seriales?` (`@ArrayMaxSize(100)`, recorte por elemento, `@EsSerialDeUnidad({each})`) y
  `unidadId?` (`@IsUUID`). El validador nuevo (`interface/validators/es-serial-de-unidad.ts`) mide el largo recortado Y el
  NORMALIZADO (1..255): `'ß'.repeat(128)` normaliza a 256 y es 400, no el 500 del `throw` de la entidad (carry-over WU-8).
- `MovimientoInsumoResponseDto` suma `unidadId` y `numeroSerie`; `StockInsumoResponseDto` suma `seguimiento` y
  `pendientesDeSerie`. `MovimientoInsumoEntity.numeroSerie` es un atributo de LECTURA (no es columna): lo completa
  `reconstitute()` desde `include: { unidad: { select: { numeroSerie } } }` en `insert()` y `listarPorInsumo()` del repositorio
  (`INCLUIR_SERIAL_DE_LA_UNIDAD`). Es el serial VIGENTE de la unidad (una correccion posterior lo cambia en el historial).
- `executeTodos()` en `RegistrarEntradaInsumoUseCase` y `RegistrarAjusteInsumoUseCase` devuelve TODOS los movimientos (uno por
  unidad en SERIE); `execute()` delega y conserva el primero, asi que recepcion/equipos no cambian.
- Respuesta ampliada (decision): `MovimientosRegistradosResponseDto` = el PRIMER asiento con su forma de siempre mas
  `movimientos: MovimientoInsumoResponseDto[]` con todos. Compatible con el frontend actual, que lee el objeto plano.

## WU-8a — Borde de movimientos (parte 2 de 2: controller y e2e)

Rama `feat/repuestos-numero-de-serie-wu08a-2`. Tareas 8a.2, 8a.3 y 8a.4 hechas.

- `toHttpExceptionMovimiento` (exportada de `movimientos-insumo.controller.ts`): 409 para `SerialDuplicadoError` y
  `UnidadMedidaCambiadaError`; 404 para `UnidadNoEncontradaError`; 422 explicito para `UnidadNoAdmitida`, `UnidadRequerida`,
  `UnidadNoDisponible`, `SerialesNoCoinciden`, `SerialRequerido`, `CantidadNoEntera`, `SeguimientoNoModificable`,
  `UnidadMedidaNoEntera`, `UnidadMedidaEnUsoPorSerie`, `MotivoCorreccionSerialInvalido`, `MotivoRecuperacionRequerido` y
  `UnidadDelComponenteNoDisponible`; el resto cae en `toHttpException`. Decoradores de permiso sin cambio.
- Entrada y ajuste llaman `executeTodos()` y responden `MovimientosRegistradosResponseDto`. La entrada rechaza `unidadId` y la
  salida rechaza `seriales` con 422 (`UnidadNoAdmitidaError`) en el controller: sus casos de uso no tienen esos campos.
- Ningun spec de insumos enumera las clases de error (no hay `CLASES_DE_ERROR` en este modulo): no hubo conteo que actualizar;
  el mapeo se prueba con una tabla en `movimientos-insumo.controller.spec.ts`.
- e2e `movimientos-insumo-serie.e2e.spec.ts` (`usarLockMasterTest()`): prepara el insumo SERIE por SQL (`unidades_medida.entera`
  y `insumos.seguimiento`); cubre entrada con seriales (todos los movimientos), salida con `unidadId`, ajuste negativo, 403,
  409, 422 por error, 400 por largo normalizado/maximo/uuid y `NINGUNO` rechazando `seriales` y `unidadId`. Higiene:
  TRUNCATE de filas -> `app.close()` -> `dropDatabase`.

## WU-8b — Borde de unidades (parte 1 de 2: lecturas)

Rama `feat/repuestos-numero-de-serie-wu08b`. Las tareas 8b.1 a 8b.4 se marcan al cerrar la parte 2 (escrituras).

- `ListarUnidadesInsumoUseCase` (`estado`, `disponibles=true` = `EN_DEPOSITO` con serial; con `estado=EN_DEPOSITO` las pendientes
  se incluyen) y `ConsultarHistorialUnidadUseCase` (cronologico; lee `sector_id`, `equipo_id` y `motivo` del movimiento
  referenciado por `movimientoId`, sin copiarlos al evento; el motivo propio del evento gana si existe).
- Puertos: `IMovimientoInsumoRepository.listarPorIds(ids)` (con el serial de la unidad) e
  `IUnidadInsumoRepository.nombresDeEquipos/nombresDeSectores(ids)` (lecturas de presentacion, sin lock, mapa id -> nombre).
  Decision: el nombre del equipo y del sector se resuelve en infraestructura (misma base del tenant) para no importar `equipos`.
- `UnidadesInsumoController` (`insumos/:insumoId/unidades`): `GET` y `GET :unidadId/historial`, ambos `INSUMOS:LECTURA`, errores
  por `toHttpExceptionMovimiento`. La unidad de otro insumo es 404 (no se distingue de la inexistente).
- e2e `unidades-insumo.e2e.spec.ts` (`usarLockMasterTest()`): listar y filtrar, historial de vida completa (eventos de
  instalacion sembrados por SQL hasta WU-10/11), descartada, entregada con sector, sin historia, 404 ajena y 403.

## WU-8b — Borde de unidades (parte 2 de 2: escrituras)

Rama `feat/repuestos-numero-de-serie-wu08b-2`. Tareas 8b.1 a 8b.4 hechas.

- `CargarSerialUnidadUseCase` y `CorregirSerialUnidadUseCase`: dentro de `txRunner.run()` leen la unidad sin lock (solo para
  verificar que es del insumo de la URL: si no, `UnidadNoEncontradaError` 404) y delegan en `OperacionesUnidadInsumo`, cuya
  primera lectura es L1 y sigue L2 y L3 (ADR-12). `FalloOperacionDeUnidad` (P2002) se desenvuelve AFUERA del `run()` como
  `SerialDuplicadoError` (409). Reciben `Pick<ITenantTransactionRunner, 'run'>`.
- DTOs: `numeroSerie` con `@Transform` (trim) + `@EsSerialDeUnidad` (400 por largo recortado o normalizado, 1..255);
  `motivo` de la correccion opcional en el borde (`transformarMotivo`, `@MaxLength(500)`) para que la regla la haga cumplir el
  servicio: sin motivo o en blanco es `MotivoCorreccionSerialInvalidoError` (422), no un 400.
- Rutas: `POST …/unidades/:unidadId/serial` (`INSUMOS:ALTAS`) y `POST …/unidades/:unidadId/correccion-serial`
  (`INSUMOS:AJUSTAR`), ambas 201 con `UnidadInsumoResponseDto`; `usuarioId` del JWT.
- e2e (mismo archivo): carga valida y repetida (409), ya con serial (422), 400 por largo normalizado y vacio; correccion valida
  (evento con anterior, nuevo y motivo), sin motivo (422), a un serial existente (409), sobre instalada (422); 403 por ruta.

## WU-8c — Devolución de entrega (F2, ADR-13)

Rama `feat/repuestos-numero-de-serie-wu08c`. Parte 1 de 2 (caso de uso). Tareas 8c.1 y 8c.2 hechas; 8c.3 y 8c.4 al cerrar la parte 2 (ruta y e2e).

- `DevolverEntregaUseCase(insumoRepo, unidadRepo, familiaRepo, txRunner, operaciones)`: dentro de una transacción lee L1
  (`leerSeguimientoParaMovimiento`), verifica que la unidad sea del insumo de la URL (si no, `UnidadNoEncontradaError` 404),
  aplica la exención de G2 (`validarInsumoElegible` sin `exigirHabilitado`; `validarCondicionAdmitida` con
  `admitirFamiliaNoVigente: true`) y delega en `operaciones.devolverEntregas` (L2, L3, ENTRADA de 1 y evento
  `DEVOLUCION_DE_ENTREGA`). Devuelve el `MovimientoInsumoEntity`. `FalloOperacionDeUnidad` se desenvuelve afuera del `run()`.
- La exención vive solo acá: un spec prueba que la entrada manual (insumo deshabilitado, USADO con familia no vigente) y el
  ajuste positivo manual (USADO con familia no vigente) siguen rechazando.
- Registrado en `insumos.module.ts` (sin exportar); la ruta llega en la parte 2.

### WU-8c — parte 2 de 2 (ruta y e2e)

Rama `feat/repuestos-numero-de-serie-wu08c-2`. Tareas 8c.3 y 8c.4 hechas (8c.1 a 8c.4 completas).

- Ruta `POST /insumos/:insumoId/unidades/:unidadId/devolucion-entrega` (`INSUMOS:ALTAS`, 201, `MovimientoInsumoResponseDto`) en
  `UnidadesInsumoController`; body `DevolverEntregaHttpDto` `{ condicion, motivo? }` (400 por condición fuera de NUEVO/USADO).
- e2e ampliado en `unidades-insumo.e2e.spec.ts` (mismo arnés; `sembrarInsumo` acepta `repuesto`): NUEVO, USADO, G2 (insumo y
  familia deshabilitados), guards 422, insumo dado de baja 404, 400, 404 de unidad ajena, 403, e historial con
  `DEVOLUCION_DE_ENTREGA`.

## WU-8d - Recuperar pieza descartada (G1, ADR-14)

Rama `feat/repuestos-numero-de-serie-wu08d`. Parte 1 de 2 (servicio). Tareas 8d.1 y 8d.3 hechas; 8d.2, 8d.4 y 8d.5 al cerrar la parte 2.

- `OperacionesUnidadInsumo.recuperarDescartadas(insumoId, unidadIds, {usuarioId, motivo?, condicion})`: `DESCARTADA -> EN_DEPOSITO`
  (serial o pendiente; una pendiente vuelve pendiente), ENTRADA de 1 en la condicion elegida y evento `RECUPERACION`. Comparte
  el cuerpo con `devolverEntregas` mediante el privado `restituirAlDeposito` (mismo orden L1, L2, L3). No reevalua unicidad.
- `invariante-serie.integration.spec.ts`: la secuencia cierra con la recuperacion de una descartada con serial (USADO) y de
  la pendiente dada de baja (vuelve pendiente); el invariante y la consulta de stock se verifican tras cada paso.
- Mutacion adversarial (8d.3): omitir la ENTRADA de la recuperacion (evento sin movimiento) dejo la secuencia en rojo con
  "USADO: hay 2 unidades EN_DEPOSITO y el libro da saldo 1."; revertida y verde.

### WU-8d - parte 2 de 2 (caso de uso, ruta y e2e)

Rama `feat/repuestos-numero-de-serie-wu08d-2`. Tareas 8d.2, 8d.4 y 8d.5 hechas (8d.1 a 8d.5 completas).

- `RecuperarUnidadDescartadaUseCase(insumoRepo, unidadRepo, familiaRepo, txRunner, operaciones)`: copia la forma de
  `DevolverEntregaUseCase` (L1 -> 404 de unidad ajena -> motivo obligatorio -> exencion G2 -> `operaciones.recuperarDescartadas`);
  `FalloOperacionDeUnidad` se desenvuelve afuera del `run()`. Motivo vacio, en blanco o de mas de 500 es
  `MotivoRecuperacionRequeridoError` (422). Registrado en `insumos.module.ts` (sin exportar).
- Ruta `POST /insumos/:insumoId/unidades/:unidadId/recuperacion` (`INSUMOS:AJUSTAR`, 201, `MovimientoInsumoResponseDto`) con
  `RecuperarUnidadDescartadaHttpDto` `{condicion, motivo?}`: el motivo es opcional en el borde (400 solo por mas de 500) para que
  la regla la haga cumplir el caso de uso con 422.
- e2e en `unidades-insumo.e2e.spec.ts` (mismo arnes): NUEVO, USADO desde un equipo, pendiente, G2, 422 por motivo y por guards,
  404 de insumo dado de baja y de unidad ajena, 400, 403 sin `AJUSTAR`, e historial con `RECUPERACION`.
- Ayuda: `permisos-y-roles.md` corregido (fila de la tabla y parrafo de `AJUSTAR`: ya no es "la unica operacion"; cubre tambien
  corregir un serial y recuperar una pieza). Deuda de UI en WU-16b.

## WU-9 - Recepcion de compra `SERIE` (compras)

Rama `feat/repuestos-numero-de-serie-wu09`. Parte 1 de 2 (codigo y tests unitarios). Tareas 9.1 y 9.2 hechas; 9.3 (e2e) y 9.4 en la parte 2.

- `RegistrarRecepcionDeItemHttpDto.seriales?` (`@ArrayMaxSize(100)`, `transformarSeriales` + `@EsSerialDeUnidad({each})`:
  largo recortado y normalizado 1..255, 400 si no). `RegistrarRecepcionDeItemDto.seriales?` viaja a la entrada junto con
  `completarConPendientes: true`; sin `seriales` no se manda la clave (un insumo `NINGUNO` rechazaria `[]`).
- La validacion de delta entero (`CantidadNoEnteraError`) y `seriales.length <= delta` (`SerialesNoCoincidenError`) la hace la
  entrada (`ingresarPorSerie`), dentro de la misma transaccion; el use case de recepcion ya LANZA ante `isFail` (`FalloEntradaDeStock`),
  asi que cualquier fallo (incluido un `P2002` anidado) revierte acumulado, bitacora y unidades. Delta cero no llama a la entrada.
- Controller: `toHttpException` mapea `SerialDuplicadoError` a 409 y lista `UnidadNoAdmitida`, `SerialesNoCoinciden` y
  `CantidadNoEntera` como 422 (se importan las clases de insumos; no se importa `toHttpExceptionMovimiento` para no arrastrar el
  controller de insumos ni cambiar el mapeo de `InsumoNoEncontradoError` a 422). El catalogo de errores de compras no cambia.
- Tests: unit (pasa seriales, sin seriales, delta cero, duplicado revierte), DTO (7 casos) y controller (mapeo).
- Ayuda: sin cambios (la recepcion sigue subiendo por delta); deuda de UI en WU-18.
