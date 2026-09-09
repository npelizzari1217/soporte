-- issue #135: el preventivo dejó de reusar el tipo MANTENIMIENTO (EDILICIA)
-- y pasa a tener su propio tipo PREVENTIVO, para que sus tickets queden
-- afuera de la métrica `cumplimientoSla` del dashboard.
--
-- El seeder de tenants (`TenantSeederAdapter`) solo siembra este tipo al
-- provisionar un tenant NUEVO. Los tenants YA EXISTENTES no se regeneran, así
-- que esta migración inserta la fila para que el barrido de preventivo no
-- rompa contra el catálogo de un tenant migrado (el throw defensivo de
-- `GenerarPreventivosUseCase` se llevaría puesto el barrido completo del
-- tenant si el tipo no existe).
--
-- `modulo = 'EDILICIA'`: mismo módulo que ya usaba MANTENIMIENTO (que el
-- preventivo reusaba antes) — evita cambiar routing o permisos.
--
-- Idempotente (INSERT ... ON CONFLICT (codigo) DO NOTHING, `codigo` es
-- @unique en el schema) — correr esta migración más de una vez no duplica la
-- fila. NO se corrige ningún ticket ya generado (decisión del dueño): el
-- arreglo aplica solo a los tickets creados a partir de esta migración.
INSERT INTO "tipos_ticket" ("id", "codigo", "nombre", "modulo", "activo", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'PREVENTIVO', 'Preventivo', 'EDILICIA', true, now(), now())
ON CONFLICT ("codigo") DO NOTHING;
