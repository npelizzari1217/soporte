import { formatearDiaCalendario } from './dia-calendario';

describe('formatearDiaCalendario', () => {
  it('arma dd/mm/aaaa con los componentes UTC de una columna @db.Date (medianoche UTC)', () => {
    expect(formatearDiaCalendario(new Date('2026-07-01T00:00:00.000Z'))).toBe('01/07/2026');
  });

  it('no corre el día hacia atrás: la medianoche UTC del 31/12 sigue siendo el 31/12', () => {
    // Desplazado a Argentina (UTC-3) caería el 30/12 a las 21:00.
    expect(formatearDiaCalendario(new Date('2026-12-31T00:00:00.000Z'))).toBe('31/12/2026');
  });
});
