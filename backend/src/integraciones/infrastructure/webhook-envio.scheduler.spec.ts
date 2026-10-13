/**
 * Barrido de webhooks por inquilino (odd/webhooks, T5): bindea el `TenantContext` de cada
 * inquilino, aísla el fallo de uno y no arranca el barrido de un inquilino mientras el suyo anterior
 * sigue corriendo (nota (c) de T5: `tomarVencidas` no reserva filas). Desde JD-3 (T10) el candado
 * es por inquilino: uno colgado no demora a los demás.
 */
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { TenantActivo } from '../../shared/domain/ports/i-tenant-enumerator';
import { ResultadoEnvioWebhooks } from '../application/enviar-webhooks-pendientes.use-case';
import { WebhookEnvioScheduler } from './webhook-envio.scheduler';

const TENANTS: TenantActivo[] = [
  { clienteId: 'cliente-a', dbName: 'soporte_a' },
  { clienteId: 'cliente-b', dbName: 'soporte_b' },
];
const RESULTADO: ResultadoEnvioWebhooks = { purgadas: 0, entregadas: 0, fallos: 0 };

function armar(ejecutar: (clienteId: string) => Promise<ResultadoEnvioWebhooks>) {
  const tenantContext = new TenantContext();
  const errores: string[] = [];
  const vistos: Array<{ clienteId: string; contexto: string | undefined }> = [];
  let enumeraciones = 0;
  const scheduler = new WebhookEnvioScheduler(
    {
      listActiveTenants: async () => {
        enumeraciones += 1;
        return TENANTS;
      },
    },
    tenantContext,
    { getTenantClient: vi.fn().mockImplementation((dbName: string) => ({ __dbName: dbName })) },
    {
      ejecutar: async (clienteId) => {
        vistos.push({ clienteId, contexto: tenantContext.get()?.dbName });
        return ejecutar(clienteId);
      },
    },
    { error: (mensaje) => errores.push(mensaje) },
  );
  return { scheduler, errores, vistos, enumeraciones: () => enumeraciones };
}

describe('WebhookEnvioScheduler (odd/webhooks T5)', () => {
  it('corre el envío de cada inquilino dentro de su TenantContext', async () => {
    const { scheduler, vistos } = armar(async () => RESULTADO);

    await scheduler.ejecutarBarrido();

    expect(vistos).toEqual([
      { clienteId: 'cliente-a', contexto: 'soporte_a' },
      { clienteId: 'cliente-b', contexto: 'soporte_b' },
    ]);
  });

  it('un inquilino que falla no frena al resto y se registra sin el error crudo', async () => {
    const { scheduler, vistos, errores } = armar(async (clienteId) => {
      if (clienteId === 'cliente-a') throw new Error('se cayó la base');
      return RESULTADO;
    });

    await scheduler.ejecutarBarrido();

    expect(vistos.map((v) => v.clienteId)).toEqual(['cliente-a', 'cliente-b']);
    expect(errores).toEqual(['WEBHOOK_SWEEP_ERROR | tenant=soporte_a | error=se cayó la base']);
  });

  it('JD-3: un inquilino colgado no demora a los demás, ni en el mismo tick ni en el siguiente', async () => {
    const terminados: string[] = [];
    const { scheduler, vistos } = armar(async (clienteId) => {
      if (clienteId === 'cliente-a') return new Promise<ResultadoEnvioWebhooks>(() => undefined);
      terminados.push(clienteId);
      return RESULTADO;
    });

    void scheduler.ejecutarBarrido();
    await vi.waitFor(() => expect(terminados).toEqual(['cliente-b']), { timeout: 500 });

    void scheduler.ejecutarBarrido();
    await vi.waitFor(() => expect(terminados).toEqual(['cliente-b', 'cliente-b']), {
      timeout: 500,
    });
    // El de A sigue en curso: el segundo tick no lo arranca de nuevo.
    expect(vistos.map((v) => v.clienteId)).toEqual(['cliente-a', 'cliente-b', 'cliente-b']);
  });

  it('el candado es por inquilino: no arranca otro barrido del mismo mientras el suyo sigue, y lo libera al terminar', async () => {
    let liberar: () => void = () => undefined;
    const bloqueo = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const { scheduler, vistos } = armar(async (clienteId) => {
      if (clienteId === 'cliente-a') await bloqueo;
      return RESULTADO;
    });
    const corridasDe = (clienteId: string) =>
      vistos.filter((v) => v.clienteId === clienteId).length;

    const primero = scheduler.ejecutarBarrido();
    // Deja terminar el barrido de B (y liberar su candado); el de A sigue bloqueado.
    await new Promise((resolve) => setImmediate(resolve));
    await scheduler.ejecutarBarrido();
    expect(corridasDe('cliente-a')).toBe(1);
    expect(corridasDe('cliente-b')).toBe(2);

    liberar();
    await primero;
    await scheduler.ejecutarBarrido();
    expect(corridasDe('cliente-a')).toBe(2);
    expect(corridasDe('cliente-b')).toBe(3);
  });

  it('libera el candado de un inquilino cuyo barrido falla, aunque falle antes de empezar', async () => {
    const errores: string[] = [];
    let clientesPedidos = 0;
    const scheduler = new WebhookEnvioScheduler(
      { listActiveTenants: async () => [TENANTS[0]] },
      new TenantContext(),
      {
        getTenantClient: () => {
          clientesPedidos += 1;
          throw new Error('sin conexión');
        },
      },
      { ejecutar: async () => RESULTADO },
      { error: (mensaje) => errores.push(mensaje) },
    );

    await scheduler.ejecutarBarrido();
    await scheduler.ejecutarBarrido();

    expect(clientesPedidos).toBe(2);
    expect(errores).toEqual([
      'WEBHOOK_SWEEP_ERROR | tenant=soporte_a | error=sin conexión',
      'WEBHOOK_SWEEP_ERROR | tenant=soporte_a | error=sin conexión',
    ]);
  });

  it('libera el candado aunque la enumeración de inquilinos falle', async () => {
    const errores: string[] = [];
    let intentos = 0;
    const scheduler = new WebhookEnvioScheduler(
      {
        listActiveTenants: async () => {
          intentos += 1;
          throw new Error('master caída');
        },
      },
      new TenantContext(),
      { getTenantClient: vi.fn().mockImplementation((dbName: string) => ({ __dbName: dbName })) },
      { ejecutar: async () => RESULTADO },
      { error: (mensaje) => errores.push(mensaje) },
    );

    await scheduler.ejecutarBarrido();
    await scheduler.ejecutarBarrido();

    expect(intentos).toBe(2);
    expect(errores[0]).toBe(
      'WEBHOOK_SWEEP_ERROR | enumeración de tenants falló | error=master caída',
    );
  });
});
