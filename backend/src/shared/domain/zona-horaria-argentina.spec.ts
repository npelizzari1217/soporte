import { desplazarAArgentina, diaArgentino, medianocheArgentina } from './zona-horaria-argentina';

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

  describe('diaArgentino', () => {
    it('devuelve el día calendario argentino de un instante, como medianoche UTC (igual que un @db.Date)', () => {
      expect(diaArgentino(new Date('2026-06-30T04:00:00.000Z'))).toEqual(
        new Date('2026-06-30T00:00:00.000Z'),
      );
    });

    it('entre las 21:00 y las 23:59 ART el día UTC ya cambió, pero el argentino no', () => {
      // 01:30 UTC del 01/07 son las 22:30 ART del 30/06.
      expect(diaArgentino(new Date('2026-07-01T01:30:00.000Z'))).toEqual(
        new Date('2026-06-30T00:00:00.000Z'),
      );
    });

    it('es la inversa de medianocheArgentina sobre un día calendario', () => {
      const dia = new Date('2026-12-31T00:00:00.000Z');
      expect(diaArgentino(medianocheArgentina(dia))).toEqual(dia);
    });
  });
});
