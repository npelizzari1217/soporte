/**
 * ciclo-vigente.entity.spec.ts — TDD RED→GREEN (T9.1, PR9).
 *
 * Invariante estructural R20: `fechaFin > fechaInicio`, reforzado en
 * `CicloVigenteEntity.create()` como defensa en profundidad del CHECK de DB.
 */
import { describe, expect, it } from 'vitest';
import { CicloVigenteEntity, CICLO_VIGENTE_NOMBRE_MAX_LENGTH } from './ciclo-vigente.entity';
import { CicloVigenteInvalidDatesError } from '../errors/clientes.errors';

describe('CicloVigenteEntity', () => {
  it('crea un ciclo válido cuando fechaFin > fechaInicio', () => {
    const ciclo = CicloVigenteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    });

    expect(ciclo.nombre).toBe('Ciclo 2026');
    expect(ciclo.activo).toBe(true);
    expect(ciclo.id).toBeTruthy();
  });

  it('lanza CicloVigenteInvalidDatesError cuando fechaFin === fechaInicio', () => {
    const fecha = new Date('2026-01-01');
    expect(() =>
      CicloVigenteEntity.create({
        nombre: 'Ciclo inválido',
        fechaInicio: fecha,
        fechaFin: fecha,
        activo: true,
      }),
    ).toThrow(CicloVigenteInvalidDatesError);
  });

  it('lanza CicloVigenteInvalidDatesError cuando fechaFin < fechaInicio', () => {
    expect(() =>
      CicloVigenteEntity.create({
        nombre: 'Ciclo inválido',
        fechaInicio: new Date('2026-12-31'),
        fechaFin: new Date('2026-01-01'),
        activo: true,
      }),
    ).toThrow(CicloVigenteInvalidDatesError);
  });

  it('reconstitute omite la revalidación de fechas (datos ya validados en DB)', () => {
    const fecha = new Date('2026-01-01');
    const ciclo = CicloVigenteEntity.reconstitute(
      { nombre: 'Ciclo reconstituido', fechaInicio: fecha, fechaFin: fecha, activo: false },
      'id-fijo',
      fecha,
      fecha,
      null,
    );

    expect(ciclo.id).toBe('id-fijo');
    expect(ciclo.fechaInicio).toBe(fecha);
    expect(ciclo.fechaFin).toBe(fecha);
  });

  describe('rename() / reschedule() (sdd/ciclos-abm-root)', () => {
    it('rename() cambia el nombre', () => {
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });

      ciclo.rename('Ciclo 2026 renombrado');

      expect(ciclo.nombre).toBe('Ciclo 2026 renombrado');
    });

    it('reschedule() cambia las fechas cuando fechaFin > fechaInicio', () => {
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });

      ciclo.reschedule(new Date('2026-02-01'), new Date('2026-11-30'));

      expect(ciclo.fechaInicio).toEqual(new Date('2026-02-01'));
      expect(ciclo.fechaFin).toEqual(new Date('2026-11-30'));
    });

    it('reschedule() lanza CicloVigenteInvalidDatesError cuando fechaFin <= fechaInicio', () => {
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });

      expect(() => ciclo.reschedule(new Date('2026-06-01'), new Date('2026-06-01'))).toThrow(
        CicloVigenteInvalidDatesError,
      );
      // Sin mutar en fallo — las fechas originales se preservan.
      expect(ciclo.fechaInicio).toEqual(new Date('2026-01-01'));
      expect(ciclo.fechaFin).toEqual(new Date('2026-12-31'));
    });
  });
});

/**
 * Tope de largo de `nombre`, espejando `ciclosVigentes.nombre VarChar(100)`
 * (`prisma_master/schema.prisma`).
 *
 * No lo acotaba ninguna capa: el valor llegaba a Postgres y moría con 22001
 * (500 crudo). `nombre` no se normaliza en ningún borde, así que va con `throw`
 * plano — rama 1 de la "regla de tres ramas".
 */
describe('CicloVigenteEntity — tope de largo de nombre', () => {
  const fechas = { fechaInicio: new Date('2026-01-01'), fechaFin: new Date('2026-12-31') };

  it('acepta un nombre en el límite exacto', () => {
    const c = CicloVigenteEntity.create({
      nombre: 'A'.repeat(CICLO_VIGENTE_NOMBRE_MAX_LENGTH),
      ...fechas,
    });
    expect(c.nombre).toHaveLength(CICLO_VIGENTE_NOMBRE_MAX_LENGTH);
  });

  it('create() rechaza un nombre que pasa el tope', () => {
    expect(() =>
      CicloVigenteEntity.create({
        nombre: 'A'.repeat(CICLO_VIGENTE_NOMBRE_MAX_LENGTH + 1),
        ...fechas,
      }),
    ).toThrow(/nombre excede/);
  });

  it('rename() rechaza un nombre que pasa el tope', () => {
    const c = CicloVigenteEntity.create({ nombre: 'Ciclo 2026', ...fechas });
    expect(() => c.rename('A'.repeat(CICLO_VIGENTE_NOMBRE_MAX_LENGTH + 1))).toThrow(
      /nombre excede/,
    );
  });

  it('rename() acepta un nombre en el límite exacto', () => {
    const c = CicloVigenteEntity.create({ nombre: 'Ciclo 2026', ...fechas });
    c.rename('A'.repeat(CICLO_VIGENTE_NOMBRE_MAX_LENGTH));
    expect(c.nombre).toHaveLength(CICLO_VIGENTE_NOMBRE_MAX_LENGTH);
  });

  /** Centinela de valor: el tope es el ancho real de la columna. */
  it('el tope coincide con el ancho de la columna', () => {
    expect(CICLO_VIGENTE_NOMBRE_MAX_LENGTH).toBe(100);
  });
});
