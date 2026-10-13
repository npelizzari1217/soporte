/**
 * Consulta del destino, regeneración del secreto y registro de entregas (odd/webhooks, T6: CA4,
 * CA6 y CA7). Fakes en memoria.
 */
import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { DatosWebhookDestino, WebhookDestino } from '../domain/webhook-destino';
import { WebhookEntrega } from '../domain/webhook-entrega';
import { ConsultarWebhookDestinoUseCase } from './consultar-webhook-destino.use-case';
import { ListarEntregasWebhookUseCase } from './listar-entregas-webhook.use-case';
import { RegenerarSecretoWebhookUseCase } from './regenerar-secreto-webhook.use-case';

const CLIENTE_ID = '0190a000-0000-7000-8000-00000000000a';

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

const DESTINO: WebhookDestino = {
  clienteId: CLIENTE_ID,
  url: 'https://erp.example.com/webhooks',
  eventos: ['TICKET_CREADO'],
  secretoCifrado: 'v1:iv:tag:ct',
  activo: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
};

describe('ConsultarWebhookDestinoUseCase', () => {
  it('sin destino responde configurado: false con el resto en null', async () => {
    const useCase = new ConsultarWebhookDestinoUseCase({ buscarPorCliente: async () => null });

    expect(await useCase.execute(CLIENTE_ID)).toEqual({
      configurado: false,
      url: null,
      eventos: null,
      activo: null,
      creadoEn: null,
      actualizadoEn: null,
    });
  });

  it('con destino devuelve la configuración y nunca el secreto cifrado', async () => {
    const useCase = new ConsultarWebhookDestinoUseCase({ buscarPorCliente: async () => DESTINO });

    const vista = await useCase.execute(CLIENTE_ID);

    expect(vista).toEqual({
      configurado: true,
      url: 'https://erp.example.com/webhooks',
      eventos: ['TICKET_CREADO'],
      activo: true,
      creadoEn: DESTINO.createdAt,
      actualizadoEn: DESTINO.updatedAt,
    });
    expect(JSON.stringify(vista)).not.toContain(DESTINO.secretoCifrado);
  });
});

describe('RegenerarSecretoWebhookUseCase', () => {
  function armar(apiHabilitada: boolean, existente: WebhookDestino | null) {
    const guardados: DatosWebhookDestino[] = [];
    const useCase = new RegenerarSecretoWebhookUseCase(
      { findById: async () => cliente(apiHabilitada) },
      {
        buscarPorCliente: async () => existente,
        guardar: async (datos) => {
          guardados.push(datos);
          return { ...DESTINO, ...datos };
        },
      },
      { cifrar: (clienteId, secreto) => `cifrado:${clienteId}:${secreto}` },
    );
    return { useCase, guardados };
  }

  it('sin destino falla con WEBHOOK_DESTINO_NO_ENCONTRADO y no guarda nada', async () => {
    const { useCase, guardados } = armar(true, null);

    const result = await useCase.execute(CLIENTE_ID);

    expect(result.getError().code).toBe('WEBHOOK_DESTINO_NO_ENCONTRADO');
    expect(guardados).toHaveLength(0);
  });

  it('con la API deshabilitada falla con API_NO_HABILITADA', async () => {
    const { useCase, guardados } = armar(false, DESTINO);

    expect((await useCase.execute(CLIENTE_ID)).getError().code).toBe('API_NO_HABILITADA');
    expect(guardados).toHaveLength(0);
  });

  it('genera un secreto nuevo, lo guarda cifrado y lo devuelve en claro; conserva el resto', async () => {
    const { useCase, guardados } = armar(true, DESTINO);

    const { secreto } = (await useCase.execute(CLIENTE_ID)).getValue();

    expect(secreto).toMatch(/^whsec_/);
    expect(guardados).toEqual([
      {
        clienteId: CLIENTE_ID,
        url: DESTINO.url,
        eventos: DESTINO.eventos,
        activo: true,
        secretoCifrado: `cifrado:${CLIENTE_ID}:${secreto}`,
      },
    ]);
  });
});

describe('ListarEntregasWebhookUseCase', () => {
  function entrega(id: string, payload: Record<string, unknown>): WebhookEntrega {
    return {
      id,
      evento: 'TICKET_ESTADO_CAMBIADO',
      ticketId: 't-1',
      payload,
      estado: 'PENDIENTE',
      intentos: 2,
      proximoIntentoAt: new Date('2026-10-13T12:15:00Z'),
      ultimoCodigo: 500,
      ultimoError: 'HTTP 500',
      createdAt: new Date('2026-10-13T12:00:00Z'),
      entregadaAt: null,
      updatedAt: new Date('2026-10-13T12:05:00Z'),
    };
  }

  it('proyecta cada entrega con el nombre externo y el número del cuerpo, sin el cuerpo', async () => {
    const pedidos: { pagina: number; porPagina: number }[] = [];
    const useCase = new ListarEntregasWebhookUseCase({
      listar: async (opciones) => {
        pedidos.push(opciones);
        return {
          items: [
            entrega('e-1', { ticket: { id: 't-1', numero: 'SOP-2026-00042' } }),
            entrega('e-2', {}),
            entrega('e-3', { ticket: { id: 't-3', numero: '' } }),
          ],
          total: 7,
        };
      },
    });

    const pagina = await useCase.execute({ pagina: 2, porPagina: 2 });

    expect(pedidos).toEqual([{ pagina: 2, porPagina: 2 }]);
    expect(pagina).toMatchObject({ total: 7, pagina: 2, porPagina: 2 });
    expect(pagina.items[0]).toEqual({
      id: 'e-1',
      evento: 'ticket.estado_cambiado',
      ticketId: 't-1',
      numero: 'SOP-2026-00042',
      estado: 'PENDIENTE',
      intentos: 2,
      ultimoCodigo: 500,
      ultimoError: 'HTTP 500',
      createdAt: new Date('2026-10-13T12:00:00Z'),
      proximoIntentoAt: new Date('2026-10-13T12:15:00Z'),
      entregadaAt: null,
    });
    expect(pagina.items[1].numero).toBeNull();
    expect(pagina.items[2].numero).toBeNull();
  });

  it('usa 1 y 20 por defecto, y acota porPagina a 100 y la página a 1 como mínimo', async () => {
    const pedidos: { pagina: number; porPagina: number }[] = [];
    const useCase = new ListarEntregasWebhookUseCase({
      listar: async (opciones) => {
        pedidos.push(opciones);
        return { items: [], total: 0 };
      },
    });

    await useCase.execute({});
    await useCase.execute({ pagina: 0, porPagina: 500 });

    expect(pedidos).toEqual([
      { pagina: 1, porPagina: 20 },
      { pagina: 1, porPagina: 100 },
    ]);
  });
});
