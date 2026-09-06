import { describe, expect, it } from 'vitest';
import {
  FamiliaInsumoEntity,
  FAMILIA_INSUMO_CODIGO_MAX_LENGTH,
  FAMILIA_INSUMO_NOMBRE_MAX_LENGTH,
  normalizarCodigoFamiliaInsumo,
  normalizarNombreFamiliaInsumo,
} from './familia-insumo.entity';

/**
 * El dominio es la AUTORIDAD del largo; el `VarChar(30)`/`VarChar(100)` de
 * `familias_insumo` es backstop. Sin esta precondición el valor viaja intacto
 * hasta Postgres y el usuario recibe un 22001 crudo del driver, sin nombre de
 * campo.
 *
 * La precondición va como `throw` y no como `Result` porque un primitivo fuera
 * de rango llegando a la entidad es violación de contrato del caller, no una
 * desviación de negocio que el usuario deba ver.
 *
 * Se recorren `create()` Y `actualizar()`: el guard está invocado en los dos, y
 * sin el par, borrar uno solo no pone nada en rojo.
 */
describe.each([
  [
    'create()',
    (codigo: string, nombre: string) => (): unknown =>
      FamiliaInsumoEntity.create({ codigo, nombre, activo: true }),
  ],
  [
    'actualizar()',
    (codigo: string, nombre: string) => (): unknown =>
      FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }).actualizar({
        codigo,
        nombre,
      }),
  ],
])('FamiliaInsumoEntity %s — precondición de largo', (_caso, construir) => {
  it('lanza si codigo excede el tope de la columna', () => {
    expect(construir('A'.repeat(FAMILIA_INSUMO_CODIGO_MAX_LENGTH + 1), 'N')).toThrow(
      /codigo excede/,
    );
  });

  it('acepta codigo en el tope exacto (límite inclusive)', () => {
    expect(construir('A'.repeat(FAMILIA_INSUMO_CODIGO_MAX_LENGTH), 'N')).not.toThrow();
  });

  it('lanza si nombre excede el tope de la columna', () => {
    expect(construir('A', 'N'.repeat(FAMILIA_INSUMO_NOMBRE_MAX_LENGTH + 1))).toThrow(
      /nombre excede/,
    );
  });

  it('acepta nombre en el tope exacto (límite inclusive)', () => {
    expect(construir('A', 'N'.repeat(FAMILIA_INSUMO_NOMBRE_MAX_LENGTH))).not.toThrow();
  });
});

describe('normalizarCodigoFamiliaInsumo()', () => {
  it('recorta espacios y pasa a mayúscula', () => {
    expect(normalizarCodigoFamiliaInsumo('  toner  ')).toBe('TONER');
  });

  /**
   * `toUpperCase()` puede AGRANDAR el string: `'ß'` se convierte en `'SS'`.
   * El largo crudo no es cota del largo persistido, así que quien mida contra
   * el tope de la columna tiene que medir DESPUÉS de normalizar.
   */
  it('puede agrandar el string — la ß se expande a dos caracteres', () => {
    expect(normalizarCodigoFamiliaInsumo('ß')).toHaveLength(2);
  });
});

/**
 * El `nombre` pasa por la MISMA capa que el `codigo`. Sin esta normalización,
 * `'   '` cumple el `@MinLength(1)` del borde y se persiste como espacios: una
 * familia sin nombre visible en el catálogo.
 */
describe('normalizarNombreFamiliaInsumo()', () => {
  it('recorta los espacios de borde', () => {
    expect(normalizarNombreFamiliaInsumo('  Tóner  ')).toBe('Tóner');
  });

  /**
   * Un nombre de solo espacios queda en cadena vacía, que es lo que el
   * `@MinLength(1)` del DTO sabe rechazar. Si el recorte corriera DESPUÉS del
   * mínimo de largo, `'   '` pasaría la validación y llegaría vacío a la base.
   */
  it('deja en cadena vacía un nombre de solo espacios', () => {
    expect(normalizarNombreFamiliaInsumo('   ')).toBe('');
  });
});

describe('FamiliaInsumoEntity', () => {
  describe('create()', () => {
    it('crea una familia activa con codigo/nombre', () => {
      const familia = FamiliaInsumoEntity.create({
        codigo: 'TONER',
        nombre: 'Tóner',
        activo: true,
      });

      expect(familia.codigo).toBe('TONER');
      expect(familia.nombre).toBe('Tóner');
      expect(familia.activo).toBe(true);
      expect(familia.isDeleted()).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('reconstituye desde persistencia preservando timestamps e id', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const familia = FamiliaInsumoEntity.reconstitute(
        { codigo: 'CARTUCHO', nombre: 'Cartucho', activo: false },
        'id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(familia.id).toBe('id-fijo');
      expect(familia.createdAt).toEqual(createdAt);
      expect(familia.updatedAt).toEqual(updatedAt);
      expect(familia.activo).toBe(false);
    });

    /**
     * Una fila histórica más larga que el tope actual se LEE, no explota:
     * hacer caer una lectura por un dato viejo convierte un valor legado en
     * una caída de sistema.
     */
    it('no aplica la precondición de largo sobre una fila ya persistida', () => {
      expect(() =>
        FamiliaInsumoEntity.reconstitute(
          {
            codigo: 'A'.repeat(FAMILIA_INSUMO_CODIGO_MAX_LENGTH + 10),
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
      const familia = FamiliaInsumoEntity.create({
        codigo: 'A',
        nombre: 'Familia A',
        activo: true,
      });

      familia.actualizar({ nombre: 'Familia A renombrada' });

      expect(familia.nombre).toBe('Familia A renombrada');
      expect(familia.codigo).toBe('A'); // no tocado
    });

    it('actualiza codigo cuando se provee', () => {
      const familia = FamiliaInsumoEntity.create({
        codigo: 'A',
        nombre: 'Familia A',
        activo: true,
      });

      familia.actualizar({ codigo: 'B' });

      expect(familia.codigo).toBe('B');
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
      const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });

      familia.desactivar();

      expect(familia.activo).toBe(false);
      expect(familia.deletedAt).toBeNull();
      expect(familia.isDeleted()).toBe(false);
    });

    it('activar() vuelve a encender activo (caso hermano de desactivar)', () => {
      const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
      familia.desactivar();

      familia.activar();

      expect(familia.activo).toBe(true);
      expect(familia.isDeleted()).toBe(false);
    });
  });
});
