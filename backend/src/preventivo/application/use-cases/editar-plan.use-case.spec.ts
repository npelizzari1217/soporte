import { EditarPlanUseCase } from './editar-plan.use-case';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { PlanNoEncontradoError } from '../../domain/errors/preventivo.errors';

function makePlan(overrides: Partial<Parameters<typeof PlanPreventivoEntity.create>[0]> = {}) {
  const result = PlanPreventivoEntity.create(
    {
      titulo: 'Cambio de filtros',
      instrucciones: null,
      equipoId: 'equipo-uuid',
      ubicacion: null,
      prioridadId: 'prioridad-uuid',
      responsableId: 'responsable-uuid',
      intervaloValor: 3,
      intervaloUnidad: 'MESES',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-01'),
      activo: true,
      ...overrides,
    },
    'plan-uuid',
  );
  return result.getValue();
}

describe('EditarPlanUseCase (4.2/4.3)', () => {
  function buildUseCase(plan: PlanPreventivoEntity | null) {
    const planRepo = {
      buscarPorId: vi.fn().mockResolvedValue(plan),
      guardar: vi.fn().mockResolvedValue(undefined),
      actualizarProximaEjecucion: vi.fn().mockResolvedValue(undefined),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    return {
      useCase: new EditarPlanUseCase(planRepo, txRunner as never),
      planRepo,
      txRunner,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('plan inexistente → Result.fail(PlanNoEncontradoError)', async () => {
    const { useCase } = buildUseCase(null);

    const result = await useCase.execute({ planId: 'no-existe', titulo: 'Nuevo título' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PlanNoEncontradoError);
  });

  it('edita título sin tocar la cadencia → NO recalcula proximaEjecucionEn', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({ planId: plan.id, titulo: 'Nuevo título' });

    expect(result.isOk()).toBe(true);
    expect(plan.titulo).toBe('Nuevo título');
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
    expect(planRepo.actualizarProximaEjecucion).not.toHaveBeenCalled();
  });

  // [R2] — el pasado es inalcanzable al editar la cadencia.
  it('[R2] cambia la cadencia con ciclos vencidos en el pasado → recalcula el puntero HACIA ADELANTE desde hoy, sin generar los ciclos salteados', async () => {
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));
    // Cadencia original semanal, mismo fechaInicio — habría MUCHOS ciclos
    // vencidos entre 2026-01-01 y hoy si se contaran con la cadencia vieja.
    const plan = makePlan({
      intervaloValor: 7,
      intervaloUnidad: 'DIAS',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-08'),
    });
    const { useCase, planRepo } = buildUseCase(plan);

    // Edita a cadencia MENSUAL — el recálculo debe usar la cadencia NUEVA
    // desde fechaInicio, y el resultado debe ser una fecha > hoy (2026-06-15).
    const result = await useCase.execute({
      planId: plan.id,
      intervaloValor: 1,
      intervaloUnidad: 'MESES',
    });

    expect(result.isOk()).toBe(true);
    expect(planRepo.actualizarProximaEjecucion).toHaveBeenCalledTimes(1);
    const [planIdArg, nuevaFecha] = planRepo.actualizarProximaEjecucion.mock.calls[0] as [
      string,
      Date,
    ];
    expect(planIdArg).toBe(plan.id);
    expect(nuevaFecha.getTime()).toBeGreaterThan(new Date('2026-06-15T00:00:00.000Z').getTime());
    // El ancla NUNCA se toca — sigue siendo fechaInicio.
    expect(plan.fechaInicio).toEqual(new Date('2026-01-01'));
  });

  it('objetivo excluyente violado tras editar → Result.fail, sin persistir', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({ planId: plan.id, ubicacion: 'DEPOSITO' });

    expect(result.isFail()).toBe(true);
    expect(planRepo.guardar).not.toHaveBeenCalled();
  });
});
