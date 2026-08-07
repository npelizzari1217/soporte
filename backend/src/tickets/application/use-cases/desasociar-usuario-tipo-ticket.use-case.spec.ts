/**
 * T8.4 [UNIT] — RED→GREEN: `DesasociarUsuarioTipoTicketUseCase` (routing T3).
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB.
 *
 * Ref spec: sdd/tickets-core/spec T3. Tarea: T8.4.
 */
import {
  DesasociarUsuarioTipoTicketUseCase,
  DesasociarUsuarioTipoTicketDto,
} from './desasociar-usuario-tipo-ticket.use-case';

function baseDto(
  overrides: Partial<DesasociarUsuarioTipoTicketDto> = {},
): DesasociarUsuarioTipoTicketDto {
  return {
    usuarioId: 'agente-uuid',
    tipoTicketId: 'tipo-soporte-uuid',
    ...overrides,
  };
}

describe('DesasociarUsuarioTipoTicketUseCase', () => {
  function makeCollaborators() {
    const usuarioTiposTicketRepo = {
      revoke: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new DesasociarUsuarioTipoTicketUseCase(usuarioTiposTicketRepo as never);

    return { useCase, usuarioTiposTicketRepo };
  }

  it('T3: desasocia un usuario de un tipo_ticket — eliminación física, idempotente', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(c.usuarioTiposTicketRepo.revoke).toHaveBeenCalledWith(
      'agente-uuid',
      'tipo-soporte-uuid',
    );
  });

  it('fila inexistente — no falla (revoke es idempotente en el repo)', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto({ usuarioId: 'nunca-asociado-uuid' }));

    expect(result.isOk()).toBe(true);
  });
});
