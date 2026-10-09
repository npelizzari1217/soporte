import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { esResponsableElegible, evaluarResponsableRegla } from './elegibilidad-responsable-regla';

const TECNICO = { id: 'u-tecnico', nombre: 'Tina', apellido: 'Tecnica' };
const COLABORADOR = { id: 'u-colab', nombre: 'Cora', apellido: 'Colaboradora' };

describe('esResponsableElegible', () => {
  it('es elegible si el id figura entre los candidatos', () => {
    expect(esResponsableElegible('u-colab', [TECNICO, COLABORADOR])).toBe(true);
  });

  it('no es elegible si el id no figura entre los candidatos', () => {
    expect(esResponsableElegible('u-otro', [TECNICO, COLABORADOR])).toBe(false);
  });

  it('con lista vacia nadie es elegible', () => {
    expect(esResponsableElegible('u-tecnico', [])).toBe(false);
  });
});

describe('evaluarResponsableRegla', () => {
  function checkerCon(candidatos: { id: string; nombre: string; apellido: string }[]) {
    const listarTecnicosAsignables = vi.fn().mockResolvedValue(candidatos);
    const checker = { listarTecnicosAsignables } satisfies Pick<
      IUsuarioMasterChecker,
      'listarTecnicosAsignables'
    >;
    return { checker, listarTecnicosAsignables };
  }

  it('pide el universo con el cliente y el modulo, y aplica la funcion pura', async () => {
    const { checker, listarTecnicosAsignables } = checkerCon([TECNICO]);

    await expect(evaluarResponsableRegla('u-tecnico', 'c-1', 'SOPORTE', checker)).resolves.toBe(
      true,
    );
    expect(listarTecnicosAsignables).toHaveBeenCalledWith('c-1', 'SOPORTE');
  });

  it('un ADMINISTRADOR que el checker no incluye en el universo no es elegible (P1)', async () => {
    const { checker } = checkerCon([TECNICO, COLABORADOR]);

    await expect(evaluarResponsableRegla('u-admin', 'c-1', 'SOPORTE', checker)).resolves.toBe(
      false,
    );
  });

  it('propaga el rechazo del checker (no lo traga)', async () => {
    const checker: Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'> = {
      listarTecnicosAsignables: vi.fn().mockRejectedValue(new Error('master caido')),
    };

    await expect(evaluarResponsableRegla('u-tecnico', 'c-1', 'SOPORTE', checker)).rejects.toThrow(
      'master caido',
    );
  });
});
