/**
 * Barrido de webhooks por inquilino (odd/webhooks, T5): bindea el `TenantContext` de cada
 * inquilino, aísla el fallo de uno y no arranca un barrido mientras el anterior sigue corriendo
 * (nota (c) de T5: `tomarVencidas` no reserva filas).
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

  it('no arranca un barrido mientras el anterior sigue corriendo, y libera el candado al terminar', async () => {
    let liberar: () => void = () => undefined;
    const bloqueo = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const { scheduler, enumeraciones } = armar(async () => {
      await bloqueo;
      return RESULTADO;
    });

    const primero = scheduler.ejecutarBarrido();
    await scheduler.ejecutarBarrido();
    expect(enumeraciones()).toBe(1);

    liberar();
    await primero;
    await scheduler.ejecutarBarrido();
    expect(enumeraciones()).toBe(2);
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
