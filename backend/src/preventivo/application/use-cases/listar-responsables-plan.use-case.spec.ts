/**
 * [UNIT] — `ListarResponsablesPlanUseCase`: el selector "Responsable" del alta y la edición de un
 * plan ofrece solo a los técnicos que atienden los tickets que el plan genera (tipo `PREVENTIVO`).
 * Sin DB: `ElegibilidadAsignado` real sobre dobles en memoria.
 */
import { ListarResponsablesPlanUseCase } from './listar-responsables-plan.use-case';
import {
  USUARIOS_PREVENTIVO,
  responsablesDePrueba,
} from '../../test-helpers/responsables-plan-en-memoria';

describe('ListarResponsablesPlanUseCase', () => {
  it('lista solo a TECNICO y COLABORADOR con LECTURA sobre Preventivo, ordenados', async () => {
    const { responsables } = responsablesDePrueba();
    const useCase = new ListarResponsablesPlanUseCase(responsables);

    const result = await useCase.execute({ clienteId: 'cliente-1' });

    // Fuera: el USUARIO que ve Preventivo, el técnico de otro tipo y el técnico sin permisos.
    expect(result.getValue()).toEqual([
      USUARIOS_PREVENTIVO.COLABORADOR_PREVENTIVO,
      USUARIOS_PREVENTIVO.TECNICO_PREVENTIVO,
    ]);
  });

  it('un tenant sin el tipo PREVENTIVO sembrado es un error de infraestructura, no una lista vacía', async () => {
    const { responsables } = responsablesDePrueba(null);
    const useCase = new ListarResponsablesPlanUseCase(responsables);

    await expect(useCase.execute({ clienteId: 'cliente-1' })).rejects.toThrow(
      'no existe el tipo "PREVENTIVO"',
    );
  });
});
