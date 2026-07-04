/**
 * Test: ResolverCicloActivoParaCreacion
 *
 * Colaborador de aplicación compartido (ADR-1, design-fase4.md) que resuelve
 * el ciclo ACTIVO del tenant para los 4 flujos de creación (tickets/compras/
 * reparaciones/equipos). Usa `ICicloClienteRepository` del lado tickets
 * (ADR-4-Repo) — NO el repo admin de `clientes`.
 *
 * Contrato:
 *   - Con ciclo activo → Result.ok(cicloActivo).
 *   - Sin ciclo activo → Result.fail(SinCicloActivoError).
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-1
 * Tarea: 1.2 (TEST RED) → 1.3 (IMPL GREEN)
 */
import { ResolverCicloActivoParaCreacion } from './resolver-ciclo-activo.service';
import { SinCicloActivoError } from '../../domain/errors/tickets.errors';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/** Stub mínimo de ICicloClienteRepository — solo lo que consume el resolver. */
function makeCicloRepoStub(
  activo: CicloClienteEntity | null,
): Pick<ICicloClienteRepository, 'findActive'> {
  return {
    findActive: vi.fn().mockResolvedValue(activo),
  };
}

function makeCicloActivo(): CicloClienteEntity {
  return CicloClienteEntity.reconstitute(
    {
      cicloVigenteId: 'cv-1',
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    'ciclo-activo-id',
    new Date(),
    new Date(),
    null,
  );
}

describe('ResolverCicloActivoParaCreacion', () => {
  it('retorna Result.ok(activo) cuando findActive() devuelve un ciclo', async () => {
    const activo = makeCicloActivo();
    const repo = makeCicloRepoStub(activo);
    const resolver = new ResolverCicloActivoParaCreacion(repo as ICicloClienteRepository);

    const result = await resolver.resolver();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(activo);
  });

  it('retorna Result.fail(SinCicloActivoError) cuando findActive() devuelve null', async () => {
    const repo = makeCicloRepoStub(null);
    const resolver = new ResolverCicloActivoParaCreacion(repo as ICicloClienteRepository);

    const result = await resolver.resolver();

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SinCicloActivoError);
  });
});
