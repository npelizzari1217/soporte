/**
 * [INTEGRATION] WU-3a.4 (sdd/sla-primera-respuesta-y-pausa): guardia de regresión contra Postgres REAL
 * (`soporte_tenant_test`). `AsignarYPonerEnProcesoUseCase` solo recorre arcos en los que el reloj sigue
 * corriendo: no marca, deja `operaciones_ticket.sla_reloj_seq` en NULL y la versión en 0 (sla-reloj-activo R1).
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaTicketRepository } from '../../infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaEstadoRepository } from '../../infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaTipoTicketRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaOperacionTicketRepository } from '../../infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { AsignarYPonerEnProcesoUseCase } from './asignar-y-poner-en-proceso.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

describe('AsignarYPonerEnProceso no marca el reloj de SLA (WU-3a.4)', () => {
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let ticketRepo: PrismaTicketRepository;
  let txRunner: PrismaTenantTransactionRunner;
  let ids: { tipo: string; prioridad: string };

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    ticketRepo = new PrismaTicketRepository(tenantContext);
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    const s = randomBytes(3).toString('hex');
    ids = {
      tipo: (
        await client.tipoTicket.create({
          data: { codigo: `WU3AG${s}`, nombre: 'WU3a', activo: true, modulo: 'SOPORTE' },
        })
      ).id,
      prioridad: (
        await client.prioridad.create({
          data: { codigo: `WU3AQ${s}`, nombre: 'WU3a', orden: 1, activo: true },
        })
      ).id,
    };
  }, 30_000);

  afterAll(async () => {
    await client.tipoTicket.delete({ where: { id: ids.tipo } });
    await client.prioridad.delete({ where: { id: ids.prioridad } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: TENANT_TEST_DB_NAME, clienteId: 'wu3a' }, fn);

  it('en arcos donde el reloj sigue corriendo no marca y deja sla_reloj_seq NULL', async () => {
    // Catálogos reales que el use case resuelve por código; solo se borran los que creó este test.
    const creados: Array<() => Promise<unknown>> = [];
    const asegurar = async (codigo: string, orden: number): Promise<string> => {
      const previo = await client.estado.findUnique({ where: { codigo } });
      if (previo) return previo.id;
      const e = await client.estado.create({
        data: { codigo, nombre: codigo, orden, activo: true },
      });
      creados.push(() => client.estado.delete({ where: { id: e.id } }));
      return e.id;
    };
    const nuevoId = await asegurar('NUEVO', 1);
    await asegurar('ASIGNADO', 2);
    await asegurar('EN_PROCESO', 3);
    for (const codigo of ['ASIGNACION', 'CAMBIO_ESTADO']) {
      if (!(await client.tipoOperacion.findUnique({ where: { codigo } }))) {
        const t = await client.tipoOperacion.create({ data: { codigo, nombre: codigo } });
        creados.push(() => client.tipoOperacion.delete({ where: { id: t.id } }));
      }
    }
    const ticket = TicketEntity.create({
      numero: `W3A-ASG-${randomBytes(3).toString('hex')}`,
      titulo: 'Ticket WU-3a asignar',
      descripcion: null,
      tipoId: ids.tipo,
      estadoId: nuevoId,
      prioridadId: ids.prioridad,
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: DUMMY_USUARIO_ID,
    });
    await withTenant(() => ticketRepo.save(ticket));
    const useCase = new AsignarYPonerEnProcesoUseCase(
      ticketRepo,
      new PrismaOperacionTicketRepository(tenantContext),
      new PrismaEstadoRepository(tenantContext),
      new PrismaTipoTicketRepository(tenantContext),
      new PrismaTipoOperacionRepository(tenantContext),
      {
        estaActivoEnTenant: async () => true,
        getAutorizacionModulos: async () => ({ esAdminTotal: true, modulos: [] }),
      },
      new TicketStateMachineFactory(),
      txRunner,
    );

    try {
      const result = await withTenant(() =>
        useCase.execute({
          ticketId: ticket.id,
          asignadoId: DUMMY_USUARIO_ID,
          autorId: DUMMY_USUARIO_ID,
          clienteId: 'wu3a',
        }),
      );
      expect(result.isOk()).toBe(true);

      const ops = await client.operacionTicket.findMany({ where: { ticketId: ticket.id } });
      expect(ops.length).toBeGreaterThanOrEqual(2); // asignación + cambios de estado
      expect(ops.every((o) => o.slaRelojSeq === null)).toBe(true);
      const fila = await client.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(fila.slaRelojVersion).toBe(0);
      expect(fila.slaRelojPendiente).toBe(false);
    } finally {
      await client.operacionTicket.deleteMany({ where: { ticketId: ticket.id } });
      await client.ticket.delete({ where: { id: ticket.id } });
      for (const borrar of creados.reverse()) await borrar();
    }
  }, 30_000);
});
