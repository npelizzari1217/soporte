/**
 * [UNIT] Recuperación de un ticket borrado (odd/tasks/permisos-por-tipo-ticket.md, S8, L41), con
 * fakes en memoria: se afirma sobre el estado final del ticket y del historial.
 */
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  TicketNoEncontradoError,
  TicketsBorradosSoloAdministradorError,
} from '../../domain/errors/tickets.errors';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { RecuperarTicketUseCase } from './recuperar-ticket.use-case';

const BORRADO_EN = new Date('2026-10-20T10:00:00Z');
const AHORA = new Date('2026-10-22T15:00:00Z');

function ticket(id: string, borrado: boolean): TicketEntity {
  const entidad = TicketEntity.create(
    {
      numero: `SOP-2026-${id}`,
      titulo: `Ticket ${id}`,
      descripcion: null,
      tipoId: 'tipo-soporte',
      estadoId: 'estado-resuelto',
      prioridadId: 'prioridad-media',
      cicloId: 'ciclo-1',
      ticketReferenciaId: null,
      solicitanteId: 'usr-solicitante',
    },
    id,
  );
  if (borrado) entidad.softDelete(BORRADO_EN);
  return entidad;
}

function escenario() {
  const tickets = new Map(
    [ticket('t-borrado', true), ticket('t-activo', false)].map((t) => [t.id, t]),
  );
  const operaciones: OperacionTicketEntity[] = [];
  const useCase = new RecuperarTicketUseCase(
    {
      findById: async (id: string) => tickets.get(id) ?? null,
      recuperarSiBorrado: async (id: string) => {
        const actual = tickets.get(id);
        if (!actual?.isDeleted()) return false;
        actual._deletedAt = null;
        return true;
      },
    },
    { save: async (operacion: OperacionTicketEntity) => void operaciones.push(operacion) },
    { findIdByCodigo: async (codigo: string) => `tipo-op-${codigo}` },
    { run: async <T>(fn: () => Promise<T>): Promise<T> => fn() },
    () => AHORA,
  );
  return { useCase, tickets, operaciones };
}

describe('RecuperarTicketUseCase', () => {
  it('ADMINISTRADOR o ROOT lo recupera con el estado que tenía, y queda en el historial', async () => {
    const { useCase, operaciones } = escenario();

    const result = await useCase.execute({
      ticketId: 't-borrado',
      ...alcanceSinRestriccion('usr-admin'),
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().isDeleted()).toBe(false);
    expect(result.getValue().estadoId).toBe('estado-resuelto');
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0]).toMatchObject({
      ticketId: 't-borrado',
      tipoOperacionId: 'tipo-op-TICKET_RECUPERADO',
      autorId: 'usr-admin',
      esInterno: false,
    });
  });

  it('cualquier otro actor: 403, aunque tenga Borrar sobre el tipo, y el ticket sigue borrado', async () => {
    const { useCase, tickets, operaciones } = escenario();

    const result = await useCase.execute({
      ticketId: 't-borrado',
      ...alcancePorTipo('usr-tecnico', {
        'tipo-soporte': ['LECTURA', 'VER_TODOS', 'BORRADO'],
      }),
    });

    expect(result.getError()).toBeInstanceOf(TicketsBorradosSoloAdministradorError);
    expect(result.getError().message).toBe(
      'Solo un administrador puede ver o recuperar tickets borrados.',
    );
    expect(tickets.get('t-borrado')?.deletedAt).toEqual(BORRADO_EN);
    expect(operaciones).toEqual([]);
  });

  it.each([
    ['un ticket que no está borrado', 't-activo'],
    ['un ticket inexistente', 't-no-existe'],
  ])('%s: 404 sin escribir el historial', async (_caso, ticketId) => {
    const { useCase, operaciones } = escenario();

    const result = await useCase.execute({ ticketId, ...alcanceSinRestriccion('usr-admin') });

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(operaciones).toEqual([]);
  });
});
