-- Migration: add_estados_suspendido_sin_solucion
-- Change: tickets-maquina-estados-observaciones / PR1
-- Ref spec: Delta "Tabla estados" (tickets-core/spec.md), ADR-7
--
-- Agrega SUSPENDIDO (c0...009, orden 45) y SIN_SOLUCION (c0...00a, orden 55)
-- al catálogo de estados del tenant.
--
-- Idempotente: ON CONFLICT (codigo) DO NOTHING.
-- Segura para correr en TODAS las tenant DBs (incluyendo las ya existentes).

INSERT INTO estados (id, codigo, nombre, orden) VALUES
  ('c0000000-0000-4000-c000-000000000009', 'SUSPENDIDO',   'Suspendido',    45),
  ('c0000000-0000-4000-c000-00000000000a', 'SIN_SOLUCION', 'Sin solución',  55)
ON CONFLICT (codigo) DO NOTHING;
