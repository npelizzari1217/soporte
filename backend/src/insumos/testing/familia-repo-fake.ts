import { type Mock, vi } from 'vitest';
import { FamiliaInsumoEntity } from '../domain/entities/familia-insumo.entity';
import { IFamiliaInsumoRepository } from '../domain/ports/i-familia-insumo.repository';

/** Estado de la familia que responde el fake; por defecto, una familia de repuestos vigente. */
export interface EstadoFamiliaFake {
  esRepuesto?: boolean;
  activo?: boolean;
  /** Baja lógica: la fila vuelve igual, porque `findById()` no filtra por `deletedAt`. */
  dadaDeBaja?: boolean;
  /** `null` simula una familia inexistente. */
  inexistente?: boolean;
}

/**
 * Familia con el estado pedido. Con `esRepuesto` en `true` por defecto, porque
 * la mayoría de los casos que consultan la familia son los de USADO.
 */
export function familiaFake(estado: EstadoFamiliaFake = {}): FamiliaInsumoEntity {
  const props = {
    codigo: 'REP',
    nombre: 'Repuestos',
    activo: estado.activo ?? true,
    esRepuesto: estado.esRepuesto ?? true,
  };
  const baja = new Date('2026-02-01T00:00:00Z');
  return FamiliaInsumoEntity.reconstitute(
    props,
    'fam-1',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-01T00:00:00Z'),
    estado.dadaDeBaja === true ? baja : null,
  );
}

/**
 * Doble del `Pick<IFamiliaInsumoRepository, 'findById'>` que los casos de uso
 * reciben. Es un espía: los specs verifican que con `NUEVO` no se consulta.
 */
export function familiaRepoFake(estado: EstadoFamiliaFake = {}): {
  findById: Mock<IFamiliaInsumoRepository['findById']>;
} {
  return {
    findById: vi.fn().mockResolvedValue(estado.inexistente === true ? null : familiaFake(estado)),
  };
}
