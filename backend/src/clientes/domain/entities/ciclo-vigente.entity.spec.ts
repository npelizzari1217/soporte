/**
 * ciclo-vigente.entity.spec.ts — TDD RED→GREEN (T9.1, PR9).
 *
 * Invariante estructural R20: `fechaFin > fechaInicio`, reforzado en
 * `CicloVigenteEntity.create()` como defensa en profundidad del CHECK de DB.
 */
import { describe, expect, it } from 'vitest';
import { CicloVigenteEntity } from './ciclo-vigente.entity';
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
});
