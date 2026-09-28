/**
 * [UNIT] `ObtenerHorarioLaboralUseCase` (sdd/horario-laboral-por-cliente,
 * WU-5, tarea 5.4). Repositorio mockeado — sin DB.
 */
import { ObtenerHorarioLaboralUseCase } from './obtener-horario-laboral.use-case';
import { CalendarioLaboralSemanal } from '../../domain/services/calcular-sla-habil-vence.service';

const HORARIO_DEFAULT: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: null, cierreMinuto: null },
];

describe('ObtenerHorarioLaboralUseCase', () => {
  it('devuelve Result.ok con el horario que retorna el repositorio', async () => {
    const repo = { obtener: vi.fn().mockResolvedValue(HORARIO_DEFAULT) };
    const useCase = new ObtenerHorarioLaboralUseCase(repo);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(HORARIO_DEFAULT);
    expect(repo.obtener).toHaveBeenCalledTimes(1);
  });

  it('propaga (sin capturar) un rechazo del repositorio — ej. CalendarioLaboralSinTenantContextError', async () => {
    const error = new Error('sin TenantContext');
    const repo = { obtener: vi.fn().mockRejectedValue(error) };
    const useCase = new ObtenerHorarioLaboralUseCase(repo);

    await expect(useCase.execute()).rejects.toThrow(error);
  });
});
