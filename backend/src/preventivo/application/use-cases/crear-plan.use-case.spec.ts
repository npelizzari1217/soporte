import { CrearPlanUseCase } from './crear-plan.use-case';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import {
  AccionSobreTipoDelPlanNoPermitidaError,
  ObjetivoInvalidoError,
  ResponsableNoElegibleError,
} from '../../domain/errors/preventivo.errors';
import { TipoTicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';
import {
  TIPO_DADO_DE_BAJA_ID,
  TIPO_PREVENTIVO_ID,
  TIPO_SOPORTE_ID,
  USUARIOS_PREVENTIVO,
  responsablesDePrueba,
  tiposDePrueba,
} from '../../test-helpers/responsables-plan-en-memoria';

/** Actor que ve Preventivo y Soporte, y nada más (odd/preventivo-por-tipo, S4). */
const ACTOR = alcancePorTipo('actor-1', {
  [TIPO_PREVENTIVO_ID]: ['LECTURA'],
  [TIPO_SOPORTE_ID]: ['LECTURA', 'ALTAS'],
  'tipo-sin-lectura': ['ALTAS'],
});

describe('CrearPlanUseCase (4.2)', () => {
  function buildUseCase() {
    const planRepo = {
      guardar: vi.fn<IPlanPreventivoRepository['guardar']>().mockResolvedValue(undefined),
    };
    // Runner real con un espía encima: `run` es genérico y un `vi.fn` lo perdería.
    const txRunner: ITenantTransactionRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: unstubbed('txRunner.alCommitear'),
    };
    vi.spyOn(txRunner, 'run');
    return {
      useCase: new CrearPlanUseCase(
        planRepo,
        txRunner,
        responsablesDePrueba().responsables,
        tiposDePrueba(),
      ),
      planRepo,
      txRunner,
    };
  }

  const baseDto = {
    clienteId: 'cliente-1',
    titulo: 'Cambio de filtros',
    instrucciones: null,
    equipoId: 'equipo-uuid',
    ubicacion: null,
    prioridadId: 'prioridad-uuid',
    tipoId: TIPO_PREVENTIVO_ID,
    responsableId: USUARIOS_PREVENTIVO.TECNICO_PREVENTIVO.id,
    intervaloValor: 3,
    intervaloUnidad: 'MESES' as const,
    fechaInicio: new Date('2026-01-01'),
    alcance: ACTOR,
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

  it('sin anticipación el plan nace con 0 días (S5)', async () => {
    const { useCase } = buildUseCase();

    const plan = (await useCase.execute(baseDto)).getValue();

    expect(plan.anticipacionValor).toBe(0);
    expect(plan.anticipacionUnidad).toBe('DIAS');
  });

  it('con anticipación válida la persiste tal cual', async () => {
    const { useCase, planRepo } = buildUseCase();

    const result = await useCase.execute({
      ...baseDto,
      anticipacionValor: 15,
      anticipacionUnidad: 'DIAS',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().anticipacionValor).toBe(15);
    expect(planRepo.guardar).toHaveBeenCalledWith(result.getValue());
  });

  it('un COLABORADOR con LECTURA sobre Preventivo también puede ser responsable', async () => {
    const { useCase, planRepo } = buildUseCase();

    const result = await useCase.execute({
      ...baseDto,
      responsableId: USUARIOS_PREVENTIVO.COLABORADOR_PREVENTIVO.id,
    });

    expect(result.isOk()).toBe(true);
    expect(planRepo.guardar).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'un USUARIO con LECTURA sobre Preventivo (no es técnico)',
      USUARIOS_PREVENTIVO.USUARIO_PREVENTIVO.id,
    ],
    ['un técnico de otro tipo', USUARIOS_PREVENTIVO.TECNICO_SOPORTE.id],
    ['un técnico sin permisos por tipo', USUARIOS_PREVENTIVO.TECNICO_SIN_PERMISOS.id],
    ['un id que no es de nadie', 'desconocido-uuid'],
  ])(
    'responsable no elegible (%s) → ResponsableNoElegibleError, sin persistir',
    async (_caso, responsableId) => {
      const { useCase, planRepo, txRunner } = buildUseCase();

      const result = await useCase.execute({ ...baseDto, responsableId });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResponsableNoElegibleError);
      expect(txRunner.run).not.toHaveBeenCalled();
      expect(planRepo.guardar).not.toHaveBeenCalled();
    },
  );

  // ─── Tipo del plan (odd/preventivo-por-tipo, S2, S4, S5) ────────────────

  it('S2: el plan guarda el tipo elegido, también uno que no es Preventivo', async () => {
    const { useCase, planRepo } = buildUseCase();

    const result = await useCase.execute({
      ...baseDto,
      tipoId: TIPO_SOPORTE_ID,
      responsableId: USUARIOS_PREVENTIVO.TECNICO_SOPORTE.id,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().tipoId).toBe(TIPO_SOPORTE_ID);
    expect(planRepo.guardar).toHaveBeenCalledWith(result.getValue());
  });

  it.each([
    ['dado de baja', TIPO_DADO_DE_BAJA_ID],
    ['inexistente', 'tipo-inexistente'],
  ])(
    'tipo %s → TipoTicketNoEncontradoError, como el alta de un ticket, sin persistir',
    async (_caso, tipoId) => {
      const { useCase, planRepo, txRunner } = buildUseCase();

      const result = await useCase.execute({
        ...baseDto,
        tipoId,
        alcance: alcanceSinRestriccion('admin-1'),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
      expect(txRunner.run).not.toHaveBeenCalled();
      expect(planRepo.guardar).not.toHaveBeenCalled();
    },
  );

  it('S4: un tipo sin LECTURA para el actor (aunque tenga ALTAS) → 403 que nombra LECTURA, sin persistir', async () => {
    const { useCase, planRepo } = buildUseCase();
    const actor = alcancePorTipo('actor-1', {
      [TIPO_PREVENTIVO_ID]: ['ALTAS', 'MODIFICACION'],
      [TIPO_SOPORTE_ID]: ['LECTURA'],
    });

    const result = await useCase.execute({ ...baseDto, alcance: actor });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AccionSobreTipoDelPlanNoPermitidaError);
    expect(result.getError().message).toBe(
      'El usuario no tiene el permiso "LECTURA" sobre el tipo de ticket elegido para el plan.',
    );
    expect(planRepo.guardar).not.toHaveBeenCalled();
  });

  it('S4: ADMINISTRADOR (sin restricción por tipo) crea con cualquier tipo vigente', async () => {
    const { useCase, planRepo } = buildUseCase();

    const result = await useCase.execute({
      ...baseDto,
      tipoId: TIPO_SOPORTE_ID,
      responsableId: USUARIOS_PREVENTIVO.TECNICO_SOPORTE.id,
      alcance: alcanceSinRestriccion('admin-1'),
    });

    expect(result.isOk()).toBe(true);
    expect(planRepo.guardar).toHaveBeenCalledTimes(1);
  });

  it('S5: el responsable se valida contra el tipo elegido, no contra Preventivo', async () => {
    const { useCase, planRepo } = buildUseCase();

    const result = await useCase.execute({
      ...baseDto,
      tipoId: TIPO_SOPORTE_ID,
      responsableId: USUARIOS_PREVENTIVO.TECNICO_PREVENTIVO.id,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ResponsableNoElegibleError);
    expect(result.getError().message).toBe(
      'El responsable debe ser un técnico o colaborador habilitado para el tipo de ticket del plan.',
    );
    expect(planRepo.guardar).not.toHaveBeenCalled();
  });
});
