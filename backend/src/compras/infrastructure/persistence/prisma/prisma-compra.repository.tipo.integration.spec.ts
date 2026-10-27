/**
 * [INTEGRATION] `PrismaCompraRepository` — tipo de ticket de la compra (odd/compras-por-tipo, T1,
 * T3: S2, S4, S5), contra Postgres real (`soporte_tenant_test`, migrada con
 * `20261027100000_compras_tipo_ticket`).
 *
 * El fixture tiene las tres clases de compra que el filtro distingue: una de un tipo VISIBLE, una
 * de un tipo NO visible y una SIN tipo. Cada assert de ausencia tiene su caso hermano con la
 * condición invertida, y los asserts son de contenido (ids exactos y `total`), no de cantidad.
 *
 * Aísla sus filas con un ciclo y dos tipos propios, que borra al terminar; no toca master.
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { CompraEntity } from '../../../domain/entities/compra.entity';
import { CompraListFiltros } from '../../../domain/ports/i-compra.repository';
import { PrismaCompraRepository } from './prisma-compra.repository';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaCompraRepository — tipo de ticket y alcance por tipo (odd/compras-por-tipo)', () => {
  let client: Client;
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaCompraRepository;

  const sufijo = randomBytes(3).toString('hex').toUpperCase();
  let cicloId: string;
  let tipoVisible: string;
  let tipoNoVisible: string;
  let compraVisible: string;
  let compraNoVisible: string;
  let compraSinTipo: string;
  let numeroSeq = 0;

  /** Número con el formato real `COM-{anio}-{SEQ5}`, en un rango alto al azar por corrida. */
  const baseNumero = 90000 + Math.floor(Math.random() * 9000);
  function siguienteNumero(): string {
    numeroSeq += 1;
    return `COM-2026-${baseNumero + numeroSeq}`;
  }

  async function insertTipo(codigo: string): Promise<string> {
    const fila = await client.query(
      `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, activo, updated_at)
       VALUES (gen_random_uuid(), $1, $1, 'TICKETS', true, now()) RETURNING id`,
      [codigo],
    );
    return fila.rows[0].id as string;
  }

  async function insertCompra(tipoTicketId: string | null): Promise<string> {
    const fila = await client.query(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, tipo_ticket_id, updated_at)
       VALUES (gen_random_uuid(), $1, '2026-03-01', 'Compra por tipo', gen_random_uuid(), $2, $3, now())
       RETURNING id`,
      [siguienteNumero(), cicloId, tipoTicketId],
    );
    return fila.rows[0].id as string;
  }

  /** Ids de la página, sin importar el orden, más el total de la misma consulta. */
  async function listar(filtros: CompraListFiltros): Promise<{ ids: string[]; total: number }> {
    const { compras, total } = await repo.findPaginaConItems({
      cicloId,
      grupoEstado: 'TODAS',
      ...filtros,
    });
    return { ids: compras.map((compra) => compra.id).sort(), total };
  }

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-compras-por-tipo',
    });
    repo = new PrismaCompraRepository(tenantContext);

    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();

    const ciclo = await client.query(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Compras por tipo', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    cicloId = ciclo.rows[0].id as string;
    tipoVisible = await insertTipo(`CPT_VIS_${sufijo}`);
    tipoNoVisible = await insertTipo(`CPT_NOVIS_${sufijo}`);

    compraVisible = await insertCompra(tipoVisible);
    compraNoVisible = await insertCompra(tipoNoVisible);
    compraSinTipo = await insertCompra(null);
  });

  afterAll(async () => {
    await client.query(
      'DELETE FROM items_compra WHERE compra_id IN (SELECT id FROM compras WHERE ciclo_id = $1)',
      [cicloId],
    );
    await client.query('DELETE FROM compras WHERE ciclo_id = $1', [cicloId]);
    await client.query('DELETE FROM ciclos_cliente WHERE id = $1', [cicloId]);
    await client.query('DELETE FROM tipos_ticket WHERE id = ANY($1::uuid[])', [
      [tipoVisible, tipoNoVisible],
    ]);
    await client.end();
    await prismaService.onModuleDestroy();
  });

  describe('findPaginaConItems — alcance por tipo (S4, S5)', () => {
    it('con un tipo visible: trae la de ese tipo y la sin tipo, NO la del tipo no visible, y el total lo refleja', async () => {
      const { ids, total } = await listar({ tiposVisibles: [tipoVisible] });

      expect(ids).toEqual([compraVisible, compraSinTipo].sort());
      expect(ids).not.toContain(compraNoVisible);
      expect(total).toBe(2);
    });

    it('caso hermano: con ambos tipos visibles, entra también la del otro tipo', async () => {
      const { ids, total } = await listar({ tiposVisibles: [tipoVisible, tipoNoVisible] });

      expect(ids).toEqual([compraVisible, compraNoVisible, compraSinTipo].sort());
      expect(total).toBe(3);
    });

    it('sin ningún tipo visible: solo la compra sin tipo (S4)', async () => {
      const { ids, total } = await listar({ tiposVisibles: [] });

      expect(ids).toEqual([compraSinTipo]);
      expect(total).toBe(1);
    });

    it('sin alcance (ADMINISTRADOR): las tres', async () => {
      const { ids, total } = await listar({});

      expect(ids).toEqual([compraVisible, compraNoVisible, compraSinTipo].sort());
      expect(total).toBe(3);
    });
  });

  describe('findPaginaConItems — filtro tipoTicketId (S5)', () => {
    it('filtrar por el tipo NO visible nunca amplía el alcance: vacío y total 0', async () => {
      const { ids, total } = await listar({
        tipoTicketId: tipoNoVisible,
        tiposVisibles: [tipoVisible],
      });

      expect(ids).toEqual([]);
      expect(total).toBe(0);
    });

    it('filtrar por el tipo visible trae solo esa compra (ni la sin tipo ni la del otro tipo)', async () => {
      const { ids, total } = await listar({
        tipoTicketId: tipoVisible,
        tiposVisibles: [tipoVisible],
      });

      expect(ids).toEqual([compraVisible]);
      expect(total).toBe(1);
    });

    it('sin alcance, filtrar por un tipo trae solo las de ese tipo', async () => {
      const { ids } = await listar({ tipoTicketId: tipoNoVisible });

      expect(ids).toEqual([compraNoVisible]);
    });
  });

  describe('findParaVisibilidad', () => {
    it('devuelve el tipo de una compra con tipo, y null como tipo de una sin tipo', async () => {
      expect(await repo.findParaVisibilidad(compraNoVisible)).toEqual({
        tipoTicketId: tipoNoVisible,
      });
      expect(await repo.findParaVisibilidad(compraSinTipo)).toEqual({ tipoTicketId: null });
    });

    it('una compra inexistente o dada de baja devuelve null', async () => {
      const borrada = await insertCompra(tipoNoVisible);
      await client.query('UPDATE compras SET deleted_at = now() WHERE id = $1', [borrada]);

      expect(await repo.findParaVisibilidad(borrada)).toBeNull();
      expect(await repo.findParaVisibilidad('00000000-0000-4000-8000-0000000000ff')).toBeNull();
    });
  });

  describe('guardar / findByIdConItems — persistencia del tipo (T1)', () => {
    it('persiste el tipo al crear, lo cambia al editar y lo relee igual', async () => {
      const compra = CompraEntity.create({
        numero: siguienteNumero(),
        fechaSolicitud: new Date('2026-03-02'),
        motivo: 'Compra con tipo',
        descripcion: null,
        solicitanteId: '00000000-0000-4000-8000-0000000000aa',
        cicloId,
        tipoTicketId: tipoVisible,
      });
      await repo.guardar(compra);
      expect((await repo.findByIdConItems(compra.id))?.tipoTicketId).toBe(tipoVisible);

      compra.actualizar({ tipoTicketId: tipoNoVisible });
      await repo.guardar(compra);

      expect((await repo.findByIdConItems(compra.id))?.tipoTicketId).toBe(tipoNoVisible);
      const fila = await client.query('SELECT tipo_ticket_id FROM compras WHERE id = $1', [
        compra.id,
      ]);
      expect(fila.rows[0].tipo_ticket_id).toBe(tipoNoVisible);
    });

    it('una compra sin tipo se relee con tipoTicketId null (S4)', async () => {
      expect((await repo.findByIdConItems(compraSinTipo))?.tipoTicketId).toBeNull();
    });
  });
});
