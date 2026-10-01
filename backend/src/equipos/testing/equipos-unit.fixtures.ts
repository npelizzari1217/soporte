import { vi } from 'vitest';
import { unstubbed } from '../../testing/mocks';
import { AgregarComponenteUseCase } from '../application/use-cases/agregar-componente.use-case';
import type { IComponenteEquipoRepository } from '../domain/ports/i-componente-equipo.repository';
import type { IEquipoInformaticoRepository } from '../domain/ports/i-equipo-informatico.repository';
import type { IInsumoRepository } from '../../insumos/domain/ports/i-insumo.repository';
import type { IFamiliaInsumoRepository } from '../../insumos/domain/ports/i-familia-insumo.repository';
import type { ITenantTransactionRunner } from '../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  EquipoInformaticoEntity,
  type CrearEquipoInformaticoProps,
} from '../domain/entities/equipo-informatico.entity';

/** Equipo vigente con datos mínimos, para los specs unitarios de los use cases de equipos. */
export function equipoVigente(
  overrides: Partial<CrearEquipoInformaticoProps> = {},
): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.create({
    nombre: 'Original',
    numeroSerie: 'SN-ORIG',
    marca: null,
    modelo: null,
    fechaAdquisicion: null,
    ubicacion: null,
    importe: null,
    fechaValoracion: null,
    observaciones: null,
    valorResidual: null,
    fechaValorResidual: null,
    ...overrides,
  });
}

/** Equipo ya dado de baja (`activo = false` con sus datos de baja). */
export function equipoDadoDeBaja(): EquipoInformaticoEntity {
  const equipo = equipoVigente();
  equipo.darDeBaja({
    destino: 'DESCARTE',
    categoria: 'VEJEZ',
    usuarioId: 'u1',
    fecha: new Date('2026-10-01T00:00:00Z'),
  });
  return equipo;
}

/**
 * Runner transaccional de spec: ejecuta el callback tal cual y registra `tx:inicio` /
 * `tx:fin` en `llamadas`, para verificar que una lectura corre dentro de la transacción.
 */
export function txRunnerDeSpec(llamadas: string[] = []): ITenantTransactionRunner {
  return {
    run: async <T>(fn: () => Promise<T>): Promise<T> => {
      llamadas.push('tx:inicio');
      const valor = await fn();
      llamadas.push('tx:fin');
      return valor;
    },
    alCommitear: vi.fn(),
  };
}

/**
 * `AgregarComponenteUseCase` REAL armado sobre un equipo dado de baja. El catálogo de insumos
 * y familias lanza si se consulta: el guard del equipo tiene que cortar antes. Sirve para probar
 * que cada camino de alta (instalar con unidad, con insumo `NINGUNO`, sin descuento) devuelve
 * `EquipoDadoDeBajaError` sin crear el componente.
 */
export function agregarComponenteSobreEquipoDadoDeBaja() {
  const equipo = equipoDadoDeBaja();
  const equipoRepo = {
    bloquearParaOperarPiezas: vi.fn(async () => equipo),
  } satisfies Pick<IEquipoInformaticoRepository, 'bloquearParaOperarPiezas'>;
  const componenteRepo = { save: vi.fn(async () => {}) } satisfies Pick<
    IComponenteEquipoRepository,
    'save'
  >;
  const insumoRepo = { findById: unstubbed('insumoRepo.findById') } satisfies Pick<
    IInsumoRepository,
    'findById'
  >;
  const familiaRepo = { findById: unstubbed('familiaRepo.findById') } satisfies Pick<
    IFamiliaInsumoRepository,
    'findById'
  >;
  const useCase = new AgregarComponenteUseCase(equipoRepo, componenteRepo, insumoRepo, familiaRepo);
  return { equipo, useCase, componenteRepo };
}
