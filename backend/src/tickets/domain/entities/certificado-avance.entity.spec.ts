/**
 * [UNIT] CertificadoAvanceEntity (odd/edilicia-obra-externa, S5, S8).
 */
import { CertificadoYaAnuladoError } from '../errors/certificados.errors';
import { CertificadoAvanceEntity } from './certificado-avance.entity';

const T0 = new Date('2026-11-06T10:00:00Z');
const T1 = new Date('2026-11-06T11:00:00Z');

function emitir(pesos: number[] = [20, 15]): CertificadoAvanceEntity {
  return CertificadoAvanceEntity.emitir({
    ticketId: 'ticket-1',
    numero: 1,
    emitidoPorId: 'u-cert',
    emitidoEn: T0,
    tareas: pesos.map((peso, i) => ({ tareaId: `t${i}`, peso })),
  });
}

describe('CertificadoAvanceEntity', () => {
  it('el porcentaje es la suma de los pesos copiados, no un valor cargado (S5)', () => {
    const c = emitir([20, 15, 5]);

    expect(c.porcentaje).toBe(40);
    expect(c.vigente).toBe(true);
    expect(c.emitidoPorId).toBe('u-cert');
    expect(c.emitidoEn).toEqual(T0);
  });

  it('sin tareas viola la precondición', () => {
    expect(() => emitir([])).toThrow();
  });

  it('anular registra quién, cuándo y por qué, y deja de estar vigente (S8)', () => {
    const c = emitir();

    expect(c.anular('u-admin', 'Se certificó de más', T1).isOk()).toBe(true);
    expect(c.vigente).toBe(false);
    expect(c.anuladoPorId).toBe('u-admin');
    expect(c.anuladoEn).toEqual(T1);
    expect(c.motivoAnulacion).toBe('Se certificó de más');
  });

  it('anular dos veces da CertificadoYaAnuladoError y conserva la primera anulación', () => {
    const c = emitir();
    c.anular('u-admin', 'Primera', T1);

    expect(c.anular('u-otro', 'Segunda', T1).getError()).toBeInstanceOf(CertificadoYaAnuladoError);
    expect(c.anuladoPorId).toBe('u-admin');
    expect(c.motivoAnulacion).toBe('Primera');
  });

  it('un motivo en blanco viola la precondición y no anula', () => {
    const c = emitir();

    expect(() => c.anular('u-admin', '   ', T1)).toThrow();
    expect(c.vigente).toBe(true);
  });
});
