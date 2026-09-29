/**
 * [UNIT] `GuardarHorarioLaboralUseCase` (sdd/horario-laboral-por-cliente,
 * WU-5, tareas 5.5/5.6). Puertos mockeados (`vi.fn`) — sin DB. La atomicidad
 * real (7 upsert secuenciales, rollback ante fallo a mitad de camino) se
 * cubre en `calendario-laboral.repositorios.integration.spec.ts` (5.7),
 * contra Postgres real.
 */
import { GuardarHorarioLaboralUseCase } from './guardar-horario-laboral.use-case';
import { HorarioLaboralSinDiasAbiertosError } from '../../domain/errors/horario-laboral.errors';
import { CalendarioLaboralSemanal } from '../../domain/services/calcular-sla-habil-vence.service';
import { DiaHorarioEntrada } from '../../domain/value-objects/horario-laboral-semanal';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';

const DIAS_VALIDOS: DiaHorarioEntrada[] = [
  { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
  { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
];

const DIAS_LOS_7_CERRADOS: DiaHorarioEntrada[] = DIAS_VALIDOS.map((dia) => ({
  ...dia,
  aperturaMinuto: null,
  cierreMinuto: null,
}));

const HORARIO_LEIDO_POST_COMMIT: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: null, cierreMinuto: null },
];

function makeCollaborators() {
  const lecturaRepo = { obtener: vi.fn().mockResolvedValue(HORARIO_LEIDO_POST_COMMIT) };
  const escrituraRepo = { reemplazar: vi.fn().mockResolvedValue(undefined) };
  // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
  // preserva la semántica "corre dentro de la tx" para los tests. `run` se
  // declara con su propio `<T>` (igual que el puerto real): `vi.fn()` no
  // preserva genéricos, así que el conteo de llamadas se lleva aparte, en
  // `runSpy`.
  const runSpy = vi.fn();
  const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
    run<T>(fn: () => Promise<T>): Promise<T> {
      runSpy();
      return fn();
    },
  };

  const useCase = new GuardarHorarioLaboralUseCase(lecturaRepo, escrituraRepo, txRunner);

  return { useCase, lecturaRepo, escrituraRepo, txRunner, runSpy };
}

describe('GuardarHorarioLaboralUseCase', () => {
  it('con un VO válido: reemplaza dentro de txRunner.run y devuelve el horario leído DESPUÉS del commit', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({ dias: DIAS_VALIDOS });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(HORARIO_LEIDO_POST_COMMIT);
    expect(c.runSpy).toHaveBeenCalledTimes(1);
    expect(c.escrituraRepo.reemplazar).toHaveBeenCalledTimes(1);
    // La lectura post-commit ocurre DESPUÉS de que resuelve txRunner.run —
    // no dentro de la transacción (D6).
    expect(c.lecturaRepo.obtener).toHaveBeenCalledTimes(1);
  });

  it('con un VO inválido (7 días cerrados): Result.fail y txRunner.run NO se llama', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({ dias: DIAS_LOS_7_CERRADOS });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(HorarioLaboralSinDiasAbiertosError);
    expect(c.runSpy).not.toHaveBeenCalled();
    expect(c.escrituraRepo.reemplazar).not.toHaveBeenCalled();
    expect(c.lecturaRepo.obtener).not.toHaveBeenCalled();
  });

  it('con un VO inválido (6 días, falta uno): Result.fail y txRunner.run NO se llama', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({ dias: DIAS_VALIDOS.slice(0, 6) });

    expect(result.isFail()).toBe(true);
    expect(c.runSpy).not.toHaveBeenCalled();
    expect(c.escrituraRepo.reemplazar).not.toHaveBeenCalled();
  });
});
