/**
 * WU9.2 [UNIT] — RED→GREEN: `ObtenerCsatTicketUseCase` — puntaje/comentario
 * de la última respuesta CSAT de un ticket, gateado por `CSAT:LECTURA`
 * (ADR-C5) y scopeado por rol: TECNICO solo ve tickets que tuvo asignados
 * (ADR-C8, `asignadoId` ACTUAL — mismo límite conocido que el dashboard).
 *
 * Ref spec: sdd/csat/spec, Requirement "Puntaje y comentario en el detalle
 * del ticket". Ref design: ADR-C5, ADR-C8. Tarea: 9.2.
 */
import { ObtenerCsatTicketUseCase } from './obtener-csat-ticket.use-case';

describe('ObtenerCsatTicketUseCase', () => {
  function makeUseCase(respuesta: { puntaje: number; comentario: string | null } | null) {
    const encuestaRepo = { ultimaDeTicket: vi.fn().mockResolvedValue(respuesta) };
    const useCase = new ObtenerCsatTicketUseCase(encuestaRepo as never);
    return { useCase, encuestaRepo };
  }

  it('SIN CSAT:LECTURA devuelve null y no consulta el repo', async () => {
    const { useCase, encuestaRepo } = makeUseCase({ puntaje: 5, comentario: 'Excelente' });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      asignadoId: 'tecnico-1',
      actorId: 'tecnico-1',
      actorRol: 'TECNICO',
      tieneCsatLectura: false,
    });

    expect(result).toBeNull();
    expect(encuestaRepo.ultimaDeTicket).not.toHaveBeenCalled();
  });

  it('TECNICO ajeno al ticket (asignadoId distinto del actor) devuelve null y no consulta el repo', async () => {
    const { useCase, encuestaRepo } = makeUseCase({ puntaje: 5, comentario: 'Excelente' });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      asignadoId: 'otro-tecnico',
      actorId: 'tecnico-1',
      actorRol: 'TECNICO',
      tieneCsatLectura: true,
    });

    expect(result).toBeNull();
    expect(encuestaRepo.ultimaDeTicket).not.toHaveBeenCalled();
  });

  it('TECNICO con el ticket asignado a sí mismo ve puntaje y comentario reales', async () => {
    const { useCase } = makeUseCase({ puntaje: 4, comentario: 'Bien, pero tardó' });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      asignadoId: 'tecnico-1',
      actorId: 'tecnico-1',
      actorRol: 'TECNICO',
      tieneCsatLectura: true,
    });

    expect(result).toEqual({ puntaje: 4, comentario: 'Bien, pero tardó' });
  });

  it.each(['ADMINISTRADOR', 'COLABORADOR'])(
    '%s con CSAT:LECTURA ve cualquier ticket, sin importar el asignado',
    async (rol) => {
      const { useCase } = makeUseCase({ puntaje: 3, comentario: null });

      const result = await useCase.execute({
        ticketId: 'ticket-1',
        asignadoId: 'tecnico-ajeno',
        actorId: 'staff-1',
        actorRol: rol,
        tieneCsatLectura: true,
      });

      expect(result).toEqual({ puntaje: 3, comentario: null });
    },
  );

  it('ticket sin ninguna respuesta registrada devuelve null', async () => {
    const { useCase } = makeUseCase(null);

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      asignadoId: 'admin-1',
      actorId: 'admin-1',
      actorRol: 'ADMINISTRADOR',
      tieneCsatLectura: true,
    });

    expect(result).toBeNull();
  });
});
