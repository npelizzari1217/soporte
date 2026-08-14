/**
 * resolver-ciclo-activo-compra.service.spec.ts — casos mínimos de
 * `ResolverCicloActivoCompra` (fix-ciclo-activo-cross-module): hay ciclo
 * activo -> lo devuelve; no hay -> falla con `SinCicloActivoError` de
 * `compras/domain/errors` (NUNCA la de `tickets/`).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1 (S1, S2).
 */
import { ResolverCicloActivoCompra } from './resolver-ciclo-activo-compra.service';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { SinCicloActivoError } from '../../domain/errors/compras.errors';

describe('ResolverCicloActivoCompra', () => {
  it('hay ciclo activo -> lo devuelve', async () => {
    const cicloActivo = CicloClienteEntity.create(
      {
        cicloVigenteId: 'ciclo-vigente-uuid',
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
      'ciclo-activo-uuid',
    );
    const cicloRepo = { findActive: vi.fn().mockResolvedValue(cicloActivo) };
    const resolver = new ResolverCicloActivoCompra(cicloRepo);

    const result = await resolver.resolver();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(cicloActivo);
  });

  it('no hay ciclo activo -> SinCicloActivoError de compras (no de tickets)', async () => {
    const cicloRepo = { findActive: vi.fn().mockResolvedValue(null) };
    const resolver = new ResolverCicloActivoCompra(cicloRepo);

    const result = await resolver.resolver();

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SinCicloActivoError);
    expect(result.getError().message).toBe(
      'No hay un ciclo activo en este tenant. No se puede crear la compra.',
    );
  });
});
