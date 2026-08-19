import { describe, expect, it } from 'vitest';

import {
  BOM_UTF8,
  ColumnaCsv,
  SEPARADOR_CSV,
  fechaCsv,
  fechaHoraCsv,
  montoCsv,
  serializarCsv,
} from './csv';

interface FilaPrueba {
  nombre: string;
  cantidad: number;
  observacion: string | null;
}

const COLUMNAS: readonly ColumnaCsv<FilaPrueba>[] = [
  { encabezado: 'Nombre', valor: (f) => f.nombre },
  { encabezado: 'Cantidad', valor: (f) => f.cantidad },
  { encabezado: 'Observación', valor: (f) => f.observacion },
];

const fila = (parcial: Partial<FilaPrueba> = {}): FilaPrueba => ({
  nombre: 'Tornillo',
  cantidad: 3,
  observacion: null,
  ...parcial,
});

describe('serializarCsv', () => {
  it('abre con el BOM de UTF-8', () => {
    // Sin BOM, Excel asume la codificación del sistema (Windows-1252 en
    // Windows en español) y "Reparación" se ve como "ReparaciÃ³n".
    expect(serializarCsv([], COLUMNAS).startsWith(BOM_UTF8)).toBe(true);
  });

  it('emite los encabezados en el orden declarado', () => {
    const [encabezado] = serializarCsv([], COLUMNAS).slice(BOM_UTF8.length).split('\r\n');

    expect(encabezado).toBe(['Nombre', 'Cantidad', 'Observación'].join(SEPARADOR_CSV));
  });

  it('sin filas emite SOLO el encabezado, no una línea vacía de más', () => {
    const lineas = serializarCsv([], COLUMNAS).slice(BOM_UTF8.length).split('\r\n');

    expect(lineas).toHaveLength(1);
  });

  it('separa las filas con CRLF (RFC 4180)', () => {
    const lineas = serializarCsv([fila(), fila({ nombre: 'Tuerca' })], COLUMNAS)
      .slice(BOM_UTF8.length)
      .split('\r\n');

    expect(lineas).toHaveLength(3);
    expect(lineas[1]).toContain('Tornillo');
    expect(lineas[2]).toContain('Tuerca');
  });

  it('proyecta null y undefined como celda vacía, no como el texto "null"', () => {
    const salida = serializarCsv([fila({ observacion: null })], COLUMNAS);

    expect(salida).not.toContain('null');
    expect(salida.slice(BOM_UTF8.length).split('\r\n')[1]).toBe(
      ['Tornillo', '3', ''].join(SEPARADOR_CSV),
    );
  });

  // Los tres casos que obligan a entrecomillar según RFC 4180. Parametrizado
  // porque la regla es una sola: si el valor contiene el separador, una
  // comilla doble o un salto de línea, va entre comillas.
  it.each([
    { caso: 'el separador', crudo: `Caño${SEPARADOR_CSV}codo`, esperado: `"Caño${SEPARADOR_CSV}codo"` },
    { caso: 'comillas dobles', crudo: 'Caño de 2"', esperado: '"Caño de 2"""' },
    { caso: 'un salto de línea', crudo: 'Primera\nSegunda', esperado: '"Primera\nSegunda"' },
  ])('entrecomilla cuando el valor contiene $caso', ({ crudo, esperado }) => {
    const salida = serializarCsv([fila({ nombre: crudo })], COLUMNAS);

    expect(salida.slice(BOM_UTF8.length).split('\r\n')[1]).toContain(esperado);
  });

  it('no entrecomilla un valor que no lo necesita', () => {
    expect(serializarCsv([fila()], COLUMNAS)).not.toContain('"');
  });

  it('neutraliza el valor que empieza con un caracter de fórmula', () => {
    // Inyección CSV: Excel evalúa como fórmula toda celda que arranca con
    // =, +, - o @. Un `motivo` cargado por un usuario como
    // `=HYPERLINK(...)` se ejecutaría al abrir el archivo.
    const salida = serializarCsv([fila({ nombre: '=1+1' })], COLUMNAS);

    expect(salida).not.toContain(`${SEPARADOR_CSV}=1+1`);
    expect(salida).toContain("'=1+1");
  });
});

describe('fechaCsv', () => {
  it('formatea una columna @db.Date SIN desplazarla de zona horaria', () => {
    // Prisma devuelve `@db.Date` como medianoche UTC del día calendario.
    // Restarle las 3 horas de Argentina caería en las 21:00 del día
    // ANTERIOR — el bug clásico de "la fecha se corrió un día".
    expect(fechaCsv(new Date('2026-08-19T00:00:00.000Z'))).toBe('19/08/2026');
  });

  it('proyecta null como celda vacía', () => {
    expect(fechaCsv(null)).toBe('');
  });
});

describe('fechaHoraCsv', () => {
  it('desplaza un timestamp a la hora de Argentina (UTC-3)', () => {
    expect(fechaHoraCsv(new Date('2026-08-19T14:30:00.000Z'))).toBe('19/08/2026 11:30');
  });

  it('retrocede el día cuando en UTC ya es el día siguiente', () => {
    // 00:30 UTC del 20 son las 21:30 del 19 en Argentina. Formatear en UTC
    // mostraría el 20 y adelantaría el registro un día.
    expect(fechaHoraCsv(new Date('2026-08-20T00:30:00.000Z'))).toBe('19/08/2026 21:30');
  });
});

describe('montoCsv', () => {
  it.each([
    { entrada: 1234.5, esperado: '1234,50' },
    { entrada: 0, esperado: '0,00' },
    { entrada: 1234.567, esperado: '1234,57' },
  ])('usa coma decimal y dos decimales: $entrada → $esperado', ({ entrada, esperado }) => {
    expect(montoCsv(entrada)).toBe(esperado);
  });

  it('no agrega separador de miles', () => {
    // Con separador de miles, Excel en español lee "1.234,50" como número
    // sólo si la configuración regional coincide; sin él lo lee siempre.
    expect(montoCsv(1234567.89)).toBe('1234567,89');
  });
});
