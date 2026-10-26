/**
 * T7.3 [INTEGRATION] — PrismaConteoComentariosTicketRepository contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Desde odd/ticket-unificado (S3) el conteo de comentarios de la grilla cuenta los COMENTARIO del
 * timeline del ticket, separados por visibilidad. El repositorio del satélite `ticket_edilicia` y
 * sus casos se retiraron con T4a.
 *
 * Fixtures propios prefijados `T7_TEST_*`: la DB de test NO corre `TenantSeederAdapter`, solo está
 * migrada, así que el tipo de operación COMENTARIO se crea si falta y se borra solo si lo creó esta
 * suite (mismo criterio que `primera-respuesta.integration.spec.ts`). Cleanup acotado por los ids
 * de fixture de ESTA suite (nunca TRUNCATE global — la DB es compartida).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E2, F3-E3. Tarea: T7.1, T7.2, T7.4.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaConteoComentariosTicketRepository } from './prisma-conteo-comentarios-ticket.repository';

import { TicketEntity, TicketProps } from '../../../../tickets/domain/entities/ticket.entity';

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
  let comentarioRepo: PrismaConteoComentariosTicketRepository;

  let tipoEdiliciaId: string;
  let estadoNuevoId: string;
  let prioridadMediaId: string;
  let tipoComentarioId: string;
  let tipoCambioEstadoId: string;
  let creoTipoComentario = false;
  let creoTipoCambioEstado = false;

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `T7${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  // Códigos FIJOS de los fixtures de catálogo. Al ser fijos y `unique`, una corrida anterior que
  // muriera entre el alta y el cleanup dejaba las filas vivas; de ahí que la limpieza corra también
  // AL ENTRAR, no sólo al salir.
  const CODIGO_TIPO = 'T7_TEST_EDILICIA';
  const CODIGO_ESTADO = 'T7_TEST_NUEVO';
  const CODIGO_PRIORIDAD = 'T7_TEST_MEDIA';

  /** Borra los fixtures de esta suite, acotado por sus códigos fijos. Idempotente. */
  async function limpiarFixtures(): Promise<void> {
    const tipo = await tenantClient.tipoTicket.findUnique({
      where: { codigo: CODIGO_TIPO },
      select: { id: true },
    });

    if (tipo !== null) {
      const tickets = await tenantClient.ticket.findMany({
        where: { tipoId: tipo.id },
        select: { id: true },
      });
      const ids = tickets.map((t) => t.id);

      if (ids.length > 0) {
        await tenantClient.operacionTicket.deleteMany({ where: { ticketId: { in: ids } } });
        await tenantClient.ticket.deleteMany({ where: { id: { in: ids } } });
      }
    }

    await tenantClient.prioridad.deleteMany({ where: { codigo: CODIGO_PRIORIDAD } });
    await tenantClient.estado.deleteMany({ where: { codigo: CODIGO_ESTADO } });
    await tenantClient.tipoTicket.deleteMany({ where: { codigo: CODIGO_TIPO } });
  }

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

  /** Inserta `cantidad` operaciones de un tipo en el timeline del ticket. */
  async function operaciones(
    ticketId: string,
    tipoOperacionId: string,
    cantidad: number,
    extra: { esInterno?: boolean; deletedAt?: Date } = {},
  ): Promise<void> {
    for (let i = 0; i < cantidad; i += 1) {
      await tenantClient.operacionTicket.create({
        data: {
          ticketId,
          tipoOperacionId,
          descripcion: `Operación ${i + 1}`,
          autorId: DUMMY_USUARIO_ID,
          esInterno: extra.esInterno ?? false,
          deletedAt: extra.deletedAt ?? null,
        },
      });
    }
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();

    ticketRepo = new PrismaTicketRepository(tenantContext);
    comentarioRepo = new PrismaConteoComentariosTicketRepository(tenantContext);

    await limpiarFixtures();

    tipoEdiliciaId = (
      await tenantClient.tipoTicket.create({
        data: {
          codigo: CODIGO_TIPO,
          nombre: 'Edilicia Test PR7',
          activo: true,
          modulo: 'EDILICIA',
        },
      })
    ).id;
    estadoNuevoId = (
      await tenantClient.estado.create({
        data: { codigo: CODIGO_ESTADO, nombre: 'Nuevo Test PR7', orden: 1, activo: true },
      })
    ).id;
    prioridadMediaId = (
      await tenantClient.prioridad.create({
        data: { codigo: CODIGO_PRIORIDAD, nombre: 'Media Test PR7', orden: 1, activo: true },
      })
    ).id;

    const comentario = await tenantClient.tipoOperacion.findUnique({
      where: { codigo: 'COMENTARIO' },
    });
    if (comentario) {
      tipoComentarioId = comentario.id;
    } else {
      tipoComentarioId = (
        await tenantClient.tipoOperacion.create({
          data: { codigo: 'COMENTARIO', nombre: 'Comentario' },
        })
      ).id;
      creoTipoComentario = true;
    }
    // Mismo criterio que COMENTARIO: en una base de test recien creada el catalogo esta vacio,
    // y depender de que otro spec lo haya sembrado antes hace que el resultado dependa del orden.
    const cambioEstado = await tenantClient.tipoOperacion.findUnique({
      where: { codigo: 'CAMBIO_ESTADO' },
    });
    if (cambioEstado) {
      tipoCambioEstadoId = cambioEstado.id;
    } else {
      tipoCambioEstadoId = (
        await tenantClient.tipoOperacion.create({
          data: { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio de estado' },
        })
      ).id;
      creoTipoCambioEstado = true;
    }
  }, 30_000);

  afterAll(async () => {
    // Limpiar las filas ANTES de cerrar el cliente: con el pool ya cerrado los borrados no llegan
    // a ejecutarse y la base compartida queda sucia.
    await limpiarFixtures();
    if (creoTipoComentario) {
      await tenantClient.tipoOperacion.deleteMany({ where: { codigo: 'COMENTARIO' } });
    }
    if (creoTipoCambioEstado) {
      await tenantClient.tipoOperacion.deleteMany({ where: { codigo: 'CAMBIO_ESTADO' } });
    }
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('PrismaConteoComentariosTicketRepository.contarPorTickets (odd/ticket-unificado, S3)', () => {
    it('cuenta los COMENTARIO activos del timeline por ticket, separados por visibilidad', async () => {
      const a = TicketEntity.create(makeTicketProps());
      const b = TicketEntity.create(makeTicketProps());
      const sinComentarios = TicketEntity.create(makeTicketProps());
      await withTenant(async () => {
        for (const t of [a, b, sinComentarios]) await ticketRepo.save(t);
      });
      await operaciones(a.id, tipoComentarioId, 2);
      await operaciones(a.id, tipoComentarioId, 3, { esInterno: true });
      // Lo que NO cuenta: otro tipo de operación, y un comentario dado de baja.
      await operaciones(a.id, tipoCambioEstadoId, 4);
      await operaciones(a.id, tipoComentarioId, 1, { deletedAt: new Date() });
      await operaciones(sinComentarios.id, tipoCambioEstadoId, 1);
      await operaciones(b.id, tipoComentarioId, 1);

      await withTenant(async () => {
        const conteos = await comentarioRepo.contarPorTickets([a.id, b.id, sinComentarios.id]);

        expect(conteos.get(a.id)).toEqual({ publicos: 2, internos: 3 });
        expect(conteos.get(b.id)).toEqual({ publicos: 1, internos: 0 });
        // El GROUP BY no emite fila para el ticket sin comentarios: el `0` lo resuelve el consumidor.
        expect(conteos.has(sinComentarios.id)).toBe(false);
      });
    });

    it('con lista vacía devuelve un Map vacío sin consultar', async () => {
      const spy = vi.spyOn(tenantClient.operacionTicket, 'groupBy');

      await withTenant(async () => {
        expect(await comentarioRepo.contarPorTickets([])).toEqual(new Map());
      });

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
