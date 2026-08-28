import { describe, it, expect } from 'vitest';
import { EquipoInformaticoEntity, EquipoInformaticoProps } from './equipo-informatico.entity';

/**
 * T10.1 [U][RED] — EquipoInformaticoEntity: `deactivate()` (activo=false)
 * distinto de `softDelete()` (deletedAt); `actualizar()`. La asignación a
 * personas se eliminó del dominio Equipos — vive solo en `Ticket`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref design: ADR-9.
 */
/** Props base válidas, sin nada opcional seteado — usada por los tests de límites. */
function baseProps(): Omit<EquipoInformaticoProps, 'activo'> {
  return {
    nombre: 'Notebook',
    numeroSerie: null,
    marca: null,
    modelo: null,
    fechaAdquisicion: null,
    ubicacion: null,
    importe: null,
    fechaValoracion: null,
    observaciones: null,
    valorResidual: null,
    fechaValorResidual: null,
  };
}

describe('EquipoInformaticoEntity', () => {
  function makeEquipo() {
    return EquipoInformaticoEntity.create({
      nombre: 'Notebook Dell 5420',
      numeroSerie: 'SN-001',
      marca: 'Dell',
      modelo: 'Latitude 5420',
      fechaAdquisicion: new Date('2025-01-01'),
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
  }

  it('create() inicializa activo=true y deletedAt=null', () => {
    const equipo = makeEquipo();
    expect(equipo.activo).toBe(true);
    expect(equipo.isDeleted()).toBe(false);
    expect(equipo.nombre).toBe('Notebook Dell 5420');
    expect(equipo.numeroSerie).toBe('SN-001');
  });

  it('deactivate() setea activo=false SIN tocar deletedAt (distinto de softDelete)', () => {
    const equipo = makeEquipo();
    equipo.deactivate();
    expect(equipo.activo).toBe(false);
    expect(equipo.isDeleted()).toBe(false);
  });

  it('softDelete() (heredado de BaseEntity) setea deletedAt SIN tocar activo', () => {
    const equipo = makeEquipo();
    equipo.softDelete();
    expect(equipo.isDeleted()).toBe(true);
    expect(equipo.activo).toBe(true);
  });

  it('actualizar() aplica PATCH semántico (undefined no toca, null limpia)', () => {
    const equipo = makeEquipo();
    equipo.actualizar({ nombre: 'Notebook Dell 5420 (actualizado)', marca: undefined });
    expect(equipo.nombre).toBe('Notebook Dell 5420 (actualizado)');
    expect(equipo.marca).toBe('Dell');

    equipo.actualizar({ ubicacion: 'oficina 1' });
    expect(equipo.ubicacion).toBe('OFICINA 1'); // normalizada a mayúscula (invariante de dominio)
    equipo.actualizar({ ubicacion: null });
    expect(equipo.ubicacion).toBeNull();
  });

  it('create() normaliza ubicacion a mayúscula', () => {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'Notebook Dell 5420',
      numeroSerie: 'SN-002',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: 'oficina 1',
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
    expect(equipo.ubicacion).toBe('OFICINA 1');
  });

  /**
   * Fix defecto "límites de equipos" (sdd/limites-db): la base impone topes
   * (`VarChar`/`Decimal(14,2)`) que el dominio no hacía respetar. Un caso por
   * camino, parametrizado.
   */
  describe('límites de largo/rango', () => {
    it.each([
      ['nombre', { nombre: 'A'.repeat(256) }, /nombre excede/],
      ['numeroSerie', { numeroSerie: 'A'.repeat(256) }, /numeroSerie excede/],
      ['marca', { marca: 'A'.repeat(101) }, /marca excede/],
      ['modelo', { modelo: 'A'.repeat(101) }, /modelo excede/],
      ['importe (negativo)', { importe: -1 }, /importe no puede ser negativo/],
      ['importe (excede techo)', { importe: 100_000_000 }, /importe excede el techo de negocio/],
      ['valorResidual (negativo)', { valorResidual: -1 }, /valorResidual no puede ser negativo/],
      [
        'valorResidual (excede techo)',
        { valorResidual: 100_000_000 },
        /valorResidual excede el techo de negocio/,
      ],
    ] as const)('create() rechaza %s fuera de rango', (_campo, override, mensaje) => {
      expect(() => EquipoInformaticoEntity.create({ ...baseProps(), ...override })).toThrow(
        mensaje,
      );
    });

    it.each([
      ['nombre', { nombre: 'A'.repeat(255) }],
      ['numeroSerie', { numeroSerie: 'A'.repeat(255) }],
      ['marca', { marca: 'A'.repeat(100) }],
      ['modelo', { modelo: 'A'.repeat(100) }],
      ['importe (mínimo, 0)', { importe: 0 }],
      ['importe (techo, 99999999)', { importe: 99_999_999 }],
      ['valorResidual (mínimo, 0)', { valorResidual: 0 }],
      ['valorResidual (techo, 99999999)', { valorResidual: 99_999_999 }],
    ] as const)('create() acepta %s en el límite exacto', (_campo, override) => {
      expect(() => EquipoInformaticoEntity.create({ ...baseProps(), ...override })).not.toThrow();
    });

    it('actualizar() re-valida el mismo tope de nombre', () => {
      const equipo = EquipoInformaticoEntity.create(baseProps());
      expect(() => equipo.actualizar({ nombre: 'A'.repeat(256) })).toThrow(/nombre excede/);
      expect(equipo.nombre).toBe(baseProps().nombre); // no mutó (falló antes de aplicar)
    });

    it('actualizar() re-valida el mismo tope de importe', () => {
      const equipo = EquipoInformaticoEntity.create(baseProps());
      expect(() => equipo.actualizar({ importe: -1 })).toThrow(/importe no puede ser negativo/);
      expect(equipo.importe).toBeNull(); // no mutó (falló antes de aplicar)
    });
  });

  /**
   * Hermano invertido de los tests de rechazo de `create()`: `reconstitute()`
   * NO valida largos (JSDoc de `validarLargos`) porque la fila ya existe en
   * la base — hacer explotar una lectura por un valor histórico convertiría
   * un dato viejo en una caída de sistema.
   */
  it('reconstitute() NO valida largos (permite un valor histórico que excede el tope actual)', () => {
    expect(() =>
      EquipoInformaticoEntity.reconstitute(
        { ...baseProps(), nombre: 'A'.repeat(300), activo: true },
        'id-historico',
        new Date('2020-01-01'),
        new Date('2020-01-01'),
        null,
      ),
    ).not.toThrow();
  });

  it('reconstitute() restaura estado desde persistencia', () => {
    const createdAt = new Date('2025-01-01');
    const updatedAt = new Date('2025-02-01');
    const equipo = EquipoInformaticoEntity.reconstitute(
      {
        nombre: 'Equipo reconstituido',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
        activo: false,
      },
      'id-reconstituido',
      createdAt,
      updatedAt,
      null,
    );
    expect(equipo.id).toBe('id-reconstituido');
    expect(equipo.activo).toBe(false);
    expect(equipo.createdAt).toEqual(createdAt);
  });
});
