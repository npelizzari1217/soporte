/**
 * paquete.spec.ts — validación del formato `soporte-importacion-legacy/v1`.
 * Unit, sin DB: el paquete se valida ANTES de leer o escribir nada.
 */
import { fechaDia, validarPaquete, type PaqueteLegacy } from './paquete';
import { paqueteSintetico } from './paquete-sintetico.fixture';

function erroresDe(crudo: unknown): string[] {
  const r = validarPaquete(crudo);
  return r.isFail() ? r.getError().errores : [];
}

function mutado(cambio: (p: PaqueteLegacy) => void): PaqueteLegacy {
  const p = paqueteSintetico();
  cambio(p);
  return p;
}

describe('validarPaquete', () => {
  it('paquete sintético completo → ok, sin errores', () => {
    expect(validarPaquete(paqueteSintetico()).isOk()).toBe(true);
  });

  it('[CRITICAL] formato desconocido → rechaza sin mirar el resto', () => {
    const errores = erroresDe({ ...paqueteSintetico(), formato: 'soporte-importacion-legacy/v2' });
    expect(errores).toEqual(['formato desconocido: "soporte-importacion-legacy/v2"']);
  });

  it('no es un objeto → rechaza', () => {
    expect(erroresDe([])).toEqual(['el paquete no es un objeto JSON']);
  });

  it('acumula TODOS los problemas en vez de cortar en el primero', () => {
    const errores = erroresDe(
      mutado((p) => {
        p.tickets[0].numero = 'SOP-1';
        p.tickets[1].titulo = 'x'.repeat(256);
        p.ciclos[0].fechaFin = '2024-02-30';
      }),
    );
    expect(errores).toHaveLength(3);
  });

  it.each<[string, (p: PaqueteLegacy) => void, RegExp]>([
    [
      'solicitante inexistente',
      (p) => (p.tickets[0].solicitanteLegacyId = 77),
      /solicitanteLegacyId/,
    ],
    ['asignado inexistente', (p) => (p.tickets[0].asignadoLegacyId = 77), /asignadoLegacyId/],
    ['ciclo inexistente', (p) => (p.tickets[0].cicloLegacyId = 77), /cicloLegacyId/],
    [
      'autor de comentario inexistente',
      (p) => (p.tickets[0].comentarios[0].autorLegacyId = 77),
      /autorLegacyId/,
    ],
    ['numero repetido', (p) => (p.tickets[1].numero = 'ANT-1'), /numero: repetido/],
    [
      'email repetido sin distinguir mayúsculas',
      (p) => (p.usuarios[1].email = 'EXISTENTE@legacy.test'),
      /email: repetido/,
    ],
    [
      'rol desconocido',
      (p) => ((p.usuarios[0] as { rol: string }).rol = 'ROOT'),
      /rol: desconocido/,
    ],
    [
      'tipo desconocido',
      (p) => ((p.tickets[0] as { tipoCodigo: string }).tipoCodigo = 'COMPRAS'),
      /tipoCodigo/,
    ],
    ['fechaAlta sin offset', (p) => (p.tickets[0].fechaAlta = '2024-03-01T09:00:00'), /fechaAlta/],
    ['comentario vacío', (p) => (p.tickets[0].comentarios[0].texto = '  '), /texto: vacio/],
    ['ciclo con fin antes del inicio', (p) => (p.ciclos[0].fechaFin = '2023-12-31'), /posterior/],
  ])('%s → rechaza nombrando el campo', (_caso, cambio, patron) => {
    const errores = erroresDe(mutado(cambio));
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(patron);
  });

  it('legacyId como string también se acepta (se compara por String(id))', () => {
    const p = mutado((q) => {
      q.usuarios[0].legacyId = '10';
      q.ciclos[0].legacyId = '1';
    });
    expect(validarPaquete(p).isOk()).toBe(true);
  });
});

describe('fechaDia', () => {
  it('YYYY-MM-DD → medianoche UTC (lo que Prisma escribe tal cual en @db.Date)', () => {
    expect(fechaDia('2024-12-31').toISOString()).toBe('2024-12-31T00:00:00.000Z');
  });
});
