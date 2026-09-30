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

