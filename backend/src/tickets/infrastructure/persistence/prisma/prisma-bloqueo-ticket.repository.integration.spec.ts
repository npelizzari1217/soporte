/**
 * [INTEGRATION] `PrismaBloqueoTicketRepository` contra un tenant efímero
 * (odd/ticket-cerrado-solo-lectura, S2): el bloqueo por compra se lee por `ticketId`, con el
 * MISMO criterio que el chip "Bloqueada" del listado de reparaciones.
 *
 * No toca master: sin `usarLockMasterTest()`. Tenant propio: se destruye entero al final.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PrismaBloqueoTicketRepository } from './prisma-bloqueo-ticket.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_bloqueo_ticket_${randomBytes(4).toString('hex')}_test`;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000401';

describe('PrismaBloqueoTicketRepository (tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaBloqueoTicketRepository;

  let tipoEdiliciaId: string;
  let estadoId: string;
  let prioridadId: string;
  let cicloId: string;
  let numeroCounter = 0;

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId: 'test-cliente-bloqueo' },
      fn,
    );
  }

  async function crearTicket(
    conReparacion: boolean,
  ): Promise<{ ticketId: string; ediliciaId: string }> {
    const ticket = await tenantClient.ticket.create({
      data: {
        numero: `BLQ-${randomBytes(5).toString('hex')}`,
        titulo: 'Ticket de test de bloqueo',
        tipoId: tipoEdiliciaId,
        estadoId,
        prioridadId,
        solicitanteId: DUMMY_USUARIO_ID,
      },
    });
    if (!conReparacion) return { ticketId: ticket.id, ediliciaId: '' };
    const edilicia = await tenantClient.ticketEdilicia.create({ data: { ticketId: ticket.id } });
    return { ticketId: ticket.id, ediliciaId: edilicia.id };
  }

  /** Compra con un ítem aprobado y nada recibido (grupo ACTIVAS), o cancelada. */
  async function crearCompra(
    opciones: { cancelada?: boolean; eliminada?: boolean } = {},
  ): Promise<string> {
    numeroCounter += 1;
    const compra = await tenantClient.compra.create({
      data: {
        numero: `COM-2026-B${String(numeroCounter).padStart(4, '0')}`,
        fechaSolicitud: new Date('2026-01-01'),
        motivo: 'Compra de test de bloqueo',
        solicitanteId: DUMMY_USUARIO_ID,
        cicloId,
        // El CHECK `compras_cancelacion_atomica_check` exige los tres campos juntos.
        canceladaEn: opciones.cancelada ? new Date('2026-01-03') : null,
        canceladoPorId: opciones.cancelada ? DUMMY_USUARIO_ID : null,
        motivoCancelacion: opciones.cancelada ? 'Cancelada en el test' : null,
        deletedAt: opciones.eliminada ? new Date('2026-01-04') : null,
      },
    });
    await tenantClient.itemCompra.create({
      data: {
        compraId: compra.id,
        descripcion: 'Repuesto de test',
        cantidad: 10,
        proveedor: 'Proveedor Test',
        monto: 100,
        fechaCotizacion: new Date('2026-01-01'),
        estadoAprobacion: 'APROBADO',
        decididoPorId: DUMMY_USUARIO_ID,
        decididoEn: new Date('2026-01-02'),
        cantidadOrdenada: 10,
      },
    });
    return compra.id;
  }

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    tenantContext = new TenantContext();
    repo = new PrismaBloqueoTicketRepository(tenantContext);

    tipoEdiliciaId = (
      await tenantClient.tipoTicket.create({
        data: {
          codigo: 'BLQ_TEST_EDILICIA',
          nombre: 'Edilicia Test',
          activo: true,
          modulo: 'EDILICIA',
        },
      })
    ).id;
    estadoId = (
      await tenantClient.estado.create({
        data: { codigo: 'BLQ_TEST_EN_PROCESO', nombre: 'En proceso Test', orden: 1, activo: true },
      })
    ).id;
    prioridadId = (
      await tenantClient.prioridad.create({
        data: { codigo: 'BLQ_TEST_MEDIA', nombre: 'Media Test', orden: 1, activo: true },
      })
    ).id;
    cicloId = (
      await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: DUMMY_USUARIO_ID,
          nombre: 'Ciclo Test Bloqueo',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  it('un ticket sin reparación nunca está bloqueado', async () => {
    const { ticketId } = await crearTicket(false);
    expect(await withTenant(() => repo.estaBloqueadoPorCompra(ticketId))).toBe(false);
  });

  it('una reparación con una compra activa vinculada bloquea al ticket', async () => {
    const { ticketId, ediliciaId } = await crearTicket(true);
    const compraId = await crearCompra();
    await tenantClient.reparacionCompra.create({
      data: { ticketEdiliciaId: ediliciaId, compraId },
    });

    expect(await withTenant(() => repo.estaBloqueadoPorCompra(ticketId))).toBe(true);
  });

  it('una compra cancelada o eliminada no bloquea, y el bloqueo es por ticket, no global', async () => {
    const conCancelada = await crearTicket(true);
    await tenantClient.reparacionCompra.create({
      data: {
        ticketEdiliciaId: conCancelada.ediliciaId,
        compraId: await crearCompra({ cancelada: true }),
      },
    });
    const conEliminada = await crearTicket(true);
    await tenantClient.reparacionCompra.create({
      data: {
        ticketEdiliciaId: conEliminada.ediliciaId,
        compraId: await crearCompra({ eliminada: true }),
      },
    });
    const bloqueado = await crearTicket(true);
    await tenantClient.reparacionCompra.create({
      data: { ticketEdiliciaId: bloqueado.ediliciaId, compraId: await crearCompra() },
    });

    await withTenant(async () => {
      expect(await repo.estaBloqueadoPorCompra(conCancelada.ticketId)).toBe(false);
      expect(await repo.estaBloqueadoPorCompra(conEliminada.ticketId)).toBe(false);
      expect(await repo.estaBloqueadoPorCompra(bloqueado.ticketId)).toBe(true);
    });
  });

  // odd/preventivo-por-tipo: lo que vuelve no borrable a un ticket es el enlace con un plan, no el
  // tipo. El ticket enlazado es de Edilicia; el hermano, del mismo tipo y sin enlace.
  it('generadoPorPlanPreventivo: true solo para el ticket enlazado por preventivo_generacion', async () => {
    const enlazado = await crearTicket(false);
    const suelto = await crearTicket(false);
    const plan = await tenantClient.planPreventivo.create({
      data: {
        titulo: 'Plan de test de bloqueo',
        ubicacion: 'DEPOSITO',
        prioridadId,
        tipoId: tipoEdiliciaId,
        responsableId: DUMMY_USUARIO_ID,
        intervaloValor: 1,
        intervaloUnidad: 'MESES',
        fechaInicio: new Date('2026-01-01'),
        proximaEjecucionEn: new Date('2026-02-01'),
      },
    });
    await tenantClient.preventivoGeneracion.create({
      data: {
        planId: plan.id,
        fechaProgramada: new Date('2026-01-01'),
        resultado: 'GENERADO',
        ticketId: enlazado.ticketId,
      },
    });

    await withTenant(async () => {
      expect(await repo.generadoPorPlanPreventivo(enlazado.ticketId)).toBe(true);
      expect(await repo.generadoPorPlanPreventivo(suelto.ticketId)).toBe(false);
    });
  });
});
