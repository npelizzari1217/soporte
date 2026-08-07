-- Backfill 5.2: asigna los 4 módulos a TODAS las membresías activas existentes,
-- para que la introducción del eje "módulos por usuario" no bloquee a nadie.
-- Idempotente: ON CONFLICT sobre el unique (usuario_id, cliente_id, modulo) → DO NOTHING.
-- El admin luego restringe desde Admin > Usuarios. ROOT/ADMINISTRADOR no dependen de esta tabla.
INSERT INTO usuario_cliente_modulos (usuario_id, cliente_id, modulo)
SELECT DISTINCT m.usuario_id, m.cliente_id, mod.modulo
FROM membresias m
CROSS JOIN (VALUES ('SOPORTE'), ('COMPRAS'), ('EDILICIA'), ('EQUIPOS')) AS mod(modulo)
WHERE m.activo = true
  AND m.deleted_at IS NULL
ON CONFLICT (usuario_id, cliente_id, modulo) DO NOTHING;
