/**
 * cli.spec.ts — argumentos de `pnpm importar:legacy` y el freno que impide
 * escribir en producción por accidente.
 */
import { frenoDeProduccion, parsearArgs, urlsNoLocales, type OpcionesCli } from './cli';

const LOCAL = 'postgresql://u:p@localhost:5432/soporte_master';
const REMOTA = 'postgresql://u:p@db.ejemplo.net:5432/soporte_master';

describe('parsearArgs', () => {
  it('sin --aplicar → simulación', () => {
    const r = parsearArgs(['--paquete', 'p.json', '--cliente', 'Rotair']);
    expect(r.getValue()).toEqual({
      paquete: 'p.json',
      cliente: 'Rotair',
      aplicar: false,
      confirmarProduccion: false,
    });
  });

  it('acepta el separador -- que agrega pnpm y las dos banderas', () => {
    const r = parsearArgs([
      '--',
      '--aplicar',
      '--cliente',
      'Rotair',
      '--paquete',
      'p.json',
      '--confirmar-produccion',
    ]);
    expect(r.getValue()).toMatchObject({ aplicar: true, confirmarProduccion: true });
  });

  it.each([
    [['--paquete', 'p.json']],
    [['--paquete', '--cliente', 'Rotair']],
    [['--paquete', 'p.json', '--cliente', 'Rotair', '--aplicarr']],
  ])('%j → error con el uso', (argv) => {
    const r = parsearArgs(argv);
    expect(r.isFail()).toBe(true);
    expect(r.getError().message).toMatch(/Uso: pnpm importar:legacy/);
  });
});

describe('urlsNoLocales', () => {
  it('solo mira claves DATABASE_URL*; localhost, 127.0.0.1 y ::1 son locales', () => {
    expect(
      urlsNoLocales({
        DATABASE_URL_MASTER: LOCAL,
        DATABASE_URL_TENANT: 'postgresql://u:p@127.0.0.1/x',
        DATABASE_URL_IPV6: 'postgresql://u:p@[::1]/x',
        OTRA: REMOTA,
      }),
    ).toEqual([]);
  });

  it('host remoto o URL ilegible → no local (falla cerrado)', () => {
    expect(urlsNoLocales({ DATABASE_URL_MASTER: REMOTA, DATABASE_URL_X: 'no es url' })).toEqual([
      'DATABASE_URL_MASTER',
      'DATABASE_URL_X',
    ]);
  });
});

describe('frenoDeProduccion', () => {
  const opciones = (o: Partial<OpcionesCli>): OpcionesCli => ({
    paquete: 'p.json',
    cliente: 'Rotair',
    aplicar: true,
    confirmarProduccion: false,
    ...o,
  });

  it('[CRITICAL] --aplicar con una base remota y sin --confirmar-produccion → rechaza', () => {
    const r = frenoDeProduccion(opciones({}), { DATABASE_URL_MASTER: REMOTA });
    expect(r.getError().message).toMatch(/DATABASE_URL_MASTER.*--confirmar-produccion/);
  });

  it('--confirmar-produccion explícito, simulación o bases locales → deja pasar', () => {
    expect(
      frenoDeProduccion(opciones({ confirmarProduccion: true }), {
        DATABASE_URL_MASTER: REMOTA,
      }).isOk(),
    ).toBe(true);
    expect(
      frenoDeProduccion(opciones({ aplicar: false }), { DATABASE_URL_MASTER: REMOTA }).isOk(),
    ).toBe(true);
    expect(frenoDeProduccion(opciones({}), { DATABASE_URL_MASTER: LOCAL }).isOk()).toBe(true);
  });
});
