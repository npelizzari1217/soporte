/**
 * 3.D.4 TEST — Integration test del seed de catálogos TENANT (PR-09)
 *
 * Verifica que tenant-seed.ts haya sembrado correctamente los catálogos
 * operativos base en la DB tenant de test:
 *   - estados          (8 valores del spec tickets-core)
 *   - prioridades      (4 valores del spec tickets-core)
 *   - tipos_ticket     (SOPORTE, COMPRAS, EDILICIA)
 *   - tipo_operacion   (5 valores del spec tickets-core)
 *
 * Estrategia TDD:
 *   RED  → corre ANTES de ejecutar tenant-seed.ts (tablas vacías → fallos esperados).
 *   GREEN → corre DESPUÉS de `pnpm run seed:tenant` apuntando a soporte_tenant_test.
 *
 * Configuración de DB:
 *   - Usa DATABASE_URL_TENANT del entorno o el fallback local de test.
 *   - NUNCA apunta a soporte_master ni a una DB tenant de producción.
 *   - NO hace TRUNCATE: son datos de catálogo de referencia, no fixtures.
 *     La suite asume que la migración 20260623120000_init_tenant_schema ya fue aplicada.
 *
 * Ref spec: SPEC:tickets-core/Seeds de catálogos en provisioning de tenant
 */
import { Pool } from 'pg';

// ─── Conexión de test ─────────────────────────────────────────────────────────
// Credenciales locales throwaway — seguro commitear.
const TEST_DB_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

// ─── Catálogos esperados (verbatim del spec tickets-core) ─────────────────────

// estados (8 valores base — orden definido en spec)
const EXPECTED_ESTADOS = [
  'ABIERTO',
  'PENDIENTE_APROBACION',
  'APROBADO',
  'RECHAZADO',
  'EN_PROGRESO',
  'RESUELTO',
  'CERRADO',
  'CANCELADO',
];

// prioridades (4 niveles base — codigos del spec)
const EXPECTED_PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

// tipos_ticket (discriminadores de flujo — spec explícito)
const EXPECTED_TIPOS_TICKET = ['SOPORTE', 'COMPRAS', 'EDILICIA'];

// tipo_operacion (eventos del timeline — spec explícito)
const EXPECTED_TIPO_OPERACION = [
  'CAMBIO_ESTADO',
  'COMENTARIO',
  'ASIGNACION',
  'ADJUNTO',
  'AVANCE_EDILICIO',
];

// ─── SQL idempotente (refleja exactamente el seed) ────────────────────────────
// Usado en el test de idempotencia para re-ejecutar el seed via pool directo.
const SEED_ESTADOS_SQL = `
INSERT INTO estados (id, codigo, nombre, orden) VALUES
  ('c0000000-0000-4000-c000-000000000001', 'ABIERTO',               'Abierto',                   10),
  ('c0000000-0000-4000-c000-000000000002', 'PENDIENTE_APROBACION',  'Pendiente de aprobación',   20),
  ('c0000000-0000-4000-c000-000000000003', 'APROBADO',              'Aprobado',                  30),
  ('c0000000-0000-4000-c000-000000000004', 'RECHAZADO',             'Rechazado',                 35),
  ('c0000000-0000-4000-c000-000000000005', 'EN_PROGRESO',           'En progreso',               40),
  ('c0000000-0000-4000-c000-000000000006', 'RESUELTO',              'Resuelto',                  50),
  ('c0000000-0000-4000-c000-000000000007', 'CERRADO',               'Cerrado',                   60),
  ('c0000000-0000-4000-c000-000000000008', 'CANCELADO',             'Cancelado',                 70)
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_PRIORIDADES_SQL = `
INSERT INTO prioridades (id, codigo, nombre, orden) VALUES
  ('d0000000-0000-4000-d000-000000000001', 'BAJA',    'Baja',    10),
  ('d0000000-0000-4000-d000-000000000002', 'MEDIA',   'Media',   20),
  ('d0000000-0000-4000-d000-000000000003', 'ALTA',    'Alta',    30),
  ('d0000000-0000-4000-d000-000000000004', 'CRITICA', 'Crítica', 40)
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_TIPOS_TICKET_SQL = `
INSERT INTO tipos_ticket (id, codigo, nombre) VALUES
  ('e0000000-0000-4000-e000-000000000001', 'SOPORTE',  'Soporte'),
  ('e0000000-0000-4000-e000-000000000002', 'COMPRAS',  'Compras'),
  ('e0000000-0000-4000-e000-000000000003', 'EDILICIA', 'Edilicia')
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_TIPO_OPERACION_SQL = `
INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000001', 'CAMBIO_ESTADO',   'Cambio de estado'),
  ('f0000000-0000-4000-f000-000000000002', 'COMENTARIO',      'Comentario'),
  ('f0000000-0000-4000-f000-000000000003', 'ASIGNACION',      'Asignación'),
  ('f0000000-0000-4000-f000-000000000004', 'ADJUNTO',         'Adjunto'),
  ('f0000000-0000-4000-f000-000000000005', 'AVANCE_EDILICIO', 'Avance edilicio')
ON CONFLICT (codigo) DO NOTHING;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Tenant catalog seed (integration — 3.D.4)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── 1. estados catalog ───────────────────────────────────────────────────

  describe('1. Catálogo de estados', () => {
    it('contiene exactamente los 8 estados base del spec', async () => {
      const res = await pool.query<{ codigo: string }>(
        'SELECT codigo FROM estados WHERE deleted_at IS NULL ORDER BY codigo',
      );
      const codigos = res.rows.map((r) => r.codigo);

      for (const expected of EXPECTED_ESTADOS) {
        expect(codigos).toContain(expected);
      }
      expect(res.rows.length).toBe(8);
    });

    it('todos los estados tienen activo=true y deleted_at IS NULL', async () => {
      const res = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM estados WHERE activo = TRUE AND deleted_at IS NULL`,
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(8);
    });

    it('los nombres coinciden con los definidos en el spec', async () => {
      const res = await pool.query<{ codigo: string; nombre: string }>(
        'SELECT codigo, nombre FROM estados',
      );
      const byCodigo: Record<string, string> = {};
      for (const row of res.rows) byCodigo[row.codigo] = row.nombre;

      expect(byCodigo['ABIERTO']).toBe('Abierto');
      expect(byCodigo['PENDIENTE_APROBACION']).toBe('Pendiente de aprobación');
      expect(byCodigo['APROBADO']).toBe('Aprobado');
      expect(byCodigo['RECHAZADO']).toBe('Rechazado');
      expect(byCodigo['EN_PROGRESO']).toBe('En progreso');
      expect(byCodigo['RESUELTO']).toBe('Resuelto');
      expect(byCodigo['CERRADO']).toBe('Cerrado');
      expect(byCodigo['CANCELADO']).toBe('Cancelado');
    });

    it('los órdenes de visualización coinciden con el spec', async () => {
      const res = await pool.query<{ codigo: string; orden: number }>(
        'SELECT codigo, orden FROM estados ORDER BY orden',
      );
      const byOrden: Record<string, number> = {};
      for (const row of res.rows) byOrden[row.codigo] = row.orden;

      expect(byOrden['ABIERTO']).toBe(10);
      expect(byOrden['PENDIENTE_APROBACION']).toBe(20);
      expect(byOrden['APROBADO']).toBe(30);
      expect(byOrden['RECHAZADO']).toBe(35);
      expect(byOrden['EN_PROGRESO']).toBe(40);
      expect(byOrden['RESUELTO']).toBe(50);
      expect(byOrden['CERRADO']).toBe(60);
      expect(byOrden['CANCELADO']).toBe(70);
    });
  });

  // ─── 2. prioridades catalog ───────────────────────────────────────────────

  describe('2. Catálogo de prioridades', () => {
    it('contiene exactamente los 4 niveles de prioridad del spec', async () => {
      const res = await pool.query<{ codigo: string }>(
        'SELECT codigo FROM prioridades WHERE deleted_at IS NULL ORDER BY codigo',
      );
      const codigos = res.rows.map((r) => r.codigo);

      for (const expected of EXPECTED_PRIORIDADES) {
        expect(codigos).toContain(expected);
      }
      expect(res.rows.length).toBe(4);
    });

    it('todos los registros tienen activo=true y deleted_at IS NULL', async () => {
      const res = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM prioridades WHERE activo = TRUE AND deleted_at IS NULL`,
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(4);
    });

    it('los órdenes de visualización coinciden con el spec', async () => {
      const res = await pool.query<{ codigo: string; orden: number }>(
        'SELECT codigo, orden FROM prioridades ORDER BY orden',
      );
      const byOrden: Record<string, number> = {};
      for (const row of res.rows) byOrden[row.codigo] = row.orden;

      expect(byOrden['BAJA']).toBe(10);
      expect(byOrden['MEDIA']).toBe(20);
      expect(byOrden['ALTA']).toBe(30);
      expect(byOrden['CRITICA']).toBe(40);
    });
  });

  // ─── 3. tipos_ticket catalog ──────────────────────────────────────────────

  describe('3. Catálogo de tipos_ticket', () => {
    it('contiene exactamente SOPORTE, COMPRAS y EDILICIA', async () => {
      const res = await pool.query<{ codigo: string }>(
        'SELECT codigo FROM tipos_ticket WHERE deleted_at IS NULL ORDER BY codigo',
      );
      const codigos = res.rows.map((r) => r.codigo);

      for (const expected of EXPECTED_TIPOS_TICKET) {
        expect(codigos).toContain(expected);
      }
      expect(res.rows.length).toBe(3);
    });

    it('todos los tipos tienen activo=true y deleted_at IS NULL', async () => {
      const res = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM tipos_ticket WHERE activo = TRUE AND deleted_at IS NULL`,
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(3);
    });
  });

  // ─── 4. tipo_operacion catalog ────────────────────────────────────────────

  describe('4. Catálogo de tipo_operacion', () => {
    it('contiene exactamente los 5 tipos de operación del spec', async () => {
      const res = await pool.query<{ codigo: string }>(
        'SELECT codigo FROM tipo_operacion WHERE deleted_at IS NULL ORDER BY codigo',
      );
      const codigos = res.rows.map((r) => r.codigo);

      for (const expected of EXPECTED_TIPO_OPERACION) {
        expect(codigos).toContain(expected);
      }
      expect(res.rows.length).toBe(5);
    });

    it('todos los tipos tienen activo=true y deleted_at IS NULL', async () => {
      const res = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM tipo_operacion WHERE activo = TRUE AND deleted_at IS NULL`,
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(5);
    });
  });

  // ─── 5. Idempotencia ──────────────────────────────────────────────────────

  describe('5. Idempotencia del seed', () => {
    it('re-ejecutar el seed SQL no modifica los row counts en ningún catálogo', async () => {
      // Contar ANTES de la segunda ejecución
      const [estadosBefore, prioridadesBefore, tiposBefore, opsBefore] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) FROM estados'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM prioridades'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM tipos_ticket'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM tipo_operacion'),
      ]);

      // Re-ejecutar el mismo SQL idempotente via pool directo
      await pool.query(SEED_ESTADOS_SQL);
      await pool.query(SEED_PRIORIDADES_SQL);
      await pool.query(SEED_TIPOS_TICKET_SQL);
      await pool.query(SEED_TIPO_OPERACION_SQL);

      // Contar DESPUÉS
      const [estadosAfter, prioridadesAfter, tiposAfter, opsAfter] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) FROM estados'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM prioridades'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM tipos_ticket'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM tipo_operacion'),
      ]);

      expect(estadosAfter.rows[0].count).toBe(estadosBefore.rows[0].count);
      expect(prioridadesAfter.rows[0].count).toBe(prioridadesBefore.rows[0].count);
      expect(tiposAfter.rows[0].count).toBe(tiposBefore.rows[0].count);
      expect(opsAfter.rows[0].count).toBe(opsBefore.rows[0].count);
    });
  });
});
