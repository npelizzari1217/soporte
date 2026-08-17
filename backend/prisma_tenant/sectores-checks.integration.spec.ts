/**
 * sectores-checks.integration.spec.ts — WU-03 (sdd/compras-tres-etapas-y-sectores,
 * FASE 2, M1). Un `it` por CADA constraint de la migración de sectores:
 * UNIQUE de `codigo` (sin índice parcial por `deleted_at` — mismo criterio
 * que `tipos_ticket`, un código dado de baja NO se reutiliza) y `RESTRICT`
 * del FK `compras.sector_id → sectores.id`. Cliente `pg` crudo — la
 * autoridad es la DB, mismo patrón que `compras-checks.integration.spec.ts`.
 */
import { Client } from 'pg';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

describe('Constraints de sectores/compras.sector_id — migración 20260817150000_sectores', () => {
  let client: Client;
  let cicloId: string;
  let numeroSeq = 0;

  async function limpiarDatosDeEsteSpec(): Promise<void> {
    await client.query(
      'UPDATE compras SET sector_id = NULL WHERE ciclo_id = $1',
      [cicloId],
    );
    await client.query('DELETE FROM compras WHERE ciclo_id = $1', [cicloId]);
    await client.query("DELETE FROM sectores WHERE codigo LIKE 'WU03_%'");
  }

  beforeAll(async () => {
    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();

    const ciclo = await client.query(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Ciclo test sectores', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    cicloId = ciclo.rows[0].id as string;
  });

  afterAll(async () => {
    await limpiarDatosDeEsteSpec();
    await client.query('DELETE FROM ciclos_cliente WHERE id = $1', [cicloId]);
    await client.end();
  });

  beforeEach(async () => {
    await limpiarDatosDeEsteSpec();
  });

  function siguienteNumero(): string {
    numeroSeq += 1;
    return `COM-2026-${String(80000 + numeroSeq).padStart(5, '0')}`;
  }

  async function insertSector(codigo: string, deletedAt: Date | null = null): Promise<string> {
    const result = await client.query(
      `INSERT INTO sectores (id, codigo, nombre, activo, updated_at, deleted_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), $4)
       RETURNING id`,
      [codigo, `Sector ${codigo}`, deletedAt === null, deletedAt],
    );
    return result.rows[0].id as string;
  }

  async function insertCompra(sectorId: string | null = null): Promise<string> {
    const result = await client.query(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, sector_id, updated_at)
       VALUES (gen_random_uuid(), $1, '2026-01-01', 'Motivo de compra de test', gen_random_uuid(), $2, $3, now())
       RETURNING id`,
      [siguienteNumero(), cicloId, sectorId],
    );
    return result.rows[0].id as string;
  }

  describe('UNIQUE sectores_codigo_key', () => {
    it('rechaza un codigo duplicado entre dos sectores activos', async () => {
      await insertSector('WU03_DUP');
      await expect(insertSector('WU03_DUP')).rejects.toThrow(
        /sectores_codigo_key|duplicate key/i,
      );
    });

    it('rechaza un codigo duplicado incluso si el existente está soft-deleted (mismo criterio que tipos_ticket: un código dado de baja NO se reutiliza)', async () => {
      await insertSector('WU03_BAJA', new Date('2026-01-01'));
      await expect(insertSector('WU03_BAJA')).rejects.toThrow(
        /sectores_codigo_key|duplicate key/i,
      );
    });

    it('acepta codigos distintos (caso hermano)', async () => {
      const id1 = await insertSector('WU03_A');
      const id2 = await insertSector('WU03_B');
      expect(id1).not.toBe(id2);
    });
  });

  describe('FK compras_sector_id_fkey ON DELETE RESTRICT', () => {
    it('rechaza el DELETE de un sector referenciado por una compra', async () => {
      const sectorId = await insertSector('WU03_REF');
      await insertCompra(sectorId);

      await expect(client.query('DELETE FROM sectores WHERE id = $1', [sectorId])).rejects.toThrow(
        /compras_sector_id_fkey|foreign key constraint/i,
      );
    });

    it('permite el DELETE de un sector SIN compras asociadas (caso hermano)', async () => {
      const sectorId = await insertSector('WU03_LIBRE');
      const result = await client.query('DELETE FROM sectores WHERE id = $1 RETURNING id', [
        sectorId,
      ]);
      expect(result.rowCount).toBe(1);
    });
  });

  describe('compras.sector_id es opcional (S66/S67)', () => {
    it('acepta una compra sin sector_id (NULL)', async () => {
      const id = await insertCompra(null);
      const row = await client.query('SELECT sector_id FROM compras WHERE id = $1', [id]);
      expect(row.rows[0].sector_id).toBeNull();
    });

    it('acepta una compra con sector_id válido', async () => {
      const sectorId = await insertSector('WU03_OK');
      const id = await insertCompra(sectorId);
      const row = await client.query('SELECT sector_id FROM compras WHERE id = $1', [id]);
      expect(row.rows[0].sector_id).toBe(sectorId);
    });
  });
});
