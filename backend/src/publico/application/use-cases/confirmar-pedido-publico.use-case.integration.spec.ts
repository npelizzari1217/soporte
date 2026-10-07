/**
 * [INTEGRATION] Confirmacion del pedido publico (sdd/formulario-publico-qr, WU-14, tarea 14.1) contra
 * Postgres REAL, en un tenant EFIMERO migrado, con los repositorios y el `txRunner` reales
 * (`CrearTicketSoporteUseCase` incluido):
 *   - `Promise.all` de dos confirmaciones del mismo link: un ticket y un 404.
 *   - Sin ciclo activo: 409, sin ticket ni solicitante y el pendiente sigue (el link sigue valido y
 *     confirma cuando el ciclo aparece).
 *   - Un `prioridadId` CRITICA que llegue al caso de uso se ignora: el ticket sale MEDIA.
 * El token de master es un doble en memoria: lo que se prueba es la atomicidad del tenant, y asi el
 * spec no toca `soporte_master_test` (sin `usarLockMasterTest()`).
 * Higiene: filas -> cerrar pool -> dropDatabase.
 */
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { CrearTicketSoporteUseCase } from '../../../equipos/application/use-cases/crear-ticket-soporte.use-case';
import { PrismaEquipoInformaticoRepository } from '../../../equipos/infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaTicketSoporteRepository } from '../../../equipos/infrastructure/persistence/prisma/prisma-ticket-soporte.repository';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { ResolverCicloActivoParaCreacion } from '../../../tickets/application/services/resolver-ciclo-activo.service';
import { AUTOR_FORMULARIO_PUBLICO } from '../../../tickets/domain/constants/formulario-publico.constants';
import { SinCicloActivoError } from '../../../tickets/domain/errors/tickets.errors';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { PrismaCicloClienteRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { PrismaEstadoRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaOperacionTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaPrioridadRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaSolicitanteExternoRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-solicitante-externo.repository';
import { PrismaTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTipoOperacionRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaTipoTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PedidoPendienteEntity } from '../../domain/entities/pedido-pendiente.entity';
import { PedidoPublicoTokenEntity } from '../../domain/entities/pedido-publico-token.entity';
import { FormularioPublicoNoDisponibleError } from '../../domain/errors/publico.errors';
import { IPedidoPublicoTokenRepository } from '../../domain/ports/i-pedido-publico-token.repository';
import { PrismaPedidoPendienteRepository } from '../../infrastructure/persistence/prisma/prisma-pedido-pendiente.repository';
import { ResolverClientePublicoService } from '../services/resolver-cliente-publico.service';
import {
  ConfirmarPedidoPublicoCommand,
  ConfirmarPedidoPublicoUseCase,
} from './confirmar-pedido-publico.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB = `soporte_confirmar_pedido_${sufijo}_test`;
const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const TOKEN_CRUDO = 'token-crudo-integracion';

type Client = InstanceType<typeof TenantPrismaClient>;

describe('ConfirmarPedidoPublicoUseCase (WU-14, tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: Client;
  let prioridadMediaId = '';
  let prioridadCriticaId = '';
  const tenantContext = new TenantContext();
  const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
  const publicar = vi.fn();
  const logger = { error: vi.fn() };

  const clienteRepo: IClienteRepository = {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findBySlug: vi.fn().mockImplementation(async () =>
      ClienteEntity.reconstitute(
        {
          nombre: 'Colegio Norte',
          razonSocial: null,
          cuit: null,
          dbName: DB,
          activo: true,
          slug: 'colegio-norte',
          formularioPublicoHabilitado: true,
        },
        CLIENTE_ID,
        new Date(),
        new Date(),
        null,
      ),
    ),
    congelarSlug: vi.fn(),
    fijarRequiere2fa: vi.fn(),
    obtenerRequiere2fa: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };

  /** Token de master en memoria: `marcarUsado` es un CAS sobre `usedAt`, como el real. */
  const tokens = new Map<string, PedidoPublicoTokenEntity>();
  const marcados: string[] = [];
  const tokenRepo: IPedidoPublicoTokenRepository = {
    save: async (t) => {
      tokens.set(t.tokenHash, t);
    },
    findByHash: async (hash) => tokens.get(hash) ?? null,
    marcarUsado: async (id) => {
      if (marcados.includes(id)) return false;
      marcados.push(id);
      return true;
    },
  };

  const pendienteRepo = new PrismaPedidoPendienteRepository(tenantContext);

  function armar(): ConfirmarPedidoPublicoUseCase {
    const resolver = new ResolverClientePublicoService(clienteRepo, prismaService, tenantContext);
    const crearTicket = new CrearTicketSoporteUseCase(
      new PrismaTicketRepository(tenantContext),
      new PrismaOperacionTicketRepository(tenantContext),
      new PrismaTicketSoporteRepository(tenantContext),
      new PrismaEstadoRepository(tenantContext),
      new PrismaTipoTicketRepository(tenantContext),
      new PrismaTipoOperacionRepository(tenantContext),
      { existeEnTenant: async () => true },
      new NumeradorTicket(new PrismaTicketRepository(tenantContext)),
      new ResolverCicloActivoParaCreacion(new PrismaCicloClienteRepository(tenantContext)),
      new PrismaEquipoInformaticoRepository(tenantContext),
      { publish: publicar },
      txRunner,
    );
    return new ConfirmarPedidoPublicoUseCase(
      resolver,
      { estado: async () => 'LISTO' },
      tokenRepo,
      pendienteRepo,
      new PrismaSolicitanteExternoRepository(tenantContext),
      new PrismaPrioridadRepository(tenantContext),
      crearTicket,
      txRunner,
      logger,
    );
  }

  /** Cada confirmacion corre en su PROPIO scope, como cada request: `bind` no se comparte. */
  const confirmar = (
    useCase: ConfirmarPedidoPublicoUseCase,
    cmd: ConfirmarPedidoPublicoCommand = { slug: 'colegio-norte', token: TOKEN_CRUDO },
  ) =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, () =>
      useCase.ejecutar(cmd),
    );

  async function sembrarPendiente(): Promise<PedidoPendienteEntity> {
    const pedido = PedidoPendienteEntity.create({
      nombre: 'Ana Perez',
      email: 'ana@ejemplo.com',
      telefono: '1155550000',
      titulo: 'No enciende',
      descripcion: 'La PC no enciende',
    }).getValue();
    await tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, () =>
      pendienteRepo.save(pedido),
    );
    tokens.set(
      sha256(TOKEN_CRUDO),
      PedidoPublicoTokenEntity.emitir(
        { clienteId: CLIENTE_ID, tokenHash: sha256(TOKEN_CRUDO) },
        pedido.id,
      ),
    );
    return pedido;
  }

  const crearCicloActivo = () =>
    client.cicloCliente.create({
      data: {
        cicloVigenteId: '01977a00-0000-7000-8000-0000000000d1',
        nombre: 'Ciclo integracion',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });

  async function limpiar(): Promise<void> {
    await client.ticketSoporte.deleteMany();
    await client.operacionTicket.deleteMany();
    await client.ticket.deleteMany();
    await client.solicitanteExterno.deleteMany();
    await client.pedidoPublicoPendiente.deleteMany();
    await client.cicloCliente.deleteMany();
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
    await client.tipoTicket.create({
      data: { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS' },
    });
    await client.estado.create({ data: { codigo: 'NUEVO', nombre: 'Nuevo' } });
    await client.tipoOperacion.create({ data: { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio' } });
    prioridadMediaId = (
      await client.prioridad.create({ data: { codigo: 'MEDIA', nombre: 'Media' } })
    ).id;
    prioridadCriticaId = (
      await client.prioridad.create({ data: { codigo: 'CRITICA', nombre: 'Critica' } })
    ).id;
  }, 120_000);

  beforeEach(async () => {
    await limpiar();
    tokens.clear();
    marcados.length = 0;
    publicar.mockClear();
    logger.error.mockClear();
  });

  afterAll(async () => {
    try {
      await limpiar();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB);
  }, 60_000);

  it('Promise.all de dos confirmaciones del mismo link da un ticket y un 404', async () => {
    await crearCicloActivo();
    const pedido = await sembrarPendiente();
    const useCase = armar();

    const [a, b] = await Promise.all([confirmar(useCase), confirmar(useCase)]);

    const [ok, fallo] = [a, b].sort((x, y) => Number(y.isOk()) - Number(x.isOk()));
    expect(ok.isOk()).toBe(true);
    expect(fallo.isFail()).toBe(true);
    expect(fallo.getError()).toBeInstanceOf(FormularioPublicoNoDisponibleError);
    expect(await client.ticket.count()).toBe(1);
    expect(await client.solicitanteExterno.count()).toBe(1);
    expect(await client.pedidoPublicoPendiente.count()).toBe(0);
    expect(marcados).toEqual([pedido.id]);
    expect(publicar).toHaveBeenCalledTimes(1);
    const ticket = await client.ticket.findFirstOrThrow({ include: { solicitanteExterno: true } });
    expect(ticket.solicitanteId).toBeNull();
    expect(ticket.solicitanteExterno?.email).toBe('ana@ejemplo.com');
    const operacion = await client.operacionTicket.findFirstOrThrow();
    expect(operacion.autorId).toBe(AUTOR_FORMULARIO_PUBLICO);
  }, 60_000);

  it('sin ciclo activo da 409, sin ticket ni solicitante, y el pendiente sigue valido', async () => {
    const pedido = await sembrarPendiente();
    const useCase = armar();

    const r = await confirmar(useCase);

    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(SinCicloActivoError);
    expect(await client.ticket.count()).toBe(0);
    expect(await client.solicitanteExterno.count()).toBe(0);
    expect(await client.pedidoPublicoPendiente.count()).toBe(1);
    expect(marcados).toEqual([]);
    expect(publicar).not.toHaveBeenCalled();

    // El link sigue valido: cuando el ciclo aparece, el mismo link confirma.
    await crearCicloActivo();
    const reintento = await confirmar(useCase);
    expect(reintento.isOk()).toBe(true);
    expect(await client.ticket.count()).toBe(1);
    expect(await client.pedidoPublicoPendiente.count()).toBe(0);
    expect(marcados).toEqual([pedido.id]);
  }, 60_000);

  it('un prioridadId CRITICA que llegue al caso de uso se ignora y el ticket sale MEDIA', async () => {
    await crearCicloActivo();
    await sembrarPendiente();
    const conPrioridadAjena = {
      slug: 'colegio-norte',
      token: TOKEN_CRUDO,
      prioridadId: prioridadCriticaId,
    };

    const r = await confirmar(armar(), conPrioridadAjena);

    expect(r.isOk()).toBe(true);
    const ticket = await client.ticket.findFirstOrThrow();
    expect(ticket.prioridadId).toBe(prioridadMediaId);
    expect(ticket.prioridadId).not.toBe(prioridadCriticaId);
  }, 60_000);
});

function sha256(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
