/**
 * consultar-encuesta.use-case.spec.ts — TDD RED→GREEN (Tarea 7.1).
 *
 * `ResolverEncuestaTokenService` e `ITicketRepository` 100% fake (sin Nest,
 * sin DB). Cubre: token inválido propaga el rechazo genérico sin tocar el
 * repo de tickets, ticket inexistente (soft ref roto) da el MISMO rechazo
 * genérico, y el camino feliz devuelve ÚNICAMENTE el número — nunca título
 * ni ningún otro campo del ticket (spec, "Respuesta HTTP mínima").
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público", "Respuesta HTTP mínima". Ref design: ADR-C1. Tarea: 7.1.
 */
import { ConsultarEncuestaUseCase } from './consultar-encuesta.use-case';
import { EncuestaLinkInvalidoError } from '../../domain/errors/csat.errors';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { Result } from '../../../shared/domain/result';
import {
  EncuestaTokenResuelto,
  ResolverEncuestaTokenService,
} from '../services/resolver-encuesta-token.service';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { unstubbed } from '../../../testing/mocks';

const TICKET_ID = '01977a00-0000-7000-8000-0000000000t1';
const TOKEN_ID = '01977a00-0000-7000-8000-0000000000d1';
const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';

function makeTicket(numero = 'SOP-2026-00042'): TicketEntity {
  return TicketEntity.create(
    {
      numero,
      titulo: 'Título que NUNCA debe salir en la respuesta pública',
      descripcion: 'Descripción que NUNCA debe salir en la respuesta pública',
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    TICKET_ID,
  );
}

function makeFakeResolver(
  result: Result<EncuestaTokenResuelto, EncuestaLinkInvalidoError>,
): ResolverEncuestaTokenService {
  return Object.create(ResolverEncuestaTokenService.prototype, {
    resolver: {
      value: vi.fn<ResolverEncuestaTokenService['resolver']>().mockResolvedValue(result),
    },
  });
}

function makeFakeTicketRepo(ticket: TicketEntity | null) {
  return {
    findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticket),
    findByIds: unstubbed('findByIds'),
    findByNumero: unstubbed('findByNumero'),
    findLastSecuencia: unstubbed('findLastSecuencia'),
    findAll: unstubbed('findAll'),
    count: unstubbed('count'),
    esVisiblePara: unstubbed('esVisiblePara'),
    bloquear: unstubbed('bloquear'),
    save: unstubbed('save'),
    delete: unstubbed('delete'),
    borrarSiActivo: unstubbed('borrarSiActivo'),
    recuperarSiBorrado: unstubbed('recuperarSiBorrado'),
  } satisfies ITicketRepository;
}

describe('ConsultarEncuestaUseCase', () => {
  it('token inválido: propaga el MISMO EncuestaLinkInvalidoError y no consulta el repo de tickets', async () => {
    const resolver = makeFakeResolver(Result.fail(new EncuestaLinkInvalidoError()));
    const ticketRepo = makeFakeTicketRepo(null);
    const useCase = new ConsultarEncuestaUseCase(resolver, ticketRepo);

    const resultado = await useCase.ejecutar('token-crudo');

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    expect(ticketRepo.findById).not.toHaveBeenCalled();
  });

  it('ticket inexistente (soft ref roto): mismo rechazo genérico', async () => {
    const resolver = makeFakeResolver(
      Result.ok({ tokenId: TOKEN_ID, ticketId: TICKET_ID, clienteId: CLIENTE_ID }),
    );
    const ticketRepo = makeFakeTicketRepo(null);
    const useCase = new ConsultarEncuestaUseCase(resolver, ticketRepo);

    const resultado = await useCase.ejecutar('token-crudo');

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
  });

  it('ticket borrado (odd/permisos-por-tipo-ticket, S8): mismo rechazo genérico, sin el número', async () => {
    const resolver = makeFakeResolver(
      Result.ok({ tokenId: TOKEN_ID, ticketId: TICKET_ID, clienteId: CLIENTE_ID }),
    );
    const borrado = makeTicket('SOP-2026-00042');
    borrado.softDelete(new Date('2026-10-22T12:00:00Z'));
    const useCase = new ConsultarEncuestaUseCase(resolver, makeFakeTicketRepo(borrado));

    const resultado = await useCase.ejecutar('token-crudo');

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
  });

  it('camino válido: devuelve ÚNICAMENTE el número — sin título ni descripción', async () => {
    const resolver = makeFakeResolver(
      Result.ok({ tokenId: TOKEN_ID, ticketId: TICKET_ID, clienteId: CLIENTE_ID }),
    );
    const ticketRepo = makeFakeTicketRepo(makeTicket('SOP-2026-00042'));
    const useCase = new ConsultarEncuestaUseCase(resolver, ticketRepo);

    const resultado = await useCase.ejecutar('token-crudo');

    expect(resultado.isOk()).toBe(true);
    // toEqual (no toMatchObject): si algún día se agrega `titulo` al payload,
    // esta aserción se rompe — es EXACTAMENTE la forma del contrato mínimo.
    expect(resultado.getValue()).toEqual({ numero: 'SOP-2026-00042' });
    expect(JSON.stringify(resultado.getValue())).not.toContain('Título');
  });
});
