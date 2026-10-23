import { EditarPlanUseCase } from './editar-plan.use-case';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import {
  IntervaloInvalidoError,
  ObjetivoInvalidoError,
  PlanNoEncontradoError,
  ResponsableNoElegibleError,
} from '../../domain/errors/preventivo.errors';
import {
  USUARIOS_PREVENTIVO,
  responsablesDePrueba,
} from '../../test-helpers/responsables-plan-en-memoria';

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
      buscarPorId: vi.fn<IPlanPreventivoRepository['buscarPorId']>().mockResolvedValue(plan),
      guardar: vi.fn<IPlanPreventivoRepository['guardar']>().mockResolvedValue(undefined),
      actualizarProximaEjecucion: vi
        .fn<IPlanPreventivoRepository['actualizarProximaEjecucion']>()
        .mockResolvedValue(undefined),
    };
    // Runner real con un espía encima: `run` es genérico y un `vi.fn` lo perdería.
    const txRunner: ITenantTransactionRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: unstubbed('txRunner.alCommitear'),
    };
    vi.spyOn(txRunner, 'run');
    const { responsables, master } = responsablesDePrueba();
    return {
      useCase: new EditarPlanUseCase(planRepo, txRunner, responsables),
      planRepo,
      txRunner,
      master,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[EP-R6] plan inexistente → Result.fail(PlanNoEncontradoError)', async () => {
    const { useCase } = buildUseCase(null);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: 'no-existe',
      titulo: 'Nuevo título',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PlanNoEncontradoError);
  });

  // Hermano de "plan inexistente": un plan que existe pero está dado de baja
  // lógicamente también es "no encontrado" a efectos de edición.
  it('[EP-R6] plan dado de baja lógicamente → Result.fail(PlanNoEncontradoError), ningún campo cambia', async () => {
    const plan = makePlan();
    plan.softDelete();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      titulo: 'Nuevo título',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PlanNoEncontradoError);
    expect(planRepo.guardar).not.toHaveBeenCalled();
    expect(plan.titulo).toBe('Cambio de filtros');
  });

  // [EP-R5] editar solo titulo, sin tocar la cadencia, es el hermano invertido
  // de "cambia la cadencia → recalcula el puntero" (test más abajo).
  it('[EP-R5] edita título sin tocar la cadencia → NO recalcula proximaEjecucionEn', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      titulo: 'Nuevo título',
    });

    expect(result.isOk()).toBe(true);
    expect(plan.titulo).toBe('Nuevo título');
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
    expect(planRepo.actualizarProximaEjecucion).not.toHaveBeenCalled();
    expect(plan.proximaEjecucionEn).toEqual(new Date('2026-01-01'));
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
      clienteId: 'cliente-1',
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

  // [EP-R3] XOR "ambos": el plan ya tiene equipoId (objetivo por equipo);
  // mandar ubicacion sin limpiar equipoId deja los dos presentes a la vez.
  it('[EP-R3] edición deja equipo Y ubicación simultáneos → ObjetivoInvalidoError, ningún campo cambia', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      ubicacion: 'DEPOSITO',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ObjetivoInvalidoError);
    expect(planRepo.guardar).not.toHaveBeenCalled();
    expect(plan.equipoId).toBe('equipo-uuid');
    expect(plan.ubicacion).toBeNull();
    expect(plan.titulo).toBe('Cambio de filtros');
  });

  // [EP-R3] XOR "ninguno": limpiar equipoId sin proveer ubicacion deja el
  // plan sin objetivo.
  it('[EP-R3] edición deja el plan sin equipo ni ubicación → ObjetivoInvalidoError, ningún campo cambia', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      equipoId: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ObjetivoInvalidoError);
    expect(planRepo.guardar).not.toHaveBeenCalled();
    expect(plan.equipoId).toBe('equipo-uuid');
    expect(plan.ubicacion).toBeNull();
  });

  // Hermano invertido de los dos casos de arriba: la MISMA operación que
  // limpia equipoId Y provee ubicacion en el mismo envío sí es un objetivo
  // válido (XOR satisfecho) y sí persiste.
  it('[EP-R3] hermano invertido: swap de equipo a ubicación en el mismo envío sí persiste', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      equipoId: null,
      ubicacion: 'DEPOSITO',
    });

    expect(result.isOk()).toBe(true);
    expect(plan.equipoId).toBeNull();
    expect(plan.ubicacion).toBe('DEPOSITO');
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
  });

  // [EP-R4] cadencia inválida: intervaloValor no positivo.
  it('[EP-R4] intervaloValor: 0 → IntervaloInvalidoError, ningún campo cambia', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      intervaloValor: 0,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(IntervaloInvalidoError);
    expect(planRepo.guardar).not.toHaveBeenCalled();
    expect(planRepo.actualizarProximaEjecucion).not.toHaveBeenCalled();
    expect(plan.intervaloValor).toBe(3);
    expect(plan.intervaloUnidad).toBe('MESES');
  });

  // Hermano invertido: la misma edición con un intervaloValor positivo
  // válido sí persiste.
  it('[EP-R4] hermano invertido: intervaloValor positivo válido sí persiste', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      intervaloValor: 5,
    });

    expect(result.isOk()).toBe(true);
    expect(plan.intervaloValor).toBe(5);
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
  });

  it('cambia el responsable a un técnico con LECTURA sobre Preventivo → persiste', async () => {
    const plan = makePlan();
    const { useCase, planRepo } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      responsableId: USUARIOS_PREVENTIVO.TECNICO_PREVENTIVO.id,
    });

    expect(result.isOk()).toBe(true);
    expect(plan.responsableId).toBe(USUARIOS_PREVENTIVO.TECNICO_PREVENTIVO.id);
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
  });

  it.each([
    [
      'un USUARIO con LECTURA sobre Preventivo (no es técnico)',
      USUARIOS_PREVENTIVO.USUARIO_PREVENTIVO.id,
    ],
    ['un técnico de otro tipo', USUARIOS_PREVENTIVO.TECNICO_SOPORTE.id],
    ['un técnico sin permisos por tipo', USUARIOS_PREVENTIVO.TECNICO_SIN_PERMISOS.id],
  ])(
    'cambia el responsable a uno no elegible (%s) → ResponsableNoElegibleError, ningún campo cambia',
    async (_caso, responsableId) => {
      const plan = makePlan();
      const { useCase, planRepo } = buildUseCase(plan);

      const result = await useCase.execute({
        clienteId: 'cliente-1',
        planId: plan.id,
        titulo: 'Nuevo título',
        responsableId,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResponsableNoElegibleError);
      expect(planRepo.guardar).not.toHaveBeenCalled();
      expect(plan.titulo).toBe('Cambio de filtros');
      expect(plan.responsableId).toBe('responsable-uuid');
    },
  );

  // El formulario manda el responsable vigente en cada guardado. Si ese técnico perdió el
  // permiso después de crear el plan, exigirlo de nuevo bloquearía editar cualquier otro campo:
  // la regla se aplica al ELEGIR un responsable, no al conservarlo.
  it('el mismo responsable vigente, aunque ya no sea elegible → no se revalida y persiste', async () => {
    const plan = makePlan();
    const { useCase, planRepo, master } = buildUseCase(plan);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      planId: plan.id,
      titulo: 'Nuevo título',
      responsableId: 'responsable-uuid',
    });

    expect(result.isOk()).toBe(true);
    expect(plan.titulo).toBe('Nuevo título');
    expect(planRepo.guardar).toHaveBeenCalledWith(plan);
    expect(master.consultasDeAgentes).toBe(0);
  });
});
