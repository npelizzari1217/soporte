import { describe, expect, it } from 'vitest';
import {
  ModeloEquipoEntity,
  MODELO_EQUIPO_MARCA_MAX_LENGTH,
  MODELO_EQUIPO_MODELO_MAX_LENGTH,
  normalizarMarcaModeloEquipo,
  normalizarModeloModeloEquipo,
} from './modelo-equipo.entity';

/**
 * El dominio es la AUTORIDAD del largo; el `VarChar(100)`/`VarChar(150)` de
 * `modelos_equipo` es backstop. Sin esta precondición el valor viaja intacto
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
    (marca: string, modelo: string) => (): unknown =>
      ModeloEquipoEntity.create({ marca, modelo, activo: true }),
  ],
  [
    'actualizar()',
    (marca: string, modelo: string) => (): unknown =>
      ModeloEquipoEntity.create({ marca: 'A', modelo: 'A', activo: true }).actualizar({
        marca,
        modelo,
      }),
  ],
])('ModeloEquipoEntity %s — precondición de largo', (_caso, construir) => {
  it('lanza si marca excede el tope de la columna', () => {
    expect(construir('A'.repeat(MODELO_EQUIPO_MARCA_MAX_LENGTH + 1), 'M')).toThrow(/marca excede/);
  });

  it('acepta marca en el tope exacto (límite inclusive)', () => {
    expect(construir('A'.repeat(MODELO_EQUIPO_MARCA_MAX_LENGTH), 'M')).not.toThrow();
  });

  it('lanza si modelo excede el tope de la columna', () => {
    expect(construir('A', 'M'.repeat(MODELO_EQUIPO_MODELO_MAX_LENGTH + 1))).toThrow(
      /modelo excede/,
    );
  });

  it('acepta modelo en el tope exacto (límite inclusive)', () => {
    expect(construir('A', 'M'.repeat(MODELO_EQUIPO_MODELO_MAX_LENGTH))).not.toThrow();
  });
});

describe('normalizarMarcaModeloEquipo()', () => {
  it('recorta espacios y pasa a mayúscula', () => {
    expect(normalizarMarcaModeloEquipo('  hp  ')).toBe('HP');
  });

  /**
   * `toUpperCase()` puede AGRANDAR el string: `'ß'` se convierte en `'SS'`.
   * El largo crudo no es cota del largo persistido, así que quien mida contra
   * el tope de la columna tiene que medir DESPUÉS de normalizar.
   */
  it('puede agrandar el string — la ß se expande a dos caracteres', () => {
    expect(normalizarMarcaModeloEquipo('ß')).toHaveLength(2);
  });
});

/**
 * El `modelo` es la mitad de la identidad del catálogo, pero NO se grita: la
 * designación comercial de un equipo se lee tal como la escribió el
 * fabricante. Gritarla convertiría "LaserJet Pro M404" en "LASERJET PRO M404",
 * que no es como nadie la busca ni la ve impresa en la máquina.
 */
describe('normalizarModeloModeloEquipo()', () => {
  it('recorta los espacios de borde SIN tocar mayúsculas y minúsculas', () => {
    expect(normalizarModeloModeloEquipo('  LaserJet Pro M404  ')).toBe('LaserJet Pro M404');
  });

  /**
   * Un modelo de solo espacios queda en cadena vacía, que es lo que el
   * `@MinLength(1)` del DTO sabe rechazar. Si el recorte corriera DESPUÉS del
   * mínimo de largo, `'   '` pasaría la validación y llegaría vacío a la base.
   */
  it('deja en cadena vacía un modelo de solo espacios', () => {
    expect(normalizarModeloModeloEquipo('   ')).toBe('');
  });
});

describe('ModeloEquipoEntity', () => {
  describe('create()', () => {
    it('crea un modelo activo con marca/modelo', () => {
      const modelo = ModeloEquipoEntity.create({
        marca: 'HP',
        modelo: 'LaserJet Pro M404',
        activo: true,
      });

      expect(modelo.marca).toBe('HP');
      expect(modelo.modelo).toBe('LaserJet Pro M404');
      expect(modelo.activo).toBe(true);
      expect(modelo.isDeleted()).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('reconstituye desde persistencia preservando timestamps e id', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const modelo = ModeloEquipoEntity.reconstitute(
        { marca: 'BROTHER', modelo: 'HL-L2350DW', activo: false },
        'id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(modelo.id).toBe('id-fijo');
      expect(modelo.createdAt).toEqual(createdAt);
      expect(modelo.updatedAt).toEqual(updatedAt);
      expect(modelo.activo).toBe(false);
    });

    /**
     * Una fila histórica más larga que el tope actual se LEE, no explota:
     * hacer caer una lectura por un dato viejo convierte un valor legado en
     * una caída de sistema.
     */
    it('no aplica la precondición de largo sobre una fila ya persistida', () => {
      expect(() =>
        ModeloEquipoEntity.reconstitute(
          {
            marca: 'A'.repeat(MODELO_EQUIPO_MARCA_MAX_LENGTH + 10),
            modelo: 'Histórico',
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
      const modelo = ModeloEquipoEntity.create({
        marca: 'HP',
        modelo: 'LaserJet Pro M404',
        activo: true,
      });

      modelo.actualizar({ modelo: 'LaserJet Pro M404dn' });

      expect(modelo.modelo).toBe('LaserJet Pro M404dn');
      expect(modelo.marca).toBe('HP'); // no tocada
    });

    it('actualiza marca cuando se provee', () => {
      const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true });

      modelo.actualizar({ marca: 'BROTHER' });

      expect(modelo.marca).toBe('BROTHER');
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
      const modelo = ModeloEquipoEntity.create({ marca: 'A', modelo: 'A', activo: true });

      modelo.desactivar();

      expect(modelo.activo).toBe(false);
      expect(modelo.deletedAt).toBeNull();
      expect(modelo.isDeleted()).toBe(false);
    });

    it('activar() vuelve a encender activo (caso hermano de desactivar)', () => {
      const modelo = ModeloEquipoEntity.create({ marca: 'A', modelo: 'A', activo: true });
      modelo.desactivar();

      modelo.activar();

      expect(modelo.activo).toBe(true);
      expect(modelo.isDeleted()).toBe(false);
    });
  });
});
