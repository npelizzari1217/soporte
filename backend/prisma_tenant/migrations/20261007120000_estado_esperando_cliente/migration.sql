-- Estado "Esperando al cliente" (roadmap segunda etapa, punto 6; M1 del ciclo
-- sla-primera-respuesta-y-pausa).
--
-- Se suma al catálogo fijo `estados` de los tenants ya provisionados (los nuevos lo
-- reciben del seeder). `orden` 35 lo ubica entre EN_PROCESO (30) y RESUELTO (40).
-- Idempotente: `codigo` es UNIQUE, reaplicar no duplica la fila.
INSERT INTO "estados" ("codigo", "nombre", "orden", "activo", "updated_at")
VALUES ('ESPERANDO_CLIENTE', 'Esperando al cliente', 35, true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;
