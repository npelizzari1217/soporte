/**
 * [UNIT] — `ListarResponsablesPlanUseCase`: el selector "Responsable" del alta y la edición de un
 * plan ofrece solo a los técnicos que atienden los tickets del tipo elegido
 * (odd/preventivo-por-tipo, S5). Sin DB: `ElegibilidadAsignado` real sobre dobles en memoria.
 */
import { ListarResponsablesPlanUseCase } from './listar-responsables-plan.use-case';
import { AccionSobreTipoDelPlanNoPermitidaError } from '../../domain/errors/preventivo.errors';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';
import {
  TIPO_PREVENTIVO_ID,
  TIPO_SOPORTE_ID,
  USUARIOS_PREVENTIVO,
  responsablesDePrueba,
} from '../../test-helpers/responsables-plan-en-memoria';

const ACTOR = alcancePorTipo('actor-1', {
  [TIPO_PREVENTIVO_ID]: ['LECTURA'],
  [TIPO_SOPORTE_ID]: ['LECTURA'],
});

describe('ListarResponsablesPlanUseCase', () => {
  it('Preventivo: lista solo a TECNICO y COLABORADOR con LECTURA sobre Preventivo, ordenados', async () => {
    const { responsables } = responsablesDePrueba();
    const useCase = new ListarResponsablesPlanUseCase(responsables);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      tipoId: TIPO_PREVENTIVO_ID,
      alcance: ACTOR,
    });

    // Fuera: el USUARIO que ve Preventivo, el técnico de Soporte y el técnico sin permisos.
    expect(result.getValue()).toEqual([
      USUARIOS_PREVENTIVO.COLABORADOR_PREVENTIVO,
      USUARIOS_PREVENTIVO.TECNICO_PREVENTIVO,
    ]);
  });

  it('S5: con otro tipo lista a los técnicos de ESE tipo, no a los de Preventivo', async () => {
    const { responsables } = responsablesDePrueba();
    const useCase = new ListarResponsablesPlanUseCase(responsables);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      tipoId: TIPO_SOPORTE_ID,
      alcance: ACTOR,
    });

    expect(result.getValue()).toEqual([USUARIOS_PREVENTIVO.TECNICO_SOPORTE]);
  });

  it('S4: un tipo sin LECTURA para el actor → 403, sin consultar a master', async () => {
    const { responsables, master } = responsablesDePrueba();
    const useCase = new ListarResponsablesPlanUseCase(responsables);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      tipoId: TIPO_SOPORTE_ID,
      alcance: alcancePorTipo('actor-1', { [TIPO_PREVENTIVO_ID]: ['LECTURA'] }),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AccionSobreTipoDelPlanNoPermitidaError);
    expect(master.consultasDeAgentes).toBe(0);
  });

  it('ADMINISTRADOR (sin restricción por tipo) lista los de cualquier tipo', async () => {
    const { responsables } = responsablesDePrueba();
    const useCase = new ListarResponsablesPlanUseCase(responsables);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      tipoId: TIPO_SOPORTE_ID,
      alcance: alcanceSinRestriccion('admin-1'),
    });

    expect(result.getValue()).toEqual([USUARIOS_PREVENTIVO.TECNICO_SOPORTE]);
  });
});
