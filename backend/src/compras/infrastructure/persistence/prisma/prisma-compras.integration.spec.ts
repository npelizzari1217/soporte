/**
 * T3.1, T3.3 [INTEGRATION] — RED→GREEN: PrismaTicketCompraRepository,
 * PrismaItemCompraRepository, PrismaPresupuestoRepository (save / find /
 * delete) y `PrismaArchivoRepository.linkToPresupuesto` (ADR-8, extensión
 * retrocompatible del puerto de Fase 2) contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Fixtures propios prefijados `T3_TEST_*` (mismo patrón que
 * `prisma-tickets.integration.spec.ts`, Fase 2 PR5): la DB de test NO corre
 * `TenantSeederAdapter` automáticamente, solo está migrada. Cleanup en
 * `afterAll` acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
 * global — la DB es compartida).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1..C3. Ref design: "Archivos
 * afectados" PR3, ADR-7, ADR-8. Tarea: T3.1, T3.3.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaArchivoRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-archivo.repository';
import { PrismaTicketCompraRepository } from './prisma-ticket-compra.repository';
import { PrismaItemCompraRepository } from './prisma-item-compra.repository';
import { PrismaPresupuestoRepository } from './prisma-presupuesto.repository';

import { TicketEntity, TicketProps } from '../../../../tickets/domain/entities/ticket.entity';
import { ArchivoEntity } from '../../../../tickets/domain/entities/archivo.entity';
import { TicketCompraEntity } from '../../../domain/entities/ticket-compra.entity';
import { ItemCompraEntity } from '../../../domain/entities/item-compra.entity';
import { PresupuestoEntity } from '../../../domain/entities/presupuesto.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000101';

describe('Compras Persistence Repos — Integration (PR3)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketRepo: PrismaTicketRepository;
  let archivoRepo: PrismaArchivoRepository;
  let ticketCompraRepo: PrismaTicketCompraRepository;
  let itemCompraRepo: PrismaItemCompraRepository;
  let presupuestoRepo: PrismaPresupuestoRepository;

  let tipoComprasId: string;
  let estadoNuevoId: string;
  let prioridadMediaId: string;

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `T3${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  const ticketIdsCreados: string[] = [];
  const archivoIdsCreados: string[] = [];

  function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
    return {
      numero: nextNumero(),
      titulo: 'Ticket de compra de test PR3',
      descripcion: null,
      tipoId: tipoComprasId,
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
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-pr3' },
      fn,
    );
  }

  /** Crea un Ticket base + TicketCompra satélite, persistidos directo (sin use case). */
  async function crearTicketConSatelite(): Promise<{
    ticket: TicketEntity;
    ticketCompra: TicketCompraEntity;
  }> {
    const ticket = TicketEntity.create(makeTicketProps());
    const ticketCompra = TicketCompraEntity.create({ ticketId: ticket.id });
    await withTenant(async () => {
      await ticketRepo.save(ticket);
      await ticketCompraRepo.save(ticketCompra);
    });
    ticketIdsCreados.push(ticket.id);
    return { ticket, ticketCompra };
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();

    ticketRepo = new PrismaTicketRepository(tenantContext);
    archivoRepo = new PrismaArchivoRepository(tenantContext);
    ticketCompraRepo = new PrismaTicketCompraRepository(tenantContext);
    itemCompraRepo = new PrismaItemCompraRepository(tenantContext);
    presupuestoRepo = new PrismaPresupuestoRepository(tenantContext);

    const tipoCompras = await tenantClient.tipoTicket.create({
      data: {
        codigo: 'T3_TEST_COMPRAS',
        nombre: 'Compras Test PR3',
        activo: true,
        modulo: 'COMPRAS',
      },
    });
    tipoComprasId = tipoCompras.id;

    const estadoNuevo = await tenantClient.estado.create({
      data: { codigo: 'T3_TEST_NUEVO', nombre: 'Nuevo Test PR3', orden: 1, activo: true },
    });
    estadoNuevoId = estadoNuevo.id;

    const prioridadMedia = await tenantClient.prioridad.create({
      data: { codigo: 'T3_TEST_MEDIA', nombre: 'Media Test PR3', orden: 1, activo: true },
    });
    prioridadMediaId = prioridadMedia.id;
  }, 30_000);

  afterAll(async () => {
    // Cleanup acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
    // global — soporte_tenant_test es compartida por otras suites).
    if (archivoIdsCreados.length > 0) {
      await tenantClient.archivoPresupuesto.deleteMany({
        where: { archivoId: { in: archivoIdsCreados } },
      });
      await tenantClient.archivo.deleteMany({ where: { id: { in: archivoIdsCreados } } });
    }
    if (ticketIdsCreados.length > 0) {
      await tenantClient.presupuesto.deleteMany({
        where: { ticketCompra: { ticketId: { in: ticketIdsCreados } } },
      });
      await tenantClient.itemCompra.deleteMany({
        where: { ticketCompra: { ticketId: { in: ticketIdsCreados } } },
      });
      await tenantClient.ticketCompra.deleteMany({
        where: { ticketId: { in: ticketIdsCreados } },
      });
      await tenantClient.ticket.deleteMany({ where: { id: { in: ticketIdsCreados } } });
    }
    await tenantClient.prioridad.delete({ where: { id: prioridadMediaId } });
    await tenantClient.estado.delete({ where: { id: estadoNuevoId } });
    await tenantClient.tipoTicket.delete({ where: { id: tipoComprasId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('PrismaTicketCompraRepository', () => {
    it('save() + findById() persiste y recupera el satélite', async () => {
      const { ticket, ticketCompra } = await crearTicketConSatelite();

      await withTenant(async () => {
        const found = await ticketCompraRepo.findById(ticketCompra.id);
        expect(found).not.toBeNull();
        expect(found!.ticketId).toBe(ticket.id);
        expect(found!.estaDecidida).toBe(false);
      });
    });

    it('findByTicketId() resuelve el satélite desde el ticket base', async () => {
      const { ticket, ticketCompra } = await crearTicketConSatelite();

      await withTenant(async () => {
        const found = await ticketCompraRepo.findByTicketId(ticket.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(ticketCompra.id);
      });
    });

    it('save() upsert — persiste la decisión de aprobación', async () => {
      const { ticketCompra } = await crearTicketConSatelite();
      const aprobar = ticketCompra.aprobar(DUMMY_USUARIO_ID, new Date());
      expect(aprobar.isOk()).toBe(true);

      await withTenant(async () => {
        await ticketCompraRepo.save(ticketCompra);
        const found = await ticketCompraRepo.findById(ticketCompra.id);
        expect(found!.aprobada).toBe(true);
        expect(found!.aprobadoPorId).toBe(DUMMY_USUARIO_ID);
      });
    });

    it('findAll() retorna los ticket_compra activos del tenant', async () => {
      await crearTicketConSatelite();

      await withTenant(async () => {
        const all = await ticketCompraRepo.findAll();
        expect(all.length).toBeGreaterThan(0);
      });
    });
  });

  describe('PrismaItemCompraRepository', () => {
    it('save() + findActiveByTicketCompraId() excluye soft-deleted', async () => {
      const { ticketCompra } = await crearTicketConSatelite();
      const item1 = ItemCompraEntity.create({
        ticketCompraId: ticketCompra.id,
        descripcion: 'Item activo',
        cantidad: 3,
        unidad: 'unidad',
        precioUnitarioRef: null,
        observaciones: null,
      }).getValue();
      const item2 = ItemCompraEntity.create({
        ticketCompraId: ticketCompra.id,
        descripcion: 'Item a borrar',
        cantidad: 1,
        unidad: null,
        precioUnitarioRef: null,
        observaciones: null,
      }).getValue();

      await withTenant(async () => {
        await itemCompraRepo.save(item1);
        await itemCompraRepo.save(item2);
        await itemCompraRepo.delete(item2.id);

        const activos = await itemCompraRepo.findActiveByTicketCompraId(ticketCompra.id);
        expect(activos.map((i) => i.id)).toEqual([item1.id]);

        const borrado = await itemCompraRepo.findById(item2.id);
        expect(borrado!.isDeleted()).toBe(true);
      });
    });
  });

  describe('PrismaPresupuestoRepository', () => {
    it('save() + findSelectedByTicketCompraId() refleja el swap atómico', async () => {
      const { ticketCompra } = await crearTicketConSatelite();
      const presupuestoA = PresupuestoEntity.create({
        ticketCompraId: ticketCompra.id,
        proveedor: 'Proveedor A',
        montoTotal: 1000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-01-01'),
        seleccionado: false,
        observaciones: null,
      }).getValue();
      const presupuestoB = PresupuestoEntity.create({
        ticketCompraId: ticketCompra.id,
        proveedor: 'Proveedor B',
        montoTotal: 900,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-01-02'),
        seleccionado: false,
        observaciones: null,
      }).getValue();

      await withTenant(async () => {
        await presupuestoRepo.save(presupuestoA);
        await presupuestoRepo.save(presupuestoB);

        presupuestoA.seleccionar();
        await presupuestoRepo.save(presupuestoA);

        let seleccionado = await presupuestoRepo.findSelectedByTicketCompraId(ticketCompra.id);
        expect(seleccionado!.id).toBe(presupuestoA.id);

        // Swap: deseleccionar A, seleccionar B.
        presupuestoA.deseleccionar();
        presupuestoB.seleccionar();
        await presupuestoRepo.save(presupuestoA);
        await presupuestoRepo.save(presupuestoB);

        seleccionado = await presupuestoRepo.findSelectedByTicketCompraId(ticketCompra.id);
        expect(seleccionado!.id).toBe(presupuestoB.id);

        const todos = await presupuestoRepo.findByTicketCompraId(ticketCompra.id);
        expect(todos).toHaveLength(2);
      });
    });

    it('delete() aplica soft delete', async () => {
      const { ticketCompra } = await crearTicketConSatelite();
      const presupuesto = PresupuestoEntity.create({
        ticketCompraId: ticketCompra.id,
        proveedor: 'Proveedor a borrar',
        montoTotal: 500,
        moneda: 'USD',
        fechaCotizacion: new Date('2026-01-01'),
        seleccionado: false,
        observaciones: null,
      }).getValue();

      await withTenant(async () => {
        await presupuestoRepo.save(presupuesto);
        await presupuestoRepo.delete(presupuesto.id);

        const activos = await presupuestoRepo.findByTicketCompraId(ticketCompra.id);
        expect(activos.find((p) => p.id === presupuesto.id)).toBeUndefined();

        const borrado = await presupuestoRepo.findById(presupuesto.id);
        expect(borrado!.isDeleted()).toBe(true);
      });
    });
  });

  describe('PrismaArchivoRepository.linkToPresupuesto (ADR-8)', () => {
    it('crea el join archivos_presupuesto', async () => {
      const { ticketCompra } = await crearTicketConSatelite();
      const presupuesto = PresupuestoEntity.create({
        ticketCompraId: ticketCompra.id,
        proveedor: 'Proveedor con adjunto',
        montoTotal: 2000,
        moneda: 'ARS',
        fechaCotizacion: new Date('2026-01-01'),
        seleccionado: false,
        observaciones: null,
      }).getValue();
      const archivo = ArchivoEntity.create({
        storageKey: `presupuestos/pr3-test/archivo-${Date.now()}`,
        nombreOriginal: 'cotizacion.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: BigInt(2048),
        subidoPorId: DUMMY_USUARIO_ID,
      }).getValue();

      await withTenant(async () => {
        await presupuestoRepo.save(presupuesto);
        await archivoRepo.save(archivo);
        await archivoRepo.linkToPresupuesto(archivo.id, presupuesto.id);

        const join = await tenantClient.archivoPresupuesto.findUnique({
          where: {
            archivoId_presupuestoId: { archivoId: archivo.id, presupuestoId: presupuesto.id },
          },
        });
        expect(join).not.toBeNull();
      });
      archivoIdsCreados.push(archivo.id);
    });
  });
});
