/**
 * acciones.spec.ts — catálogo de acciones y pares (módulo, acción) válidos.
 *
 * Fuente única para el CHECK de DB (WU-2), el guard (WU-6), los DTOs del ABM
 * (WU-7.4) y la grilla del frontend (WU-7.6). Ref spec R1, design ADR-P1.
 */
import {
  ACCIONES_PISO,
  CATALOGO_MODULOS,
  PARES_VALIDOS,
  accionesDeModulo,
  moduloDe,
} from './acciones';

describe('PARES_VALIDOS — cardinalidad exacta por módulo (R1)', () => {
  it('tiene exactamente 33 pares en total', () => {
    expect(PARES_VALIDOS).toHaveLength(33);
  });

  it.each([
    ['TICKETS', 8],
    ['COMPRAS', 5],
    ['EDILICIA', 4],
    ['EQUIPOS', 4],
    ['KB', 6],
    ['DASHBOARD', 1],
    ['CSAT', 1],
    ['PREVENTIVO', 4],
  ] as const)('%s declara exactamente %i pares', (modulo, cantidad) => {
    const propios = PARES_VALIDOS.filter((p) => p.startsWith(`${modulo}:`));
    expect(propios).toHaveLength(cantidad);
  });
});

describe('Ningún código de acción contiene ":" en su parte de acción', () => {
  it.each([...PARES_VALIDOS])('%s tiene exactamente un ":"', (par) => {
    expect(par.split(':')).toHaveLength(2);
  });
});

describe('IMPRESION no aparece en ningún piso de módulo', () => {
  it('IMPRESION vive en ACCIONES_PISO pero en cero pares válidos', () => {
    expect(ACCIONES_PISO).toContain('IMPRESION');
    const conImpresion = PARES_VALIDOS.filter((p) => p.endsWith(':IMPRESION'));
    expect(conImpresion).toHaveLength(0);
  });
});

describe('APROBACION solo en COMPRAS', () => {
  it('el único módulo con :APROBACION es COMPRAS', () => {
    const conAprobacion = PARES_VALIDOS.filter((p) => p.endsWith(':APROBACION'));
    expect(conAprobacion).toEqual(['COMPRAS:APROBACION']);
  });
});

describe('accionesDeModulo', () => {
  it('devuelve exactamente los pares de TICKETS', () => {
    const acciones = accionesDeModulo('TICKETS');
    expect(acciones).toHaveLength(8);
    for (const a of acciones) expect(a.startsWith('TICKETS:')).toBe(true);
  });

  it('devuelve exactamente los pares de DASHBOARD (solo LECTURA)', () => {
    expect(accionesDeModulo('DASHBOARD')).toEqual(['DASHBOARD:LECTURA']);
  });
});

describe('moduloDe', () => {
  it.each([
    ['TICKETS:ALTAS', 'TICKETS'],
    ['COMPRAS:APROBACION', 'COMPRAS'],
    ['DASHBOARD:LECTURA', 'DASHBOARD'],
  ] as const)('moduloDe(%s) === %s', (codigo, esperado) => {
    expect(moduloDe(codigo)).toBe(esperado);
  });
});

describe('CATALOGO_MODULOS — claves esperadas', () => {
  it('declara exactamente los 8 módulos vigentes (R1 + CSAT sdd/csat WU-3 + PREVENTIVO sdd/preventivo WU-1)', () => {
    expect(Object.keys(CATALOGO_MODULOS).sort()).toEqual(
      ['COMPRAS', 'CSAT', 'DASHBOARD', 'EDILICIA', 'EQUIPOS', 'KB', 'PREVENTIVO', 'TICKETS'].sort(),
    );
  });
});
