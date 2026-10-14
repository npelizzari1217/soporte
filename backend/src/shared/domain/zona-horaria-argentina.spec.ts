import { desplazarAArgentina, medianocheArgentina } from './zona-horaria-argentina';

describe('zona-horaria-argentina', () => {
  describe('medianocheArgentina', () => {
    it('devuelve el instante en que empieza el día argentino de una columna @db.Date (03:00 UTC)', () => {
      // Prisma devuelve un @db.Date como la medianoche UTC del día calendario.
      expect(medianocheArgentina(new Date('2026-10-31T00:00:00.000Z'))).toEqual(
        new Date('2026-10-31T03:00:00.000Z'),
      );
    });

    it('usa solo el día calendario UTC: la hora del Date que recibe no corre el resultado', () => {
      expect(medianocheArgentina(new Date('2026-10-31T23:59:59.999Z'))).toEqual(
        new Date('2026-10-31T03:00:00.000Z'),
      );
    });

    it('cruza meses y años sin desfasarse', () => {
      expect(medianocheArgentina(new Date('2026-12-31T00:00:00.000Z'))).toEqual(
        new Date('2026-12-31T03:00:00.000Z'),
      );
    });

    it('es el instante que un observador argentino lee como 00:00 de ese día', () => {
      const leido = desplazarAArgentina(medianocheArgentina(new Date('2026-10-31T00:00:00.000Z')));
      expect(leido.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    });
  });
});
