/**
 * [UNIT] ConfigurarReglaAsignacionUseCase — R1, R2, R3 (sdd/asignacion-automatica-por-tipo).
 *
 * Mutación documentada: saltear la revalidación de elegibilidad antes de `fijar` pone en rojo los
 * casos 422 (el ADMINISTRADOR, el de otro cliente y el dado de baja quedarían guardados).
 */
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import {
  ResponsableReglaNoElegibleError,
  TipoTicketNoConfigurableError,
} from '../../domain/errors';
import { ConfigurarReglaAsignacionUseCase } from './configurar-regla-asignacion.use-case';

const CLIENTE = 'cliente-1';
const ACTOR = 'u-admin';

class MasterCaidoError extends Error {}

function tipoActivo(): TipoTicketEntity {
  return TipoTicketEntity.create(
    { codigo: 'TICKETS', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
    'tipo-1',
  );
}

function armar(tipo: TipoTicketEntity | null = tipoActivo()) {
  const fijar = vi.fn().mockResolvedValue(undefined);
  const quitar = vi.fn().mockResolvedValue(undefined);
  // El universo no incluye al ADMINISTRADOR, al de otro cliente, al sin módulo ni al dado de baja.
  const listarTecnicosAsignables = vi
    .fn()
    .mockResolvedValue([{ id: 'u-tina', nombre: 'Tina', apellido: 'Tecnica' }]);
  const useCase = new ConfigurarReglaAsignacionUseCase(
    { findById: vi.fn().mockResolvedValue(tipo) },
    { fijar, quitar },
    { listarTecnicosAsignables },
  );
  const dto = (responsableId: string | null) => ({
    tipoId: 'tipo-1',
    responsableId,
    clienteId: CLIENTE,
    actorId: ACTOR,
  });
  return { useCase, fijar, quitar, listarTecnicosAsignables, dto };
}

describe('ConfigurarReglaAsignacionUseCase', () => {
  it('null quita la regla del tipo y devuelve SIN_REGLA, sin consultar a master', async () => {
    const { useCase, quitar, fijar, listarTecnicosAsignables, dto } = armar();

    const result = await useCase.execute(dto(null));

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toMatchObject({
      tipoId: 'tipo-1',
      responsableId: null,
      estado: 'SIN_REGLA',
    });
    expect(quitar).toHaveBeenCalledWith('tipo-1');
    expect(fijar).not.toHaveBeenCalled();
    expect(listarTecnicosAsignables).not.toHaveBeenCalled();
  });

  it('un responsable elegible se fija con el actor como actualizado_por', async () => {
    const { useCase, fijar, listarTecnicosAsignables, dto } = armar();

    const result = await useCase.execute(dto('u-tina'));

    expect(result.getValue()).toMatchObject({
      responsableId: 'u-tina',
      responsableNombre: 'Tina Tecnica',
      estado: 'VALIDA',
    });
    expect(listarTecnicosAsignables).toHaveBeenCalledWith(CLIENTE, 'TICKETS');
    expect(fijar).toHaveBeenCalledWith('tipo-1', 'u-tina', ACTOR);
  });

  it.each(['u-admin-cliente', 'u-otro-cliente', 'u-sin-modulo', 'u-dado-de-baja'])(
    'el responsable %s no esta en el universo: ResponsableReglaNoElegibleError sin escribir',
    async (responsableId) => {
      const { useCase, fijar, quitar, dto } = armar();

      const result = await useCase.execute(dto(responsableId));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResponsableReglaNoElegibleError);
      expect(fijar).not.toHaveBeenCalled();
      expect(quitar).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['inexistente', null],
    [
      'dado de baja',
      TipoTicketEntity.create(
        { codigo: 'X', nombre: 'X', modulo: 'TICKETS', activo: false },
        'tipo-1',
      ),
    ],
  ])('tipo %s: TipoTicketNoConfigurableError sin escribir', async (_caso, tipo) => {
    const { useCase, fijar, quitar, dto } = armar(tipo);

    const conResponsable = await useCase.execute(dto('u-tina'));
    const quitando = await useCase.execute(dto(null));

    expect(conResponsable.getError()).toBeInstanceOf(TipoTicketNoConfigurableError);
    expect(quitando.getError()).toBeInstanceOf(TipoTicketNoConfigurableError);
    expect(fijar).not.toHaveBeenCalled();
    expect(quitar).not.toHaveBeenCalled();
  });

  it('un fallo de master se propaga (no se degrada) y no escribe', async () => {
    const { useCase, fijar, listarTecnicosAsignables, dto } = armar();
    listarTecnicosAsignables.mockRejectedValue(new MasterCaidoError('master caido'));

    await expect(useCase.execute(dto('u-tina'))).rejects.toBeInstanceOf(MasterCaidoError);
    expect(fijar).not.toHaveBeenCalled();
  });
});
