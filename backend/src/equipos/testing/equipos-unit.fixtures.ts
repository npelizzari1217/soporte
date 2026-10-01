import { vi } from 'vitest';
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
