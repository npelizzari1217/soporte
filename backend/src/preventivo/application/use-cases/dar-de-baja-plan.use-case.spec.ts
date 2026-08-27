import { DarDeBajaPlanUseCase } from './dar-de-baja-plan.use-case';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { PlanNoEncontradoError } from '../../domain/errors/preventivo.errors';

function makePlan(): PlanPreventivoEntity {
  return PlanPreventivoEntity.create(
    {
      titulo: 'Plan',
      instrucciones: null,
      equipoId: 'equipo-uuid',
      ubicacion: null,
      prioridadId: 'prioridad-uuid',
      responsableId: 'responsable-uuid',
      intervaloValor: 1,
      intervaloUnidad: 'MESES',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-01'),
      activo: true,
    },
    'plan-uuid',
  ).getValue();
}

describe('DarDeBajaPlanUseCase (4.2, R4)', () => {
  function buildUseCase(plan: PlanPreventivoEntity | null) {
    const planRepo = {
      buscarPorId: vi.fn().mockResolvedValue(plan),
      guardar: vi.fn().mockResolvedValue(undefined),
    };
    return { useCase: new DarDeBajaPlanUseCase(planRepo), planRepo };
  }

  it('plan inexistente → Result.fail(PlanNoEncontradoError)', async () => {
    const { useCase } = buildUseCase(null);

    const result = await useCase.execute({ planId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PlanNoEncontradoError);
  });

  it('[R4] baja lógica: activo=false Y soft delete, sin tocar generaciones (el repo de generaciones nunca se inyecta)', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({ planId: plan.id });

    expect(result.isOk()).toBe(true);
    expect(plan.activo).toBe(false);
    expect(plan.isDeleted()).toBe(true);
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
  });

  it('plan ya dado de baja → Result.fail(PlanNoEncontradoError) (idempotencia por 404, no doble baja silenciosa)', async () => {
    const plan = makePlan();
    plan.softDelete();
    const { useCase } = buildUseCase(plan);

    const result = await useCase.execute({ planId: plan.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PlanNoEncontradoError);
  });
});
