import { ListarPlanesUseCase } from './listar-planes.use-case';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';

function makePlan(id: string, tipoId: string): PlanPreventivoEntity {
  return PlanPreventivoEntity.create(
    {
      titulo: `Plan ${id}`,
      instrucciones: null,
      equipoId: 'equipo-uuid',
      ubicacion: null,
      prioridadId: 'prioridad-uuid',
      tipoId,
      responsableId: 'responsable-uuid',
      intervaloValor: 1,
      intervaloUnidad: 'MESES',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-01'),
      activo: true,
    },
    id,
  ).getValue();
}

describe('ListarPlanesUseCase (4.2, odd/preventivo-por-tipo S1)', () => {
  // Un plan por tipo: el fixture contiene los planes que NO tienen que aparecer.
  const planes = [
    makePlan('plan-preventivo', 'tipo-preventivo'),
    makePlan('plan-soporte', 'tipo-soporte'),
    makePlan('plan-edilicia', 'tipo-edilicia'),
  ];

  function buildUseCase() {
    // Doble que filtra como el repositorio real (`tipo_id IN (...)`, o todos con `null`).
    const listar = vi.fn<IPlanPreventivoRepository['listar']>(async (tipoIds) =>
      planes.filter((plan) => tipoIds === null || tipoIds.includes(plan.tipoId)),
    );
    return { useCase: new ListarPlanesUseCase({ listar }), listar };
  }

  it('S1: trae solo los planes de los tipos con LECTURA para el actor', async () => {
    const { useCase } = buildUseCase();
    const alcance = alcancePorTipo('actor-1', {
      'tipo-preventivo': ['LECTURA'],
      'tipo-soporte': ['LECTURA', 'ALTAS'],
      // ALTAS sin LECTURA no hace visible el tipo.
      'tipo-edilicia': ['ALTAS', 'MODIFICACION'],
    });

    const result = await useCase.execute({ alcance });

    expect(result.getValue().map((plan) => plan.id)).toEqual(['plan-preventivo', 'plan-soporte']);
  });

  it('ADMINISTRADOR (sin restricción por tipo) ve todos los planes', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ alcance: alcanceSinRestriccion('admin-1') });

    expect(result.getValue().map((plan) => plan.id)).toEqual([
      'plan-preventivo',
      'plan-soporte',
      'plan-edilicia',
    ]);
  });

  it('sin LECTURA sobre ningún tipo → lista vacía, sin consultar la base', async () => {
    const { useCase, listar } = buildUseCase();

    const result = await useCase.execute({
      alcance: alcancePorTipo('actor-1', { 'tipo-preventivo': ['ALTAS'] }),
    });

    expect(result.getValue()).toEqual([]);
    expect(listar).not.toHaveBeenCalled();
  });
});
