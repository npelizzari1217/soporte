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
