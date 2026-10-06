import { describe, expect, it } from 'vitest';

import {
  BOM_UTF8,
  cantidadCsv,
  ColumnaCsv,
  SEPARADOR_CSV,
  diaArgentinoCelda,
  diaArgentinoCsv,
  fechaCelda,
  fechaCsv,
  fechaHoraCelda,
  fechaHoraCsv,
  montoCelda,
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
    {
      caso: 'el separador',
      crudo: `Caño${SEPARADOR_CSV}codo`,
      esperado: `"Caño${SEPARADOR_CSV}codo"`,
    },
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

describe('diaArgentinoCsv', () => {
  // sdd/corregir-fecha-cierre-tickets D3: `fechaCierre` pasó a ser un
  // instante real (`@db.Timestamptz`). Este helper desplaza a hora de
  // Argentina ANTES de truncar al día — a diferencia de `fechaCsv`, que lee
  // componentes UTC crudos y solo es correcto para columnas `@db.Date`.
  it.each([
    { entrada: '2026-08-14T02:59:59.000Z', esperado: '13/08/2026' },
    { entrada: '2026-08-14T03:00:00.000Z', esperado: '14/08/2026' },
  ])(
    'desplaza el instante a Argentina antes de truncar: $entrada → $esperado',
    ({ entrada, esperado }) => {
      expect(diaArgentinoCsv(new Date(entrada))).toBe(esperado);
    },
  );

  it('proyecta null como celda vacía', () => {
    expect(diaArgentinoCsv(null)).toBe('');
  });

  it('proyecta undefined como celda vacía', () => {
    expect(diaArgentinoCsv(undefined)).toBe('');
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

describe('cantidadCsv', () => {
  const CELDA = /^-?\d+(,\d{2})?$/;

  it('una unidad entera con valor entero sale sin decimales', () => {
    expect(cantidadCsv(3, true).texto).toBe('3');
  });

  it('un fraccionario sale con dos decimales y coma', () => {
    expect(cantidadCsv(2.5, false).texto).toBe('2,50');
  });

  it('un fraccionario en una unidad entera no se redondea', () => {
    expect(cantidadCsv(2.5, true).texto).toBe('2,50');
  });

  it('un entero en una unidad fraccionaria lleva dos decimales', () => {
    expect(cantidadCsv(3, false).texto).toBe('3,00');
  });

  it('un negativo sale sin apostrofo ni comillas', () => {
    const csv = serializarCsv(
      [{ c: cantidadCsv(-3, true) }],
      [{ encabezado: 'C', valor: (f) => f.c }],
    );
    expect(csv).toBe(`${BOM_UTF8}C\r\n-3`);
  });

  it('-0 sale 0, nunca -0 ni -0,00', () => {
    expect(cantidadCsv(-0, true).texto).toBe('0');
    expect(cantidadCsv(-0, false).texto).toBe('0,00');
    expect(cantidadCsv(-0.001, false).texto).toBe('0,00');
  });

  it('NaN e Infinity lanzan', () => {
    expect(() => cantidadCsv(Number.NaN, true)).toThrow();
    expect(() => cantidadCsv(Infinity, false)).toThrow();
    expect(() => cantidadCsv(-Infinity, false)).toThrow();
  });

  it('la salida siempre cumple el formato numerico', () => {
    for (const v of [0, 1, -1, 2.5, -2.5, 1234567.891, -0.4]) {
      expect(cantidadCsv(v, false).texto).toMatch(CELDA);
      expect(cantidadCsv(v, true).texto).toMatch(CELDA);
    }
  });

  it('el texto libre sigue neutralizado y un number plano no cambia', () => {
    const columnas: readonly ColumnaCsv<{ v: string | number }>[] = [
      { encabezado: 'V', valor: (f) => f.v },
    ];
    expect(serializarCsv([{ v: '-3' }], columnas)).toBe(`${BOM_UTF8}V\r\n'-3`);
    expect(serializarCsv([{ v: '=cmd' }], columnas)).toBe(`${BOM_UTF8}V\r\n'=cmd`);
    expect(serializarCsv([{ v: -3 }], columnas)).toBe(`${BOM_UTF8}V\r\n'-3`);
  });
});

describe('celdas tipadas — el texto del CSV es idéntico al de los helpers de texto', () => {
  const instante = new Date('2026-08-20T01:30:45.000Z');
  const fecha = new Date('2026-08-19T00:00:00.000Z');

  it('cada variante tipada emite el mismo texto que su helper', () => {
    expect(fechaHoraCelda(instante)?.texto).toBe(fechaHoraCsv(instante));
    expect(diaArgentinoCelda(instante)?.texto).toBe(diaArgentinoCsv(instante));
    expect(fechaCelda(fecha)?.texto).toBe(fechaCsv(fecha));
    expect(montoCelda(1234.5).texto).toBe(montoCsv(1234.5));
  });

  it('llevan el valor crudo con los componentes UTC ya en hora argentina', () => {
    expect(fechaHoraCelda(instante)?.fecha.toISOString()).toBe('2026-08-19T22:30:00.000Z');
    expect(diaArgentinoCelda(instante)?.fecha.toISOString()).toBe('2026-08-19T00:00:00.000Z');
    expect(fechaCelda(fecha)?.fecha).toBe(fecha);
    expect(montoCelda(1234.5)).toMatchObject({ valor: 1234.5, decimales: 2 });
    expect(cantidadCsv(3, true)).toMatchObject({ valor: 3, decimales: 0 });
    expect(cantidadCsv(2.5, true)).toMatchObject({ valor: 2.5, decimales: 2 });
  });

  it('null y undefined son celda vacía', () => {
    expect(fechaHoraCelda(null)).toBeNull();
    expect(diaArgentinoCelda(undefined)).toBeNull();
    expect(fechaCelda(null)).toBeNull();
  });

  it('el CSV las emite tal cual, sin neutralizar un monto negativo', () => {
    const columnas: readonly ColumnaCsv<{ f: Date; m: number }>[] = [
      { encabezado: 'F', valor: (x) => fechaHoraCelda(x.f) },
      { encabezado: 'M', valor: (x) => montoCelda(x.m) },
    ];
    expect(serializarCsv([{ f: instante, m: -5 }], columnas)).toBe(
      `${BOM_UTF8}F;M\r\n19/08/2026 22:30;-5,00`,
    );
  });
});
