/**
 * [UNIT] — `ListarComprasDeTicketUseCase` (odd/ticket-unificado, S1, S5).
 *
 * Las compras vinculadas a un ticket de cualquier tipo, con su grupo de estado y si lo bloquean
 * (el criterio único de `comprasQueBloquean`). Exige ver el ticket. Desde odd/compras-por-tipo,
 * solo lista las compras que el actor ve por su tipo (S2, S4); el bloqueo del ticket no cambia.
 */
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';
import { CompraVinculada } from '../../domain/services/bloqueo-reparacion';
import { ListarComprasDeTicketUseCase } from './listar-compras-de-ticket.use-case';

const activa: CompraVinculada = {
  compraId: 'c-activa',
  numero: 'COM-2026-00001',
  tipoTicketId: null,
  cancelada: false,
  items: [{ estadoAprobacion: 'PENDIENTE', comprado: false, entregado: false }],
};
const completada: CompraVinculada = {
  compraId: 'c-completada',
  numero: 'COM-2026-00002',
  tipoTicketId: null,
  cancelada: false,
  items: [{ estadoAprobacion: 'APROBADO', comprado: true, entregado: true }],
};
const cancelada: CompraVinculada = {
  compraId: 'c-cancelada',
  numero: 'COM-2026-00003',
  tipoTicketId: null,
  cancelada: true,
  items: [{ estadoAprobacion: 'PENDIENTE', comprado: false, entregado: false }],
};

function armar(vinculadas: CompraVinculada[]) {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Impresora sin tóner',
      descripcion: null,
      tipoId: 'tipo-soporte',
      estadoId: 'estado-nuevo',
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
  const reparacionCompraRepo = {
    findComprasVinculadasByTicketIds: vi
      .fn()
      .mockResolvedValue(new Map(vinculadas.length > 0 ? [['ticket-uuid', vinculadas]] : [])),
  };
  const ticketRepo = {
    findById: vi.fn().mockResolvedValue(ticket),
    esVisiblePara: vi.fn().mockResolvedValue(false),
  };
  return {
    useCase: new ListarComprasDeTicketUseCase(reparacionCompraRepo, ticketRepo),
    reparacionCompraRepo,
  };
}

describe('ListarComprasDeTicketUseCase', () => {
  it('devuelve cada compra con su grupo, y marca como bloqueante solo la activa', async () => {
    const { useCase, reparacionCompraRepo } = armar([activa, completada, cancelada]);

    const result = await useCase.execute('ticket-uuid', alcanceSinRestriccion('actor'));

    expect(result.getValue()).toEqual([
      { compraId: 'c-activa', numero: 'COM-2026-00001', grupo: 'ACTIVAS', bloquea: true },
      { compraId: 'c-completada', numero: 'COM-2026-00002', grupo: 'COMPLETADAS', bloquea: false },
      { compraId: 'c-cancelada', numero: 'COM-2026-00003', grupo: 'CANCELADAS', bloquea: false },
    ]);
    expect(reparacionCompraRepo.findComprasVinculadasByTicketIds).toHaveBeenCalledWith([
      'ticket-uuid',
    ]);
  });

  it('un ticket sin compras vinculadas devuelve []', async () => {
    const { useCase } = armar([]);

    const result = await useCase.execute('ticket-uuid', alcanceSinRestriccion('actor'));

    expect(result.getValue()).toEqual([]);
  });

  it('sin LECTURA sobre el tipo → 404, sin leer los vínculos', async () => {
    const { useCase, reparacionCompraRepo } = armar([activa]);

    const result = await useCase.execute(
      'ticket-uuid',
      alcancePorTipo('actor', { 'tipo-otro': ['LECTURA', 'VER_TODOS'] }),
    );

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(reparacionCompraRepo.findComprasVinculadasByTicketIds).not.toHaveBeenCalled();
  });

  // `COMPRAS:LECTURA` lo exige la ruta (L19), no este caso de uso: el 403 se prueba en el e2e.
  it('con LECTURA y VER_TODOS sobre el tipo, sin MODIFICACION → las ve', async () => {
    const { useCase } = armar([activa]);

    const result = await useCase.execute(
      'ticket-uuid',
      alcancePorTipo('actor', { 'tipo-soporte': ['LECTURA', 'VER_TODOS'] }),
    );

    expect(result.getValue().map((c) => c.numero)).toEqual(['COM-2026-00001']);
  });

  describe('odd/compras-por-tipo — solo las compras que el actor ve por su tipo (S2, S4)', () => {
    const deEdilicia: CompraVinculada = {
      ...activa,
      compraId: 'c-edilicia',
      tipoTicketId: 'tipo-edilicia',
    };
    const deSoporte: CompraVinculada = {
      ...completada,
      compraId: 'c-soporte',
      tipoTicketId: 'tipo-soporte',
    };
    const sinTipo: CompraVinculada = { ...cancelada, compraId: 'c-sin-tipo', tipoTicketId: null };
    const lectorDeSoporte = alcancePorTipo('actor', { 'tipo-soporte': ['LECTURA', 'VER_TODOS'] });

    it('no lista la compra de un tipo sin LECTURA; sí la de su tipo y la sin tipo', async () => {
      const { useCase } = armar([deEdilicia, deSoporte, sinTipo]);

      const result = await useCase.execute('ticket-uuid', lectorDeSoporte);

      expect(result.getValue().map((c) => c.compraId)).toEqual(['c-soporte', 'c-sin-tipo']);
    });

    it('caso hermano: con LECTURA sobre el otro tipo también la lista, con su bloqueo', async () => {
      const { useCase } = armar([deEdilicia, deSoporte, sinTipo]);

      const result = await useCase.execute(
        'ticket-uuid',
        alcancePorTipo('actor', {
          'tipo-soporte': ['LECTURA', 'VER_TODOS'],
          'tipo-edilicia': ['LECTURA'],
        }),
      );

      expect(result.getValue().find((c) => c.compraId === 'c-edilicia')).toEqual({
        compraId: 'c-edilicia',
        numero: 'COM-2026-00001',
        grupo: 'ACTIVAS',
        bloquea: true,
      });
    });

    it('ADMINISTRADOR lista las de todos los tipos', async () => {
      const { useCase } = armar([deEdilicia, deSoporte, sinTipo]);

      const result = await useCase.execute('ticket-uuid', alcanceSinRestriccion('actor'));

      expect(result.getValue()).toHaveLength(3);
    });
  });
});
