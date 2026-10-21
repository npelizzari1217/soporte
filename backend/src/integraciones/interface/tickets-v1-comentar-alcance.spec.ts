/**
 * Alcance del comentario por la API v1 (odd/permisos-por-tipo-ticket, S0, hallazgo del Judgment
 * Day de la etapa 0). Controller real con `CrearComentarioUseCase` y `TicketsV1Query` reales sobre
 * puertos en memoria: una clave con solo `TICKETS:COMENTAR` (sin `TICKETS:LECTURA`, así que el
 * guard no le agrega `VER_TODOS`) comenta cualquier ticket del módulo TICKETS, y uno de otro módulo
 * es 404 sin escribir nada.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { CalcularSlaHabilVenceService } from '../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { ITenantTransactionRunner } from '../../shared/infrastructure/persistence/tenant-transaction-runner';
import { Modulo } from '../../shared/domain/modulos';
import { CrearComentarioUseCase } from '../../tickets/application/use-cases/crear-comentario.use-case';
import { CrearTicketUseCase } from '../../tickets/application/use-cases/crear-ticket.use-case';
import { ListarTicketsUseCase } from '../../tickets/application/use-cases/listar-tickets.use-case';
import { ObtenerTicketUseCase } from '../../tickets/application/use-cases/obtener-ticket.use-case';
import { EstadoEntity } from '../../tickets/domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../tickets/domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../tickets/domain/entities/tipo-ticket.entity';
import { TicketsV1Query } from '../application/tickets-v1.query';
import { TiposTicketV1Query } from '../application/tipos-ticket-v1.query';
import { ApiClaveGuard } from '../infrastructure/api-clave.guard';
import { ApiV1ThrottlerGuard } from '../infrastructure/api-v1-throttler.guard';
import { TicketsV1Controller } from './tickets-v1.controller';
import { TicketsV1Presenter } from './tickets-v1.presenter';

const ID_TICKETS = '01977a00-0000-7000-8000-0000000000c1';
const ID_EDILICIA = '01977a00-0000-7000-8000-0000000000c2';
const OTRO_USUARIO = '01977a00-0000-7000-8000-0000000000bb';

/** Actor sintético tal como lo arma `ApiClaveGuard` para una clave con solo `TICKETS:COMENTAR`. */
const actorSoloComentar: JwtPayload = {
  v: 1,
  sub: '01977a00-0000-7000-8000-0000000000aa',
  cliente_id: 'c1',
  rol: 'USUARIO',
  permisos: ['TICKETS:COMENTAR'],
  is_global_admin: false,
  cliente_nombre: null,
  membresias: [],
  modulos: ['TICKETS'],
  nombre: 'Integracion',
  apellido: 'API',
  cliente_logo_v: null,
};

const ESTADO_NUEVO = EstadoEntity.create(
  { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 1, activo: true },
  'estado-nuevo',
);

const TIPOS: TipoTicketEntity[] = [
  tipo('tipo-tickets', 'TICKETS'),
  tipo('tipo-edilicia', 'EDILICIA'),
];

function tipo(id: string, modulo: Modulo): TipoTicketEntity {
  return TipoTicketEntity.create({ codigo: id, nombre: id, modulo, activo: true }, id);
}

/** Ticket que el usuario de integración NO pidió ni tiene asignado. */
function ticketAjeno(id: string, tipoId: string): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'No imprime',
      descripcion: null,
      tipoId,
      estadoId: ESTADO_NUEVO.id,
      prioridadId: 'prio-1',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: OTRO_USUARIO,
    },
    id,
  );
}

async function armar() {
  const tickets = new Map<string, TicketEntity>([
    [ID_TICKETS, ticketAjeno(ID_TICKETS, 'tipo-tickets')],
    [ID_EDILICIA, ticketAjeno(ID_EDILICIA, 'tipo-edilicia')],
  ]);
  const guardadas: OperacionTicketEntity[] = [];
  const ticketRepo = {
    findById: (id: string): Promise<TicketEntity | null> =>
      Promise.resolve(tickets.get(id) ?? null),
    esVisiblePara: (): Promise<boolean> => Promise.resolve(false),
  };
  const tipoTicketRepo = {
    findById: (id: string): Promise<TipoTicketEntity | null> =>
      Promise.resolve(TIPOS.find((t) => t.id === id) ?? null),
    findIdsByModulos: (modulos: Modulo[]): Promise<string[]> =>
      Promise.resolve(TIPOS.filter((t) => modulos.includes(t.modulo)).map((t) => t.id)),
  };
  const txRunner: ITenantTransactionRunner = {
    run: <T>(fn: () => Promise<T>): Promise<T> => fn(),
    alCommitear: vi.fn(),
  };
  const crearComentario = new CrearComentarioUseCase(
    ticketRepo,
    {
      save: (op: OperacionTicketEntity): Promise<void> => {
        guardadas.push(op);
        return Promise.resolve();
      },
    },
    { findById: () => Promise.resolve(ESTADO_NUEVO) },
    { findIdByCodigo: () => Promise.resolve('tipo-op-comentario') },
    { publish: vi.fn() },
    txRunner,
    { registrarSiFalta: vi.fn().mockResolvedValue(undefined) },
    new CalcularSlaHabilVenceService(),
    { obtener: vi.fn().mockResolvedValue([]) },
    { obtener: vi.fn().mockResolvedValue(new Set<string>()) },
    { error: vi.fn() },
  );
  const modulo = await Test.createTestingModule({
    controllers: [TicketsV1Controller],
    providers: [
      { provide: TicketsV1Presenter, useValue: {} },
      { provide: ListarTicketsUseCase, useValue: {} },
      { provide: ObtenerTicketUseCase, useValue: {} },
      { provide: CrearTicketUseCase, useValue: {} },
      { provide: CrearComentarioUseCase, useValue: crearComentario },
      { provide: TiposTicketV1Query, useValue: {} },
      { provide: TicketsV1Query, useValue: new TicketsV1Query(ticketRepo, tipoTicketRepo) },
    ],
  })
    .overrideGuard(ApiClaveGuard)
    .useValue({})
    .overrideGuard(ApiV1ThrottlerGuard)
    .useValue({})
    .overrideGuard(AccionesGuard)
    .useValue({})
    .compile();
  const controller = modulo.get(TicketsV1Controller);
  return { controller, guardadas };
}

describe('TicketsV1Controller.comentar — alcance de la clave (S0)', () => {
  it('una clave con solo COMENTAR comenta un ticket del modulo TICKETS que no pidio', async () => {
    const { controller, guardadas } = await armar();

    const res = await controller.comentar(actorSoloComentar, ID_TICKETS, { texto: 'hola' });

    expect(res).toMatchObject({ ticketId: ID_TICKETS, texto: 'hola', esInterno: false });
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]).toMatchObject({ ticketId: ID_TICKETS, descripcion: 'hola' });
  });

  it('la misma clave sobre un ticket de un tipo de EDILICIA es 404 y no persiste nada', async () => {
    const { controller, guardadas } = await armar();

    await expect(
      controller.comentar(actorSoloComentar, ID_EDILICIA, { texto: 'hola' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(guardadas).toHaveLength(0);
  });
});
