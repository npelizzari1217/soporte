/**
 * [UNIT] Conteo de saturaciones y disparo del aviso (odd/saturacion-conexiones, S3): 5 en una
 * ventana de 10 minutos disparan un aviso, con un máximo de uno por hora.
 */
import { MonitorSaturacion, ResumenSaturacion } from './monitor-saturacion';

const INICIO = new Date('2026-11-09T12:00:00.000Z');
const minutos = (n: number): number => n * 60_000;

function crearMonitor() {
  let ahora = INICIO.getTime();
  const avisos: ResumenSaturacion[] = [];
  const monitor = new MonitorSaturacion({ error: vi.fn() }, () => new Date(ahora));
  monitor.suscribir((resumen) => {
    avisos.push(resumen);
  });
  return {
    monitor,
    avisos,
    avanzar: (ms: number): void => {
      ahora += ms;
    },
  };
}

describe('MonitorSaturacion', () => {
  it('4 saturaciones en 10 minutos no avisan; la 5.ª sí, con el detalle por origen', () => {
    const { monitor, avisos, avanzar } = crearMonitor();
    for (const origen of ['pool', 'pool', 'servidor', 'transaccion'] as const) {
      monitor.registrar(origen);
      avanzar(minutos(1));
    }
    expect(avisos).toEqual([]);

    monitor.registrar('pool');

    expect(avisos).toEqual([
      {
        eventos: 5,
        desde: INICIO,
        hasta: new Date(INICIO.getTime() + minutos(4)),
        porOrigen: { servidor: 1, pool: 3, transaccion: 1 },
      },
    ]);
  });

  it('las saturaciones de hace más de 10 minutos no cuentan para el umbral', () => {
    const { monitor, avisos, avanzar } = crearMonitor();
    for (let i = 0; i < 4; i++) monitor.registrar('pool');
    avanzar(minutos(11));

    monitor.registrar('pool');

    expect(avisos).toEqual([]);
  });

  it('después de avisar, no vuelve a avisar en la misma hora aunque siga saturado', () => {
    const { monitor, avisos, avanzar } = crearMonitor();
    for (let i = 0; i < 5; i++) monitor.registrar('pool');
    expect(avisos).toHaveLength(1);

    avanzar(minutos(30));
    for (let i = 0; i < 10; i++) monitor.registrar('pool');
    expect(avisos).toHaveLength(1);

    avanzar(minutos(31));
    for (let i = 0; i < 5; i++) monitor.registrar('pool');
    expect(avisos).toHaveLength(2);
  });

  it('si el aviso no se pudo entregar, no consume la hora de espera: el próximo episodio vuelve a avisar', async () => {
    let ahora = INICIO.getTime();
    const monitor = new MonitorSaturacion({ error: vi.fn() }, () => new Date(ahora));
    const intentos: number[] = [];
    let entregar = false;
    monitor.suscribir(async (resumen) => {
      intentos.push(resumen.eventos);
      return entregar;
    });

    for (let i = 0; i < 5; i++) monitor.registrar('pool');
    await new Promise((resolver) => setImmediate(resolver));
    expect(intentos).toEqual([5]);

    // No reintenta en cada evento (sumaría carga en plena saturación): espera 5 minutos.
    entregar = true;
    ahora += minutos(1);
    monitor.registrar('pool');
    await new Promise((resolver) => setImmediate(resolver));
    expect(intentos).toEqual([5]);

    ahora += minutos(4);
    monitor.registrar('pool');
    await new Promise((resolver) => setImmediate(resolver));
    expect(intentos).toEqual([5, 7]);

    // Entregado: ahora sí corre la hora completa.
    ahora += minutos(5);
    for (let i = 0; i < 5; i++) monitor.registrar('pool');
    await new Promise((resolver) => setImmediate(resolver));
    expect(intentos).toEqual([5, 7]);
  });

  it('un suscriptor que no informa entrega (void) consume la hora de espera, como hasta ahora', async () => {
    const { monitor, avisos, avanzar } = crearMonitor();
    for (let i = 0; i < 5; i++) monitor.registrar('pool');
    await new Promise((resolver) => setImmediate(resolver));
    avanzar(minutos(1));
    monitor.registrar('pool');
    await new Promise((resolver) => setImmediate(resolver));

    expect(avisos).toHaveLength(1);
  });

  it('bajo una avalancha, guarda como máximo 10.000 eventos y sigue respondiendo rápido', () => {
    const { monitor } = crearMonitor();
    const inicio = performance.now();

    for (let i = 0; i < 50_000; i++) monitor.registrar('servidor');

    expect(monitor.estado().eventosRecientes).toBe(10_000);
    expect(performance.now() - inicio).toBeLessThan(1_000);
  });

  it('el estado informa el último aviso y las saturaciones de los últimos 10 minutos', () => {
    const { monitor, avanzar } = crearMonitor();
    expect(monitor.estado()).toEqual({ eventosRecientes: 0, ultimoAviso: null });

    for (let i = 0; i < 5; i++) monitor.registrar('servidor');
    avanzar(minutos(2));
    monitor.registrar('pool');

    expect(monitor.estado()).toEqual({
      eventosRecientes: 6,
      ultimoAviso: {
        avisadoEn: INICIO,
        eventos: 5,
        desde: INICIO,
        hasta: INICIO,
        porOrigen: { servidor: 5, pool: 0, transaccion: 0 },
      },
    });
  });

  it('un suscriptor que falla no impide avisar a los demás, no lanza y deja la falla en el log', async () => {
    const logger = { error: vi.fn() };
    const monitor = new MonitorSaturacion(logger, () => INICIO);
    const recibidos: number[] = [];
    monitor.suscribir(() => Promise.reject(new Error('smtp caído')));
    monitor.suscribir(() => {
      throw new Error('falla sincrónica');
    });
    monitor.suscribir((resumen) => {
      recibidos.push(resumen.eventos);
    });

    expect(() => {
      for (let i = 0; i < 5; i++) monitor.registrar('pool');
    }).not.toThrow();
    await new Promise((resolver) => setImmediate(resolver));

    expect(recibidos).toEqual([5]);
    expect(logger.error).toHaveBeenCalledWith(
      'ALERTA_SATURACION_SUSCRIPTOR_FALLO | error=smtp caído',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'ALERTA_SATURACION_SUSCRIPTOR_FALLO | error=falla sincrónica',
    );
  });
});
