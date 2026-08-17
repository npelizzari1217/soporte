-- WU-02 (sdd/compras-tres-etapas-y-sectores, FASE 1, M0).
--
-- Cierra el riesgo de `findActive()` no determinístico (ADR-T8, design):
-- `findFirst({ where: { activo: true, deletedAt: null } })` sin `orderBy` sobre
-- un modelo sin constraint de unicidad podía devolver cualquiera de dos ciclos
-- activos simultáneos, cambiando entre requests sin ningún error visible.
--
-- Índice único PARCIAL: solo aplica sobre filas con activo=true Y deleted_at
-- IS NULL. Vuelve imposible por construcción tener dos ciclos activos y no
-- soft-deleted al mismo tiempo, para CUALQUIER camino de escritura (Prisma
-- typed, $executeRaw, o SQL crudo por fuera de la app).
--
-- Compatible con PrismaCicloClienteRepository.activarCiclo()
-- (src/clientes/.../prisma-ciclo-cliente.repository.ts): esa transacción
-- desactiva el resto ANTES de activar el objetivo, así que nunca hay un
-- instante con 2 filas activas dentro de la misma transacción.
--
-- Sin CONCURRENTLY: Prisma envuelve el archivo de migración en una
-- transacción y CREATE INDEX CONCURRENTLY no puede correr dentro de una. La
-- tabla tiene un puñado de filas por tenant — el lock de un CREATE INDEX
-- normal es aceptable acá.
CREATE UNIQUE INDEX "ciclos_cliente_unico_activo_idx"
  ON "ciclos_cliente" ("activo")
  WHERE "activo" = true AND "deleted_at" IS NULL;
