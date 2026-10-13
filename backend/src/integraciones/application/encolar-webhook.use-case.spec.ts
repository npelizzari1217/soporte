/**
 * Encolado de avisos de webhook (odd/webhooks, T4): cuándo se omite (API deshabilitada, sin
 * destino, destino inactivo, evento no suscripto, ticket fuera de `v1`) y la forma exacta del
 * cuerpo congelado (CA3: sin descripción ni comentarios).
 */
import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { EstadoEntity } from '../../tickets/domain/entities/estado.entity';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { EventoWebhook, WebhookDestino } from '../domain/webhook-destino';
import { DatosEncolarEntrega, WebhookEntrega } from '../domain/webhook-entrega';
import { EncolarWebhookUseCase, NOMBRE_EXTERNO_EVENTO_WEBHOOK } from './encolar-webhook.use-case';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const TICKET_ID = '01977a00-0000-7000-8000-0000000000t1';
const TIPO_V1 = 'tipo-soporte';
const TIPO_OTRO_MODULO = 'tipo-reparacion';
const ESTADO_ID = 'estado-asignado';
const CREADO = new Date('2026-10-01T10:00:00.000Z');
const ACTUALIZADO = new Date('2026-10-02T11:30:00.000Z');
const OCURRIDO = new Date('2026-10-13T12:00:00.000Z');
const AHORA = new Date('2026-10-13T12:00:01.000Z');

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

function ticket(cambios: { tipoId?: string; borrado?: boolean } = {}): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero: 'SOP-2026-00042',
      titulo: 'La impresora no imprime',
      descripcion: 'Detalle que nunca debe salir en el aviso',
      tipoId: cambios.tipoId ?? TIPO_V1,
      estadoId: ESTADO_ID,
      prioridadId: 'prioridad',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante',
      asignadoId: 'tecnico',
      slaVenceAt: null,
      vencido: false,
      fechaCierre: null,
    },
    TICKET_ID,
    CREADO,
    ACTUALIZADO,
    cambios.borrado ? ACTUALIZADO : null,
  );
}

function destino(cambios: Partial<WebhookDestino> = {}): WebhookDestino {
  return {
    clienteId: CLIENTE_ID,
    url: 'https://erp.example.com/webhooks',
    eventos: ['TICKET_CREADO', 'TICKET_ESTADO_CAMBIADO', 'TICKET_ASIGNADO', 'TICKET_COMENTADO'],
    secretoCifrado: 'v1:iv:tag:ct',
    activo: true,
    createdAt: CREADO,
    updatedAt: CREADO,
    ...cambios,
  };
}

interface Escenario {
  cliente?: ClienteEntity | null;
  destino?: WebhookDestino | null;
  ticket?: TicketEntity | null;
}

function armar(escenario: Escenario = {}) {
  const encoladas: DatosEncolarEntrega[] = [];
  const clientesConsultados: string[] = [];
  const useCase = new EncolarWebhookUseCase(
    {
      findById: async (id) => {
        clientesConsultados.push(id);
        return escenario.cliente === undefined ? cliente(true) : escenario.cliente;
      },
    },
    {
      buscarPorCliente: async (id) =>
        id === CLIENTE_ID
          ? escenario.destino === undefined
            ? destino()
            : escenario.destino
          : null,
    },
    {
      findById: async (id) =>
        id === TICKET_ID ? (escenario.ticket === undefined ? ticket() : escenario.ticket) : null,
    },
    {
      findById: async (id) =>
        id === ESTADO_ID
          ? EstadoEntity.create(
              { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
              ESTADO_ID,
            )
          : null,
    },
    { findIdsByModulos: async (modulos) => (modulos.includes('TICKETS') ? [TIPO_V1] : []) },
    {
      encolar: async (datos): Promise<WebhookEntrega> => {
        encoladas.push(datos);
        return {
          id: 'entrega-1',
          ...datos,
          estado: 'PENDIENTE',
          intentos: 0,
          ultimoCodigo: null,
          ultimoError: null,
          createdAt: AHORA,
          entregadaAt: null,
          updatedAt: AHORA,
        };
      },
    },
    () => AHORA,
  );
  return { useCase, encoladas, clientesConsultados };
}

const entrada = (evento: EventoWebhook = 'TICKET_CREADO') => ({
  clienteId: CLIENTE_ID,
  evento,
  ticketId: TICKET_ID,
  ocurridoEn: OCURRIDO,
});

describe('EncolarWebhookUseCase (odd/webhooks T4)', () => {
  it('con la API deshabilitada no encola nada (CA6)', async () => {
    const { useCase, encoladas } = armar({ cliente: cliente(false) });

    expect(await useCase.ejecutar(entrada())).toEqual({ omitida: 'API_DESHABILITADA' });
    expect(encoladas).toEqual([]);
  });

  it('un cliente inexistente cuenta como API deshabilitada', async () => {
    const { useCase, encoladas } = armar({ cliente: null });

    expect(await useCase.ejecutar(entrada())).toEqual({ omitida: 'API_DESHABILITADA' });
    expect(encoladas).toEqual([]);
  });

  it('sin destino configurado no encola', async () => {
    const { useCase, encoladas } = armar({ destino: null });

    expect(await useCase.ejecutar(entrada())).toEqual({ omitida: 'SIN_DESTINO' });
    expect(encoladas).toEqual([]);
  });

  it('con el destino inactivo no encola', async () => {
    const { useCase, encoladas } = armar({ destino: destino({ activo: false }) });

    expect(await useCase.ejecutar(entrada())).toEqual({ omitida: 'DESTINO_INACTIVO' });
    expect(encoladas).toEqual([]);
  });

  it('un evento al que el destino no está suscripto no se encola', async () => {
    const { useCase, encoladas } = armar({ destino: destino({ eventos: ['TICKET_CREADO'] }) });

    expect(await useCase.ejecutar(entrada('TICKET_COMENTADO'))).toEqual({
      omitida: 'EVENTO_NO_SUSCRIPTO',
    });
    expect(encoladas).toEqual([]);
  });

  it('un ticket de otro módulo, uno dado de baja o uno inexistente no se encolan: v1 no los muestra', async () => {
    for (const t of [ticket({ tipoId: TIPO_OTRO_MODULO }), ticket({ borrado: true }), null]) {
      const { useCase, encoladas } = armar({ ticket: t });

      expect(await useCase.ejecutar(entrada())).toEqual({ omitida: 'TICKET_FUERA_DE_V1' });
      expect(encoladas).toEqual([]);
    }
  });

  it('encola con el cliente de la entrada, vencida ya, con el cuerpo exacto y sin campos de más (CA3)', async () => {
    const { useCase, encoladas, clientesConsultados } = armar();

    const resultado = await useCase.ejecutar(entrada('TICKET_ESTADO_CAMBIADO'));

    expect(resultado).toMatchObject({ encolada: { id: 'entrega-1', estado: 'PENDIENTE' } });
    expect(clientesConsultados).toEqual([CLIENTE_ID]);
    expect(encoladas).toEqual([
      {
        evento: 'TICKET_ESTADO_CAMBIADO',
        ticketId: TICKET_ID,
        proximoIntentoAt: AHORA,
        payload: {
          evento: 'ticket.estado_cambiado',
          ocurridoEn: '2026-10-13T12:00:00.000Z',
          ticket: {
            id: TICKET_ID,
            numero: 'SOP-2026-00042',
            estado: 'ASIGNADO',
            tipo: TIPO_V1,
            creadoEn: '2026-10-01T10:00:00.000Z',
            actualizadoEn: '2026-10-02T11:30:00.000Z',
          },
        },
      },
    ]);
    // toEqual ya exige las claves exactas; esto deja explícito que no viaja el detalle.
    expect(JSON.stringify(encoladas[0].payload)).not.toMatch(/descripcion|titulo|Detalle/);
  });

  it('los nombres externos de los eventos son estables', () => {
    expect(NOMBRE_EXTERNO_EVENTO_WEBHOOK).toEqual({
      TICKET_CREADO: 'ticket.creado',
      TICKET_ESTADO_CAMBIADO: 'ticket.estado_cambiado',
      TICKET_ASIGNADO: 'ticket.asignado',
      TICKET_COMENTADO: 'ticket.comentado',
    });
  });
});
