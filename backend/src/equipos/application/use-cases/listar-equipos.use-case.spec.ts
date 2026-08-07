import { describe, it, expect, vi } from 'vitest';
import { ListarEquiposUseCase } from './listar-equipos.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

describe('ListarEquiposUseCase', () => {
  it('retorna los equipos activos del tenant', async () => {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
    });
    const equipoRepo = { findAllActive: vi.fn().mockResolvedValue([equipo]) };
    const useCase = new ListarEquiposUseCase(equipoRepo as never);

    const result = await useCase.execute();
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(1);
  });
});
