/**
 * zona-horaria.spec.ts — VO `ZonaHoraria` y sus primitivas de zona (D1, D2, D6).
 *
 * Recorre `shared-fixtures/formato-fecha-paridad.json` para que la validación
 * del dominio y la del schema Zod del frontend (WU-2c) no puedan divergir sobre
 * el mismo candidato — es el mismo fixture que `fixture-paridad.spec.ts` ya
 * probó alcanzable. `America/Argentina/Buenos_Aires` es el centinela
 * anti-catálogo: está ausente de `Intl.supportedValuesOf('timeZone')` en
 * Node 24 pero construye un formateador válido, así que si alguien
 * reintrodujera una validación por catálogo este caso se pone rojo primero.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ZONA_HORARIA_MAX_LENGTH,
  ZonaHoraria,
  esZonaValida,
  hoyEnZona,
  partesEnZona,
} from './zona-horaria';

interface FixtureParidad {
  zonasValidas: string[];
  zonasInvalidas: string[];
  casos: Array<{
    instante: string;
    zona: string;
    esperadoInstante: string;
    esperadoDia: string;
    esperadoHoy: string;
  }>;
}

const RUTA_FIXTURE = join(__dirname, '../../../../shared-fixtures/formato-fecha-paridad.json');

function cargarFixture(): FixtureParidad {
  return JSON.parse(readFileSync(RUTA_FIXTURE, 'utf-8')) as FixtureParidad;
}

const fixture = cargarFixture();

describe('esZonaValida — validación por construcción, nunca por catálogo', () => {
  it.each(fixture.zonasValidas)('acepta %s', (candidata) => {
    expect(esZonaValida(candidata)).toBe(true);
  });

  it.each(fixture.zonasInvalidas)('rechaza %s', (candidata) => {
    expect(esZonaValida(candidata)).toBe(false);
  });
});

describe('ZonaHoraria.crear()', () => {
  it.each(fixture.zonasValidas)('construye el VO para %s sin lanzar', (candidata) => {
    expect(() => ZonaHoraria.crear(candidata)).not.toThrow();
    expect(ZonaHoraria.crear(candidata).valor).toBe(candidata);
  });

  it.each(fixture.zonasInvalidas)('lanza para el candidato inválido %s', (candidata) => {
    expect(() => ZonaHoraria.crear(candidata)).toThrow();
  });
});

describe('ZonaHoraria.desdePersistencia()', () => {
  it('reconstruye un valor persistido válido', () => {
    const zona = ZonaHoraria.desdePersistencia('Europe/Madrid');
    expect(zona.valor).toBe('Europe/Madrid');
  });

  it('lanza y nombra el clienteId cuando la fila persistida es inválida', () => {
    expect(() => ZonaHoraria.desdePersistencia('Europe/Madriz', 'cliente-123')).toThrow(
      /cliente-123/,
    );
  });
});

describe('ZonaHoraria.equals()', () => {
  it('dos VOs con el mismo valor son iguales', () => {
    const a = ZonaHoraria.crear('Europe/Madrid');
    const b = ZonaHoraria.crear('Europe/Madrid');
    expect(a.equals(b)).toBe(true);
  });

  it('dos VOs con distinto valor no son iguales', () => {
    const a = ZonaHoraria.crear('Europe/Madrid');
    const b = ZonaHoraria.crear('America/Argentina/Buenos_Aires');
    expect(a.equals(b)).toBe(false);
  });

  it('UTC y utc NO son iguales — comparación por string crudo, limitación documentada en equals()', () => {
    const a = ZonaHoraria.crear('UTC');
    const b = ZonaHoraria.crear('utc');
    expect(a.equals(b)).toBe(false);
  });

  it('normalizar por Intl resolvedOptions() rechazaría la propia zona por defecto del proyecto — por eso equals() no normaliza', () => {
    // America/Argentina/Buenos_Aires resuelve a su alias America/Buenos_Aires
    // vía resolvedOptions().timeZone. Si ZonaHoraria normalizara (o, peor,
    // rechazara la forma no canónica) el candidato en validar(), la zona que
    // D8 backfillea dejaría de aceptarse tal cual está escrita en la
    // migración — la misma trampa que el centinela anti-catálogo de
    // esZonaValida existe para evitar, pero por otra puerta.
    const canonico = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).resolvedOptions().timeZone;
    expect(canonico).not.toBe('America/Argentina/Buenos_Aires');
    expect(() => ZonaHoraria.crear('America/Argentina/Buenos_Aires')).not.toThrow();
  });
});

describe('centinela de tope — ZONA_HORARIA_MAX_LENGTH', () => {
  it('es 64', () => {
    // Fijo contra el número 64, no contra la constante: detecta un cambio
    // silencioso de ZONA_HORARIA_MAX_LENGTH en este archivo. Guard parcial:
    // el que realmente ata este número a la columna real VARCHAR(64) lo
    // agrega WU-2, cuando la migración exista (ver JSDoc de la constante).
    expect(ZONA_HORARIA_MAX_LENGTH).toBe(64);
  });

  it('rechaza un candidato de MAX_LENGTH + 1 caracteres específicamente por el tope de largo', () => {
    // Cualquier string de 65 caracteres también es una zona IANA inexistente,
    // así que esZonaValida() lo rechazaría igual — un `.toThrow()` sin
    // matcher no distinguiría "cae por largo" de "cae por invalidez IANA".
    // El mensaje puntual prueba que fue el guard de largo el que disparó: si
    // se borra ese guard, este candidato pasa a rechazarse por el otro
    // mensaje y el test se pone rojo.
    const candidato = 'x'.repeat(ZONA_HORARIA_MAX_LENGTH + 1);
    expect(() => ZonaHoraria.crear(candidato)).toThrow(/excede \d+ caracteres/);
  });
});

describe('partesEnZona — componentes completos del instante, no solo el día (D7)', () => {
  it.each(fixture.casos)(
    'para $instante en $zona, el instante formateado es $esperadoInstante',
    ({ instante, zona, esperadoInstante }) => {
      const partes = partesEnZona(ZonaHoraria.crear(zona), new Date(instante));
      // Mismo armado que formatearInstante() del frontend (DD/MM/YYYY HH:mm):
      // si `hour12` volviera a `true`, el caso de medianoche (00:30 en Madrid)
      // devolvería "12:30" en vez de "00:30" y este assert se pone rojo.
      const formateado = `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
      expect(formateado).toBe(esperadoInstante);
    },
  );
});

describe('hoyEnZona — día calendario de la zona, no el de UTC (D6)', () => {
  it.each(fixture.casos)(
    'para $instante en $zona, hoy es $esperadoHoy',
    ({ instante, zona, esperadoHoy }) => {
      const resultado = hoyEnZona(ZonaHoraria.crear(zona), new Date(instante));
      expect(resultado.toISOString()).toBe(esperadoHoy);
    },
  );

  it('a las 00:30 en Europe/Madrid, cuando en UTC todavía es el día anterior, hoyEnZona ya ve el día nuevo', () => {
    // 2026-01-15T23:30:00.000Z en UTC (día 15) es 2026-01-16T00:30 en Madrid (día 16, CET +1).
    const resultado = hoyEnZona(
      ZonaHoraria.crear('Europe/Madrid'),
      new Date('2026-01-15T23:30:00.000Z'),
    );
    expect(resultado.toISOString()).toBe('2026-01-16T00:00:00.000Z');
  });

  it('cruza el cambio de horario de marzo en Europe/Madrid sin correr el día', () => {
    const antesDelCambio = hoyEnZona(
      ZonaHoraria.crear('Europe/Madrid'),
      new Date('2026-03-29T00:30:00.000Z'),
    );
    const despuesDelCambio = hoyEnZona(
      ZonaHoraria.crear('Europe/Madrid'),
      new Date('2026-03-29T01:30:00.000Z'),
    );
    expect(antesDelCambio.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(despuesDelCambio.toISOString()).toBe('2026-03-29T00:00:00.000Z');
  });

  it('cruza el cambio de horario de octubre en Europe/Madrid sin correr el día', () => {
    const antesDelCambio = hoyEnZona(
      ZonaHoraria.crear('Europe/Madrid'),
      new Date('2026-10-25T00:30:00.000Z'),
    );
    const despuesDelCambio = hoyEnZona(
      ZonaHoraria.crear('Europe/Madrid'),
      new Date('2026-10-25T02:30:00.000Z'),
    );
    expect(antesDelCambio.toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(despuesDelCambio.toISOString()).toBe('2026-10-25T00:00:00.000Z');
  });
});
