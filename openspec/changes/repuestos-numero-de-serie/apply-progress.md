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
