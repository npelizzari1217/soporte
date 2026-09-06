import { describe, expect, it } from 'vitest';
import {
  InsumoCodigoAlternativoEntity,
  INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH,
  INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH,
  normalizarCodigoAlternativo,
  normalizarFabricanteCodigoAlternativo,
} from './insumo-codigo-alternativo.entity';

describe('normalizarCodigoAlternativo()', () => {
  it('recorta espacios y pasa a mayúscula', () => {
    expect(normalizarCodigoAlternativo('  ce285a  ')).toBe('CE285A');
  });

  /**
   * `toUpperCase()` puede AGRANDAR el string: `'ß'` se convierte en `'SS'`.
   * El largo crudo no es cota del largo persistido, así que el tope de la
   * columna se mide DESPUÉS de normalizar, nunca antes.
   */
  it('puede agrandar el string — la ß se expande a dos caracteres', () => {
    expect(normalizarCodigoAlternativo('ß')).toHaveLength(2);
  });
});

/**
 * El UNIQUE `(codigo, fabricante)` de `insumos_codigos_alternativos` es
 * `NULLS NOT DISTINCT`: junta dos filas que tengan `NULL` en `fabricante`,
 * pero NO junta `''` con `NULL` — para Postgres son dos valores distintos.
 * Sin colapsar el vacío a `null`, el mismo código genérico entra dos veces y
 * el índice no puede frenarlo.
 */
describe('normalizarFabricanteCodigoAlternativo()', () => {
  it('recorta espacios y pasa a mayúscula', () => {
    expect(normalizarFabricanteCodigoAlternativo(' hp ')).toBe('HP');
  });

  it('convierte la cadena vacía en null', () => {
    expect(normalizarFabricanteCodigoAlternativo('')).toBeNull();
  });

  it('convierte una cadena de solo espacios en null', () => {
    expect(normalizarFabricanteCodigoAlternativo('   ')).toBeNull();
  });

  it('deja null en null', () => {
    expect(normalizarFabricanteCodigoAlternativo(null)).toBeNull();
  });

  /**
   * El borde puede omitir el campo entero: un `fabricante` ausente significa
   * lo mismo que uno vacío —código genérico— y tiene que llegar como el mismo
   * `null` a la columna.
   */
  it('deja undefined en null', () => {
    expect(normalizarFabricanteCodigoAlternativo(undefined)).toBeNull();
  });
});

/**
 * El dominio es la AUTORIDAD del largo; el `VarChar(50)`/`VarChar(100)` de
 * `insumos_codigos_alternativos` es backstop. Sin esta precondición el valor
 * viaja intacto hasta Postgres y el usuario recibe un 22001 crudo del driver,
 * sin nombre de campo.
 *
 * Se recorren los dos campos con su tope exacto (aceptado) y su tope + 1
 * (rechazado): sin el caso aceptado, un guard que rechazara todo pasaría
 * igual.
 */
describe('InsumoCodigoAlternativoEntity.create() — precondición de largo', () => {
  it('lanza si codigo excede el tope de la columna', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({
        codigo: 'A'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH + 1),
        fabricante: null,
      }),
    ).toThrow(/codigo excede/);
  });

  it('acepta codigo en el tope exacto (límite inclusive)', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({
        codigo: 'A'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH),
        fabricante: null,
      }),
    ).not.toThrow();
  });

  it('lanza si fabricante excede el tope de la columna', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({
        codigo: 'CE285A',
        fabricante: 'F'.repeat(INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH + 1),
      }),
    ).toThrow(/fabricante excede/);
  });

  it('acepta fabricante en el tope exacto (límite inclusive)', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({
        codigo: 'CE285A',
        fabricante: 'F'.repeat(INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH),
      }),
    ).not.toThrow();
  });

  it('acepta fabricante null — el largo no aplica al código genérico', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({ codigo: 'CE285A', fabricante: null }),
    ).not.toThrow();
  });
});

/**
 * El caso que la composición "normalizar y después medir" tiene que atrapar:
 * 26 caracteres `ß` son 26 en crudo —bajo el tope de 50— y 52 una vez
 * normalizados. Un guard que midiera el valor CRUDO dejaría pasar un string
 * que la columna rechaza con un 22001.
 */
describe('InsumoCodigoAlternativoEntity — el tope se mide sobre el valor normalizado', () => {
  const CRUDO_QUE_SE_PASA = 'ß'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH / 2 + 1);
  const CRUDO_EN_EL_TOPE = 'ß'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH / 2);

  it('el crudo que se pasa mide MENOS que el tope antes de normalizar', () => {
    expect(CRUDO_QUE_SE_PASA.length).toBeLessThanOrEqual(
      INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH,
    );
  });

  it('lanza cuando la expansión de la ß pasa el tope de codigo', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({
        codigo: normalizarCodigoAlternativo(CRUDO_QUE_SE_PASA),
        fabricante: null,
      }),
    ).toThrow(/codigo excede/);
  });

  it('acepta el crudo cuya expansión cae justo en el tope (caso hermano)', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({
        codigo: normalizarCodigoAlternativo(CRUDO_EN_EL_TOPE),
        fabricante: null,
      }),
    ).not.toThrow();
  });

  it('lanza cuando la expansión de la ß pasa el tope de fabricante', () => {
    expect(() =>
      InsumoCodigoAlternativoEntity.create({
        codigo: 'CE285A',
        fabricante: normalizarFabricanteCodigoAlternativo(
          'ß'.repeat(INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH / 2 + 1),
        ),
      }),
    ).toThrow(/fabricante excede/);
  });
});

describe('InsumoCodigoAlternativoEntity', () => {
  describe('create()', () => {
    it('expone el código y el fabricante recibidos', () => {
      const codigo = InsumoCodigoAlternativoEntity.create({ codigo: 'CE285A', fabricante: 'HP' });

      expect(codigo.codigo).toBe('CE285A');
      expect(codigo.fabricante).toBe('HP');
      expect(codigo.isDeleted()).toBe(false);
    });

    it('acepta un código genérico sin fabricante', () => {
      const codigo = InsumoCodigoAlternativoEntity.create({ codigo: 'CE285A', fabricante: null });

      expect(codigo.fabricante).toBeNull();
    });

    it('usa el id explícito cuando se lo pasan', () => {
      const codigo = InsumoCodigoAlternativoEntity.create(
        { codigo: 'CE285A', fabricante: null },
        'id-fijo',
      );

      expect(codigo.id).toBe('id-fijo');
    });
  });

  describe('reconstitute()', () => {
    it('reconstituye desde persistencia preservando id y timestamps', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const codigo = InsumoCodigoAlternativoEntity.reconstitute(
        { codigo: 'CE285A', fabricante: 'HP' },
        'id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(codigo.id).toBe('id-fijo');
      expect(codigo.createdAt).toEqual(createdAt);
      expect(codigo.updatedAt).toEqual(updatedAt);
      expect(codigo.deletedAt).toBeNull();
    });

    /**
     * Una fila histórica más larga que el tope actual se LEE, no explota:
     * hacer caer una lectura por un dato viejo convierte un valor legado en
     * una caída de sistema.
     */
    it('no aplica la precondición de largo sobre una fila ya persistida', () => {
      expect(() =>
        InsumoCodigoAlternativoEntity.reconstitute(
          {
            codigo: 'A'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH + 10),
            fabricante: null,
          },
          'id-legado',
          new Date(),
          new Date(),
          null,
        ),
      ).not.toThrow();
    });
  });
});
