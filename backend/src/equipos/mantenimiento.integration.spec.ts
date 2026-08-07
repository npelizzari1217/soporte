/**
 * T13.5, T13.6 [INTEGRATION] — Verificación end-to-end de que el tipo
 * MANTENIMIENTO (categoría NO-IT, ya sembrado desde Fase 1) funciona con el
 * flujo BASE de Fase 2 SIN código nuevo (ADR-10, F3-M1): `CrearTicketUseCase`
 * → estado NUEVO, `numero` con prefijo `MAN-` (`PREFIJO_BASE`), SIN tabla
 * satélite, y una transición válida de la máquina de estados BASE
 * (`BaseTicketStateMachine`, fallback de `TicketStateMachineFactory` — sin
 * máquina custom registrada para MANTENIMIENTO, ADR-2).
 *
 * `CrearTicketUseCase` resuelve internamente los códigos FIJOS "NUEVO" y
 * "CAMBIO_ESTADO" por catálogo real (no aceptan prefijo de test) — por eso
 * este test, a diferencia de `prisma-compras.integration.spec.ts`/
 * `prisma-equipos.integration.spec.ts` (que usan fixtures prefijados sobre
 * `soporte_tenant_test` compartida y construyen las entidades a mano, sin
 * pasar por el use case), provisiona una DB tenant EFÍMERA real
 * (`soporte_prov_mantE2E_<rand>_test`) y la siembra con
 * `TenantSeederAdapter.seed()` real — mismo patrón que
 * `tickets.e2e.spec.ts` (Fase 2, PR6) y
 * `tenant-seeder.adapter.integration.spec.ts` (PR1). Se borra en `afterAll`.
 * NUNCA toca `soporte_master`, `soporte_tenant_test` ni ninguna otra DB
 * compartida.
 *
 * Este test NO agrega código de producción nuevo: usa `CrearTicketUseCase` y
 * `TransicionarEstadoUseCase` del núcleo `tickets/` (Fase 2) tal cual están,
 * wireados manualmente contra repos Prisma reales.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-M1. Ref design: ADR-10.
 * Tarea: T13.5, T13.6.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../shared/infrastructure/persistence/prisma-clients';
import {
  IDomainEventPublisher,
  DomainEvent,
} from '../shared/domain/ports/i-domain-event-publisher';

import { PostgresAdminService } from '../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../clientes/infrastructure/tenant-seeder.adapter';

import { PrismaTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaEstadoRepository } from '../tickets/infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaTipoTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PrismaPrioridadRepository } from '../tickets/infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaTipoOperacionRepository } from '../tickets/infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaCicloClienteRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { PrismaTenantTransactionRunner } from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { NumeradorTicket } from '../tickets/domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';
import { TicketStateMachineFactory } from '../tickets/domain/state-machine/ticket-state-machine.factory';
import { CrearTicketUseCase } from '../tickets/application/use-cases/crear-ticket.use-case';
import { TransicionarEstadoUseCase } from '../tickets/application/use-cases/transicionar-estado.use-case';
import { IUsuarioMasterChecker } from '../tickets/domain/ports/i-usuario-master.checker';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_mantE2E_${randomBytes(4).toString('hex')}_test`;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000101';

/** Publisher no-op — este test no verifica emisión de eventos. */
class NoopDomainEventPublisher implements IDomainEventPublisher {
  publish(_event: DomainEvent): void {
    // no-op
  }
}

describe('MANTENIMIENTO — flujo BASE sin código nuevo (F3-M1, ADR-10)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let crearTicketUseCase: CrearTicketUseCase;
  let transicionarEstadoUseCase: TransicionarEstadoUseCase;

  let tipoMantenimientoId: string;
  let estadoNuevoId: string;
  let estadoAsignadoId: string;
  let prioridadMediaId: string;
  let cicloActivoId: string;

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId: 'mant-e2e-cliente' },
      fn,
    );
  }

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    tenantContext = new TenantContext();

    const ticketRepo = new PrismaTicketRepository(tenantContext);
    const operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
    const estadoRepo = new PrismaEstadoRepository(tenantContext);
    const tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
    const prioridadRepo = new PrismaPrioridadRepository(tenantContext);
    const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
    const cicloRepo = new PrismaCicloClienteRepository(tenantContext);
    const txRunner = new PrismaTenantTransactionRunner(tenantContext);

    const usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'> = {
      existeEnTenant: async () => true,
    };

    crearTicketUseCase = new CrearTicketUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      prioridadRepo,
      tipoOperacionRepo,
      usuarioMasterChecker as IUsuarioMasterChecker,
      new NumeradorTicket(ticketRepo),
      new ResolverCicloActivoParaCreacion(cicloRepo),
      new NoopDomainEventPublisher(),
      txRunner,
    );

    transicionarEstadoUseCase = new TransicionarEstadoUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      new TicketStateMachineFactory(),
      new NoopDomainEventPublisher(),
      txRunner,
    );

    const tipoMantenimiento = await tenantClient.tipoTicket.findUniqueOrThrow({
      where: { codigo: 'MANTENIMIENTO' },
    });
    tipoMantenimientoId = tipoMantenimiento.id;

    const estadoNuevo = await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } });
    estadoNuevoId = estadoNuevo.id;
    const estadoAsignado = await tenantClient.estado.findUniqueOrThrow({
      where: { codigo: 'ASIGNADO' },
    });
    estadoAsignadoId = estadoAsignado.id;

    const prioridadMedia = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadMediaId = prioridadMedia.id;

    const cicloActivo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'Mantenimiento E2E Ciclo Activo',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });
    cicloActivoId = cicloActivo.id;
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 30_000);

  it('[CRITICAL] crea un ticket MANTENIMIENTO: estado NUEVO, numero MAN-, SIN satélite', async () => {
    const result = await withTenant(() =>
      crearTicketUseCase.execute({
        titulo: 'Mantenimiento preventivo de aire acondicionado',
        descripcion: null,
        tipoId: tipoMantenimientoId,
        prioridadId: prioridadMediaId,
        solicitanteId: DUMMY_USUARIO_ID,
        clienteId: 'mant-e2e-cliente',
        autorId: DUMMY_USUARIO_ID,
        anio: 2026,
      }),
    );

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();

    expect(ticket.numero.startsWith('MAN-')).toBe(true);
    expect(ticket.tipoId).toBe(tipoMantenimientoId);
    expect(ticket.estadoId).toBe(estadoNuevoId);
    expect(ticket.cicloId).toBe(cicloActivoId);

    await withTenant(async () => {
      const row = await tenantClient.ticket.findUnique({ where: { id: ticket.id } });
      expect(row).not.toBeNull();

      // SIN tabla especializada: ningún satélite de Fase 3 referencia este ticket.
      const [ticketCompra, ticketEdilicia, ticketSoporte] = await Promise.all([
        tenantClient.ticketCompra.findUnique({ where: { ticketId: ticket.id } }),
        tenantClient.ticketEdilicia.findUnique({ where: { ticketId: ticket.id } }),
        tenantClient.ticketSoporte.findUnique({ where: { ticketId: ticket.id } }),
      ]);
      expect(ticketCompra).toBeNull();
      expect(ticketEdilicia).toBeNull();
      expect(ticketSoporte).toBeNull();
    });
  });

  it('[CRITICAL] transición NUEVO→ASIGNADO válida vía BaseTicketStateMachine (sin máquina custom)', async () => {
    const crearResult = await withTenant(() =>
      crearTicketUseCase.execute({
        titulo: 'Mantenimiento de red eléctrica',
        descripcion: null,
        tipoId: tipoMantenimientoId,
        prioridadId: prioridadMediaId,
        solicitanteId: DUMMY_USUARIO_ID,
        clienteId: 'mant-e2e-cliente',
        autorId: DUMMY_USUARIO_ID,
        anio: 2026,
      }),
    );
    const ticket = crearResult.getValue();

    const transicionResult = await withTenant(() =>
      transicionarEstadoUseCase.execute({
        ticketId: ticket.id,
        nuevoEstadoCodigo: 'ASIGNADO',
        autorId: DUMMY_USUARIO_ID,
      }),
    );

    expect(transicionResult.isOk()).toBe(true);
    expect(transicionResult.getValue().estadoId).toBe(estadoAsignadoId);
  });
});
