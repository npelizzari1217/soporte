import { describe, expect, it } from 'vitest';
import { FeriadoEntity } from './feriado.entity';
import { FechaCalendario } from '../value-objects/fecha-calendario';
import { FERIADO_DESCRIPCION_MAX_LENGTH } from '../feriados.constants';

function fecha(iso: string): FechaCalendario {
  return FechaCalendario.crear(iso).getValue();
}

describe('FeriadoEntity.crear', () => {
  it('crea un feriado válido con la fecha y descripción dadas', () => {
    const feriado = FeriadoEntity.crear({
      fecha: fecha('2026-05-01'),
      descripcion: 'Día del Trabajador',
    });

    expect(feriado.fecha.aClave()).toBe('2026-05-01');
    expect(feriado.descripcion).toBe('Día del Trabajador');
  });

  it('lanza si la descripción excede el tope de 200 caracteres', () => {
    const descripcionExcedida = 'a'.repeat(FERIADO_DESCRIPCION_MAX_LENGTH + 1);

    expect(() =>
      FeriadoEntity.crear({ fecha: fecha('2026-05-01'), descripcion: descripcionExcedida }),
    ).toThrow(/200/);
  });
});

describe('FeriadoEntity.editar', () => {
  it('actualiza fecha y descripción, y refresca updatedAt', () => {
    const creadoEn = new Date('2025-01-01T00:00:00Z');
    const feriado = FeriadoEntity.reconstitute(
      { fecha: fecha('2026-01-01'), descripcion: 'Año Nuevo' },
      'feriado-1',
      creadoEn,
      creadoEn,
    );

    feriado.editar({ fecha: fecha('2026-01-02'), descripcion: 'Feriado trasladado' });

    expect(feriado.fecha.aClave()).toBe('2026-01-02');
    expect(feriado.descripcion).toBe('Feriado trasladado');
    expect(feriado.updatedAt.getTime()).toBeGreaterThanOrEqual(creadoEn.getTime());
  });

  it('lanza si la nueva descripción excede el tope, sin mutar el estado previo', () => {
    const feriado = FeriadoEntity.crear({ fecha: fecha('2026-01-01'), descripcion: 'Año Nuevo' });
    const descripcionExcedida = 'a'.repeat(FERIADO_DESCRIPCION_MAX_LENGTH + 1);

    expect(() =>
      feriado.editar({ fecha: fecha('2026-01-01'), descripcion: descripcionExcedida }),
    ).toThrow(/200/);
    expect(feriado.descripcion).toBe('Año Nuevo');
  });
});
