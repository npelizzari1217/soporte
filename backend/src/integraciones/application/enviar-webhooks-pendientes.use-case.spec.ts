/**
 * Barrido de envío de webhooks (odd/webhooks, T5): la pausa no consume intentos (CA6), un 2xx
 * entrega, un no-2xx reprograma, el último intento deja FALLIDA (D1), un destino no público es un
 * fallo (CA8), la firma cubre el cuerpo exacto enviado (CA7), un secreto que no descifra no envía
 * nada, y la purga corre siempre (CA9). JD-3 (T10): un destino muerto (timeout, error de conexión,
 * DNS colgado o rechazado) corta el lote de ese barrido, y la resolución DNS tiene plazo.
 */
import type { LookupAddress } from 'node:dns';
import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { Result } from '../../shared/domain/result';
import { SolicitudWebhook, RespuestaWebhook } from '../domain/cliente-http-webhook.port';
import { firmarWebhook } from '../domain/firma-webhook';
import {
  DestinoWebhookIrresolubleError,
  DestinoWebhookNoPublicoError,
  SecretoWebhookIndescifrableError,
} from '../domain/integraciones.errors';
import { WebhookDestino } from '../domain/webhook-destino';
import { FalloEntrega, WebhookEntrega } from '../domain/webhook-entrega';
import {
  EnviarWebhooksPendientesUseCase,
  LOTE_ENVIO_WEBHOOK,
  ResolverDestino,
  RETENCION_ENTREGAS_WEBHOOK_MS,
  TIMEOUT_DNS_WEBHOOK_MS,
  TIMEOUT_ENVIO_WEBHOOK_MS,
} from './enviar-webhooks-pendientes.use-case';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const SECRETO = 'whsec_secreto-de-prueba';
const AHORA = new Date('2026-10-13T12:00:00.000Z');
const PUBLICA: LookupAddress = { address: '93.184.215.14', family: 4 };

function cliente(apiHabilitada: boolean): ClienteEntity {
  return ClienteEntity.create(
    {
      nombre: 'Cliente A',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_a',
      activo: true,
      apiHabilitada,
    },
    CLIENTE_ID,
  );
}

function destino(cambios: Partial<WebhookDestino> = {}): WebhookDestino {
  return {
    clienteId: CLIENTE_ID,
    url: 'https://erp.example.com/webhooks?origen=soporte',
    eventos: ['TICKET_CREADO'],
    secretoCifrado: 'v1:iv:tag:ct',
    activo: true,
    createdAt: AHORA,
    updatedAt: AHORA,
    ...cambios,
  };
}

function entrega(cambios: Partial<WebhookEntrega> = {}): WebhookEntrega {
  return {
    id: 'entrega-1',
    evento: 'TICKET_CREADO',
    ticketId: 'ticket-1',
    payload: { evento: 'ticket.creado', ticket: { id: 'ticket-1', numero: 'SOP-1' } },
    estado: 'PENDIENTE',
    intentos: 0,
    proximoIntentoAt: AHORA,
    ultimoCodigo: null,
    ultimoError: null,
    createdAt: AHORA,
    entregadaAt: null,
    updatedAt: AHORA,
    ...cambios,
  };
}

interface Escenario {
  apiHabilitada?: boolean;
  destino?: WebhookDestino | null;
  secretoRoto?: boolean;
  vencidas?: WebhookEntrega[];
  respuesta?: RespuestaWebhook;
  /** Una respuesta por envío, en orden; pisa a `respuesta`. */
  respuestas?: RespuestaWebhook[];
  resolver?: ResolverDestino;
}

function armar(escenario: Escenario = {}) {
  const entregadas: Array<{ id: string; codigo: number }> = [];
  const fallos: Array<{ id: string; fallo: FalloEntrega }> = [];
  const purgas: Date[] = [];
  const tomas: Array<{ ahora: Date; limite: number }> = [];
  const enviadas: SolicitudWebhook[] = [];
  const errores: string[] = [];
  const registros: string[] = [];

  const useCase = new EnviarWebhooksPendientesUseCase(
    { findById: async () => cliente(escenario.apiHabilitada ?? true) },
    {
      buscarPorCliente: async () =>
        escenario.destino === undefined ? destino() : escenario.destino,
    },
    {
      descifrar: () =>
        escenario.secretoRoto
          ? Result.fail(new SecretoWebhookIndescifrableError())
          : Result.ok(SECRETO),
    },
    {
      tomarVencidas: async (ahora, limite) => {
        tomas.push({ ahora, limite });
        return escenario.vencidas ?? [entrega()];
      },
      marcarEntregada: async (id, codigo) => {
        entregadas.push({ id, codigo });
        return true;
      },
      registrarFallo: async (id, fallo) => {
        fallos.push({ id, fallo });
        return true;
      },
      purgarAnterioresA: async (fecha) => {
        purgas.push(fecha);
        return 3;
      },
    },
    {
      enviar: async (solicitud) => {
        enviadas.push(solicitud);
        return (
          escenario.respuestas?.[enviadas.length - 1] ?? escenario.respuesta ?? { status: 204 }
        );
      },
    },
    { error: (mensaje) => errores.push(mensaje), log: (mensaje) => registros.push(mensaje) },
    escenario.resolver ?? (async () => Result.ok([PUBLICA])),
    () => AHORA,
  );
  return { useCase, entregadas, fallos, purgas, tomas, enviadas, errores, registros };
}

describe('EnviarWebhooksPendientesUseCase (odd/webhooks T5)', () => {
  describe('pausa (CA6): no envía ni consume intentos', () => {
    it.each([
      ['API deshabilitada', { apiHabilitada: false }, 'API_DESHABILITADA'],
      ['sin destino', { destino: null }, 'SIN_DESTINO'],
      ['destino inactivo', { destino: destino({ activo: false }) }, 'DESTINO_INACTIVO'],
    ] as const)('%s', async (_caso, escenario, motivo) => {
      const { useCase, enviadas, entregadas, fallos, tomas } = armar(escenario);

      const resultado = await useCase.ejecutar(CLIENTE_ID);

      expect(resultado).toEqual({ purgadas: 3, pausado: motivo });
      expect(tomas).toEqual([]);
      expect(enviadas).toEqual([]);
      expect(entregadas).toEqual([]);
      expect(fallos).toEqual([]);
    });

    it('un secreto que no descifra no envía nada y lo registra sin el secreto', async () => {
      const { useCase, enviadas, fallos, tomas, errores } = armar({ secretoRoto: true });

      const resultado = await useCase.ejecutar(CLIENTE_ID);

      expect(resultado).toEqual({ purgadas: 3, pausado: 'SECRETO_INDESCIFRABLE' });
      expect(tomas).toEqual([]);
      expect(enviadas).toEqual([]);
      expect(fallos).toEqual([]);
      expect(errores).toHaveLength(1);
      expect(errores[0]).toContain(CLIENTE_ID);
      expect(errores[0]).not.toContain('v1:iv:tag:ct');
    });
  });

  it('purga las entregas de más de 30 días aunque el envío esté pausado (CA9)', async () => {
    const { useCase, purgas } = armar({ apiHabilitada: false });

    await useCase.ejecutar(CLIENTE_ID);

    expect(purgas).toEqual([new Date(AHORA.getTime() - RETENCION_ENTREGAS_WEBHOOK_MS)]);
  });

  it('toma un lote acotado de vencidas a la fecha del barrido', async () => {
    const { useCase, tomas } = armar();

    await useCase.ejecutar(CLIENTE_ID);

    expect(tomas).toEqual([{ ahora: AHORA, limite: LOTE_ENVIO_WEBHOOK }]);
  });

  it('un 2xx marca la entrega ENTREGADA con el código', async () => {
    const { useCase, entregadas, fallos } = armar({ respuesta: { status: 202 } });

    const resultado = await useCase.ejecutar(CLIENTE_ID);

    expect(resultado).toEqual({ purgadas: 3, entregadas: 1, fallos: 0 });
    expect(entregadas).toEqual([{ id: 'entrega-1', codigo: 202 }]);
    expect(fallos).toEqual([]);
  });

  it.each([
    ['un 500', { status: 500 }, 500, 'HTTP 500'],
    ['un 302, que no se sigue', { status: 302 }, 302, 'HTTP 302'],
    ['un timeout', { error: 'timeout' }, null, 'timeout'],
  ] as const)('%s reprograma el próximo intento', async (_caso, respuesta, codigo, error) => {
    const { useCase, entregadas, fallos } = armar({
      vencidas: [entrega({ intentos: 2 })],
      respuesta,
    });

    const resultado = await useCase.ejecutar(CLIENTE_ID);

    expect(resultado).toEqual({ purgadas: 3, entregadas: 0, fallos: 1 });
    expect(entregadas).toEqual([]);
    // Tercer intento fallido: la espera es la tercera de la agenda (15 min).
    expect(fallos).toEqual([
      {
        id: 'entrega-1',
        fallo: { codigo, error, proximoIntentoAt: new Date(AHORA.getTime() + 15 * 60_000) },
      },
    ]);
  });

  it('el último intento fallido deja la entrega FALLIDA (D1)', async () => {
    const { useCase, fallos } = armar({
      vencidas: [entrega({ intentos: 9 })],
      respuesta: { status: 503 },
    });

    await useCase.ejecutar(CLIENTE_ID);

    expect(fallos).toEqual([
      { id: 'entrega-1', fallo: { codigo: 503, error: 'HTTP 503', proximoIntentoAt: null } },
    ]);
  });

  it('un destino que resuelve a una IP no pública cuenta como fallo y no se envía (CA8)', async () => {
    const { useCase, enviadas, fallos } = armar({
      resolver: async () => Result.fail(new DestinoWebhookNoPublicoError()),
    });

    await useCase.ejecutar(CLIENTE_ID);

    expect(enviadas).toEqual([]);
    expect(fallos).toEqual([
      {
        id: 'entrega-1',
        fallo: {
          codigo: null,
          error: new DestinoWebhookNoPublicoError().message,
          proximoIntentoAt: new Date(AHORA.getTime() + 60_000),
        },
      },
    ]);
  });

  it('una URL guardada que ya no es válida cuenta como fallo y no se envía', async () => {
    const { useCase, enviadas, fallos } = armar({
      destino: destino({ url: 'http://erp.example.com/webhooks' }),
    });

    await useCase.ejecutar(CLIENTE_ID);

    expect(enviadas).toEqual([]);
    expect(fallos[0].fallo.error).toContain('HTTPS');
  });

  it('envía a la URL actual, a las direcciones validadas, con la firma del cuerpo exacto (CA7)', async () => {
    const resolver: ResolverDestino = async (hostname) =>
      hostname === 'erp.example.com'
        ? Result.ok([PUBLICA])
        : Result.fail(new DestinoWebhookNoPublicoError());
    const { useCase, enviadas } = armar({ resolver });

    await useCase.ejecutar(CLIENTE_ID);

    expect(enviadas).toHaveLength(1);
    const [solicitud] = enviadas;
    const timestamp = Math.floor(AHORA.getTime() / 1000);
    expect(solicitud.url.href).toBe('https://erp.example.com/webhooks?origen=soporte');
    expect(solicitud.direcciones).toEqual([PUBLICA]);
    expect(solicitud.timeoutMs).toBe(TIMEOUT_ENVIO_WEBHOOK_MS);
    expect(solicitud.body).toBe(JSON.stringify(entrega().payload));
    expect(solicitud.headers).toEqual({
      'Content-Type': 'application/json',
      'User-Agent': 'Soporte-Webhooks/1',
      'X-Soporte-Firma': firmarWebhook(SECRETO, timestamp, solicitud.body),
      'X-Soporte-Timestamp': String(timestamp),
      'X-Soporte-Evento': 'ticket.creado',
      'X-Soporte-Entrega': 'entrega-1',
    });
  });

  it('procesa el lote en orden y cuenta entregadas y fallos: un no-2xx no corta el lote', async () => {
    const { useCase, enviadas, entregadas, fallos, registros } = armar({
      vencidas: [entrega({ id: 'a' }), entrega({ id: 'b' }), entrega({ id: 'c' })],
      respuestas: [{ status: 200 }, { status: 500 }, { status: 201 }],
    });

    const resultado = await useCase.ejecutar(CLIENTE_ID);

    expect(resultado).toEqual({ purgadas: 3, entregadas: 2, fallos: 1 });
    expect(enviadas.map((s) => s.headers['X-Soporte-Entrega'])).toEqual(['a', 'b', 'c']);
    expect(entregadas.map((e) => e.id)).toEqual(['a', 'c']);
    expect(fallos.map((f) => f.id)).toEqual(['b']);
    expect(registros).toEqual([]);
  });

  describe('JD-3: un destino muerto corta el lote de ese barrido', () => {
    const lote = () => [entrega({ id: 'a' }), entrega({ id: 'b' }), entrega({ id: 'c' })];

    it.each([
      ['un timeout', { error: 'timeout' }],
      ['un error de conexión', { error: 'error de conexión (ECONNREFUSED)' }],
    ] as const)(
      '%s registra el fallo y deja el resto PENDIENTE sin tocar',
      async (_caso, respuesta) => {
        const { useCase, enviadas, entregadas, fallos, registros } = armar({
          vencidas: lote(),
          respuestas: [respuesta, { status: 200 }, { status: 200 }],
        });

        const resultado = await useCase.ejecutar(CLIENTE_ID);

        expect(enviadas.map((s) => s.headers['X-Soporte-Entrega'])).toEqual(['a']);
        expect(entregadas).toEqual([]);
        expect(fallos).toEqual([
          {
            id: 'a',
            fallo: {
              codigo: null,
              error: respuesta.error,
              proximoIntentoAt: new Date(AHORA.getTime() + 60_000),
            },
          },
        ]);
        expect(resultado).toEqual({
          purgadas: 3,
          entregadas: 0,
          fallos: 1,
          cortado: { motivo: respuesta.error, restantes: 2 },
        });
        expect(registros).toEqual([
          `WEBHOOK_SWEEP_CORTE | cliente=${CLIENTE_ID} | motivo=${respuesta.error} | restantes=2`,
        ]);
      },
    );

    it.each([
      ['no pública', new DestinoWebhookNoPublicoError()],
      ['que no resuelve', new DestinoWebhookIrresolubleError()],
    ])('un destino rechazado al resolver (%s) también corta el lote', async (_caso, error) => {
      const { useCase, enviadas, fallos, registros } = armar({
        vencidas: lote(),
        resolver: async () => Result.fail(error),
      });

      const resultado = await useCase.ejecutar(CLIENTE_ID);

      expect(enviadas).toEqual([]);
      expect(fallos.map((f) => f.id)).toEqual(['a']);
      expect(resultado).toMatchObject({ fallos: 1, cortado: { restantes: 2 } });
      expect(registros).toHaveLength(1);
    });

    it('un corte después de entregas exitosas conserva lo entregado', async () => {
      const { useCase, entregadas, fallos } = armar({
        vencidas: lote(),
        respuestas: [{ status: 204 }, { error: 'timeout' }, { status: 204 }],
      });

      const resultado = await useCase.ejecutar(CLIENTE_ID);

      expect(entregadas.map((e) => e.id)).toEqual(['a']);
      expect(fallos.map((f) => f.id)).toEqual(['b']);
      expect(resultado).toEqual({
        purgadas: 3,
        entregadas: 1,
        fallos: 1,
        cortado: { motivo: 'timeout', restantes: 1 },
      });
    });
  });

  describe('JD-3: la resolución DNS tiene plazo', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('el plazo es de 5 s', () => {
      expect(TIMEOUT_DNS_WEBHOOK_MS).toBe(5_000);
    });

    it('un DNS colgado cuenta como fallo al vencer el plazo y corta el lote', async () => {
      vi.useFakeTimers();
      const { useCase, enviadas, fallos, registros } = armar({
        vencidas: [entrega({ id: 'a' }), entrega({ id: 'b' })],
        resolver: () => new Promise(() => undefined),
      });

      const ejecucion = useCase.ejecutar(CLIENTE_ID);
      await vi.advanceTimersByTimeAsync(5_000);
      const resultado = await ejecucion;

      expect(enviadas).toEqual([]);
      expect(fallos).toEqual([
        {
          id: 'a',
          fallo: {
            codigo: null,
            error: 'timeout DNS',
            proximoIntentoAt: new Date(AHORA.getTime() + 60_000),
          },
        },
      ]);
      expect(resultado).toMatchObject({ cortado: { motivo: 'timeout DNS', restantes: 1 } });
      expect(registros).toHaveLength(1);
    });

    it('una resolución a tiempo no deja el temporizador pendiente', async () => {
      vi.useFakeTimers();
      const { useCase, entregadas } = armar();

      await useCase.ejecutar(CLIENTE_ID);

      expect(entregadas).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
