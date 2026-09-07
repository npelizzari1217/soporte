import { describe, expect, it } from 'vitest';
import { Prisma } from '.prisma/tenant';
import { MovimientoInsumoMapper } from './movimiento-insumo.mapper';
import { MovimientoInsumoEntity } from '../../../domain/entities/movimiento-insumo.entity';

/** Fila base de `movimientos_insumo`, para que cada caso sobrescriba solo lo suyo. */
function filaMovimiento(
  overrides: Partial<Parameters<typeof MovimientoInsumoMapper.toDomain>[0]> = {},
): Parameters<typeof MovimientoInsumoMapper.toDomain>[0] {
  return {
    id: 'movimiento-1',
    insumoId: 'insumo-1',
    tipo: 'SALIDA',
    cantidad: new Prisma.Decimal('3.00'),
    usuarioId: 'usuario-1',
    motivo: null,
    equipoId: null,
    sectorId: null,
    itemCompraId: null,
    createdAt: new Date('2026-09-06T10:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Movimiento de dominio válido, para los casos de `toPersistence()`.
 * `getValue()` sirve de guarda del fixture: si un caso pasara props que la
 * entidad rechaza, esto lanza nombrando el error en vez de dejar pasar un
 * `undefined` que haría fallar el assert por el motivo equivocado.
 */
function crearMovimiento(
  props: Partial<Parameters<typeof MovimientoInsumoEntity.create>[0]> = {},
): MovimientoInsumoEntity {
  return MovimientoInsumoEntity.create({
    insumoId: 'insumo-1',
    tipo: 'ENTRADA',
    cantidad: 3,
    usuarioId: 'usuario-1',
    ...props,
  }).getValue();
}

describe('MovimientoInsumoMapper', () => {
  describe('toDomain()', () => {
    it('convierte una fila Prisma a MovimientoInsumoEntity', () => {
      const entity = MovimientoInsumoMapper.toDomain(filaMovimiento());

      expect(entity.id).toBe('movimiento-1');
      expect(entity.insumoId).toBe('insumo-1');
      expect(entity.tipo).toBe('SALIDA');
      expect(entity.usuarioId).toBe('usuario-1');
      expect(entity.createdAt).toEqual(new Date('2026-09-06T10:00:00.000Z'));
    });

    /**
     * `cantidad` es `DECIMAL(10,2)`, o sea un `Prisma.Decimal` — un OBJETO.
     * Sin la conversión a `number`, quien sume la bitácora estaría operando
     * sobre algo que no es un número y el stock saldría mal sin ningún error.
     * Se assertea el TIPO además del valor: un `toBe` contra un `Decimal` de
     * igual valor no distingue las dos cosas.
     */
    it('convierte el Decimal de cantidad a number', () => {
      const entity = MovimientoInsumoMapper.toDomain(
        filaMovimiento({ cantidad: new Prisma.Decimal('12.34') }),
      );

      expect(typeof entity.cantidad).toBe('number');
      expect(entity.cantidad).toBe(12.34);
    });

    it('preserva el motivo, el equipo y el sector cuando la fila los trae', () => {
      const entity = MovimientoInsumoMapper.toDomain(
        filaMovimiento({
          motivo: 'Conteo físico del 06/09',
          equipoId: 'equipo-1',
          sectorId: 'sector-1',
        }),
      );

      expect(entity.motivo).toBe('Conteo físico del 06/09');
      expect(entity.equipoId).toBe('equipo-1');
      expect(entity.sectorId).toBe('sector-1');
    });

    // Hermano invertido del caso de arriba: las tres columnas son nullables y
    // el `null` tiene que llegar como `null`, no como `undefined` — la entidad
    // declara `string | null` y un `undefined` la haría mentir.
    it('deja en null el motivo, el equipo y el sector cuando la fila no los trae', () => {
      const entity = MovimientoInsumoMapper.toDomain(filaMovimiento());

      expect(entity.motivo).toBeNull();
      expect(entity.equipoId).toBeNull();
      expect(entity.sectorId).toBeNull();
    });

    /**
     * El ORIGEN de la entrada. Es la respuesta a "¿de qué compra vino esto?", y
     * si la lectura lo perdiera la columna guardaría un dato que ninguna
     * pantalla podría mostrar. Va con su hermano invertido en el mismo caso: el
     * `null` de la mayoría de la tabla tiene que llegar como `null`.
     */
    it('preserva el itemCompraId de la fila, y deja null cuando la fila no lo trae', () => {
      expect(
        MovimientoInsumoMapper.toDomain(filaMovimiento({ itemCompraId: 'item-compra-1' }))
          .itemCompraId,
      ).toBe('item-compra-1');
      expect(MovimientoInsumoMapper.toDomain(filaMovimiento()).itemCompraId).toBeNull();
    });

    /**
     * La tabla es append-only y NO tiene `updated_at` ni `deleted_at`. La
     * entidad hereda igual esos dos campos de `BaseEntity`, así que la lectura
     * tiene que dejarlos en un valor que no invente nada: `updatedAt` espejado
     * de `createdAt` —si arrancara en `new Date()`, cada lectura mostraría un
     * movimiento "modificado hoy" que nadie tocó— y `deletedAt` en `null`.
     */
    it('espeja updatedAt de createdAt y deja deletedAt en null', () => {
      const entity = MovimientoInsumoMapper.toDomain(filaMovimiento());

      expect(entity.updatedAt).toEqual(new Date('2026-09-06T10:00:00.000Z'));
      expect(entity.deletedAt).toBeNull();
    });

    /**
     * `tipo` es `VarChar` en la base, no un enum de Prisma, así que el mapper
     * castea. El cast es seguro por el CHECK `movimientos_insumo_tipo_check`,
     * y este caso fija que el valor pasa TAL CUAL: un mapper que normalizara o
     * tradujera el tipo rompería la comparación contra el catálogo del dominio.
     */
    it('pasa el tipo tal cual viene de la columna', () => {
      const entity = MovimientoInsumoMapper.toDomain(
        filaMovimiento({ tipo: 'AJUSTE_NEGATIVO', motivo: 'Faltaban 3 unidades' }),
      );

      expect(entity.tipo).toBe('AJUSTE_NEGATIVO');
    });
  });

  describe('toPersistence()', () => {
    /**
     * El id lo genera `BaseEntity` (UUIDv7) ANTES del INSERT, y tiene que
     * viajar: la columna tiene `DEFAULT gen_random_uuid()`, que es un UUIDv4
     * aleatorio. Si el mapper omitiera el id, la base pondría uno propio, el
     * de la entidad en memoria dejaría de existir en la tabla, y la bitácora
     * perdería el desempate monótono que el UUIDv7 le da a dos asientos con el
     * mismo `created_at`.
     */
    it('incluye el id que generó la entidad', () => {
      const movimiento = crearMovimiento();

      const fila = MovimientoInsumoMapper.toPersistence(movimiento);

      expect(fila.id).toBe(movimiento.id);
    });

    it('incluye createdAt de la entidad, no el default de la base', () => {
      const movimiento = crearMovimiento();

      const fila = MovimientoInsumoMapper.toPersistence(movimiento);

      expect(fila.createdAt).toEqual(movimiento.createdAt);
    });

    it('traslada los campos del asiento', () => {
      const movimiento = crearMovimiento({
        tipo: 'SALIDA',
        cantidad: 2.5,
        equipoId: 'equipo-1',
        sectorId: 'sector-1',
        motivo: 'Reposición del piso 3',
      });

      const fila = MovimientoInsumoMapper.toPersistence(movimiento);

      expect(fila.insumoId).toBe('insumo-1');
      expect(fila.tipo).toBe('SALIDA');
      expect(fila.cantidad).toBe(2.5);
      expect(fila.usuarioId).toBe('usuario-1');
      expect(fila.motivo).toBe('Reposición del piso 3');
      expect(fila.equipoId).toBe('equipo-1');
      expect(fila.sectorId).toBe('sector-1');
    });

    /**
     * El `null` viaja EN el objeto y no como campo ausente. No es cosmético:
     * `movimientos_insumo` es append-only, así que el shape se usa solo en el
     * INSERT — pero un campo ausente y un `null` explícito son dos cosas
     * distintas para Prisma, y dejar que el ausente signifique "sin motivo"
     * abre la puerta a que un `undefined` accidental del caller se lea como
     * "no tocar" el día que alguien reuse este shape.
     */
    it('manda el motivo, el equipo y el sector como null explícito cuando no hay', () => {
      const fila = MovimientoInsumoMapper.toPersistence(crearMovimiento());

      expect(fila).toHaveProperty('motivo', null);
      expect(fila).toHaveProperty('equipoId', null);
      expect(fila).toHaveProperty('sectorId', null);
    });

    /**
     * **El caso que cierra la pérdida silenciosa.** El mapper emitió
     * `itemCompraId: null` FIJO mientras la entidad no tenía el campo; si esa
     * línea sobreviviera a la entidad, un movimiento creado con origen se
     * guardaría sin él —sin error, sin log y sin forma de notarlo salvo
     * consultando la columna—. El assert compara contra el valor de la entidad,
     * no contra un literal: un `null` fijo lo rompe.
     */
    it('emite el itemCompraId de la entidad, no un null fijo', () => {
      const movimiento = crearMovimiento({ itemCompraId: 'item-compra-1' });

      const fila = MovimientoInsumoMapper.toPersistence(movimiento);

      expect(fila.itemCompraId).toBe(movimiento.itemCompraId);
      expect(fila.itemCompraId).toBe('item-compra-1');
    });

    /**
     * Hermano invertido del de arriba: el asiento sin origen —la entrada
     * manual, la salida, el ajuste— manda `null` EXPLÍCITO y no el campo
     * ausente, por el mismo motivo que los otros tres nullables.
     */
    it('manda el itemCompraId como null explícito cuando el asiento no tiene origen', () => {
      const fila = MovimientoInsumoMapper.toPersistence(crearMovimiento());

      expect(fila).toHaveProperty('itemCompraId', null);
    });

    /**
     * La tabla NO tiene esas dos columnas: mandarlas haría fallar el INSERT
     * entero. El assert de ausencia va acompañado del de presencia para que no
     * pase en verde sobre un objeto vacío — el verde falso clásico.
     */
    it('no emite updatedAt ni deletedAt, que la tabla no tiene', () => {
      const fila = MovimientoInsumoMapper.toPersistence(crearMovimiento());
      const claves = Object.keys(fila);

      expect(claves).toContain('createdAt');
      expect(claves).not.toContain('updatedAt');
      expect(claves).not.toContain('deletedAt');
    });
  });

  /**
   * Ida y vuelta completo: lo que el mapper escribe, leído de vuelta, tiene
   * que dar la misma entidad. Es el caso que atrapa un campo olvidado en
   * cualquiera de los dos lados, que ninguno de los casos de arriba ve por
   * separado.
   */
  it('hace round-trip de un movimiento completo', () => {
    const movimiento = crearMovimiento({
      tipo: 'AJUSTE_POSITIVO',
      cantidad: 7.25,
      motivo: 'Conteo físico: sobraban 7,25',
      equipoId: 'equipo-1',
      sectorId: 'sector-1',
      itemCompraId: 'item-compra-1',
    });

    const fila = MovimientoInsumoMapper.toPersistence(movimiento);
    const reconstruido = MovimientoInsumoMapper.toDomain({
      ...fila,
      cantidad: new Prisma.Decimal(fila.cantidad),
    });

    expect(reconstruido.id).toBe(movimiento.id);
    expect(reconstruido.insumoId).toBe(movimiento.insumoId);
    expect(reconstruido.tipo).toBe(movimiento.tipo);
    expect(reconstruido.cantidad).toBe(movimiento.cantidad);
    expect(reconstruido.usuarioId).toBe(movimiento.usuarioId);
    expect(reconstruido.motivo).toBe(movimiento.motivo);
    expect(reconstruido.equipoId).toBe(movimiento.equipoId);
    expect(reconstruido.sectorId).toBe(movimiento.sectorId);
    expect(reconstruido.itemCompraId).toBe(movimiento.itemCompraId);
    expect(reconstruido.createdAt).toEqual(movimiento.createdAt);
  });
});
