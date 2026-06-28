/**
 * Seed de catálogos TENANT — tarea 3.D.4
 *
 * Siembra los catálogos operativos base en una DB tenant concreta.
 * Se ejecuta durante el provisioning de cada tenant nuevo.
 *
 * Idempotente: cada tabla usa ON CONFLICT (codigo) DO NOTHING.
 * Si el seed ya fue ejecutado, volver a correrlo no produce duplicados ni errores.
 *
 * Catálogos sembrados (verbatim del spec tickets-core):
 *   estados         — 8 estados del ciclo de vida del ticket
 *   prioridades     — 4 niveles operativos (BAJA, MEDIA, ALTA, CRITICA)
 *   tipos_ticket    — 3 discriminadores de flujo (SOPORTE, COMPRAS, EDILICIA)
 *   tipo_operacion  — 5 tipos de evento del timeline
 *
 * Conexión: DATABASE_URL_TENANT del entorno (apunta a la DB tenant a sembrar).
 * En fan-out de provisioning, el proceso externo sobreescribe DATABASE_URL_TENANT
 * por cada tenant y ejecuta este script individualmente.
 *
 * Uso:
 *   pnpm run seed:tenant
 *   DATABASE_URL_TENANT=postgresql://... pnpm run seed:tenant
 *
 * Decisión de UUIDs:
 *   Cada catálogo usa UUIDs deterministas con prefijo fijo (c0..., d0..., e0..., f0...).
 *   Mismo patrón que el master RBAC seed (PR-07): estabilidad cross-environment.
 *   La clave de idempotencia es el UNIQUE ON codigo, no el UUID.
 *
 * Nota sobre nombres:
 *   El spec tickets-core define codigos y ordenes de todos los catálogos, y los `nombre`
 *   de `estados` (sección "Seeds obligatorios"). Los `nombre` de prioridades, tipos_ticket
 *   y tipo_operacion NO están en el spec: son etiquetas en español inferidas del codigo,
 *   ratificadas por el usuario (display labels, cambiables). Ver decisión PR-09 en engram.
 *   El campo `color` (nullable) queda diferido a la UI de frontend.
 */

import { Pool } from 'pg';

// Node 22+: carga .env sin dependencias. En CI/prod las env vars ya están en
// el entorno real, por eso el try/catch (no hay archivo .env y no debe fallar).
try {
  process.loadEnvFile();
} catch {
  // .env ausente — se usan las variables del entorno.
}

// ─── Conexión ─────────────────────────────────────────────────────────────────

const url = process.env.DATABASE_URL_TENANT;
if (!url) {
  console.error('ERROR: DATABASE_URL_TENANT no está definida.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

// ─── Seed SQL ─────────────────────────────────────────────────────────────────

// ─ estados (8 valores base — spec tickets-core tabla estados) ─────────────────
//
// Codigos, ordenes y nombres: SPEC-EXPLICIT (tabla "Seeds obligatorios" del spec).
// color: omitido (nullable en schema, no definido en spec).
// UUIDs: fijos deterministas prefijo c0 para estabilidad cross-env.
//
const SEED_ESTADOS_SQL = `
INSERT INTO estados (id, codigo, nombre, orden) VALUES
  ('c0000000-0000-4000-c000-000000000001', 'ABIERTO',               'Abierto',                  10),
  ('c0000000-0000-4000-c000-000000000002', 'PENDIENTE_APROBACION',  'Pendiente de aprobación',  20),
  ('c0000000-0000-4000-c000-000000000003', 'APROBADO',              'Aprobado',                 30),
  ('c0000000-0000-4000-c000-000000000004', 'RECHAZADO',             'Rechazado',                35),
  ('c0000000-0000-4000-c000-000000000005', 'EN_PROGRESO',           'En progreso',              40),
  ('c0000000-0000-4000-c000-000000000006', 'RESUELTO',              'Resuelto',                 50),
  ('c0000000-0000-4000-c000-000000000007', 'CERRADO',               'Cerrado',                  60),
  ('c0000000-0000-4000-c000-000000000008', 'CANCELADO',             'Cancelado',                70)
ON CONFLICT (codigo) DO NOTHING;
`;

// ─ prioridades (4 niveles — spec tickets-core tabla prioridades) ──────────────
//
// Codigos y ordenes: SPEC-EXPLICIT.
// Nombres: INFERRED — no definidos en el spec.
// color: omitido (nullable).
// UUIDs: prefijo d0.
//
const SEED_PRIORIDADES_SQL = `
INSERT INTO prioridades (id, codigo, nombre, orden) VALUES
  ('d0000000-0000-4000-d000-000000000001', 'BAJA',    'Baja',    10),
  ('d0000000-0000-4000-d000-000000000002', 'MEDIA',   'Media',   20),
  ('d0000000-0000-4000-d000-000000000003', 'ALTA',    'Alta',    30),
  ('d0000000-0000-4000-d000-000000000004', 'CRITICA', 'Crítica', 40)
ON CONFLICT (codigo) DO NOTHING;
`;

// ─ tipos_ticket (3 discriminadores — spec tickets-core tabla tipos_ticket) ─────
//
// Codigos: SPEC-EXPLICIT (CHECK constraint en migration SQL también los restringe).
// Nombres: INFERRED.
// UUIDs: prefijo e0.
//
const SEED_TIPOS_TICKET_SQL = `
INSERT INTO tipos_ticket (id, codigo, nombre) VALUES
  ('e0000000-0000-4000-e000-000000000001', 'SOPORTE',  'Soporte'),
  ('e0000000-0000-4000-e000-000000000002', 'COMPRAS',  'Compras'),
  ('e0000000-0000-4000-e000-000000000003', 'EDILICIA', 'Edilicia')
ON CONFLICT (codigo) DO NOTHING;
`;

// ─ tipo_operacion (6 tipos — spec tickets-core + reparaciones PR-15a) ──────────
//
// Codigos: SPEC-EXPLICIT (5 base) + UBICACION_ELIMINADA (Reparaciones, PR-15a).
// Nombres: INFERRED.
// UUIDs: prefijo f0.
//
// UBICACION_ELIMINADA (f0...006): registrado en operaciones_ticket cuando una
// ubicación es eliminada (soft delete); el ticket edilicio puede requerir
// reasignación de ubicación. Resuelve deuda TODO(PR-15a) de EliminarUbicacionUseCase.
//
const SEED_TIPO_OPERACION_SQL = `
INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000001', 'CAMBIO_ESTADO',      'Cambio de estado'),
  ('f0000000-0000-4000-f000-000000000002', 'COMENTARIO',         'Comentario'),
  ('f0000000-0000-4000-f000-000000000003', 'ASIGNACION',         'Asignación'),
  ('f0000000-0000-4000-f000-000000000004', 'ADJUNTO',            'Adjunto'),
  ('f0000000-0000-4000-f000-000000000005', 'AVANCE_EDILICIO',    'Avance edilicio'),
  ('f0000000-0000-4000-f000-000000000006', 'UBICACION_ELIMINADA','Ubicación eliminada'),
  ('f0000000-0000-4000-f000-000000000007', 'EDICION',            'Edición'),
  ('f0000000-0000-4000-f000-000000000008', 'ELIMINACION',        'Eliminación')
ON CONFLICT (codigo) DO NOTHING;
`;

// ─ tipos_componente (10 tipos base — spec equipos PR-17a) ────────────────────
//
// Codigos: SPEC-EXPLICIT (10 tipos base de hardware).
// Nombres: INFERRED — etiquetas en español para display.
// UUIDs: prefijo a0 (siguiendo secuencia: c0=estados, d0=prioridades, e0=tipos_ticket,
//        f0=tipo_operacion, a0=tipos_componente).
//
// Nota: ON CONFLICT (codigo) DO NOTHING — idempotente.
//
const SEED_TIPOS_COMPONENTE_SQL = `
INSERT INTO tipos_componente (id, codigo, nombre) VALUES
  ('a0000000-0000-4000-a000-000000000001', 'CPU',       'Procesador'),
  ('a0000000-0000-4000-a000-000000000002', 'RAM',       'Memoria RAM'),
  ('a0000000-0000-4000-a000-000000000003', 'DISCO',     'Disco de almacenamiento'),
  ('a0000000-0000-4000-a000-000000000004', 'MONITOR',   'Monitor'),
  ('a0000000-0000-4000-a000-000000000005', 'TECLADO',   'Teclado'),
  ('a0000000-0000-4000-a000-000000000006', 'MOUSE',     'Mouse'),
  ('a0000000-0000-4000-a000-000000000007', 'GPU',       'Placa de video'),
  ('a0000000-0000-4000-a000-000000000008', 'FUENTE',    'Fuente de alimentación'),
  ('a0000000-0000-4000-a000-000000000009', 'IMPRESORA', 'Impresora'),
  ('a0000000-0000-4000-a000-000000000010', 'RED',       'Adaptador de red')
ON CONFLICT (codigo) DO NOTHING;
`;

// ─── Ejecución ────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log(`Iniciando seed de catálogos tenant en: ${url}`);

  await pool.query(SEED_ESTADOS_SQL);
  console.log('  estados           → OK (8 valores base)');

  await pool.query(SEED_PRIORIDADES_SQL);
  console.log('  prioridades       → OK (4 niveles)');

  await pool.query(SEED_TIPOS_TICKET_SQL);
  console.log('  tipos_ticket      → OK (SOPORTE, COMPRAS, EDILICIA)');

  await pool.query(SEED_TIPO_OPERACION_SQL);
  console.log('  tipo_operacion    → OK (8 tipos de evento, incluye UBICACION_ELIMINADA, EDICION, ELIMINACION)');

  await pool.query(SEED_TIPOS_COMPONENTE_SQL);
  console.log('  tipos_componente  → OK (10 tipos base: CPU, RAM, DISCO, MONITOR, TECLADO, MOUSE, GPU, FUENTE, IMPRESORA, RED)');

  console.log('Seed completado. Todos los catálogos son idempotentes (ON CONFLICT DO NOTHING).');
}

seed()
  .catch((err) => {
    console.error('Error durante el seed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
