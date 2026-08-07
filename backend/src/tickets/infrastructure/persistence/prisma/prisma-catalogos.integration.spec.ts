/**
 * T2.3 [INTEGRATION] — RED→GREEN: repos Prisma de catálogos (Estado,
 * Prioridad, TipoTicket, TipoOperacion) contra Postgres REAL
 * (`soporte_tenant_test`), vía `TenantContext.bind()` (mismo patrón que
 * `prisma-ciclo-repos.integration.spec.ts`).
 *
 * Los 4 repos son SOLO LECTURA (findByCodigo, findIdByCodigo, findAllActive)
 * — los catálogos ya existen en el tenant (sembrados en provisioning por
 * `TenantSeederAdapter`, Fase 1). Para no depender del estado externo de la
 * DB compartida `soporte_tenant_test` (otras suites insertan/leen la misma
 * base), este spec inserta sus propias filas de fixture con códigos
 * prefijados `T2_TEST_*` (vía el cliente Prisma crudo, no vía el repo — los
 * repos no exponen escritura) y las limpia en `afterAll`. Las aserciones de
 * `findAllActive()` verifican inclusión/exclusión relativa, no longitud
 * exacta (la tabla ya tiene los 6/4/5/4 códigos fijos del seed real).
 *
 * Ref spec: sdd/tickets-core/spec T1, T2. Ref design: Firmas TS, matriz de
 * tests (T1, T2). Tarea: T2.3
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaEstadoRepository } from './prisma-estado.repository';
import { PrismaPrioridadRepository } from './prisma-prioridad.repository';
import { PrismaTipoTicketRepository } from './prisma-tipo-ticket.repository';
import { PrismaTipoOperacionRepository } from './prisma-tipo-operacion.repository';
import { TipoTicketEntity } from '../../../domain/entities/tipo-ticket.entity';
import { PrioridadEntity } from '../../../domain/entities/prioridad.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('Catálogos Prisma Repositories — Integration (T2.3)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let estadoRepo: PrismaEstadoRepository;
  let prioridadRepo: PrismaPrioridadRepository;
  let tipoTicketRepo: PrismaTipoTicketRepository;
  let tipoOperacionRepo: PrismaTipoOperacionRepository;

  const ACTIVE_ESTADO = 'T2_TEST_ESTADO_ACTIVO';
  const DELETED_ESTADO = 'T2_TEST_ESTADO_BAJA';
  const ACTIVE_PRIORIDAD = 'T2_TEST_PRIORIDAD_ACTIVA';
  const DELETED_PRIORIDAD = 'T2_TEST_PRIORIDAD_BAJA';
  const ACTIVE_TIPO_TICKET = 'T2_TEST_TIPO_TICKET_ACTIVO';
  const DELETED_TIPO_TICKET = 'T2_TEST_TIPO_TICKET_BAJA';
  const ACTIVE_TIPO_OP = 'T2_TEST_TIPO_OP_ACTIVO';
  const DELETED_TIPO_OP = 'T2_TEST_TIPO_OP_BAJA';

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-catalogos',
    });

    estadoRepo = new PrismaEstadoRepository(tenantContext);
    prioridadRepo = new PrismaPrioridadRepository(tenantContext);
    tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
    tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);

    // Fixtures directos vía Prisma crudo (los repos son solo-lectura).
    await tenantClient.estado.create({
      data: { codigo: ACTIVE_ESTADO, nombre: 'Test Activo', orden: 999, activo: true },
    });
    await tenantClient.estado.create({
      data: {
        codigo: DELETED_ESTADO,
        nombre: 'Test Baja',
        orden: 998,
        activo: true,
        deletedAt: new Date(),
      },
    });

    await tenantClient.prioridad.create({
      data: { codigo: ACTIVE_PRIORIDAD, nombre: 'Test Activa', orden: 999, activo: true },
    });
    await tenantClient.prioridad.create({
      data: {
        codigo: DELETED_PRIORIDAD,
        nombre: 'Test Baja',
        orden: 998,
        activo: true,
        deletedAt: new Date(),
      },
    });

    await tenantClient.tipoTicket.create({
      data: { codigo: ACTIVE_TIPO_TICKET, nombre: 'Test Activo', activo: true },
    });
    await tenantClient.tipoTicket.create({
      data: {
        codigo: DELETED_TIPO_TICKET,
        nombre: 'Test Baja',
        activo: true,
        deletedAt: new Date(),
      },
    });

    await tenantClient.tipoOperacion.create({
      data: { codigo: ACTIVE_TIPO_OP, nombre: 'Test Activo', activo: true },
    });
    await tenantClient.tipoOperacion.create({
      data: { codigo: DELETED_TIPO_OP, nombre: 'Test Baja', activo: true, deletedAt: new Date() },
    });
  }, 30_000);

  afterAll(async () => {
    await tenantClient.estado.deleteMany({ where: { codigo: { startsWith: 'T2_TEST_' } } });
    await tenantClient.prioridad.deleteMany({ where: { codigo: { startsWith: 'T2_TEST_' } } });
    await tenantClient.tipoTicket.deleteMany({ where: { codigo: { startsWith: 'T2_TEST_' } } });
    await tenantClient.tipoOperacion.deleteMany({ where: { codigo: { startsWith: 'T2_TEST_' } } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  // ─── PrismaEstadoRepository (T1) ────────────────────────────────────────

  describe('PrismaEstadoRepository', () => {
    it('findByCodigo() retorna la entidad con las props exactas', async () => {
      const estado = await estadoRepo.findByCodigo(ACTIVE_ESTADO);
      expect(estado).not.toBeNull();
      expect(estado!.codigo).toBe(ACTIVE_ESTADO);
      expect(estado!.nombre).toBe('Test Activo');
      expect(estado!.orden).toBe(999);
    });

    it('findByCodigo() retorna null para un código inexistente', async () => {
      const estado = await estadoRepo.findByCodigo('NO_EXISTE_XYZ');
      expect(estado).toBeNull();
    });

    it('findById() retorna la entidad por su UUID (T7.2, resolver el código del estado actual del ticket)', async () => {
      const full = await estadoRepo.findByCodigo(ACTIVE_ESTADO);
      const porId = await estadoRepo.findById(full!.id);
      expect(porId).not.toBeNull();
      expect(porId!.codigo).toBe(ACTIVE_ESTADO);
    });

    it('findById() retorna null para un id inexistente', async () => {
      const porId = await estadoRepo.findById('00000000-0000-0000-0000-000000000000');
      expect(porId).toBeNull();
    });

    it('findIdByCodigo() retorna el UUID sin hidratar la entidad completa', async () => {
      const id = await estadoRepo.findIdByCodigo(ACTIVE_ESTADO);
      const full = await estadoRepo.findByCodigo(ACTIVE_ESTADO);
      expect(id).toBe(full!.id);
    });

    it('findAllActive() incluye el estado activo de fixture y excluye el soft-deleted', async () => {
      const activos = await estadoRepo.findAllActive();
      const codigos = activos.map((e) => e.codigo);
      expect(codigos).toContain(ACTIVE_ESTADO);
      expect(codigos).not.toContain(DELETED_ESTADO);
      // Nota: esta DB de test (`soporte_tenant_test`) no corre el seed de
      // provisioning (`TenantSeederAdapter`) automáticamente — solo está
      // migrada. La presencia de los 6 códigos ADR-1 se verifica en
      // `tenant-seeder.adapter.integration.spec.ts` (Fase 1, DB efímera).
    });
  });

  // ─── PrismaPrioridadRepository ──────────────────────────────────────────

  describe('PrismaPrioridadRepository', () => {
    it('findByCodigo() retorna la entidad con las props exactas', async () => {
      const prioridad = await prioridadRepo.findByCodigo(ACTIVE_PRIORIDAD);
      expect(prioridad).not.toBeNull();
      expect(prioridad!.codigo).toBe(ACTIVE_PRIORIDAD);
    });

    it('findById() retorna la entidad por su UUID (T6.1, validación prioridadId)', async () => {
      const full = await prioridadRepo.findByCodigo(ACTIVE_PRIORIDAD);
      const porId = await prioridadRepo.findById(full!.id);
      expect(porId).not.toBeNull();
      expect(porId!.codigo).toBe(ACTIVE_PRIORIDAD);
    });

    it('findById() retorna null para un id inexistente', async () => {
      const porId = await prioridadRepo.findById('00000000-0000-0000-0000-000000000000');
      expect(porId).toBeNull();
    });

    it('findIdByCodigo() retorna null para un código inexistente', async () => {
      const id = await prioridadRepo.findIdByCodigo('NO_EXISTE_XYZ');
      expect(id).toBeNull();
    });

    it('findAllActive() incluye la prioridad activa de fixture y excluye la soft-deleted', async () => {
      const activas = await prioridadRepo.findAllActive();
      const codigos = activas.map((p) => p.codigo);
      expect(codigos).toContain(ACTIVE_PRIORIDAD);
      expect(codigos).not.toContain(DELETED_PRIORIDAD);
    });
  });

  // ─── PrismaTipoTicketRepository (T2) ─────────────────────────────────────

  describe('PrismaTipoTicketRepository', () => {
    it('findByCodigo() retorna la entidad con las props exactas', async () => {
      const tipo = await tipoTicketRepo.findByCodigo(ACTIVE_TIPO_TICKET);
      expect(tipo).not.toBeNull();
      expect(tipo!.codigo).toBe(ACTIVE_TIPO_TICKET);
      expect(tipo!.activo).toBe(true);
    });

    it('findById() retorna la entidad por su UUID (T6.1, validación tipoId + prefijo numerador)', async () => {
      const full = await tipoTicketRepo.findByCodigo(ACTIVE_TIPO_TICKET);
      const porId = await tipoTicketRepo.findById(full!.id);
      expect(porId).not.toBeNull();
      expect(porId!.codigo).toBe(ACTIVE_TIPO_TICKET);
    });

    it('findById() retorna null para un id inexistente', async () => {
      const porId = await tipoTicketRepo.findById('00000000-0000-0000-0000-000000000000');
      expect(porId).toBeNull();
    });

    it('findAllActive() incluye el tipo activo de fixture y excluye el dado de baja', async () => {
      const activos = await tipoTicketRepo.findAllActive();
      const codigos = activos.map((t) => t.codigo);
      expect(codigos).toContain(ACTIVE_TIPO_TICKET);
      expect(codigos).not.toContain(DELETED_TIPO_TICKET);
    });
  });

  // ─── PrismaTipoOperacionRepository ───────────────────────────────────────

  describe('PrismaTipoOperacionRepository', () => {
    it('findByCodigo() retorna la entidad con las props exactas', async () => {
      const tipoOp = await tipoOperacionRepo.findByCodigo(ACTIVE_TIPO_OP);
      expect(tipoOp).not.toBeNull();
      expect(tipoOp!.codigo).toBe(ACTIVE_TIPO_OP);
    });

    it('findIdByCodigo() retorna el UUID correcto', async () => {
      const full = await tipoOperacionRepo.findByCodigo(ACTIVE_TIPO_OP);
      const id = await tipoOperacionRepo.findIdByCodigo(ACTIVE_TIPO_OP);
      expect(id).toBe(full!.id);
    });

    it('findAllActive() incluye el tipo activo de fixture y excluye el dado de baja', async () => {
      const activos = await tipoOperacionRepo.findAllActive();
      const codigos = activos.map((t) => t.codigo);
      expect(codigos).toContain(ACTIVE_TIPO_OP);
      expect(codigos).not.toContain(DELETED_TIPO_OP);
    });
  });

  // ─── Aislamiento multi-tenant (T23, ámbito reducido a catálogos) ────────

  describe('Aislamiento: repos obtienen el client SOLO desde TenantContext', () => {
    it('lanza un error descriptivo si no hay TenantContext activo', async () => {
      const looseContext = new TenantContext();
      const looseRepo = new PrismaEstadoRepository(looseContext);
      await expect(looseRepo.findByCodigo(ACTIVE_ESTADO)).rejects.toThrow(
        /No hay TenantContext activo/,
      );
    });
  });

  // ─── T11.1/T11.3 — PrismaTipoTicketRepository.save() (CRUD editable, PR11) ─

  describe('PrismaTipoTicketRepository.save() (T2, PR11)', () => {
    const NUEVO_CODIGO = 'T11_TEST_TIPO_NUEVO';

    afterEach(async () => {
      await tenantClient.tipoTicket.deleteMany({ where: { codigo: { startsWith: 'T11_TEST_' } } });
    });

    it('INSERT: persiste un tipo nuevo (id inexistente en DB)', async () => {
      const tipo = TipoTicketEntity.create({
        codigo: NUEVO_CODIGO,
        nombre: 'Nuevo desde repo',
        activo: true,
      });

      await tipoTicketRepo.save(tipo);

      const row = await tenantClient.tipoTicket.findUnique({ where: { id: tipo.id } });
      expect(row).not.toBeNull();
      expect(row!.codigo).toBe(NUEVO_CODIGO);
      expect(row!.nombre).toBe('Nuevo desde repo');
    });

    it('UPDATE: persiste cambios sobre un tipo existente sin pisar createdAt', async () => {
      const tipo = TipoTicketEntity.create({
        codigo: NUEVO_CODIGO,
        nombre: 'Original',
        activo: true,
      });
      await tipoTicketRepo.save(tipo);
      const original = await tenantClient.tipoTicket.findUniqueOrThrow({ where: { id: tipo.id } });

      tipo.actualizar({ nombre: 'Editado' });
      tipo.desactivar();
      await tipoTicketRepo.save(tipo);

      const actualizado = await tenantClient.tipoTicket.findUniqueOrThrow({
        where: { id: tipo.id },
      });
      expect(actualizado.nombre).toBe('Editado');
      expect(actualizado.activo).toBe(false);
      expect(actualizado.deletedAt).not.toBeNull();
      expect(actualizado.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });

  // ─── T11.2/T11.3 — PrismaPrioridadRepository.save() (CRUD editable, PR11) ──

  describe('PrismaPrioridadRepository.save() (T2, PR11)', () => {
    const NUEVO_CODIGO = 'T11_TEST_PRIORIDAD_NUEVA';

    afterEach(async () => {
      await tenantClient.prioridad.deleteMany({ where: { codigo: { startsWith: 'T11_TEST_' } } });
    });

    it('INSERT: persiste una prioridad nueva (id inexistente en DB)', async () => {
      const prioridad = PrioridadEntity.create({
        codigo: NUEVO_CODIGO,
        nombre: 'Nueva desde repo',
        color: '#123456',
        orden: 77,
        activo: true,
      });

      await prioridadRepo.save(prioridad);

      const row = await tenantClient.prioridad.findUnique({ where: { id: prioridad.id } });
      expect(row).not.toBeNull();
      expect(row!.codigo).toBe(NUEVO_CODIGO);
      expect(row!.orden).toBe(77);
    });

    it('UPDATE: persiste cambios sobre una prioridad existente sin pisar createdAt', async () => {
      const prioridad = PrioridadEntity.create({
        codigo: NUEVO_CODIGO,
        nombre: 'Original',
        color: null,
        orden: 1,
        activo: true,
      });
      await prioridadRepo.save(prioridad);
      const original = await tenantClient.prioridad.findUniqueOrThrow({
        where: { id: prioridad.id },
      });

      prioridad.actualizar({ nombre: 'Editada', orden: 2 });
      await prioridadRepo.save(prioridad);

      const actualizada = await tenantClient.prioridad.findUniqueOrThrow({
        where: { id: prioridad.id },
      });
      expect(actualizada.nombre).toBe('Editada');
      expect(actualizada.orden).toBe(2);
      expect(actualizada.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });
});
