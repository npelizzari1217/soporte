-- Zona horaria operativa del tenant (sdd/zona-horaria-por-tenant, D1, D8).
-- Gobierna SLA, vencimientos, validación de fechas de dominio, CSV y prefill
-- de calendario (ver `shared/domain/zona-horaria.ts`).
--
-- `NOT NULL DEFAULT` en un solo statement: Postgres backfillea las filas
-- existentes con el default en la misma operación, sin dejar una ventana con
-- NULL observable (D8). Los 2 tenants activos de producción son argentinos,
-- así que el default es un valor verdadero para ellos, no una suposición.
--
-- Este DEFAULT es SOLO el backfill de lo que ya existe. El alta de un
-- cliente NUEVO exige la zona explícita en `CreateClienteDto` — el use case
-- nunca confía en el default de la columna (decisión "Zona de un cliente
-- NUEVO: se exige explícita en el alta, no se defaultea a Buenos Aires").
ALTER TABLE "clientes"
  ADD COLUMN "zona_horaria" VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';
