import { describe, expect, it } from 'vitest';
import {
  UnidadMedidaEntity,
  UNIDAD_MEDIDA_CODIGO_MAX_LENGTH,
  UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH,
  normalizarCodigoUnidadMedida,
  normalizarNombreUnidadMedida,
} from './unidad-medida.entity';

/**
 * El dominio es la AUTORIDAD del largo; el `VarChar(20)`/`VarChar(50)` de
 * `unidades_medida` es backstop. Sin esta precondición el valor viaja intacto
 * hasta Postgres y el usuario recibe un 22001 crudo del driver, sin nombre de
 * campo.
 *
 * Se recorren `create()` Y `actualizar()`: el guard está invocado en los dos, y
 * sin el par, borrar uno solo no pone nada en rojo.
 */
describe.each([
  [
    'create()',
    (codigo: string, nombre: string) => (): unknown =>
      UnidadMedidaEntity.create({ codigo, nombre, activo: true }),
  ],
  [
    'actualizar()',
    (codigo: string, nombre: string) => (): unknown =>
      UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }).actualizar({
        codigo,
        nombre,
      }),
  ],
])('UnidadMedidaEntity %s — precondición de largo', (_caso, construir) => {
  it('lanza si codigo excede el tope de la columna', () => {
    expect(construir('A'.repeat(UNIDAD_MEDIDA_CODIGO_MAX_LENGTH + 1), 'N')).toThrow(
      /codigo excede/,
    );
  });

  it('acepta codigo en el tope exacto (límite inclusive)', () => {
    expect(construir('A'.repeat(UNIDAD_MEDIDA_CODIGO_MAX_LENGTH), 'N')).not.toThrow();
  });

  it('lanza si nombre excede el tope de la columna', () => {
    expect(construir('A', 'N'.repeat(UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH + 1))).toThrow(
      /nombre excede/,
    );
  });

  it('acepta nombre en el tope exacto (límite inclusive)', () => {
    expect(construir('A', 'N'.repeat(UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH))).not.toThrow();
  });
});

describe('normalizarCodigoUnidadMedida()', () => {
  it('recorta espacios y pasa a mayúscula', () => {
    expect(normalizarCodigoUnidadMedida('  un  ')).toBe('UN');
  });

  /**
   * `toUpperCase()` puede AGRANDAR el string: `'ß'` se convierte en `'SS'`.
   * El largo crudo no es cota del largo persistido, así que quien mida contra
   * el tope de la columna tiene que medir DESPUÉS de normalizar.
   */
  it('puede agrandar el string — la ß se expande a dos caracteres', () => {
    expect(normalizarCodigoUnidadMedida('ß')).toHaveLength(2);
  });
});

/**
 * El `nombre` pasa por la MISMA capa que el `codigo`. Sin esta normalización,
 * `'   '` cumple el `@MinLength(1)` del borde y se persiste como espacios: una
 * unidad sin nombre visible en el catálogo.
 */
describe('normalizarNombreUnidadMedida()', () => {
  it('recorta los espacios de borde', () => {
    expect(normalizarNombreUnidadMedida('  Litro  ')).toBe('Litro');
  });

  /**
   * Un nombre de solo espacios queda en cadena vacía, que es lo que el
   * `@MinLength(1)` del DTO sabe rechazar. Si el recorte corriera DESPUÉS del
   * mínimo de largo, `'   '` pasaría la validación y llegaría vacío a la base.
   */
  it('deja en cadena vacía un nombre de solo espacios', () => {
    expect(normalizarNombreUnidadMedida('   ')).toBe('');
  });
});

describe('UnidadMedidaEntity', () => {
  describe('create()', () => {
    it('crea una unidad activa con codigo/nombre', () => {
      const unidad = UnidadMedidaEntity.create({
        codigo: 'UN',
        nombre: 'Unidad',
        activo: true,
      });

      expect(unidad.codigo).toBe('UN');
      expect(unidad.nombre).toBe('Unidad');
      expect(unidad.activo).toBe(true);
      expect(unidad.isDeleted()).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('reconstituye desde persistencia preservando timestamps e id', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const unidad = UnidadMedidaEntity.reconstitute(
        { codigo: 'LT', nombre: 'Litro', activo: false },
        'id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(unidad.id).toBe('id-fijo');
      expect(unidad.createdAt).toEqual(createdAt);
      expect(unidad.updatedAt).toEqual(updatedAt);
      expect(unidad.activo).toBe(false);
    });

    /**
     * Una fila histórica más larga que el tope actual se LEE, no explota:
     * hacer caer una lectura por un dato viejo convierte un valor legado en
     * una caída de sistema.
     */
    it('no aplica la precondición de largo sobre una fila ya persistida', () => {
      expect(() =>
        UnidadMedidaEntity.reconstitute(
          {
            codigo: 'A'.repeat(UNIDAD_MEDIDA_CODIGO_MAX_LENGTH + 10),
            nombre: 'Histórica',
            activo: true,
          },
          'id-legado',
          new Date(),
          new Date(),
          null,
        ),
      ).not.toThrow();
    });
  });

  describe('actualizar() — PATCH semántico', () => {
    it('actualiza solo los campos provistos, deja el resto intacto', () => {
      const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'Unidad A', activo: true });

      unidad.actualizar({ nombre: 'Unidad A renombrada' });

      expect(unidad.nombre).toBe('Unidad A renombrada');
      expect(unidad.codigo).toBe('A'); // no tocado
    });

    it('actualiza codigo cuando se provee', () => {
      const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'Unidad A', activo: true });

      unidad.actualizar({ codigo: 'B' });

      expect(unidad.codigo).toBe('B');
    });
  });

  describe('desactivar() / activar()', () => {
    /**
     * Dar de baja es DESHABILITAR, no eliminar. Si `desactivar()` marcara
     * `deletedAt`, el listado —que filtra por `deletedAt: null`— haría
     * desaparecer la fila de la única pantalla que existe, y `activar()`
     * quedaría inalcanzable: nadie podría conseguir el id para reactivarla.
     */
    it('desactivar() apaga activo y NO marca la baja lógica', () => {
      const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true });

      unidad.desactivar();

      expect(unidad.activo).toBe(false);
      expect(unidad.deletedAt).toBeNull();
      expect(unidad.isDeleted()).toBe(false);
    });

    it('activar() vuelve a encender activo (caso hermano de desactivar)', () => {
      const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true });
      unidad.desactivar();

      unidad.activar();

      expect(unidad.activo).toBe(true);
      expect(unidad.isDeleted()).toBe(false);
    });
  });
});
