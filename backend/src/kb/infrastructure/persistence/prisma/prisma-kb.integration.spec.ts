/**
 * K5 [INTEGRATION][RED→GREEN] — PrismaKbArticuloRepository contra Postgres
 * REAL (`soporte_tenant_test`), vía `TenantContext.bind()` (mismo patrón que
 * `prisma-sla-config.integration.spec.ts`).
 *
 * Verifica: filtro de visibilidad (`soloVisibles`) + `incluirInactivos` +
 * `tipoTicketId` + `busqueda` (ILIKE en `titulo`) + paginación (`page`,
 * `pageSize`, `total`); soft delete excluye de `activos`.
 *
 * Este spec inserta sus PROPIAS filas de fixture (prefijo `K5_TEST_`) para
 * no depender del estado global de la DB compartida, y las limpia en
 * `afterAll`.
 *
 * Ref spec: sdd/premium/spec K3, K5. Ref design: ADR-P6. Tarea: K5/K6.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaKbArticuloRepository } from './prisma-kb-articulo.repository';
import { KbArticuloEntity } from '../../../domain/entities/kb-articulo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const AUTOR_ID = '019fd788-9acb-72a4-b004-6634da14ad34';

describe('PrismaKbArticuloRepository — Integration (K5)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaKbArticuloRepository;

  const TIPO_CODIGO = 'K5_TEST_TIPO';
  let tipoTicketId: string;
  let publicoActivoId: string;
  let internoActivoId: string;
  let publicoInactivoId: string;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-kb',
    });

    repo = new PrismaKbArticuloRepository(tenantContext);

    // Limpieza defensiva: si una corrida previa falló antes de su afterAll,
    // deja fixtures huérfanas con el mismo código único — evita
    // "Unique constraint failed" al re-correr la suite.
    await tenantClient.kbArticulo.deleteMany({ where: { titulo: { startsWith: 'K5_TEST' } } });
    await tenantClient.tipoTicket.deleteMany({ where: { codigo: TIPO_CODIGO } });

    const tipo = await tenantClient.tipoTicket.create({
      data: { codigo: TIPO_CODIGO, nombre: 'Test KB', activo: true, modulo: 'SOPORTE' },
    });
    tipoTicketId = tipo.id;

    const publicoActivo = KbArticuloEntity.create({
      titulo: 'K5_TEST Cómo resetear tu contraseña',
      contenido: 'Pasos...',
      tipoTicketId,
      autorId: AUTOR_ID,
      visibleParaSolicitante: true,
      activo: true,
    });
    await repo.save(publicoActivo);
    publicoActivoId = publicoActivo.id;

    const internoActivo = KbArticuloEntity.create({
      titulo: 'K5_TEST Runbook interno de incidentes',
      contenido: 'Solo staff...',
      tipoTicketId: null,
      autorId: AUTOR_ID,
      visibleParaSolicitante: false,
      activo: true,
    });
    await repo.save(internoActivo);
    internoActivoId = internoActivo.id;

    const publicoInactivo = KbArticuloEntity.create({
      titulo: 'K5_TEST Artículo dado de baja',
      contenido: 'Obsoleto...',
      tipoTicketId: null,
      autorId: AUTOR_ID,
      visibleParaSolicitante: true,
      activo: true,
    });
    await repo.save(publicoInactivo);
    await repo.softDelete(publicoInactivo.id);
    publicoInactivoId = publicoInactivo.id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.kbArticulo.deleteMany({
      where: { id: { in: [publicoActivoId, internoActivoId, publicoInactivoId] } },
    });
    await tenantClient.tipoTicket.deleteMany({ where: { codigo: TIPO_CODIGO } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  it('[CRITICAL] save() INSERT + findById() persiste y recupera el artículo', async () => {
    const row = await repo.findById(publicoActivoId);
    expect(row).not.toBeNull();
    expect(row!.titulo).toContain('resetear');
    expect(row!.visibleParaSolicitante).toBe(true);
  });

  it('[CRITICAL] soloVisibles=true excluye artículos internos (visibleParaSolicitante=false)', async () => {
    const { items } = await repo.findAll({
      soloVisibles: true,
      incluirInactivos: false,
      busqueda: 'K5_TEST',
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoActivoId);
    expect(ids).not.toContain(internoActivoId);
  });

  it('[CRITICAL] soloVisibles=false incluye internos (staff)', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: 'K5_TEST',
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoActivoId);
    expect(ids).toContain(internoActivoId);
  });

  it('[CRITICAL] incluirInactivos=false excluye soft-deleted/activo=false', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: false,
      busqueda: 'K5_TEST',
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain(publicoInactivoId);
  });

  it('incluirInactivos=true incluye soft-deleted/activo=false', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: 'K5_TEST',
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoInactivoId);
  });

  it('filtra por tipoTicketId', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      tipoTicketId,
      busqueda: 'K5_TEST',
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoActivoId);
    expect(ids).not.toContain(internoActivoId);
  });

  it('busqueda filtra por titulo (case-insensitive substring)', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: 'RESETEAR',
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoActivoId);
    expect(ids).not.toContain(internoActivoId);
  });

  it('[CRITICAL] pagina resultados y retorna total correcto', async () => {
    const { items, total } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: 'K5_TEST',
      page: 1,
      pageSize: 2,
    });
    expect(items).toHaveLength(2);
    expect(total).toBe(3);
  });

  it('softDelete() setea deletedAt + activo=false', async () => {
    const articulo = KbArticuloEntity.create({
      titulo: 'K5_TEST temporal para softDelete',
      contenido: 'x',
      tipoTicketId: null,
      autorId: AUTOR_ID,
      visibleParaSolicitante: false,
      activo: true,
    });
    await repo.save(articulo);

    await repo.softDelete(articulo.id);

    const row = await tenantClient.kbArticulo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.activo).toBe(false);

    await tenantClient.kbArticulo.deleteMany({ where: { id: articulo.id } });
  });

  it('lanza un error descriptivo si no hay TenantContext activo', async () => {
    const looseContext = new TenantContext();
    const looseRepo = new PrismaKbArticuloRepository(looseContext);
    await expect(looseRepo.findById(publicoActivoId)).rejects.toThrow(
      /No hay TenantContext activo/,
    );
  });
});
