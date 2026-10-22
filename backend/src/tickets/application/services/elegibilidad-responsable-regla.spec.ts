import { esResponsableElegible } from './elegibilidad-responsable-regla';

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
