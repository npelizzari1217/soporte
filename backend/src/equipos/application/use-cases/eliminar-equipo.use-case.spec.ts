import { describe, it, expect, vi } from 'vitest';
import { EliminarEquipoUseCase } from './eliminar-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  EquipoConComponentesActivosError,
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
} from '../../domain/errors/equipos.errors';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import type { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';

function equipoVigente(): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.create({
    nombre: 'X',
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
  });
}

function componenteActivo(equipoId: string): ComponenteEquipoEntity {
  return ComponenteEquipoEntity.create({
    equipoId,
    insumoId: 'insumo-1',
    descripcion: null,
    numeroSerie: null,
    capacidad: null,
  }).getValue();
}

/** Arma el use case con fakes tipados y deja un registro del orden de las llamadas. */
function armar(equipo: EquipoInformaticoEntity | null, componentes: ComponenteEquipoEntity[]) {
  const llamadas: string[] = [];
  const equipoRepo = {
    bloquearParaModificar: vi.fn(async () => {
      llamadas.push('bloquearParaModificar');
      return equipo;
    }),
    delete: vi.fn(async () => {
      llamadas.push('delete');
    }),
  } satisfies Pick<IEquipoInformaticoRepository, 'bloquearParaModificar' | 'delete'>;
  const componenteRepo = {
    findActiveByEquipoId: vi.fn(async () => {
      llamadas.push('findActiveByEquipoId');
      return componentes;
    }),
  } satisfies Pick<IComponenteEquipoRepository, 'findActiveByEquipoId'>;
  const txRunner: ITenantTransactionRunner = {
    run: async <T>(fn: () => Promise<T>): Promise<T> => {
      llamadas.push('tx:inicio');
      const valor = await fn();
      llamadas.push('tx:fin');
      return valor;
    },
    alCommitear: vi.fn(),
  };
  const useCase = new EliminarEquipoUseCase(equipoRepo, componenteRepo, txRunner);
  return { useCase, equipoRepo, componenteRepo, llamadas };
}

describe('EliminarEquipoUseCase', () => {
  it('con un componente activo falla con EquipoConComponentesActivosError(cantidad 1) y no borra', async () => {
    const equipo = equipoVigente();
    const { useCase, equipoRepo } = armar(equipo, [componenteActivo(equipo.id)]);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(EquipoConComponentesActivosError);
    expect((error as EquipoConComponentesActivosError).cantidad).toBe(1);
    expect(equipoRepo.delete).not.toHaveBeenCalled();
  });

  it('con un equipo dado de baja falla con EquipoDadoDeBajaError y no borra', async () => {
    const equipo = equipoVigente();
    equipo.darDeBaja({
      destino: 'DESCARTE',
      categoria: 'VEJEZ',
      usuarioId: 'u1',
      fecha: new Date(),
    });
    const { useCase, equipoRepo } = armar(equipo, []);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(equipoRepo.delete).not.toHaveBeenCalled();
  });

  it('sin componentes activos devuelve ok y aplica el borrado lógico', async () => {
    const equipo = equipoVigente();
    const { useCase, equipoRepo } = armar(equipo, []);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isOk()).toBe(true);
    expect(equipoRepo.delete).toHaveBeenCalledWith(equipo.id);
  });

  it('inexistente falla con EquipoNoEncontradoError y no borra', async () => {
    const { useCase, equipoRepo } = armar(null, []);

    const result = await useCase.execute({ equipoId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(equipoRepo.delete).not.toHaveBeenCalled();
  });

  it('con borrado lógico falla con EquipoNoEncontradoError y no borra', async () => {
    const equipo = equipoVigente();
    equipo.softDelete();
    const { useCase, equipoRepo } = armar(equipo, []);

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(equipoRepo.delete).not.toHaveBeenCalled();
  });

  it('el chequeo corre dentro de txRunner.run() y tras bloquearParaModificar', async () => {
    const equipo = equipoVigente();
    const { useCase, llamadas } = armar(equipo, []);

    await useCase.execute({ equipoId: equipo.id });

    expect(llamadas).toEqual([
      'tx:inicio',
      'bloquearParaModificar',
      'findActiveByEquipoId',
      'delete',
      'tx:fin',
    ]);
  });
});
