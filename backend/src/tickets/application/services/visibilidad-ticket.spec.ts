/**
 * [UNIT] `esTicketVisiblePara` (odd/tareas-con-tecnico, CA10; decisión del dueño del 2026-10-14
 * sobre el responsable): con VER_TODOS, siendo el solicitante o siendo el responsable se resuelve
 * sin consultar; en otro caso decide el repositorio, que agrega al técnico de una tarea activa.
 */
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import {
  esTicketAccesiblePara,
  esTicketVisiblePara,
  puedeOperarTicket,
  tieneAccionSobreTipo,
} from './visibilidad-ticket';

const SOLICITANTE = 'usuario-solicitante';
const TECNICO = 'usuario-tecnico';
const RESPONSABLE = 'usuario-responsable';

function ticket(tipoId = 'tipo'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Sin red',
      descripcion: null,
      tipoId,
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

  it('el responsable lo ve sin VER_TODOS y sin consultar el repositorio', async () => {
    const repo = { esVisiblePara: vi.fn() };
    const asignado = ticket();
    asignado.assignTo(RESPONSABLE);
    expect(await esTicketVisiblePara(repo, asignado, RESPONSABLE, false)).toBe(true);
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

/**
 * Punto único de la etapa 1 (odd/permisos-por-tipo-ticket, S2, S3, D5 b-c): ver es `LECTURA` sobre
 * el tipo del ticket y además `VER_TODOS` sobre ese tipo o la regla de fila; operar exige además la
 * acción sobre ese tipo. Mismo usuario, tres tipos: Soporte con Ver y Modificar, Mantenimiento solo
 * con Ver, Electricidad sin nada.
 */
describe('permisos por tipo del ticket', () => {
  const SOPORTE = 'tipo-soporte';
  const MANTENIMIENTO = 'tipo-mantenimiento';
  const ELECTRICIDAD = 'tipo-electricidad';
  const alcance = alcancePorTipo(SOLICITANTE, {
    [SOPORTE]: ['LECTURA', 'MODIFICACION'],
    [MANTENIMIENTO]: ['LECTURA'],
  });

  describe('esTicketAccesiblePara', () => {
    it('sin LECTURA sobre el tipo no lo ve, aunque sea el solicitante (S3)', async () => {
      const repo = { esVisiblePara: vi.fn().mockResolvedValue(true) };
      expect(await esTicketAccesiblePara(repo, ticket(ELECTRICIDAD), alcance)).toBe(false);
    });

    it('sin LECTURA sobre el tipo no lo ve aunque sea el responsable o tenga una tarea (S3)', async () => {
      const repo = { esVisiblePara: vi.fn().mockResolvedValue(true) };
      const asignado = ticket(ELECTRICIDAD);
      asignado.assignTo(TECNICO);
      expect(
        await esTicketAccesiblePara(
          repo,
          asignado,
          alcancePorTipo(TECNICO, { [SOPORTE]: ['LECTURA'] }),
        ),
      ).toBe(false);
      expect(repo.esVisiblePara).not.toHaveBeenCalled();
    });

    it('con LECTURA y sin VER_TODOS sobre el tipo rige la regla de fila', async () => {
      const repo = { esVisiblePara: vi.fn().mockResolvedValue(false) };
      const deTecnico = alcancePorTipo(TECNICO, { [SOPORTE]: ['LECTURA'] });
      expect(await esTicketAccesiblePara(repo, ticket(SOPORTE), deTecnico)).toBe(false);
      expect(repo.esVisiblePara).toHaveBeenCalledWith('ticket-1', TECNICO);
    });

    it('VER_TODOS sobre un tipo amplía las filas solo de ese tipo', async () => {
      const repo = { esVisiblePara: vi.fn().mockResolvedValue(false) };
      const deTecnico = alcancePorTipo(TECNICO, {
        [SOPORTE]: ['LECTURA', 'VER_TODOS'],
        [MANTENIMIENTO]: ['LECTURA'],
      });
      expect(await esTicketAccesiblePara(repo, ticket(SOPORTE), deTecnico)).toBe(true);
      expect(await esTicketAccesiblePara(repo, ticket(MANTENIMIENTO), deTecnico)).toBe(false);
    });

    it('VER_TODOS sin LECTURA sobre el tipo no alcanza para verlo', async () => {
      const repo = { esVisiblePara: vi.fn().mockResolvedValue(true) };
      const deTecnico = alcancePorTipo(TECNICO, { [SOPORTE]: ['VER_TODOS'] });
      expect(await esTicketAccesiblePara(repo, ticket(SOPORTE), deTecnico)).toBe(false);
    });

    it('ROOT y ADMINISTRADOR (sin restricción) ven cualquier tipo sin consultar', async () => {
      const repo = { esVisiblePara: vi.fn() };
      expect(
        await esTicketAccesiblePara(repo, ticket(ELECTRICIDAD), alcanceSinRestriccion(TECNICO)),
      ).toBe(true);
      expect(repo.esVisiblePara).not.toHaveBeenCalled();
    });
  });

  describe('puedeOperarTicket', () => {
    const repo = { esVisiblePara: vi.fn().mockResolvedValue(false) };

    it('con la acción sobre el tipo del ticket, ok', async () => {
      const r = await puedeOperarTicket(repo, ticket(SOPORTE), alcance, 'MODIFICACION');
      expect(r.isOk()).toBe(true);
    });

    it('lo ve pero le falta la acción sobre ese tipo: 403 con la acción en el mensaje', async () => {
      const r = await puedeOperarTicket(repo, ticket(MANTENIMIENTO), alcance, 'MODIFICACION');
      expect(r.isFail()).toBe(true);
      const error = r.getError();
      expect(error).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(error.message).toBe(
        'El usuario no tiene el permiso "MODIFICACION" sobre el tipo de este ticket.',
      );
    });

    it('sin LECTURA sobre el tipo: 404, aunque tenga la acción pedida', async () => {
      const conAccion = alcancePorTipo(SOLICITANTE, { [ELECTRICIDAD]: ['MODIFICACION'] });
      const r = await puedeOperarTicket(repo, ticket(ELECTRICIDAD), conAccion, 'MODIFICACION');
      expect(r.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });

    it('exige todas las acciones pedidas', async () => {
      const soloAsignar = alcancePorTipo(SOLICITANTE, { [SOPORTE]: ['LECTURA', 'ASIGNAR'] });
      const r = await puedeOperarTicket(
        repo,
        ticket(SOPORTE),
        soloAsignar,
        'ASIGNAR',
        'TRANSICIONAR',
      );
      expect(r.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(r.getError().message).toContain('"TRANSICIONAR"');
    });

    it('una alternativa (`algunaDe`) se cumple con cualquiera de sus acciones', async () => {
      const conAltas = alcancePorTipo(SOLICITANTE, { [SOPORTE]: ['LECTURA', 'ALTAS'] });
      const requisito = { algunaDe: ['ALTAS', 'MODIFICACION'] } as const;
      expect((await puedeOperarTicket(repo, ticket(SOPORTE), conAltas, requisito)).isOk()).toBe(
        true,
      );
      const r = await puedeOperarTicket(repo, ticket(MANTENIMIENTO), alcance, requisito);
      expect(r.getError().message).toBe(
        'El usuario no tiene el permiso "ALTAS o MODIFICACION" sobre el tipo de este ticket.',
      );
    });

    it('ROOT y ADMINISTRADOR pasan cualquier acción', async () => {
      const r = await puedeOperarTicket(
        repo,
        ticket(ELECTRICIDAD),
        alcanceSinRestriccion(TECNICO),
        'MODIFICACION',
        'BORRADO',
      );
      expect(r.isOk()).toBe(true);
    });
  });

  describe('tieneAccionSobreTipo', () => {
    it('mira solo el tipo pedido', () => {
      expect(tieneAccionSobreTipo(alcance, SOPORTE, 'MODIFICACION')).toBe(true);
      expect(tieneAccionSobreTipo(alcance, MANTENIMIENTO, 'MODIFICACION')).toBe(false);
      expect(tieneAccionSobreTipo(alcance, ELECTRICIDAD, 'LECTURA')).toBe(false);
    });

    it('sin restricción, cualquier acción', () => {
      expect(tieneAccionSobreTipo(alcanceSinRestriccion(TECNICO), ELECTRICIDAD, 'OBSERVAR')).toBe(
        true,
      );
    });
  });
});
