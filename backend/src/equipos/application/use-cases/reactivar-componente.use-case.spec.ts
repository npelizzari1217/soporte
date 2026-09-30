import { describe, it, expect, vi } from 'vitest';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteDevueltoAlStockError,
  ComponenteNoEncontradoError,
  ComponenteYaActivoError,
} from '../../domain/errors/equipos.errors';

describe('ReactivarComponenteUseCase', () => {
  function makeComponente() {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
  }

  it('falla con ComponenteNoEncontradoError si no existe', async () => {
    const componenteRepo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: 'no-existe' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
  });

  it('falla con ComponenteNoEncontradoError si el componente pertenece a OTRO equipo', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-2', componenteId: componente.id });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con ComponenteYaActivoError si el componente ya está activo', async () => {
    const componente = makeComponente();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteYaActivoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('reactiva el componente dado de baja (limpia deletedAt) y persiste', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(result.getValue().deletedAt).toBeNull();
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });

  describe('según el destino del retiro (sdd/stock-usado-componentes, ADR-5)', () => {
    it('rechaza con ComponenteDevueltoAlStockError si volvió al stock como USADO, y no persiste', async () => {
      const componente = makeComponente();
      componente.retirar({
        destino: 'STOCK_USADO',
        motivo: 'Pieza sana',
        usuarioId: 'user-1',
        bajaMovimientoId: 'mov-entrada',
      });
      const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
      const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

      const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ComponenteDevueltoAlStockError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
      expect(componente.activo).toBe(false);
      expect(componente.bajaDestino).toBe('STOCK_USADO');
    });

    it('reactiva un DESCARTE y limpia el registro de retiro', async () => {
      const componente = makeComponente();
      componente.retirar({
        destino: 'DESCARTE',
        motivo: 'Placa quemada',
        usuarioId: 'user-1',
        bajaMovimientoId: null,
      });
      const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
      const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

      const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id });

      expect(result.isOk()).toBe(true);
      expect(componente.activo).toBe(true);
      expect(componente.bajaDestino).toBeNull();
      expect(componente.bajaMotivo).toBeNull();
      expect(componente.bajaUsuarioId).toBeNull();
      expect(componenteRepo.save).toHaveBeenCalledWith(componente);
    });

    it('reactiva un retiro LEGADO (sin destino) y persiste', async () => {
      const componente = makeComponente();
      componente.softDelete();
      expect(componente.bajaDestino).toBeNull();
      const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
      const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

      const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id });

      expect(result.isOk()).toBe(true);
      expect(componente.activo).toBe(true);
      expect(componenteRepo.save).toHaveBeenCalledWith(componente);
    });
  });
});
