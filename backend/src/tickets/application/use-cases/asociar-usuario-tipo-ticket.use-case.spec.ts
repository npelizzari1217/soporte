/**
 * T8.4 [UNIT] — RED→GREEN: `AsociarUsuarioTipoTicketUseCase` (routing T3).
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB.
 *
 * Ref spec: sdd/tickets-core/spec T3. Tarea: T8.4.
 */
import {
  AsociarUsuarioTipoTicketUseCase,
  AsociarUsuarioTipoTicketDto,
} from './asociar-usuario-tipo-ticket.use-case';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { TipoTicketNoEncontradoError } from '../../domain/errors/tickets.errors';

function baseDto(
  overrides: Partial<AsociarUsuarioTipoTicketDto> = {},
): AsociarUsuarioTipoTicketDto {
  return {
    usuarioId: 'agente-uuid',
    tipoTicketId: 'tipo-soporte-uuid',
    ...overrides,
  };
}

describe('AsociarUsuarioTipoTicketUseCase', () => {
  function makeCollaborators() {
    const tipoTicketRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
    };
    const usuarioTiposTicketRepo = {
      assign: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new AsociarUsuarioTipoTicketUseCase(
      tipoTicketRepo as never,
      usuarioTiposTicketRepo as never,
    );

    return { useCase, tipoTicketRepo, usuarioTiposTicketRepo };
  }

  it('T3: asocia un usuario a un tipo_ticket existente', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(c.usuarioTiposTicketRepo.assign).toHaveBeenCalledWith(
      'agente-uuid',
      'tipo-soporte-uuid',
    );
  });

  it('tipoTicketId inexistente en el catálogo del tenant → TipoTicketNoEncontradoError (422), sin llamar assign', async () => {
    const c = makeCollaborators();
    c.tipoTicketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
    expect(c.usuarioTiposTicketRepo.assign).not.toHaveBeenCalled();
  });
});
