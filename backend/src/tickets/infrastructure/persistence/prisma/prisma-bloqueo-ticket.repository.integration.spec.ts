/**
 * [INTEGRATION] `PrismaBloqueoTicketRepository` contra un tenant efímero
 * (odd/ticket-cerrado-solo-lectura, S2): el bloqueo por compra se lee por `ticketId`, con el
 * MISMO criterio que el chip "Bloqueada" del listado de reparaciones. Desde odd/ticket-unificado
 * (S5) el vínculo es `ticket_compra`: vale para un ticket de cualquier tipo. Que la tabla vieja
 * `reparacion_compra` no se lea lo verifica `reparaciones/sin-tablas-del-satelite.spec.ts`.
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

  let tipoSoporteId: string;
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

  /** Ticket de un tipo del módulo TICKETS, sin satélite de Edilicia. */
  async function crearTicket(): Promise<string> {
    const ticket = await tenantClient.ticket.create({
      data: {
        numero: `BLQ-${randomBytes(5).toString('hex')}`,
        titulo: 'Ticket de test de bloqueo',
        tipoId: tipoSoporteId,
        estadoId,
        prioridadId,
        solicitanteId: DUMMY_USUARIO_ID,
      },
    });
    return ticket.id;
  }

  async function vincular(ticketId: string, compraId: string): Promise<void> {
    await tenantClient.ticketCompra.create({ data: { ticketId, compraId } });
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

    tipoSoporteId = (
      await tenantClient.tipoTicket.create({
        data: {
          codigo: 'BLQ_TEST_SOPORTE',
          nombre: 'Soporte Test',
          activo: true,
          modulo: 'TICKETS',
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

  it('un ticket sin compras vinculadas nunca está bloqueado', async () => {
    const ticketId = await crearTicket();
    await withTenant(async () => {
      expect(await repo.estaBloqueadoPorCompra(ticketId)).toBe(false);
      expect(await repo.comprasVinculadas(ticketId)).toEqual([]);
    });
  });

  it('un ticket de cualquier tipo, sin satélite, con una compra activa vinculada queda bloqueado (S5)', async () => {
    const ticketId = await crearTicket();
    await vincular(ticketId, await crearCompra());

    expect(await withTenant(() => repo.estaBloqueadoPorCompra(ticketId))).toBe(true);
  });

  it('una compra cancelada o eliminada no bloquea, y el bloqueo es por ticket, no global', async () => {
    const conCancelada = await crearTicket();
    await vincular(conCancelada, await crearCompra({ cancelada: true }));
    const conEliminada = await crearTicket();
    await vincular(conEliminada, await crearCompra({ eliminada: true }));
    const bloqueado = await crearTicket();
    await vincular(bloqueado, await crearCompra());

    await withTenant(async () => {
      expect(await repo.estaBloqueadoPorCompra(conCancelada)).toBe(false);
      expect(await repo.estaBloqueadoPorCompra(conEliminada)).toBe(false);
      expect(await repo.estaBloqueadoPorCompra(bloqueado)).toBe(true);
    });
  });

  it('comprasVinculadas: los números en cualquier estado salvo eliminadas, por número', async () => {
    const ticketId = await crearTicket();
    const activa = await crearCompra();
    const cancelada = await crearCompra({ cancelada: true });
    await crearCompra(); // de otro ticket: no aparece
    const eliminada = await crearCompra({ eliminada: true });
    await vincular(ticketId, cancelada);
    await vincular(ticketId, activa);
    await vincular(ticketId, eliminada);
    const numeros = await tenantClient.compra.findMany({
      where: { id: { in: [activa, cancelada] } },
      select: { numero: true },
      orderBy: { numero: 'asc' },
    });

    expect(await withTenant(() => repo.comprasVinculadas(ticketId))).toEqual(
      numeros.map((c) => c.numero),
    );
  });

  // odd/preventivo-por-tipo: lo que vuelve no borrable a un ticket es el enlace con un plan, no el
  // tipo. El ticket enlazado es de Soporte; el hermano, del mismo tipo y sin enlace.
  it('generadoPorPlanPreventivo: true solo para el ticket enlazado por preventivo_generacion', async () => {
    const enlazado = await crearTicket();
    const suelto = await crearTicket();
    const plan = await tenantClient.planPreventivo.create({
      data: {
        titulo: 'Plan de test de bloqueo',
        ubicacion: 'DEPOSITO',
        prioridadId,
        tipoId: tipoSoporteId,
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
        ticketId: enlazado,
      },
    });

    await withTenant(async () => {
      expect(await repo.generadoPorPlanPreventivo(enlazado)).toBe(true);
      expect(await repo.generadoPorPlanPreventivo(suelto)).toBe(false);
    });
  });
});
