/**
 * SB1 [UNIT] — RED→GREEN: MarcarVencidosUseCase (S4 — marca vencido=true en
 * tickets vencibles y emite `sla.vencido` por cada uno; idempotente; NO
 * auto-escala prioridad, S6).
 *
 * Ref spec: sdd/premium/spec S4, S6. Ref design: ADR-P3/ADR-P4. Tarea: SB1.
 */
import { MarcarVencidosUseCase } from './marcar-vencidos.use-case';
import { SlaVencidoEvent } from '../../domain/events/sla-vencido.event';
import { SlaPrimeraRespuestaVencidaEvent } from '../../domain/events/sla-primera-respuesta-vencida.event';

function makeCollaborators() {
  const slaTicketQueryRepo = {
    findVencibles: vi.fn().mockResolvedValue([]),
    marcarVencido: vi.fn().mockResolvedValue(true),
    findPrimerasRespuestasVencidas: vi.fn().mockResolvedValue([]),
    marcarPrimeraRespuestaVencida: vi.fn().mockResolvedValue(true),
  };
  const relojRepo = { findPendientes: vi.fn().mockResolvedValue([]) };
  const consolidar = { execute: vi.fn().mockResolvedValue('consolidado') };
  const eventPublisher = { publish: vi.fn() };
  const useCase = new MarcarVencidosUseCase(
    relojRepo,
    consolidar,
    slaTicketQueryRepo,
    eventPublisher,
  );
  return { useCase, slaTicketQueryRepo, relojRepo, consolidar, eventPublisher };
}

describe('MarcarVencidosUseCase', () => {
  it('S4: marca vencido=true y emite sla.vencido por cada ticket vencible', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([
      { id: 'ticket-1', asignadoId: 'agente-1', solicitanteId: 'sol-1' },
      { id: 'ticket-2', asignadoId: null, solicitanteId: 'sol-2' },
    ]);

    const marcados = await c.useCase.execute();

    expect(marcados).toBe(2);
    expect(c.slaTicketQueryRepo.marcarVencido).toHaveBeenCalledWith('ticket-1');
    expect(c.slaTicketQueryRepo.marcarVencido).toHaveBeenCalledWith('ticket-2');
    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(2);

    const evento1 = c.eventPublisher.publish.mock.calls[0][0];
    expect(evento1).toBeInstanceOf(SlaVencidoEvent);
    expect(evento1.ticketId).toBe('ticket-1');
    expect(evento1.asignadoId).toBe('agente-1');
    expect(evento1.solicitanteId).toBe('sol-1');

    const evento2 = c.eventPublisher.publish.mock.calls[1][0];
    expect(evento2.ticketId).toBe('ticket-2');
    expect(evento2.asignadoId).toBeNull();
  });

  it('sin tickets vencibles → 0 marcados, sin publicar eventos', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([]);

    const marcados = await c.useCase.execute();

    expect(marcados).toBe(0);
    expect(c.slaTicketQueryRepo.marcarVencido).not.toHaveBeenCalled();
    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('S6: NO toca prioridadId (el repo de marcado solo expone marcarVencido, sin superficie de escritura de prioridad)', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([
      { id: 'ticket-1', asignadoId: 'agente-1', solicitanteId: 'sol-1' },
    ]);

    await c.useCase.execute();

    expect(Object.keys(c.slaTicketQueryRepo)).toEqual([
      'findVencibles',
      'marcarVencido',
      'findPrimerasRespuestasVencidas',
      'marcarPrimeraRespuestaVencida',
    ]);
  });

  it('un fallo al marcar un ticket NO aborta el resto del barrido (aislamiento por ticket)', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([
      { id: 'ticket-1', asignadoId: null, solicitanteId: 'sol-1' },
      { id: 'ticket-2', asignadoId: null, solicitanteId: 'sol-2' },
    ]);
    c.slaTicketQueryRepo.marcarVencido.mockRejectedValueOnce(new Error('DB caída'));

    const marcados = await c.useCase.execute();

    expect(marcados).toBe(1);
    expect(c.slaTicketQueryRepo.marcarVencido).toHaveBeenCalledTimes(2);
    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(c.eventPublisher.publish.mock.calls[0][0].ticketId).toBe('ticket-2');
  });

  describe('reloj activo (sla-reloj-activo R4)', () => {
    const vencible = { id: 'ticket-1', asignadoId: null, solicitanteId: 'sol-1' };

    it('paso 1: reconcilia los pendientes ANTES de evaluar el vencimiento', async () => {
      const c = makeCollaborators();
      const orden: string[] = [];
      c.relojRepo.findPendientes.mockResolvedValue(['huerfano-1', 'huerfano-2']);
      c.consolidar.execute.mockImplementation(async (id: string) => {
        orden.push(`consolidar:${id}`);
        return 'consolidado';
      });
      c.slaTicketQueryRepo.findVencibles.mockImplementation(async () => {
        orden.push('findVencibles');
        return [];
      });

      await c.useCase.execute();

      expect(orden).toEqual(['consolidar:huerfano-1', 'consolidar:huerfano-2', 'findVencibles']);
    });

    it('un pendiente que no se puede reconciliar no aborta el barrido (queda pendiente y el repo lo excluye)', async () => {
      const c = makeCollaborators();
      c.relojRepo.findPendientes.mockResolvedValue(['roto', 'sano']);
      c.consolidar.execute.mockRejectedValueOnce(new Error('MASTER caído'));
      c.slaTicketQueryRepo.findVencibles.mockResolvedValue([vencible]);

      const marcados = await c.useCase.execute();

      expect(c.consolidar.execute).toHaveBeenCalledTimes(2);
      expect(marcados).toBe(1);
    });

    it('una marca ya puesta (el updateMany no afectó filas) no cuenta ni envía mail', async () => {
      const c = makeCollaborators();
      c.slaTicketQueryRepo.findVencibles.mockResolvedValue([vencible]);
      c.slaTicketQueryRepo.marcarVencido.mockResolvedValue(false);

      const marcados = await c.useCase.execute();

      expect(marcados).toBe(0);
      expect(c.eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('el evento sale una sola vez por ticket marcado', async () => {
      const c = makeCollaborators();
      c.slaTicketQueryRepo.findVencibles.mockResolvedValue([vencible]);

      await c.useCase.execute();

      expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('paso 3: primera respuesta vencida (sla-primera-respuesta R4)', () => {
    const fila = { id: 'ticket-1', asignadoId: 'agente-1', solicitanteId: 'sol-1' };

    it('marca con CAS y publica SlaPrimeraRespuestaVencidaEvent por cada ticket', async () => {
      const c = makeCollaborators();
      c.slaTicketQueryRepo.findPrimerasRespuestasVencidas.mockResolvedValue([
        fila,
        { id: 'ticket-2', asignadoId: null, solicitanteId: null },
      ]);

      await c.useCase.execute();

      expect(c.slaTicketQueryRepo.marcarPrimeraRespuestaVencida.mock.calls).toEqual([
        ['ticket-1'],
        ['ticket-2'],
      ]);
      const eventos = c.eventPublisher.publish.mock.calls.map(([e]) => e);
      expect(eventos).toHaveLength(2);
      expect(eventos[0]).toBeInstanceOf(SlaPrimeraRespuestaVencidaEvent);
      expect(eventos[0]).toMatchObject({
        name: 'sla.primera_respuesta_vencida',
        ticketId: 'ticket-1',
        asignadoId: 'agente-1',
        solicitanteId: 'sol-1',
      });
    });

    it('si el CAS no afectó la fila (otro barrido ganó) no publica', async () => {
      const c = makeCollaborators();
      c.slaTicketQueryRepo.findPrimerasRespuestasVencidas.mockResolvedValue([fila]);
      c.slaTicketQueryRepo.marcarPrimeraRespuestaVencida.mockResolvedValue(false);

      await c.useCase.execute();

      expect(c.eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('no cuenta en el retorno (que es de resolución) y corre aunque no haya vencibles', async () => {
      const c = makeCollaborators();
      c.slaTicketQueryRepo.findPrimerasRespuestasVencidas.mockResolvedValue([fila]);

      expect(await c.useCase.execute()).toBe(0);
      expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('un fallo al marcar un ticket no aborta el resto', async () => {
      const c = makeCollaborators();
      c.slaTicketQueryRepo.findPrimerasRespuestasVencidas.mockResolvedValue([
        fila,
        { ...fila, id: 'ticket-2' },
      ]);
      c.slaTicketQueryRepo.marcarPrimeraRespuestaVencida.mockRejectedValueOnce(new Error('DB'));

      await c.useCase.execute();

      expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(c.eventPublisher.publish.mock.calls[0][0].ticketId).toBe('ticket-2');
    });

    it('un fallo del publisher no aborta el resto', async () => {
      const c = makeCollaborators();
      c.slaTicketQueryRepo.findPrimerasRespuestasVencidas.mockResolvedValue([
        fila,
        { ...fila, id: 'ticket-2' },
      ]);
      c.eventPublisher.publish.mockImplementationOnce(() => {
        throw new Error('bus');
      });

      await c.useCase.execute();

      expect(c.slaTicketQueryRepo.marcarPrimeraRespuestaVencida).toHaveBeenCalledTimes(2);
    });
  });
});
