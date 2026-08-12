import { describe, it, expect } from 'vitest';
import { ComponenteEquipoEntity } from './componente-equipo.entity';
import { TipoComponenteCodigoRequeridoError } from '../errors/equipos.errors';

/**
 * T10.3 [U][RED] — ComponenteEquipoEntity: create() → Result.fail
 * (TipoComponenteCodigoRequeridoError) si falta código (NORMALIZADO a Result, ADR-9).
 *
 * PR4b (sdd/tipos-componente-master): el dominio pasa a referenciar el
 * catálogo MASTER por `codigo` (string estable, ej. "RAM"), no por `id`
 * tenant — el catálogo tenant `tipos_componente` se elimina.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref design: ADR-9.
 */
describe('ComponenteEquipoEntity', () => {
  it('create() falla con TipoComponenteCodigoRequeridoError si tipoComponenteCodigo está vacío', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: '',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteCodigoRequeridoError);
  });

  it('create() acepta un componente válido con tipoComponenteCodigo presente', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: 'RAM',
      descripcion: 'Kingston 16GB',
      numeroSerie: null,
      capacidad: '16GB',
    });
    expect(result.isOk()).toBe(true);
    const componente = result.getValue();
    expect(componente.equipoId).toBe('equipo-1');
    expect(componente.tipoComponenteCodigo).toBe('RAM');
    expect(componente.capacidad).toBe('16GB');
  });

  it('reconstitute() restaura estado desde persistencia', () => {
    const componente = ComponenteEquipoEntity.reconstitute(
      {
        equipoId: 'equipo-1',
        tipoComponenteCodigo: 'CPU',
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
    expect(componente.tipoComponenteCodigo).toBe('CPU');
  });

  it('activo es true recién creado y false luego de softDelete()', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: 'RAM',
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
      tipoComponenteCodigo: 'RAM',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
    }).getValue();

    componente.actualizar({ descripcion: null, capacidad: '16GB' });

    expect(componente.descripcion).toBeNull();
    expect(componente.capacidad).toBe('16GB');
    expect(componente.numeroSerie).toBe('SN-1'); // no tocado (undefined)
    expect(componente.tipoComponenteCodigo).toBe('RAM'); // no tocado (undefined)
  });

  it('reactivar() limpia deletedAt de un componente dado de baja', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: 'RAM',
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
