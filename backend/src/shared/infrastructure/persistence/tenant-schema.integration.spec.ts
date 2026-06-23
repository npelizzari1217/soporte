/**
 * 3.D.3 TEST — Integration test de verificación del schema TENANT (PR-08)
 *
 * Verifica que la migración inicial del schema tenant haya creado correctamente:
 *   - Las 11 tablas definidas en SPEC:tickets-core/Tablas TENANT
 *   - Columnas clave con tipos correctos
 *   - Constraints CHECK (tipos_ticket.codigo, archivos.tamano_bytes)
 *   - FK referential integrity (vía information_schema)
 *   - ON DELETE CASCADE en tablas join de archivos
 *   - Ausencia de cliente_id en todas las tablas (aislamiento por DB, no columna)
 *
 * Estrategia TDD:
 *   RED  → corre ANTES de aplicar la migración (tablas no existen → fallos esperados).
 *   GREEN → corre DESPUÉS de `pnpm run migrate:tenant` apuntando a soporte_tenant_test.
 *
 * Configuración de DB:
 *   - Usa DATABASE_URL_TENANT del entorno o fallback local de test.
 *   - NUNCA apunta a soporte_master ni a soporte_tenant (producción).
 *   - NO hace TRUNCATE: es verificación de DDL, no de datos.
 *
 * Ref spec: SPEC:tickets-core/Tablas TENANT, SPEC:_shared-audit-pattern
 */
import { Pool } from 'pg';

// ─── Conexión de test ─────────────────────────────────────────────────────────
// Credenciales locales throwaway — seguro commitear.
const TEST_DB_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

// ─── Tablas esperadas (11 modelos de 3.D.3) ───────────────────────────────────
const EXPECTED_TABLES = [
  'estados',
  'prioridades',
  'tipos_ticket',
  'tipo_operacion',
  'ciclos_cliente',
  'tickets',
  'operaciones_ticket',
  'archivos',
  'archivos_ticket',
  'archivos_operacion',
  'usuario_tipos_ticket',
];

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Tenant schema verification (integration — 3.D.3)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── 1. Todas las tablas existen ──────────────────────────────────────────

  describe('1. Existencia de las 11 tablas tenant', () => {
    it('todas las tablas del spec existen en el schema public', async () => {
      const res = await pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      const existingTables = res.rows.map((r) => r.table_name);

      for (const expected of EXPECTED_TABLES) {
        expect(existingTables).toContain(expected);
      }
    });
  });

  // ─── 2. Columnas clave ────────────────────────────────────────────────────

  describe('2. Columnas clave por tabla', () => {
    async function getColumns(
      table: string,
    ): Promise<Array<{ column_name: string; data_type: string; is_nullable: string }>> {
      const res = await pool.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      );
      return res.rows;
    }

    it('tickets: tiene numero (unique varchar), tipo_id, estado_id, prioridad_id, solicitante_id', async () => {
      const cols = await getColumns('tickets');
      const colNames = cols.map((c) => c.column_name);

      expect(colNames).toContain('id');
      expect(colNames).toContain('numero');
      expect(colNames).toContain('titulo');
      expect(colNames).toContain('tipo_id');
      expect(colNames).toContain('estado_id');
      expect(colNames).toContain('prioridad_id');
      expect(colNames).toContain('solicitante_id');
      expect(colNames).toContain('asignado_id');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
      expect(colNames).toContain('deleted_at');

      // NO debe existir cliente_id (aislamiento físico, no por columna)
      expect(colNames).not.toContain('cliente_id');

      // numero NOT NULL
      const numero = cols.find((c) => c.column_name === 'numero');
      expect(numero?.is_nullable).toBe('NO');

      // asignado_id es nullable (sin asignar = NULL)
      const asignadoId = cols.find((c) => c.column_name === 'asignado_id');
      expect(asignadoId?.is_nullable).toBe('YES');

      // deleted_at es nullable (soft delete)
      const deletedAt = cols.find((c) => c.column_name === 'deleted_at');
      expect(deletedAt?.is_nullable).toBe('YES');
    });

    it('archivos: tiene storage_key (text unique), tamano_bytes (bigint, not null)', async () => {
      const cols = await getColumns('archivos');
      const colNames = cols.map((c) => c.column_name);

      expect(colNames).toContain('storage_key');
      expect(colNames).toContain('nombre_original');
      expect(colNames).toContain('mime_type');
      expect(colNames).toContain('tamano_bytes');
      expect(colNames).toContain('subido_por_id');

      const tamano = cols.find((c) => c.column_name === 'tamano_bytes');
      expect(tamano?.data_type).toBe('bigint');
      expect(tamano?.is_nullable).toBe('NO');

      // NO debe existir cliente_id
      expect(colNames).not.toContain('cliente_id');
    });

    it('operaciones_ticket: tiene metadata (jsonb nullable) y estado_anterior_id, estado_nuevo_id nullables', async () => {
      const cols = await getColumns('operaciones_ticket');
      const colNames = cols.map((c) => c.column_name);

      expect(colNames).toContain('ticket_id');
      expect(colNames).toContain('tipo_operacion_id');
      expect(colNames).toContain('estado_anterior_id');
      expect(colNames).toContain('estado_nuevo_id');
      expect(colNames).toContain('autor_id');
      expect(colNames).toContain('metadata');

      const metadata = cols.find((c) => c.column_name === 'metadata');
      expect(metadata?.data_type).toBe('jsonb');
      expect(metadata?.is_nullable).toBe('YES');

      const estadoAnterior = cols.find((c) => c.column_name === 'estado_anterior_id');
      expect(estadoAnterior?.is_nullable).toBe('YES');

      const estadoNuevo = cols.find((c) => c.column_name === 'estado_nuevo_id');
      expect(estadoNuevo?.is_nullable).toBe('YES');
    });

    it('ciclos_cliente: tiene ciclo_vigente_id (uuid, no FK real — soft ref cross-DB)', async () => {
      const cols = await getColumns('ciclos_cliente');
      const colNames = cols.map((c) => c.column_name);

      expect(colNames).toContain('ciclo_vigente_id');
      expect(colNames).toContain('nombre');
      expect(colNames).toContain('fecha_inicio');
      expect(colNames).toContain('fecha_fin');
      expect(colNames).toContain('activo');

      // ciclo_vigente_id es NOT NULL (soft ref requerido)
      const cicloVigenteId = cols.find((c) => c.column_name === 'ciclo_vigente_id');
      expect(cicloVigenteId?.is_nullable).toBe('NO');
    });

    it('archivos_ticket: solo tiene archivo_id, ticket_id y created_at (sin soft delete)', async () => {
      const cols = await getColumns('archivos_ticket');
      const colNames = cols.map((c) => c.column_name);

      expect(colNames).toContain('archivo_id');
      expect(colNames).toContain('ticket_id');
      expect(colNames).toContain('created_at');
      // Sin soft delete en tablas join
      expect(colNames).not.toContain('deleted_at');
      expect(colNames).not.toContain('updated_at');
    });

    it('usuario_tipos_ticket: tiene usuario_id (soft ref) y tipo_ticket_id (FK), sin soft delete', async () => {
      const cols = await getColumns('usuario_tipos_ticket');
      const colNames = cols.map((c) => c.column_name);

      expect(colNames).toContain('usuario_id');
      expect(colNames).toContain('tipo_ticket_id');
      expect(colNames).toContain('created_at');
      expect(colNames).not.toContain('deleted_at');
    });
  });

  // ─── 3. CHECK constraints ─────────────────────────────────────────────────

  describe('3. CHECK constraints del spec', () => {
    it('tipos_ticket.codigo tiene CHECK IN (SOPORTE, COMPRAS, EDILICIA)', async () => {
      const res = await pool.query<{ constraint_name: string; check_clause: string }>(`
        SELECT cc.constraint_name, cc.check_clause
        FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
          ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'tipos_ticket'
          AND ccu.column_name = 'codigo'
          AND cc.check_clause NOT LIKE '%NOT NULL%'
      `);

      expect(res.rows.length).toBeGreaterThanOrEqual(1);

      // Verificar que la constraint cubre los tres códigos (SOPORTE, COMPRAS, EDILICIA)
      const clauses = res.rows.map((r) => r.check_clause).join(' ');
      for (const codigo of ['SOPORTE', 'COMPRAS', 'EDILICIA']) {
        expect(clauses).toContain(codigo);
      }
    });

    it('archivos.tamano_bytes tiene CHECK > 0', async () => {
      const res = await pool.query<{ constraint_name: string; check_clause: string }>(`
        SELECT cc.constraint_name, cc.check_clause
        FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
          ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_name = 'archivos'
          AND ccu.column_name = 'tamano_bytes'
          AND cc.check_clause NOT LIKE '%NOT NULL%'
      `);

      expect(res.rows.length).toBeGreaterThanOrEqual(1);

      const hasPositiveCheck = res.rows.some((r) => r.check_clause.includes('> 0'));
      expect(hasPositiveCheck).toBe(true);
    });
  });

  // ─── 4. Foreign Keys ──────────────────────────────────────────────────────

  describe('4. Foreign key constraints', () => {
    async function getFKsFrom(
      table: string,
    ): Promise<Array<{ constraint_name: string; foreign_table_name: string }>> {
      const res = await pool.query<{
        constraint_name: string;
        foreign_table_name: string;
      }>(
        `SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.referential_constraints rc
           ON tc.constraint_name = rc.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = rc.unique_constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_name = $1`,
        [table],
      );
      return res.rows;
    }

    it('tickets tiene FK a tipos_ticket, estados, prioridades', async () => {
      const fks = await getFKsFrom('tickets');
      const referencedTables = fks.map((f) => f.foreign_table_name);

      expect(referencedTables).toContain('tipos_ticket');
      expect(referencedTables).toContain('estados');
      expect(referencedTables).toContain('prioridades');
    });

    it('tickets tiene FK opcional a ciclos_cliente', async () => {
      const fks = await getFKsFrom('tickets');
      const referencedTables = fks.map((f) => f.foreign_table_name);

      expect(referencedTables).toContain('ciclos_cliente');
    });

    it('operaciones_ticket tiene FK a tickets, tipo_operacion y dos FKs a estados', async () => {
      const fks = await getFKsFrom('operaciones_ticket');
      const referencedTables = fks.map((f) => f.foreign_table_name);

      expect(referencedTables).toContain('tickets');
      expect(referencedTables).toContain('tipo_operacion');
      // Dos FKs a estados (estado_anterior_id y estado_nuevo_id)
      const estadoFks = referencedTables.filter((t) => t === 'estados');
      expect(estadoFks.length).toBe(2);
    });

    it('archivos_ticket tiene FK a archivos y tickets', async () => {
      const fks = await getFKsFrom('archivos_ticket');
      const referencedTables = fks.map((f) => f.foreign_table_name);

      expect(referencedTables).toContain('archivos');
      expect(referencedTables).toContain('tickets');
    });

    it('archivos_operacion tiene FK a archivos y operaciones_ticket', async () => {
      const fks = await getFKsFrom('archivos_operacion');
      const referencedTables = fks.map((f) => f.foreign_table_name);

      expect(referencedTables).toContain('archivos');
      expect(referencedTables).toContain('operaciones_ticket');
    });

    it('usuario_tipos_ticket tiene FK a tipos_ticket (pero NO a usuarios — soft ref cross-DB)', async () => {
      const fks = await getFKsFrom('usuario_tipos_ticket');
      const referencedTables = fks.map((f) => f.foreign_table_name);

      expect(referencedTables).toContain('tipos_ticket');
      // NO FK a usuarios (están en master DB — cross-DB soft ref)
      expect(referencedTables).not.toContain('usuarios');
    });
  });

  // ─── 5. ON DELETE CASCADE en join tables ─────────────────────────────────

  describe('5. ON DELETE CASCADE en tablas join de archivos', () => {
    it('archivos_ticket.archivo_id y ticket_id tienen ON DELETE CASCADE', async () => {
      const res = await pool.query<{
        column_name: string;
        delete_rule: string;
      }>(`
        SELECT kcu.column_name, rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = rc.constraint_name
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'archivos_ticket'
        ORDER BY kcu.column_name
      `);

      expect(res.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of res.rows) {
        expect(row.delete_rule).toBe('CASCADE');
      }
    });

    it('archivos_operacion.archivo_id y operacion_id tienen ON DELETE CASCADE', async () => {
      const res = await pool.query<{
        column_name: string;
        delete_rule: string;
      }>(`
        SELECT kcu.column_name, rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = rc.constraint_name
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'archivos_operacion'
        ORDER BY kcu.column_name
      `);

      expect(res.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of res.rows) {
        expect(row.delete_rule).toBe('CASCADE');
      }
    });
  });

  // ─── 6. Aislamiento: sin cliente_id en ninguna tabla ─────────────────────

  describe('6. Aislamiento físico: ninguna tabla tiene cliente_id', () => {
    it('ninguna de las 11 tablas tenant contiene la columna cliente_id', async () => {
      const res = await pool.query<{ table_name: string; column_name: string }>(
        `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'cliente_id'
          AND table_name = ANY($1::text[])
      `,
        [EXPECTED_TABLES],
      );

      // No debe haber ninguna fila — ninguna tabla debe tener cliente_id
      expect(res.rows).toHaveLength(0);
    });
  });
});
