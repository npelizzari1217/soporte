/**
 * consolidar-reloj-sla.use-case.spec.ts — WU-3b (sla-reloj-activo R4, R7): orden de lecturas, reintento
 * del CAS, conflicto que deja pendiente, idempotencia y camino de previos.
 */
import { CalcularSlaHabilVenceService } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { RelojSlaFila } from '../../domain/entities/reloj-sla';
import { H, L, calendarioSemanal, fila, op } from '../../domain/entities/reloj-sla.fixtures';
import { ConsolidarRelojSlaUseCase } from './consolidar-reloj-sla.use-case';

function armar(filaInicial: RelojSlaFila | null, cas: boolean[] = [true]) {
  const llamadas: string[] = [];
  const repo = {
    leer: vi.fn(async () => (llamadas.push('leer'), filaInicial)),
    historialSinSecuencia: vi.fn(async () => (llamadas.push('historial'), [])),
    transicionesDesde: vi.fn(
      async () => (
        llamadas.push('transiciones'),
        [op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 12))]
      ),
    ),
    guardarSiVersion: vi.fn(async () => (llamadas.push('guardar'), cas.shift() ?? false)),
    limpiarMetaPendiente: vi.fn(),
    findPendientes: vi.fn(),
    findMetaPendiente: vi.fn(),
  };
  const calendarioRepo = {
    obtener: vi.fn(async () => (llamadas.push('calendario'), calendarioSemanal)),
  };
  const feriadosRepo = {
    obtener: vi.fn(async () => (llamadas.push('feriados'), new Set<string>())),
  };
  const logger = { error: vi.fn() };
  const uc = new ConsolidarRelojSlaUseCase(
    repo,
    new CalcularSlaHabilVenceService(),
    calendarioRepo,
    feriadosRepo,
    logger,
  );
  return { uc, repo, logger, llamadas };
}

describe('ConsolidarRelojSlaUseCase', () => {
  it('carga el calendario y los feriados antes de leer', async () => {
    const { uc, llamadas } = armar(fila({ estadoCodigo: 'ESPERANDO_CLIENTE' }));

    expect(await uc.execute('t1')).toBe('consolidado');
    expect(llamadas.indexOf('leer')).toBeGreaterThan(llamadas.indexOf('calendario'));
    expect(llamadas.indexOf('leer')).toBeGreaterThan(llamadas.indexOf('feriados'));
  });

  it('guarda con la versión leída y el reloj plegado', async () => {
    const { uc, repo } = armar(fila({ estadoCodigo: 'ESPERANDO_CLIENTE', version: 4 }));

    await uc.execute('t1');

    expect(repo.guardarSiVersion).toHaveBeenCalledWith(
      't1',
      4,
      expect.objectContaining({ acumuladoS: 3 * H, correDesde: null }),
    );
  });

  it('reintenta una vez el CAS y consolida si el segundo intento entra', async () => {
    const { uc, repo, logger } = armar(fila({ estadoCodigo: 'ESPERANDO_CLIENTE' }), [false, true]);

    expect(await uc.execute('t1')).toBe('consolidado');
    expect(repo.guardarSiVersion).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('si el CAS vuelve a fallar deja el ticket pendiente y registra SLA_RELOJ_CONFLICTO', async () => {
    const { uc, repo, logger } = armar(fila({ estadoCodigo: 'ESPERANDO_CLIENTE' }), [false, false]);

    expect(await uc.execute('t1')).toBe('conflicto');
    expect(repo.guardarSiVersion).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SLA_RELOJ_CONFLICTO'));
  });

  it('lee el historial sin secuencia solo cuando acumuladoS es null (ticket previo)', async () => {
    const nuevo = armar(fila({ estadoCodigo: 'ESPERANDO_CLIENTE' }));
    await nuevo.uc.execute('t1');
    expect(nuevo.repo.historialSinSecuencia).not.toHaveBeenCalled();

    const previo = armar(
      fila({ estadoCodigo: 'ESPERANDO_CLIENTE', acumuladoS: null, correDesde: null }),
    );
    await previo.uc.execute('t1');
    expect(previo.repo.historialSinSecuencia).toHaveBeenCalledTimes(1);
  });

  it('un ticket inexistente no escribe', async () => {
    const { uc, repo } = armar(null);

    expect(await uc.execute('t1')).toBe('sin_ticket');
    expect(repo.guardarSiVersion).not.toHaveBeenCalled();
  });
});
