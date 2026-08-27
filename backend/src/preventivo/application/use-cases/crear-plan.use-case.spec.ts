import { CrearPlanUseCase } from './crear-plan.use-case';
import { ObjetivoInvalidoError } from '../../domain/errors/preventivo.errors';

describe('CrearPlanUseCase (4.2)', () => {
  function buildUseCase() {
    const planRepo = { guardar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    return {
      useCase: new CrearPlanUseCase(planRepo, txRunner as never),
      planRepo,
      txRunner,
    };
  }

  const baseDto = {
    titulo: 'Cambio de filtros',
    instrucciones: null,
    equipoId: 'equipo-uuid',
    ubicacion: null,
    prioridadId: 'prioridad-uuid',
    responsableId: 'responsable-uuid',
    intervaloValor: 3,
    intervaloUnidad: 'MESES' as const,
    fechaInicio: new Date('2026-01-01'),
  };

  it('crea el plan con proximaEjecucionEn = fechaInicio y lo persiste dentro de la transacción', async () => {
    const { useCase, planRepo, txRunner } = buildUseCase();

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    const plan = result.getValue();
    expect(plan.proximaEjecucionEn).toEqual(baseDto.fechaInicio);
    expect(plan.activo).toBe(true);
    expect(txRunner.run).toHaveBeenCalledTimes(1);
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
  });

  it('objetivo excluyente violado (equipo Y ubicación) → Result.fail(ObjetivoInvalidoError), sin persistir', async () => {
    const { useCase, planRepo } = buildUseCase();

    const result = await useCase.execute({ ...baseDto, ubicacion: 'DEPOSITO CENTRAL' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ObjetivoInvalidoError);
    expect(planRepo.guardar).not.toHaveBeenCalled();
  });
});
