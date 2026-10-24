import { describe, it, expect, vi } from 'vitest';
import { ListarValoracionesEquipoUseCase } from './listar-valoraciones-equipo.use-case';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';
import type { ValoracionEquipo } from '../../domain/entities/valoracion-equipo';
import type { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { IValoracionEquipoRepository } from '../../domain/ports/i-valoracion-equipo.repository';
import type { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { equipoDadoDeBaja, equipoVigente } from '../../testing/equipos-unit.fixtures';

/** odd/tasks/historial-valor-residual.md (S5): lectura del historial del valor de un equipo. */
describe('ListarValoracionesEquipoUseCase', () => {
  const ANA = '01900000-0000-7000-8000-0000000000a1';
  const BAJA_EN_MASTER = '01900000-0000-7000-8000-0000000000a2';

  function valoracion(
    equipoId: string,
    overrides: Partial<ValoracionEquipo> & Pick<ValoracionEquipo, 'id'>,
  ): ValoracionEquipo {
    return {
      equipoId,
      fecha: new Date('2026-10-24T00:00:00.000Z'),
      importe: 700,
      origen: 'MANUAL',
      usuarioId: ANA,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function makeUseCase(equipo: EquipoInformaticoEntity | null, valoraciones: ValoracionEquipo[]) {
    const equipoRepo = { findById: vi.fn(async () => equipo) } satisfies Pick<
      IEquipoInformaticoRepository,
      'findById'
    >;
    const valoracionRepo = { listarPorEquipo: vi.fn(async () => valoraciones) } satisfies Pick<
      IValoracionEquipoRepository,
      'listarPorEquipo'
    >;
    const usuarios = {
      resolverNombres: vi.fn(
        async (ids: string[]) =>
          new Map(
            ids
              .filter((id) => id === ANA)
              .map((id) => [id, { nombre: 'Ana', apellido: 'Pérez' }] as const),
          ),
      ),
    } satisfies Pick<IUsuarioMasterChecker, 'resolverNombres'>;
    return {
      useCase: new ListarValoracionesEquipoUseCase(equipoRepo, valoracionRepo, usuarios),
      valoracionRepo,
      usuarios,
    };
  }

  it('devuelve el historial en el orden del repositorio, con el usuario resuelto', async () => {
    const equipo = equipoVigente();
    const filas = [
      valoracion(equipo.id, {
        id: 'v1',
        fecha: new Date('2026-01-10T00:00:00.000Z'),
        importe: 1000,
        origen: 'MIGRACION',
        usuarioId: null,
      }),
      valoracion(equipo.id, { id: 'v2' }),
      valoracion(equipo.id, {
        id: 'v3',
        fecha: new Date('2026-10-25T00:00:00.000Z'),
        importe: 650,
      }),
    ];
    const { useCase, valoracionRepo, usuarios } = makeUseCase(equipo, filas);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([
      { valoracion: filas[0], usuario: null },
      { valoracion: filas[1], usuario: { nombre: 'Ana', apellido: 'Pérez' } },
      { valoracion: filas[2], usuario: { nombre: 'Ana', apellido: 'Pérez' } },
    ]);
    expect(valoracionRepo.listarPorEquipo).toHaveBeenCalledWith(equipo.id);
    // Una sola consulta a master, sin repetidos ni las filas de migración.
    expect(usuarios.resolverNombres).toHaveBeenCalledTimes(1);
    expect(usuarios.resolverNombres).toHaveBeenCalledWith([ANA]);
  });

  it('un usuario que ya no existe en master queda sin nombre y la fila se devuelve igual', async () => {
    const equipo = equipoVigente();
    const fila = valoracion(equipo.id, { id: 'v1', usuarioId: BAJA_EN_MASTER });
    const { useCase } = makeUseCase(equipo, [fila]);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue()).toEqual([{ valoracion: fila, usuario: null }]);
  });

  it('un equipo dado de baja también muestra su historial', async () => {
    const equipo = equipoDadoDeBaja();
    const fila = valoracion(equipo.id, { id: 'v1' });
    const { useCase } = makeUseCase(equipo, [fila]);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(1);
  });

  it('un equipo sin historial devuelve un arreglo vacío', async () => {
    const equipo = equipoVigente();
    const { useCase } = makeUseCase(equipo, []);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue()).toEqual([]);
  });

  it('un equipo inexistente falla con EquipoNoEncontradoError sin leer el historial', async () => {
    const { useCase, valoracionRepo } = makeUseCase(null, []);

    const result = await useCase.execute({ equipoId: 'no-existe' });

    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(valoracionRepo.listarPorEquipo).not.toHaveBeenCalled();
  });

  it('un equipo con borrado lógico falla con EquipoNoEncontradoError', async () => {
    const equipo = equipoVigente();
    equipo.softDelete();
    const { useCase, valoracionRepo } = makeUseCase(equipo, []);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(valoracionRepo.listarPorEquipo).not.toHaveBeenCalled();
  });
});
