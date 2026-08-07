/**
 * T5.6 [U] TEST — `ResolverCicloActivoParaCreacion` (RED → GREEN).
 *
 * Colaborador de aplicación: resuelve el ciclo ACTIVO del tenant para el
 * flujo de creación de tickets (T4 — "ciclo_id = ciclo ACTIVO del tenant,
 * resuelto por el servidor"). Mock de `ICicloClienteRepository` — sin DB.
 *
 * Contrato:
 *   - Con ciclo activo → Result.ok(cicloActivo).
 *   - Sin ciclo activo → Result.fail(SinCicloActivoError) (T4, 409).
 *
 * Ref spec: sdd/tickets-core/spec T4. Ref design: "Archivos afectados" PR5.
 * Tarea: T5.6.
 */
import { ResolverCicloActivoParaCreacion } from './resolver-ciclo-activo.service';
import { SinCicloActivoError } from '../../domain/errors/tickets.errors';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

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

  it('retorna Result.fail(SinCicloActivoError) cuando findActive() devuelve null (T4)', async () => {
    const repo = makeCicloRepoStub(null);
    const resolver = new ResolverCicloActivoParaCreacion(repo as ICicloClienteRepository);

    const result = await resolver.resolver();

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SinCicloActivoError);
  });
});
