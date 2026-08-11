/**
 * T7.1, T7.3 [INTEGRATION][RED→GREEN] — PrismaTicketEdiliciaRepository,
 * PrismaSubtareaEdiliciaRepository, PrismaUbicacionRepository (save / find /
 * delete) y `findSubtree` (CTE recursiva, árbol ≥3 niveles) contra Postgres
 * REAL (`soporte_tenant_test`).
 *
 * Fixtures propios prefijados `T7_TEST_*` (mismo patrón que
 * `prisma-compras.integration.spec.ts`, Fase 3 PR3): la DB de test NO corre
 * `TenantSeederAdapter` automáticamente, solo está migrada. Cleanup en
 * `afterAll` acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
 * global — la DB es compartida).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E2, F3-E3. Ref design:
 * "Archivos afectados" PR7, riesgo técnico #3 (findSubtree CTE). Tarea: T7.1,
 * T7.2, T7.3, T7.4.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTicketEdiliciaRepository } from './prisma-ticket-edilicia.repository';
import { PrismaSubtareaEdiliciaRepository } from './prisma-subtarea-edilicia.repository';
import { PrismaUbicacionRepository } from './prisma-ubicacion.repository';

import { TicketEntity, TicketProps } from '../../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../../domain/entities/subtarea-edilicia.entity';
import { UbicacionEntity } from '../../../domain/entities/ubicacion.entity';

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
  let ubicacionRepo: PrismaUbicacionRepository;

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
  const ubicacionIdsCreados: string[] = [];

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

  async function crearUbicacion(
    nombre: string,
    padreId: string | null = null,
  ): Promise<UbicacionEntity> {
    const ubicacion = UbicacionEntity.create({ nombre, padreId });
    await withTenant(() => ubicacionRepo.save(ubicacion));
    ubicacionIdsCreados.push(ubicacion.id);
    return ubicacion;
  }

  async function crearTicketConSatelite(
    ubicacionId: string,
  ): Promise<{ ticket: TicketEntity; edilicia: TicketEdiliciaEntity }> {
    const ticket = TicketEntity.create(makeTicketProps());
    const edilicia = TicketEdiliciaEntity.create({ ticketId: ticket.id, ubicacionId });
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
    ubicacionRepo = new PrismaUbicacionRepository(tenantContext);

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
    if (ubicacionIdsCreados.length > 0) {
      await tenantClient.ubicacion.deleteMany({ where: { id: { in: ubicacionIdsCreados } } });
    }
    await tenantClient.prioridad.delete({ where: { id: prioridadMediaId } });
    await tenantClient.estado.delete({ where: { id: estadoNuevoId } });
    await tenantClient.tipoTicket.delete({ where: { id: tipoEdiliciaId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('PrismaUbicacionRepository', () => {
    it('save() + findById() persiste y recupera la ubicación', async () => {
      const ubicacion = await crearUbicacion('T7 Edificio Central');

      await withTenant(async () => {
        const found = await ubicacionRepo.findById(ubicacion.id);
        expect(found).not.toBeNull();
        expect(found!.nombre).toBe('T7 Edificio Central');
        expect(found!.activo).toBe(true);
      });
    });

    it('save() upsert — persiste desactivar()', async () => {
      const ubicacion = await crearUbicacion('T7 Ubicacion a desactivar');
      ubicacion.desactivar();

      await withTenant(async () => {
        await ubicacionRepo.save(ubicacion);
        const found = await ubicacionRepo.findById(ubicacion.id);
        expect(found!.activo).toBe(false);
      });
    });

    it('delete() aplica soft delete', async () => {
      const ubicacion = await crearUbicacion('T7 Ubicacion a borrar');

      await withTenant(async () => {
        await ubicacionRepo.delete(ubicacion.id);
        const found = await ubicacionRepo.findById(ubicacion.id);
        expect(found!.isDeleted()).toBe(true);
      });
    });

    it('findSubtree() — CTE recursiva sobre árbol de 3 niveles (T7.3)', async () => {
      const raiz = await crearUbicacion('T7 Raiz');
      const hijo = await crearUbicacion('T7 Hijo', raiz.id);
      const nieto = await crearUbicacion('T7 Nieto', hijo.id);
      // Rama hermana, NO debe aparecer en el subárbol de `hijo`.
      const otraRaiz = await crearUbicacion('T7 Otra Raiz Sin Relacion');

      await withTenant(async () => {
        const subtreeDesdeRaiz = await ubicacionRepo.findSubtree(raiz.id);
        const idsDesdeRaiz = subtreeDesdeRaiz.map((u) => u.id).sort();
        expect(idsDesdeRaiz).toEqual([raiz.id, hijo.id, nieto.id].sort());
        expect(idsDesdeRaiz).not.toContain(otraRaiz.id);

        const subtreeDesdeHijo = await ubicacionRepo.findSubtree(hijo.id);
        expect(subtreeDesdeHijo.map((u) => u.id).sort()).toEqual([hijo.id, nieto.id].sort());

        const subtreeDesdeNieto = await ubicacionRepo.findSubtree(nieto.id);
        expect(subtreeDesdeNieto.map((u) => u.id)).toEqual([nieto.id]);
      });
    });

    it('findSubtree() excluye ramas soft-deleted', async () => {
      const raiz = await crearUbicacion('T7 Raiz Con Baja');
      const hijo = await crearUbicacion('T7 Hijo Con Baja', raiz.id);

      await withTenant(async () => {
        await ubicacionRepo.delete(hijo.id);
        const subtree = await ubicacionRepo.findSubtree(raiz.id);
        expect(subtree.map((u) => u.id)).toEqual([raiz.id]);
      });
    });
  });

  describe('PrismaTicketEdiliciaRepository', () => {
    it('save() + findById() persiste y recupera el satélite', async () => {
      const ubicacion = await crearUbicacion('T7 Ubicacion Ticket');
      const { ticket, edilicia } = await crearTicketConSatelite(ubicacion.id);

      await withTenant(async () => {
        const found = await ediliciaRepo.findById(edilicia.id);
        expect(found).not.toBeNull();
        expect(found!.ticketId).toBe(ticket.id);
        expect(found!.porcentajeAvance).toBe(0);
      });
    });

    it('findByTicketId() resuelve el satélite desde el ticket base', async () => {
      const ubicacion = await crearUbicacion('T7 Ubicacion Ticket 2');
      const { ticket, edilicia } = await crearTicketConSatelite(ubicacion.id);

      await withTenant(async () => {
        const found = await ediliciaRepo.findByTicketId(ticket.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(edilicia.id);
      });
    });

    it('save() upsert — persiste actualizarAvance() y asignarPersonal()', async () => {
      const ubicacion = await crearUbicacion('T7 Ubicacion Ticket 3');
      const { edilicia } = await crearTicketConSatelite(ubicacion.id);
      edilicia.actualizarAvance(66.67);
      edilicia.asignarPersonal(DUMMY_USUARIO_ID);

      await withTenant(async () => {
        await ediliciaRepo.save(edilicia);
        const found = await ediliciaRepo.findById(edilicia.id);
        expect(found!.porcentajeAvance).toBe(66.67);
        expect(found!.personalAsignadoId).toBe(DUMMY_USUARIO_ID);
      });
    });

    it('findByUbicacionId() retorna los satélites que referencian la ubicación', async () => {
      const ubicacion = await crearUbicacion('T7 Ubicacion Ticket 4');
      const { edilicia } = await crearTicketConSatelite(ubicacion.id);

      await withTenant(async () => {
        const encontrados = await ediliciaRepo.findByUbicacionId(ubicacion.id);
        expect(encontrados.map((e) => e.id)).toContain(edilicia.id);
      });
    });
  });

  describe('PrismaSubtareaEdiliciaRepository', () => {
    it('save() + findActiveByTicketEdiliciaId() excluye soft-deleted y ordena por orden', async () => {
      const ubicacion = await crearUbicacion('T7 Ubicacion Subtareas');
      const { edilicia } = await crearTicketConSatelite(ubicacion.id);
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
      const ubicacion = await crearUbicacion('T7 Ubicacion Subtareas 2');
      const { edilicia } = await crearTicketConSatelite(ubicacion.id);
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
