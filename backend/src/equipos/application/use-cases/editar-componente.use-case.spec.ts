import { describe, it, expect, vi } from 'vitest';
import { EditarComponenteUseCase } from './editar-componente.use-case';
import type { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
  SerialDeUnidadNoEditableError,
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
      insumoId: 'insumo-1',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
    }).getValue();
  }

  function makeUseCase(componente: ComponenteEquipoEntity | null, editado = true) {
    const componenteRepo = {
      findById: vi.fn(async () => componente),
      editar: vi.fn(async () => editado),
      // El use case no debe usarlo: queda espiado para probar que nunca se llama.
      save: vi.fn(async () => {}),
    } satisfies Pick<IComponenteEquipoRepository, 'findById' | 'editar' | 'save'>;
    return { componenteRepo, useCase: new EditarComponenteUseCase(componenteRepo) };
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
    expect(componenteRepo.editar).toHaveBeenCalledWith(componente);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('editar() devuelve false (retirado despues de leerlo): ComponenteDadoDeBajaError y nunca llama a save', async () => {
    const componente = makeComponente();
    const { useCase, componenteRepo } = makeUseCase(componente, false);

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      descripcion: 'Edicion vieja',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    expect(componenteRepo.editar).toHaveBeenCalledTimes(1);
    expect(componenteRepo.save).not.toHaveBeenCalled();
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
    expect(result.getValue()).not.toHaveProperty('tipoComponenteCodigo');
    expect(result.getValue().insumoId).toBe('insumo-1');
  });

  describe('componente con unidad de insumo (ADR-7)', () => {
    function makeConUnidad() {
      return ComponenteEquipoEntity.create({
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: 'Original',
        numeroSerie: 'SERIAL-DE-LA-UNIDAD',
        capacidad: '8GB',
        unidadId: 'unidad-1',
      }).getValue();
    }

    it('numeroSerie en el PATCH falla con SerialDeUnidadNoEditableError y no persiste', async () => {
      const componente = makeConUnidad();
      const { useCase, componenteRepo } = makeUseCase(componente);

      const result = await useCase.execute({
        equipoId: 'equipo-1',
        componenteId: componente.id,
        numeroSerie: 'OTRO',
        descripcion: 'Nueva',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(SerialDeUnidadNoEditableError);
      expect(componente.descripcion).toBe('Original');
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('tambien rechaza numeroSerie null (limpiar el serial de la unidad)', async () => {
      const componente = makeConUnidad();
      const { useCase } = makeUseCase(componente);

      const result = await useCase.execute({
        equipoId: 'equipo-1',
        componenteId: componente.id,
        numeroSerie: null,
      });

      expect(result.getError()).toBeInstanceOf(SerialDeUnidadNoEditableError);
    });

    it('sin numeroSerie edita los datos propios y no toca el serial resuelto', async () => {
      const componente = makeConUnidad();
      const { useCase, componenteRepo } = makeUseCase(componente);

      const result = await useCase.execute({
        equipoId: 'equipo-1',
        componenteId: componente.id,
        descripcion: 'Nueva',
        capacidad: '16GB',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().descripcion).toBe('Nueva');
      expect(result.getValue().capacidad).toBe('16GB');
      expect(result.getValue().numeroSerie).toBe('SERIAL-DE-LA-UNIDAD');
      expect(componenteRepo.editar).toHaveBeenCalledWith(componente);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });
  });
});
