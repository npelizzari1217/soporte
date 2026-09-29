import { describe, it, expect } from 'vitest';
import { ComponenteEquipoEntity, ComponenteEquipoProps } from './componente-equipo.entity';
import { InsumoRepuestoInexistenteError } from '../errors/equipos.errors';

/**
 * ComponenteEquipoEntity — sdd/catalogo-unico-componentes: sin tipo propio
 * (se deriva de la familia del insumo) e `insumoId` obligatorio: `create()`
 * → Result.fail(InsumoRepuestoInexistenteError) si falta.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (Result normalizado, ADR-9).
 */
describe('ComponenteEquipoEntity', () => {
  it('create() falla con InsumoRepuestoInexistenteError si insumoId está vacío', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: '',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
  });

  it('create() acepta un componente válido vinculado a un repuesto', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: 'Kingston 16GB',
      numeroSerie: null,
      capacidad: '16GB',
    });
    expect(result.isOk()).toBe(true);
    const componente = result.getValue();
    expect(componente.equipoId).toBe('equipo-1');
    expect(componente.capacidad).toBe('16GB');
    expect(componente.insumoId).toBe('insumo-1');
  });

  /**
   * Fix defecto "límites de equipos" (sdd/limites-db): la base impone topes
   * (`VarChar`) que el dominio no hacía respetar.
   */
  describe('límites de largo', () => {
    function baseProps(): ComponenteEquipoProps {
      return {
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      };
    }

    it.each([
      ['descripcion', { descripcion: 'A'.repeat(256) }, /descripcion excede/],
      ['numeroSerie', { numeroSerie: 'A'.repeat(256) }, /numeroSerie excede/],
      ['capacidad', { capacidad: 'A'.repeat(101) }, /capacidad excede/],
    ] as const)('create() rechaza %s fuera de rango', (_campo, override, mensaje) => {
      expect(() => ComponenteEquipoEntity.create({ ...baseProps(), ...override })).toThrow(mensaje);
    });

    it.each([
      ['descripcion', { descripcion: 'A'.repeat(255) }],
      ['numeroSerie', { numeroSerie: 'A'.repeat(255) }],
      ['capacidad', { capacidad: 'A'.repeat(100) }],
    ] as const)('create() acepta %s en el límite exacto', (_campo, override) => {
      expect(() => ComponenteEquipoEntity.create({ ...baseProps(), ...override })).not.toThrow();
    });

    it('actualizar() re-valida el mismo tope de descripcion', () => {
      const componente = ComponenteEquipoEntity.create(baseProps()).getValue();
      expect(() => componente.actualizar({ descripcion: 'A'.repeat(256) })).toThrow(
        /descripcion excede/,
      );
      expect(componente.descripcion).toBeNull(); // no mutó (falló antes de aplicar)
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
      ComponenteEquipoEntity.reconstitute(
        {
          equipoId: 'equipo-1',
          insumoId: 'insumo-1',
          descripcion: 'A'.repeat(300),
          numeroSerie: null,
          capacidad: null,
        },
        'componente-historico',
        new Date('2020-01-01'),
        new Date('2020-01-01'),
        null,
      ),
    ).not.toThrow();
  });

  it('reconstitute() restaura un componente EXISTENTE desde persistencia', () => {
    const componente = ComponenteEquipoEntity.reconstitute(
      {
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      },
      'componente-1',
      new Date(),
      new Date(),
      null,
    );
    expect(componente.id).toBe('componente-1');
    expect(componente.insumoId).toBe('insumo-1');
  });

  it('activo es true recién creado y false luego de softDelete()', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
    expect(componente.activo).toBe(true);

    componente.softDelete();
    expect(componente.activo).toBe(false);
    expect(componente.deletedAt).not.toBeNull();
  });

  it('actualizar() aplica PATCH semántico: undefined no toca, null limpia', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
    }).getValue();

    componente.actualizar({ descripcion: null, capacidad: '16GB' });

    expect(componente.descripcion).toBeNull();
    expect(componente.capacidad).toBe('16GB');
    expect(componente.numeroSerie).toBe('SN-1'); // no tocado (undefined)
    expect(componente.insumoId).toBe('insumo-1'); // el repuesto no se edita
  });

  it('reactivar() limpia deletedAt de un componente dado de baja', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
    componente.softDelete();
    expect(componente.activo).toBe(false);

    componente.reactivar();

    expect(componente.activo).toBe(true);
    expect(componente.deletedAt).toBeNull();
  });
});
