/**
 * Sondas del verificador independiente de T3 (odd/tasks/tiempo-tecnico.md, L10-L11): bordes de la
 * apertura, el cierre y la medición que `tramo-tecnico.spec.ts` no fijaba (S4-S7).
 */
import { evaluarCumplido, medirSegundosHabiles, planificarTramo } from './tramo-tecnico';

const lineal = (desde: Date, hasta: Date): number => hasta.getTime() - desde.getTime();
const at = (hora: string): Date => new Date(`2026-01-01T${hora}:00Z`);

describe('tramos del técnico: bordes', () => {
  it('reabrir desde CERRADO con asignado abre un tramo (S5)', () => {
    expect(
      planificarTramo(
        { asignadoId: 'X', estadoCodigo: 'CERRADO' },
        { asignadoId: 'X', estadoCodigo: 'EN_PROCESO' },
        null,
      ).abrir?.tecnicoId,
    ).toBe('X');
  });

  it('RESUELTO a CERRADO no abre ni cierra tramos (S5)', () => {
    expect(
      planificarTramo(
        { asignadoId: 'X', estadoCodigo: 'RESUELTO' },
        { asignadoId: 'X', estadoCodigo: 'CERRADO' },
        null,
      ),
    ).toEqual({ cerrar: null, abrir: null });
  });

  it('un ticket asignado antes del deploy que se resuelve no crea tramo', () => {
    expect(
      planificarTramo(
        { asignadoId: 'X', estadoCodigo: 'EN_PROCESO' },
        { asignadoId: 'X', estadoCodigo: 'RESUELTO' },
        null,
      ),
    ).toEqual({ cerrar: null, abrir: null });
  });

  it('un tramo que empieza en espera no cuenta hasta que se reanuda (S7)', () => {
    expect(
      medirSegundosHabiles(
        at('10:00'),
        at('14:00'),
        [
          { at: at('09:00'), estadoCodigo: 'ESPERANDO_CLIENTE' },
          { at: at('13:00'), estadoCodigo: 'EN_PROCESO' },
        ],
        lineal,
      ),
    ).toBe(3600);
  });

  it('un cambio exactamente en el inicio fija el estado inicial (S7)', () => {
    expect(
      medirSegundosHabiles(
        at('10:00'),
        at('14:00'),
        [{ at: at('10:00'), estadoCodigo: 'ESPERANDO_CLIENTE' }],
        lineal,
      ),
    ).toBe(0);
  });

  it('la operación de RESUELTO unos ms antes del fin no recorta la medición (S5)', () => {
    expect(
      medirSegundosHabiles(
        at('10:00'),
        at('14:00'),
        [{ at: new Date(at('14:00').getTime() - 5), estadoCodigo: 'RESUELTO' }],
        lineal,
      ),
    ).toBe(4 * 3600);
  });

  it('el veredicto existe solo en RESUELTO, con meta y con medición (S4, S6)', () => {
    expect(evaluarCumplido('RESUELTO', 10, 10)).toBe(true);
    expect(evaluarCumplido('RESUELTO', 11, 10)).toBe(false);
    expect(evaluarCumplido('CERRADO', 1, 10)).toBeNull();
    expect(evaluarCumplido('REASIGNADO', 1, 10)).toBeNull();
    expect(evaluarCumplido('RESUELTO', 1, null)).toBeNull();
    expect(evaluarCumplido('RESUELTO', null, 10)).toBeNull();
  });
});
