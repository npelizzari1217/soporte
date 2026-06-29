-- Change: tickets-maquina-estados-observaciones / PR2
-- Agrega el tipo de operacion OBSERVACION al catálogo del tenant.
-- Idempotente: ON CONFLICT (codigo) DO NOTHING.
-- Ref spec: Delta Tabla tipo_operacion (tickets-core), ADR-7
-- Task: P2.T1

INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000009', 'OBSERVACION', 'Observación técnica')
ON CONFLICT (codigo) DO NOTHING;
