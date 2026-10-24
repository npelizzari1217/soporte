import { ListarGeneracionesPlanUseCase } from './listar-generaciones-plan.use-case';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { PlanNoEncontradoError } from '../../domain/errors/preventivo.errors';
import { alcancePorTipo } from '../../../tickets/test-helpers/alcance-ticket';

/** Actor que ve el tipo del plan (odd/preventivo-por-tipo, S4). */
const ACTOR = alcancePorTipo('actor-1', { 'tipo-preventivo': ['LECTURA'] });

function makePlan(): PlanPreventivoEntity {
  return PlanPreventivoEntity.create(
    {
      titulo: 'Plan',
      instrucciones: null,
      equipoId: 'equipo-uuid',
      ubicacion: null,
      prioridadId: 'prioridad-uuid',
      tipoId: 'tipo-preventivo',
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

describe('ListarGeneracionesPlanUseCase (4.4)', () => {
  it('plan inexistente → Result.fail(PlanNoEncontradoError), sin consultar el repo de generaciones', async () => {
    const planRepo = { buscarPorId: vi.fn().mockResolvedValue(null) };
    const generacionRepo = { listarPorPlan: vi.fn() };
    const useCase = new ListarGeneracionesPlanUseCase(planRepo, generacionRepo);

    const result = await useCase.execute({ planId: 'no-existe', alcance: ACTOR });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PlanNoEncontradoError);
    expect(generacionRepo.listarPorPlan).not.toHaveBeenCalled();
  });

  it('plan existente → devuelve las generaciones del repositorio', async () => {
    const plan = makePlan();
    const generaciones = [
      {
        id: 'gen-1',
        planId: plan.id,
        fechaProgramada: new Date('2026-02-01'),
        resultado: 'GENERADO' as const,
        ticketId: 'ticket-1',
        createdAt: new Date('2026-02-01'),
      },
    ];
    const planRepo = { buscarPorId: vi.fn().mockResolvedValue(plan) };
    const generacionRepo = { listarPorPlan: vi.fn().mockResolvedValue(generaciones) };
    const useCase = new ListarGeneracionesPlanUseCase(planRepo, generacionRepo);

    const result = await useCase.execute({ planId: plan.id, alcance: ACTOR });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(generaciones);
    expect(generacionRepo.listarPorPlan).toHaveBeenCalledWith(plan.id);
  });

  it('S4: plan de un tipo sin LECTURA para el actor → 404, sin consultar las generaciones', async () => {
    const plan = makePlan();
    const planRepo = { buscarPorId: vi.fn().mockResolvedValue(plan) };
    const generacionRepo = { listarPorPlan: vi.fn() };
    const useCase = new ListarGeneracionesPlanUseCase(planRepo, generacionRepo);

    const result = await useCase.execute({
      planId: plan.id,
      alcance: alcancePorTipo('actor-1', { 'tipo-soporte': ['LECTURA'] }),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PlanNoEncontradoError);
    expect(generacionRepo.listarPorPlan).not.toHaveBeenCalled();
  });
});
