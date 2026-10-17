/**
 * responder-encuesta.use-case.spec.ts — TDD RED→GREEN (Tarea 7.1).
 *
 * `ResolverEncuestaTokenService`, `IEncuestaTokenRepository`,
 * `IEncuestaSatisfaccionRepository` e `ITicketRepository` 100% fake (sin
 * Nest, sin DB). Cubre: token inválido, puntaje fuera de rango SIN escritura
 * (spec: "puntaje fuera de rango → 400, sin escritura"), CAS ya usado → MISMO
 * rechazo genérico, camino feliz, y la compensación (`liberarUso`) cuando el
 * INSERT del tenant falla después del CAS.
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)". Ref design: ADR-C1, ADR-C2. Tarea: 7.1.
 */
import { ResponderEncuestaUseCase } from './responder-encuesta.use-case';
import { EncuestaLinkInvalidoError, PuntajeInvalidoError } from '../../domain/errors/csat.errors';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { Result } from '../../../shared/domain/result';
import { ResolverEncuestaTokenService } from '../services/resolver-encuesta-token.service';
import { IEncuestaTokenRepository } from '../../domain/ports/i-encuesta-token.repository';
import { IEncuestaSatisfaccionRepository } from '../../domain/ports/i-encuesta-satisfaccion.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { unstubbed } from '../../../testing/mocks';

const TICKET_ID = '01977a00-0000-7000-8000-0000000000t1';
const TOKEN_ID = '01977a00-0000-7000-8000-0000000000d1';
const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';

function makeTicket(numero = 'SOP-2026-00042'): TicketEntity {
  return TicketEntity.create(
    {
      numero,
      titulo: 'Título de prueba',
      descripcion: null,
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

function makeFakeResolver(okValue: boolean): ResolverEncuestaTokenService {
  return Object.create(ResolverEncuestaTokenService.prototype, {
    resolver: {
      value: vi
        .fn<ResolverEncuestaTokenService['resolver']>()
        .mockResolvedValue(
          okValue
            ? Result.ok({ tokenId: TOKEN_ID, ticketId: TICKET_ID, clienteId: CLIENTE_ID })
            : Result.fail(new EncuestaLinkInvalidoError()),
        ),
    },
  });
}

function makeFakeTokenRepo(marcarUsadoResultado = true) {
  return {
    findByHash: unstubbed('findByHash'),
    save: unstubbed('save'),
    revocarVigentesDeTicket: unstubbed('revocarVigentesDeTicket'),
    marcarUsadoSiNoUsado: vi
      .fn<IEncuestaTokenRepository['marcarUsadoSiNoUsado']>()
      .mockResolvedValue(marcarUsadoResultado),
    liberarUso: vi.fn<IEncuestaTokenRepository['liberarUso']>().mockResolvedValue(undefined),
  } satisfies IEncuestaTokenRepository;
}

function makeFakeSatisfaccionRepo(guardarImpl?: IEncuestaSatisfaccionRepository['guardar']) {
  return {
    guardar: vi.fn<IEncuestaSatisfaccionRepository['guardar']>(
      guardarImpl ?? (() => Promise.resolve()),
    ),
    ultimaDeTicket: unstubbed('ultimaDeTicket'),
    resumenPorScope: unstubbed('resumenPorScope'),
  } satisfies IEncuestaSatisfaccionRepository;
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
  } satisfies ITicketRepository;
}

function buildUseCase(
  overrides: {
    resolver?: ReturnType<typeof makeFakeResolver>;
    tokenRepo?: ReturnType<typeof makeFakeTokenRepo>;
    satisfaccionRepo?: ReturnType<typeof makeFakeSatisfaccionRepo>;
    ticketRepo?: ReturnType<typeof makeFakeTicketRepo>;
  } = {},
) {
  const resolver = overrides.resolver ?? makeFakeResolver(true);
  const tokenRepo = overrides.tokenRepo ?? makeFakeTokenRepo();
  const satisfaccionRepo = overrides.satisfaccionRepo ?? makeFakeSatisfaccionRepo();
  const ticketRepo = overrides.ticketRepo ?? makeFakeTicketRepo(makeTicket());

  const useCase = new ResponderEncuestaUseCase(resolver, tokenRepo, satisfaccionRepo, ticketRepo);
  return { useCase, resolver, tokenRepo, satisfaccionRepo, ticketRepo };
}

describe('ResponderEncuestaUseCase', () => {
  it('token inválido: rechazo genérico, no toca el CAS ni el repo de satisfacción', async () => {
    const { useCase, tokenRepo, satisfaccionRepo } = buildUseCase({
      resolver: makeFakeResolver(false),
    });

    const resultado = await useCase.ejecutar({
      rawToken: 'x',
      puntaje: 5,
      comentario: null,
    });

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    expect(tokenRepo.marcarUsadoSiNoUsado).not.toHaveBeenCalled();
    expect(satisfaccionRepo.guardar).not.toHaveBeenCalled();
  });

  it('[CRITICAL] puntaje fuera de rango (0): 400 (PuntajeInvalidoError) SIN escritura — ni CAS ni guardar', async () => {
    const { useCase, tokenRepo, satisfaccionRepo } = buildUseCase();

    const resultado = await useCase.ejecutar({
      rawToken: 'x',
      puntaje: 0,
      comentario: null,
    });

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PuntajeInvalidoError);
    expect(tokenRepo.marcarUsadoSiNoUsado).not.toHaveBeenCalled();
    expect(satisfaccionRepo.guardar).not.toHaveBeenCalled();
  });

  it('puntaje fuera de rango (6): mismo rechazo, sin escritura', async () => {
    const { useCase, tokenRepo, satisfaccionRepo } = buildUseCase();

    const resultado = await useCase.ejecutar({
      rawToken: 'x',
      puntaje: 6,
      comentario: null,
    });

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PuntajeInvalidoError);
    expect(tokenRepo.marcarUsadoSiNoUsado).not.toHaveBeenCalled();
    expect(satisfaccionRepo.guardar).not.toHaveBeenCalled();
  });

  it('[CRITICAL] token ya usado (CAS devuelve false): MISMO EncuestaLinkInvalidoError que un token inexistente, sin guardar', async () => {
    const { useCase, satisfaccionRepo } = buildUseCase({
      tokenRepo: makeFakeTokenRepo(false),
    });

    const resultado = await useCase.ejecutar({
      rawToken: 'x',
      puntaje: 5,
      comentario: null,
    });

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    expect(satisfaccionRepo.guardar).not.toHaveBeenCalled();
  });

  it('camino feliz: CAS true → guarda la respuesta → devuelve ÚNICAMENTE el número', async () => {
    const { useCase, tokenRepo, satisfaccionRepo } = buildUseCase();

    const resultado = await useCase.ejecutar({
      rawToken: 'x',
      puntaje: 4,
      comentario: 'Todo bien',
    });

    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue()).toEqual({ numero: 'SOP-2026-00042' });
    expect(tokenRepo.marcarUsadoSiNoUsado).toHaveBeenCalledWith(TOKEN_ID);
    expect(satisfaccionRepo.guardar).toHaveBeenCalledTimes(1);
    const respuestaGuardada = satisfaccionRepo.guardar.mock.calls[0]?.[0];
    expect(respuestaGuardada?.puntaje).toBe(4);
    expect(respuestaGuardada?.comentario).toBe('Todo bien');
    expect(respuestaGuardada?.tokenId).toBe(TOKEN_ID);
  });

  it('[CRITICAL] si el INSERT del tenant falla, compensa con liberarUso() y relanza — el CAS no queda huérfano', async () => {
    const errorInsert = new Error('insert falló');
    const { useCase, tokenRepo } = buildUseCase({
      satisfaccionRepo: makeFakeSatisfaccionRepo(() => Promise.reject(errorInsert)),
    });

    await expect(useCase.ejecutar({ rawToken: 'x', puntaje: 3, comentario: null })).rejects.toThrow(
      'insert falló',
    );

    expect(tokenRepo.liberarUso).toHaveBeenCalledWith(TOKEN_ID);
  });
});
