/**
 * T7.1, T7.3 [INTEGRATION][RED→GREEN] — PrismaTicketEdiliciaRepository,
 * PrismaSubtareaEdiliciaRepository (save / find / delete) contra Postgres
 * REAL (`soporte_tenant_test`). `ubicacion` es texto libre embebido en
 * `ticket_edilicia` (ex-catálogo Ubicacion/PrismaUbicacionRepository
 * removido).
 *
 * Fixtures propios prefijados `T7_TEST_*` (mismo patrón que
 * `prisma-compras.integration.spec.ts`, Fase 3 PR3): la DB de test NO corre
 * `TenantSeederAdapter` automáticamente, solo está migrada. Cleanup en
 * `afterAll` acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
 * global — la DB es compartida).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E2, F3-E3. Tarea: T7.1,
 * T7.2, T7.4.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTicketEdiliciaRepository } from './prisma-ticket-edilicia.repository';
import { PrismaSubtareaEdiliciaRepository } from './prisma-subtarea-edilicia.repository';

import { TicketEntity, TicketProps } from '../../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../../domain/entities/subtarea-edilicia.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000201';

describe('Reparaciones Persistence Repos — Integration (PR7)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketRepo: PrismaTicketRepository;
  let ediliciaRepo: PrismaTicketEdiliciaRepository;
  let subtareaRepo: PrismaSubtareaEdiliciaRepository;

  let tipoEdiliciaId: string;
  let estadoNuevoId: string;
  let prioridadMediaId: string;

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `T7${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  const ticketIdsCreados: string[] = [];

  function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
    return {
      numero: nextNumero(),
      titulo: 'Ticket edilicio de test PR7',
      descripcion: null,
      tipoId: tipoEdiliciaId,
      estadoId: estadoNuevoId,
      prioridadId: prioridadMediaId,
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: DUMMY_USUARIO_ID,
      asignadoId: null,
      slaVenceAt: null,
      vencido: false,
      fechaCierre: null,
      ...overrides,
    };
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-pr7' },
      fn,
    );
  }

  async function crearTicketConSatelite(
    ubicacion: string,
  ): Promise<{ ticket: TicketEntity; edilicia: TicketEdiliciaEntity }> {
    const ticket = TicketEntity.create(makeTicketProps());
    const edilicia = TicketEdiliciaEntity.create({ ticketId: ticket.id, ubicacion });
    await withTenant(async () => {
      await ticketRepo.save(ticket);
      await ediliciaRepo.save(edilicia);
    });
    ticketIdsCreados.push(ticket.id);
    return { ticket, edilicia };
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();

    ticketRepo = new PrismaTicketRepository(tenantContext);
    ediliciaRepo = new PrismaTicketEdiliciaRepository(tenantContext);
    subtareaRepo = new PrismaSubtareaEdiliciaRepository(tenantContext);

    const tipoEdilicia = await tenantClient.tipoTicket.create({
      data: {
        codigo: 'T7_TEST_EDILICIA',
        nombre: 'Edilicia Test PR7',
        activo: true,
        modulo: 'EDILICIA',
      },
    });
    tipoEdiliciaId = tipoEdilicia.id;

    const estadoNuevo = await tenantClient.estado.create({
      data: { codigo: 'T7_TEST_NUEVO', nombre: 'Nuevo Test PR7', orden: 1, activo: true },
    });
    estadoNuevoId = estadoNuevo.id;

    const prioridadMedia = await tenantClient.prioridad.create({
      data: { codigo: 'T7_TEST_MEDIA', nombre: 'Media Test PR7', orden: 1, activo: true },
    });
    prioridadMediaId = prioridadMedia.id;
  }, 30_000);

  afterAll(async () => {
    // Cleanup acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
    // global — soporte_tenant_test es compartida por otras suites).
    if (ticketIdsCreados.length > 0) {
      await tenantClient.subtareaEdilicia.deleteMany({
        where: { ticketEdilicia: { ticketId: { in: ticketIdsCreados } } },
      });
      await tenantClient.ticketEdilicia.deleteMany({
        where: { ticketId: { in: ticketIdsCreados } },
      });
      await tenantClient.ticket.deleteMany({ where: { id: { in: ticketIdsCreados } } });
    }
    await tenantClient.prioridad.delete({ where: { id: prioridadMediaId } });
    await tenantClient.estado.delete({ where: { id: estadoNuevoId } });
    await tenantClient.tipoTicket.delete({ where: { id: tipoEdiliciaId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('PrismaTicketEdiliciaRepository', () => {
    it('save() + findById() persiste y recupera el satélite, con ubicacion como texto libre', async () => {
      const { ticket, edilicia } = await crearTicketConSatelite('T7 Ubicacion Ticket');

      await withTenant(async () => {
        const found = await ediliciaRepo.findById(edilicia.id);
        expect(found).not.toBeNull();
        expect(found!.ticketId).toBe(ticket.id);
        expect(found!.ubicacion).toBe('T7 Ubicacion Ticket');
        expect(found!.porcentajeAvance).toBe(0);
      });
    });

    it('findByTicketId() resuelve el satélite desde el ticket base', async () => {
      const { ticket, edilicia } = await crearTicketConSatelite('T7 Ubicacion Ticket 2');

      await withTenant(async () => {
        const found = await ediliciaRepo.findByTicketId(ticket.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(edilicia.id);
      });
    });

    it('save() upsert — persiste actualizarAvance() y asignarPersonal()', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Ticket 3');
      edilicia.actualizarAvance(66.67);
      edilicia.asignarPersonal(DUMMY_USUARIO_ID);

      await withTenant(async () => {
        await ediliciaRepo.save(edilicia);
        const found = await ediliciaRepo.findById(edilicia.id);
        expect(found!.porcentajeAvance).toBe(66.67);
        expect(found!.personalAsignadoId).toBe(DUMMY_USUARIO_ID);
      });
    });
  });

  describe('PrismaSubtareaEdiliciaRepository', () => {
    it('save() + findActiveByTicketEdiliciaId() excluye soft-deleted y ordena por orden', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Subtareas');
      const sub1 = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: edilicia.id,
        descripcion: 'Subtarea 1',
        orden: 1,
      });
      const sub2 = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: edilicia.id,
        descripcion: 'Subtarea 2 (a borrar)',
        orden: 2,
      });

      await withTenant(async () => {
        await subtareaRepo.save(sub1);
        await subtareaRepo.save(sub2);
        await subtareaRepo.delete(sub2.id);

        const activas = await subtareaRepo.findActiveByTicketEdiliciaId(edilicia.id);
        expect(activas.map((s) => s.id)).toEqual([sub1.id]);

        const borrada = await subtareaRepo.findById(sub2.id);
        expect(borrada!.isDeleted()).toBe(true);
      });
    });

    it('save() upsert — persiste completar()', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Subtareas 2');
      const sub = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: edilicia.id,
        descripcion: 'Subtarea a completar',
      });

      await withTenant(async () => {
        await subtareaRepo.save(sub);
        sub.completar(DUMMY_USUARIO_ID);
        await subtareaRepo.save(sub);

        const found = await subtareaRepo.findById(sub.id);
        expect(found!.completada).toBe(true);
        expect(found!.completadaPorId).toBe(DUMMY_USUARIO_ID);
      });
    });
  });
});
