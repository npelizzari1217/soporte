/**
 * GuardarWebhookDestinoUseCase (odd/webhooks, T6): API habilitada (CA6), eventos, URL y DNS (CA8),
 * y el secreto en claro solo al crear el destino (CA7). Fakes en memoria, sin red.
 */
import type { LookupAddress } from 'node:dns';
import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { BuscarDirecciones } from '../domain/destino-webhook-seguro';
import { DatosWebhookDestino, WebhookDestino } from '../domain/webhook-destino';
import { GuardarWebhookDestinoUseCase } from './guardar-webhook-destino.use-case';

const CLIENTE_ID = '0190a000-0000-7000-8000-00000000000a';
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

interface Escenario {
  apiHabilitada?: boolean;
  existente?: WebhookDestino;
  buscar?: BuscarDirecciones;
}

function armar(escenario: Escenario = {}) {
  let guardado: WebhookDestino | null = escenario.existente ?? null;
  const guardados: DatosWebhookDestino[] = [];
  const cifrados: string[] = [];
  const useCase = new GuardarWebhookDestinoUseCase(
    { findById: async () => cliente(escenario.apiHabilitada ?? true) },
    {
      buscarPorCliente: async () => guardado,
      guardar: async (datos) => {
        guardados.push(datos);
        guardado = {
          ...datos,
          createdAt: guardado?.createdAt ?? new Date('2026-10-13T10:00:00Z'),
          updatedAt: new Date('2026-10-13T11:00:00Z'),
        };
        return guardado;
      },
    },
    {
      cifrar: (clienteId, secreto) => {
        cifrados.push(secreto);
        return `cifrado:${clienteId}:${secreto}`;
      },
    },
    escenario.buscar ?? (async () => [PUBLICA]),
  );
  return { useCase, guardados, cifrados };
}

const comando = (cambios: Partial<{ url: string; eventos: string[]; activo: boolean }> = {}) => ({
  clienteId: CLIENTE_ID,
  url: 'https://erp.example.com/webhooks',
  eventos: ['TICKET_CREADO', 'TICKET_COMENTADO'],
  activo: true,
  ...cambios,
});

describe('GuardarWebhookDestinoUseCase', () => {
  it('con la API deshabilitada falla con API_NO_HABILITADA y no guarda nada', async () => {
    const { useCase, guardados } = armar({ apiHabilitada: false });

    const result = await useCase.execute(comando());

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('API_NO_HABILITADA');
    expect(guardados).toHaveLength(0);
  });

  it.each([
    ['vacíos', []],
    ['con uno desconocido', ['TICKET_CREADO', 'SLA_VENCIDO']],
    ['con el nombre externo en vez del código', ['ticket.creado']],
  ])('rechaza eventos %s con WEBHOOK_EVENTOS_INVALIDOS', async (_caso, eventos) => {
    const { useCase, guardados } = armar();

    const result = await useCase.execute(comando({ eventos }));

    expect(result.getError().code).toBe('WEBHOOK_EVENTOS_INVALIDOS');
    expect(guardados).toHaveLength(0);
  });

  it('una URL sin HTTPS conserva su mensaje específico (WEBHOOK_URL_INVALIDA)', async () => {
    const { useCase, guardados } = armar();

    const result = await useCase.execute(comando({ url: 'http://erp.example.com/webhooks' }));

    expect(result.getError().code).toBe('WEBHOOK_URL_INVALIDA');
    expect(result.getError().message).toContain('HTTPS');
    expect(guardados).toHaveLength(0);
  });

  it('un host que resuelve a una IP privada y uno que no resuelve dan el MISMO error genérico', async () => {
    const privado = armar({ buscar: async () => [{ address: '10.0.0.7', family: 4 }] });
    const irresoluble = armar({
      buscar: async () => {
        throw new Error('ENOTFOUND interno.example.com');
      },
    });
    const vacio = armar({ buscar: async () => [] });

    const errores = [
      (await privado.useCase.execute(comando())).getError(),
      (await irresoluble.useCase.execute(comando())).getError(),
      (await vacio.useCase.execute(comando())).getError(),
    ];

    expect(errores.map((e) => e.code)).toEqual([
      'WEBHOOK_DESTINO_NO_ADMITIDO',
      'WEBHOOK_DESTINO_NO_ADMITIDO',
      'WEBHOOK_DESTINO_NO_ADMITIDO',
    ]);
    expect(new Set(errores.map((e) => e.message)).size).toBe(1);
    expect(errores[0].message).not.toContain('ENOTFOUND');
    expect(privado.guardados).toHaveLength(0);
    expect(irresoluble.guardados).toHaveLength(0);
  });

  it('al crear genera el secreto, guarda solo el cifrado y lo devuelve en claro una vez', async () => {
    const { useCase, guardados, cifrados } = armar();

    const result = await useCase.execute(
      comando({ eventos: ['TICKET_CREADO', 'TICKET_CREADO', 'TICKET_ASIGNADO'] }),
    );

    expect(result.isOk()).toBe(true);
    const salida = result.getValue();
    expect(salida.secreto).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(cifrados).toEqual([salida.secreto]);
    expect(guardados).toEqual([
      {
        clienteId: CLIENTE_ID,
        url: 'https://erp.example.com/webhooks',
        eventos: ['TICKET_CREADO', 'TICKET_ASIGNADO'],
        activo: true,
        secretoCifrado: `cifrado:${CLIENTE_ID}:${salida.secreto}`,
      },
    ]);
    expect(salida).toEqual({
      configurado: true,
      url: 'https://erp.example.com/webhooks',
      eventos: ['TICKET_CREADO', 'TICKET_ASIGNADO'],
      activo: true,
      creadoEn: new Date('2026-10-13T10:00:00Z'),
      actualizadoEn: new Date('2026-10-13T11:00:00Z'),
      secreto: salida.secreto,
    });
  });

  it('al actualizar conserva el secreto cifrado y no lo devuelve', async () => {
    const existente: WebhookDestino = {
      clienteId: CLIENTE_ID,
      url: 'https://viejo.example.com/hook',
      eventos: ['TICKET_CREADO'],
      secretoCifrado: 'v1:iv:tag:ct',
      activo: true,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    };
    const { useCase, guardados, cifrados } = armar({ existente });

    const result = await useCase.execute(
      comando({ url: '  https://Nuevo.Example.com/hook  ', activo: false }),
    );

    const salida = result.getValue();
    expect(salida).not.toHaveProperty('secreto');
    expect(cifrados).toHaveLength(0);
    expect(guardados[0]).toMatchObject({
      url: 'https://nuevo.example.com/hook',
      activo: false,
      secretoCifrado: 'v1:iv:tag:ct',
    });
    expect(salida.creadoEn).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(JSON.stringify(salida)).not.toContain('v1:iv:tag:ct');
  });
});
