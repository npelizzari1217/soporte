import { ListarPlanesUseCase } from './listar-planes.use-case';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';

describe('ListarPlanesUseCase (4.2)', () => {
  it('devuelve los planes que retorna el repositorio', async () => {
    const plan = PlanPreventivoEntity.create(
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
    const planRepo = { listar: vi.fn().mockResolvedValue([plan]) };
    const useCase = new ListarPlanesUseCase(planRepo);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([plan]);
  });
});
