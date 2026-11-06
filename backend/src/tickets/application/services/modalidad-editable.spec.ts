/**
 * modalidad-editable.spec.ts — odd/edilicia-obra-externa (S1).
 *
 * La consulta que comparten la edición y el detalle: sin tareas activas ni compras vinculadas.
 */
import { describe, expect, it, vi } from 'vitest';
import { ConsultaModalidadEditable } from './modalidad-editable';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { IBloqueoTicketRepository } from '../../domain/ports/i-bloqueo-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';

function consulta(tareas: TareaTicketEntity[], compras: string[]): ConsultaModalidadEditable {
  return new ConsultaModalidadEditable(
    {
      listarPorTicket: vi.fn<ITareaTicketRepository['listarPorTicket']>().mockResolvedValue(tareas),
    },
    {
      comprasVinculadas: vi
        .fn<IBloqueoTicketRepository['comprasVinculadas']>()
        .mockResolvedValue(compras),
    },
  );
}

function tarea(): TareaTicketEntity {
  return TareaTicketEntity.crear({ ticketId: 't1', descripcion: 'Pintar', orden: 0 });
}

describe('ConsultaModalidadEditable', () => {
  it('sin tareas ni compras, es editable', async () => {
    expect(await consulta([], []).esEditable('t1')).toBe(true);
  });

  it('con una tarea activa, no es editable', async () => {
    expect(await consulta([tarea()], []).esEditable('t1')).toBe(false);
  });

  it('con solo tareas borradas, es editable', async () => {
    const borrada = tarea();
    borrada.softDelete();
    expect(await consulta([borrada], []).esEditable('t1')).toBe(true);
  });

  it('con una compra vinculada, no es editable', async () => {
    expect(await consulta([], ['COM-2026-00001']).esEditable('t1')).toBe(false);
  });
});
