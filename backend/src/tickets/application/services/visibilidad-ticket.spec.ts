/**
 * [UNIT] `esTicketVisiblePara` (odd/tareas-con-tecnico, CA10): con VER_TODOS o siendo el
 * solicitante se resuelve sin consultar; en otro caso decide el repositorio, que agrega al técnico
 * de una tarea activa.
 */
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { esTicketVisiblePara } from './visibilidad-ticket';

const SOLICITANTE = 'usuario-solicitante';
const TECNICO = 'usuario-tecnico';

function ticket(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Sin red',
      descripcion: null,
      tipoId: 'tipo',
      estadoId: 'estado',
      prioridadId: 'prioridad',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: SOLICITANTE,
    },
    'ticket-1',
  );
}

describe('esTicketVisiblePara', () => {
  it('con VER_TODOS lo ve sin consultar el repositorio', async () => {
    const repo = { esVisiblePara: vi.fn() };
    expect(await esTicketVisiblePara(repo, ticket(), TECNICO, true)).toBe(true);
    expect(repo.esVisiblePara).not.toHaveBeenCalled();
  });

  it('el solicitante lo ve sin consultar el repositorio', async () => {
    const repo = { esVisiblePara: vi.fn() };
    expect(await esTicketVisiblePara(repo, ticket(), SOLICITANTE, false)).toBe(true);
    expect(repo.esVisiblePara).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'sin VER_TODOS y sin ser el solicitante decide el repositorio (tarea activa: %s)',
    async (tieneTarea) => {
      const repo = { esVisiblePara: vi.fn().mockResolvedValue(tieneTarea) };
      expect(await esTicketVisiblePara(repo, ticket(), TECNICO, false)).toBe(tieneTarea);
      expect(repo.esVisiblePara).toHaveBeenCalledWith('ticket-1', TECNICO);
    },
  );
});
