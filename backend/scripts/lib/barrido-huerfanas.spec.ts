/**
 * Tests del módulo puro del barrido de bases efímeras huérfanas.
 *
 * El riesgo de este módulo no es que deje basura sin barrer: es que borre una
 * base que no había que borrar. Por eso el grueso de los casos son NEGATIVOS —
 * qué NO se toca — y no positivos.
 */
import {
  MOTIVO,
  PATRON_BASE_EFIMERA,
  claveDeLockMaster,
  seleccionarHuerfanas,
} from './barrido-huerfanas.mjs';
import { claveDeLock } from '../../src/testing/lock-master-test';

/** Nombre real de un tenant de producción: `soporte_` + 32 hex, sin `_prov_` ni `_test`. */
const TENANT_REAL = 'soporte_01a0253ef26f78b88b02d5161410d8fd';

describe('barrido-huerfanas — selección', () => {
  it('barre las bases efímeras, con slug y sin slug', () => {
    const { aBorrar } = seleccionarHuerfanas({
      bases: ['soporte_prov_tickiso_b8cb66e5_test', 'soporte_prov_a1b2c3d4_test'],
      dbNamesRegistrados: [TENANT_REAL],
      basesConConexiones: [],
    });

    expect(aBorrar).toEqual(['soporte_prov_tickiso_b8cb66e5_test', 'soporte_prov_a1b2c3d4_test']);
  });

  // El fixture SIEMPRE incluye una huérfana de verdad junto al nombre que no se
  // debe tocar: sin eso, un `aBorrar` vacío pasaría en verde aunque la función
  // no estuviera haciendo absolutamente nada (regla anti verde vacuo).
  it.each([
    ['un tenant REAL de producción', TENANT_REAL],
    ['la master de desarrollo', 'soporte_master'],
    ['la master de test', 'soporte_master_test'],
    ['el tenant de test compartido', 'soporte_tenant_test'],
    ['un nombre fijo sin segmento hex', 'soporte_prov_demo_test'],
    ['una base ajena al proyecto', 'otra_cosa_test'],
    ['un nombre parecido pero sin el sufijo _test', 'soporte_prov_tickiso_b8cb66e5'],
    ['un nombre parecido pero sin el prefijo soporte_prov_', 'soporte_tickiso_b8cb66e5_test'],
  ])('NO borra %s', (_caso, nombreIntocable) => {
    const huerfanaDeVerdad = 'soporte_prov_seed_deadbeef_test';

    const { aBorrar } = seleccionarHuerfanas({
      bases: [nombreIntocable, huerfanaDeVerdad],
      dbNamesRegistrados: [TENANT_REAL],
      basesConConexiones: [],
    });

    expect(aBorrar).not.toContain(nombreIntocable);
    expect(aBorrar).toContain(huerfanaDeVerdad);
  });

  it('NO borra una efímera que igual figura en el registro de clientes', () => {
    // Por el patrón esto no debería pasar nunca. Es el cinturón sobre los
    // tiradores: si algún día alguien registra un cliente con un nombre así,
    // el registro gana.
    const registradaPeseAlNombre = 'soporte_prov_raro_cafe1234_test';

    const { aBorrar, conservadas } = seleccionarHuerfanas({
      bases: [registradaPeseAlNombre, 'soporte_prov_seed_deadbeef_test'],
      dbNamesRegistrados: [TENANT_REAL, registradaPeseAlNombre],
      basesConConexiones: [],
    });

    expect(aBorrar).toEqual(['soporte_prov_seed_deadbeef_test']);
    expect(conservadas).toContainEqual({
      nombre: registradaPeseAlNombre,
      motivo: MOTIVO.TENANT_REGISTRADO,
    });
  });

  it('NO borra una efímera con conexiones vivas: es de una corrida en curso', () => {
    // Este es el caso que hace seguro barrer mientras otra corrida trabaja.
    const enUso = 'soporte_prov_autorizE2E_0f0f0f0f_test';

    const { aBorrar, conservadas } = seleccionarHuerfanas({
      bases: [enUso, 'soporte_prov_seed_deadbeef_test'],
      dbNamesRegistrados: [TENANT_REAL],
      basesConConexiones: [enUso],
    });

    expect(aBorrar).toEqual(['soporte_prov_seed_deadbeef_test']);
    expect(conservadas).toContainEqual({ nombre: enUso, motivo: MOTIVO.EN_USO });
  });

  it('sin bases, no borra nada y no explota', () => {
    expect(seleccionarHuerfanas({}).aBorrar).toEqual([]);
  });

  it('el patrón exige prefijo, segmento hex de 8 y sufijo _test', () => {
    expect(PATRON_BASE_EFIMERA.test('soporte_prov_tickiso_b8cb66e5_test')).toBe(true);
    // 7 hex en vez de 8: no matchea. El largo es parte de la garantía.
    expect(PATRON_BASE_EFIMERA.test('soporte_prov_tickiso_b8cb66e_test')).toBe(false);
    // Hex en mayúsculas: `randomBytes().toString('hex')` siempre da minúsculas.
    expect(PATRON_BASE_EFIMERA.test('soporte_prov_tickiso_B8CB66E5_test')).toBe(false);
  });
});

describe('barrido-huerfanas — clave del advisory lock', () => {
  // AMARRA DE LA DUPLICACIÓN. `claveDeLockMaster` (.mjs) y `claveDeLock` (.ts)
  // son la misma función escrita dos veces, porque el proyecto no tiene
  // `allowJs` y no pueden importarse entre sí. Si una cambia sola, el barrido
  // y los specs tomarían turnos DISTINTOS sobre la misma base — o sea, ninguna
  // exclusión, y de vuelta el flaky. Este test es lo único que lo impide.
  it.each([
    'postgresql://soporte:soporte@localhost:5432/soporte_master_test',
    'postgresql://otro:otra@127.0.0.1:5432/soporte_master_test',
    'postgresql://soporte:soporte@localhost:5432/soporte_x_test',
  ])('coincide con claveDeLock del helper de specs para %s', (url) => {
    expect(claveDeLockMaster(url)).toBe(claveDeLock(url));
  });
});
