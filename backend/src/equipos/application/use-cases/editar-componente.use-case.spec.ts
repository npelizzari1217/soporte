import { describe, it, expect, vi } from 'vitest';
import { EditarComponenteUseCase } from './editar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
} from '../../domain/errors/equipos.errors';

/**
 * EditarComponenteUseCase — sdd/catalogo-unico-componentes (ADR-2): solo se
 * editan `descripcion`, `numeroSerie` y `capacidad`. El tipo y el repuesto
 * quedan como los fijó el alta.
 */
describe('EditarComponenteUseCase', () => {
  function makeComponente() {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: 'RAM',
      insumoId: 'insumo-1',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
    }).getValue();
  }

  function makeUseCase(componente: ComponenteEquipoEntity | null) {
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    return { componenteRepo, useCase: new EditarComponenteUseCase(componenteRepo as never) };
  }

  it('falla con ComponenteNoEncontradoError si no existe', async () => {
    const { useCase, componenteRepo } = makeUseCase(null);

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con ComponenteNoEncontradoError si el componente pertenece a OTRO equipo', async () => {
    const componente = makeComponente(); // equipoId: 'equipo-1'
    const { useCase, componenteRepo } = makeUseCase(componente);

    const result = await useCase.execute({ equipoId: 'equipo-2', componenteId: componente.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con ComponenteDadoDeBajaError si el componente está dado de baja', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const { useCase, componenteRepo } = makeUseCase(componente);

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      descripcion: 'x',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('edita los datos propios (PATCH semántico) y persiste', async () => {
    const componente = makeComponente();
    const { useCase, componenteRepo } = makeUseCase(componente);

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      descripcion: 'Nueva desc',
      numeroSerie: null,
    });

    expect(result.isOk()).toBe(true);
    const actualizado = result.getValue();
    expect(actualizado.descripcion).toBe('Nueva desc');
    expect(actualizado.numeroSerie).toBeNull();
    expect(actualizado.capacidad).toBe('8GB'); // no tocado (undefined)
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });

  it('un tipoComponenteCodigo o un insumoId sobrantes no cambian el tipo ni el repuesto', async () => {
    const componente = makeComponente();
    const { useCase } = makeUseCase(componente);

    // El DTO de aplicación no los declara; un llamador que los cuele igual no
    // puede modificar nada (ADR-2).
    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      descripcion: 'Nueva desc',
      tipoComponenteCodigo: 'CPU',
      insumoId: 'otro-insumo',
    } as never);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().tipoComponenteCodigo).toBe('RAM');
    expect(result.getValue().insumoId).toBe('insumo-1');
  });
});
