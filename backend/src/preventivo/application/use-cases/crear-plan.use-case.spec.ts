import { CrearPlanUseCase } from './crear-plan.use-case';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import {
  ObjetivoInvalidoError,
  ResponsableNoElegibleError,
} from '../../domain/errors/preventivo.errors';
import {
  USUARIOS_PREVENTIVO,
  responsablesDePrueba,
} from '../../test-helpers/responsables-plan-en-memoria';

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
      useCase: new CrearPlanUseCase(planRepo, txRunner, responsablesDePrueba().responsables),
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
    responsableId: USUARIOS_PREVENTIVO.TECNICO_PREVENTIVO.id,
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
});
