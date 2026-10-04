import { SlugCliente, SLUG_MAX_LENGTH } from './slug-cliente';

describe('SlugCliente', () => {
  it.each(['colegio-norte', 'a', 'abc123', 'a-b-c', '0-9'])('acepta %s', (valor) => {
    const r = SlugCliente.crear(valor);
    expect(r.isOk()).toBe(true);
    expect(r.getValue().valor).toBe(valor);
  });

  it.each([
    ['vacio', ''],
    ['mayusculas', 'Colegio'],
    ['espacios', 'colegio norte'],
    ['guion bajo', 'colegio_norte'],
    ['guion inicial', '-colegio'],
    ['guion final', 'colegio-'],
    ['acentos', 'colegió'],
    ['barra', 'a/b'],
  ])('rechaza formato invalido: %s', (_motivo, valor) => {
    const r = SlugCliente.crear(valor);
    expect(r.isFail()).toBe(true);
    expect(r.getError().code).toBe('SLUG_INVALIDO');
  });

  it('rechaza un slug que excede el largo maximo', () => {
    expect(SlugCliente.crear('a'.repeat(SLUG_MAX_LENGTH)).isOk()).toBe(true);
    const r = SlugCliente.crear('a'.repeat(SLUG_MAX_LENGTH + 1));
    expect(r.isFail()).toBe(true);
    expect(r.getError().code).toBe('SLUG_INVALIDO');
  });

  it('rechaza la forma de UUID aunque cumpla el formato', () => {
    const r = SlugCliente.crear('0199aaaa-bbbb-7ccc-8ddd-eeeeffff0001');
    expect(r.isFail()).toBe(true);
    expect(r.getError().message).toMatch(/UUID/);
  });
});
