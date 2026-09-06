import { describe, expect, it } from 'vitest';
import {
  COMPATIBILIDAD_ROL_MAX_LENGTH,
  crearCompatibilidadModelo,
  normalizarRolCompatibilidad,
} from './compatibilidad-modelo';

/**
 * El `rol` colapsa el vacío a `null` por el mismo motivo que el `fabricante`
 * del código alternativo: sin el colapso, `''` y `NULL` serían dos formas de
 * decir "sin rol" y la misma compatibilidad se leería distinto según por qué
 * camino se cargó.
 */
describe('normalizarRolCompatibilidad()', () => {
  it('recorta espacios y pasa a mayúscula', () => {
    expect(normalizarRolCompatibilidad(' negro ')).toBe('NEGRO');
  });

  it('convierte la cadena vacía en null', () => {
    expect(normalizarRolCompatibilidad('')).toBeNull();
  });

  it('convierte una cadena de solo espacios en null', () => {
    expect(normalizarRolCompatibilidad('   ')).toBeNull();
  });

  it('deja null en null', () => {
    expect(normalizarRolCompatibilidad(null)).toBeNull();
  });

  /**
   * El borde puede omitir el campo entero: una lámpara no es de ningún color,
   * y el `rol` ausente significa lo mismo que el vacío.
   */
  it('deja undefined en null', () => {
    expect(normalizarRolCompatibilidad(undefined)).toBeNull();
  });

  /**
   * `toUpperCase()` puede AGRANDAR el string: `'ß'` se convierte en `'SS'`.
   * El largo crudo no es cota del largo persistido, así que el tope de
   * `insumos_modelos_equipo.rol` se mide DESPUÉS de normalizar.
   */
  it('puede agrandar el string — la ß se expande a dos caracteres', () => {
    expect(normalizarRolCompatibilidad('ß')).toHaveLength(2);
  });
});

/**
 * El dominio es la AUTORIDAD del largo; el `VarChar(20)` de
 * `insumos_modelos_equipo.rol` es backstop. Sin esta precondición el valor
 * viaja intacto hasta Postgres y el usuario recibe un 22001 crudo del driver,
 * sin nombre de campo.
 */
describe('crearCompatibilidadModelo()', () => {
  it('devuelve el par con el rol normalizado', () => {
    const compatibilidad = crearCompatibilidadModelo({
      modeloEquipoId: 'id-modelo',
      rol: ' negro ',
    });

    expect(compatibilidad.modeloEquipoId).toBe('id-modelo');
    expect(compatibilidad.rol).toBe('NEGRO');
  });

  it('deja el rol en null cuando el campo viene ausente', () => {
    expect(crearCompatibilidadModelo({ modeloEquipoId: 'id-modelo' }).rol).toBeNull();
  });

  it('deja el rol en null cuando llega null explícito', () => {
    expect(crearCompatibilidadModelo({ modeloEquipoId: 'id-modelo', rol: null }).rol).toBeNull();
  });

  it('lanza si el rol excede el tope de la columna, nombrando el campo', () => {
    expect(() =>
      crearCompatibilidadModelo({
        modeloEquipoId: 'id-modelo',
        rol: 'A'.repeat(COMPATIBILIDAD_ROL_MAX_LENGTH + 1),
      }),
    ).toThrow(/rol excede/);
  });

  it('acepta el rol en el tope exacto (límite inclusive)', () => {
    expect(() =>
      crearCompatibilidadModelo({
        modeloEquipoId: 'id-modelo',
        rol: 'A'.repeat(COMPATIBILIDAD_ROL_MAX_LENGTH),
      }),
    ).not.toThrow();
  });

  /**
   * El caso que distingue medir ANTES de normalizar de medir DESPUÉS: once
   * `ß` son once caracteres tipeados —por debajo del tope— y veintidós
   * caracteres persistidos, que la columna rechaza. Un guard que midiera el
   * valor crudo dejaría pasar esto.
   */
  it('mide el largo sobre el rol YA normalizado: la ß expandida pasa el tope', () => {
    expect(() =>
      crearCompatibilidadModelo({
        modeloEquipoId: 'id-modelo',
        rol: 'ß'.repeat(COMPATIBILIDAD_ROL_MAX_LENGTH / 2 + 1),
      }),
    ).toThrow(/rol excede/);
  });

  it('acepta la ß expandida que queda justo en el tope (caso hermano)', () => {
    const compatibilidad = crearCompatibilidadModelo({
      modeloEquipoId: 'id-modelo',
      rol: 'ß'.repeat(COMPATIBILIDAD_ROL_MAX_LENGTH / 2),
    });

    expect(compatibilidad.rol).toHaveLength(COMPATIBILIDAD_ROL_MAX_LENGTH);
  });
});
