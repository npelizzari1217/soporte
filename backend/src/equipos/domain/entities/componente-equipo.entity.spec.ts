import { describe, it, expect } from 'vitest';
import { ComponenteEquipoEntity } from './componente-equipo.entity';
import { TipoComponenteIdRequeridoError } from '../errors/equipos.errors';

/**
 * T10.3 [U][RED] — ComponenteEquipoEntity: create() → Result.fail
 * (TipoComponenteIdRequeridoError) si falta tipo (NORMALIZADO a Result, ADR-9).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref design: ADR-9.
 */
describe('ComponenteEquipoEntity', () => {
  it('create() falla con TipoComponenteIdRequeridoError si tipoComponenteId está vacío', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteId: '',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteIdRequeridoError);
  });

  it('create() acepta un componente válido con tipoComponenteId presente', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteId: 'tipo-ram',
      descripcion: 'Kingston 16GB',
      numeroSerie: null,
      capacidad: '16GB',
    });
    expect(result.isOk()).toBe(true);
    const componente = result.getValue();
    expect(componente.equipoId).toBe('equipo-1');
    expect(componente.tipoComponenteId).toBe('tipo-ram');
    expect(componente.capacidad).toBe('16GB');
  });

  it('reconstitute() restaura estado desde persistencia', () => {
    const componente = ComponenteEquipoEntity.reconstitute(
      {
        equipoId: 'equipo-1',
        tipoComponenteId: 'tipo-cpu',
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
    expect(componente.tipoComponenteId).toBe('tipo-cpu');
  });
});
