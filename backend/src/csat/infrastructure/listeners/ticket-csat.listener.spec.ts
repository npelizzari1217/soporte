/**
 * ticket-csat.listener.spec.ts — TDD RED→GREEN (Tarea 6.2).
 *
 * Trampa del work unit: el filtro de disparo es PROPIO
 * (`estadoNuevoCodigo === 'CERRADO'`) — `esEstadoNotificable` (tickets/domain)
 * también dispara en `RESUELTO` y NO debe reusarse acá, o se mandarían
 * encuestas de tickets que no están cerrados. El test de RESUELTO cubre
 * exactamente esa trampa.
 *
 * Ref spec: sdd/csat/spec, Requirement "Emisión de token al cierre del
 * ticket" (escenario "Transición a RESUELTO no emite"), "Fallo de mail no
 * revierte el cierre". Ref design: flujo de datos. Tarea: 6.2.
 */
import { TicketCsatListener } from './ticket-csat.listener';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEstadoCambiadoEvent } from '../../../tickets/domain/events/ticket-estado-cambiado.event';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IContactoSolicitanteResolver } from '../../../notificaciones/domain/ports/i-contacto-solicitante-resolver';
import { EmitirEncuestaUseCase } from '../../application/use-cases/emitir-encuesta.use-case';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const TICKET_ID = 'ticket-uuid';

function makeTicket(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00042',
      titulo: 'La impresora no imprime',
      descripcion: null,
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    TICKET_ID,
  );
}

function makeCliente(csatHabilitado: boolean): ClienteEntity {
  return ClienteEntity.create(
    {
      nombre: 'Cliente de Prueba',
      razonSocial: null,
      cuit: null,
      dbName: 'test_csat_listener',
      activo: true,
      csatHabilitado,
    },
    CLIENTE_ID,
  );
}

function makeEvent(estadoNuevoCodigo: string): TicketEstadoCambiadoEvent {
  return new TicketEstadoCambiadoEvent({
    ticketId: TICKET_ID,
    estadoAnteriorCodigo: 'EN_PROCESO',
    estadoNuevoCodigo,
    autorId: 'autor-uuid',
  });
}

function makeListener(clienteCsatHabilitado = true) {
  const ticketRepo = {
    findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(makeTicket()),
  };
  const clienteRepo = {
    findById: vi
      .fn<IClienteRepository['findById']>()
      .mockResolvedValue(makeCliente(clienteCsatHabilitado)),
  };
  const contactoResolver = {
    resolver: vi.fn<IContactoSolicitanteResolver['resolver']>().mockResolvedValue({
      email: 'solicitante@dominio.com',
      nombre: 'Solicitante',
      esExterno: false,
    }),
  };
  const emitirEncuestaUseCase = {
    ejecutar: vi.fn<EmitirEncuestaUseCase['ejecutar']>().mockResolvedValue(undefined),
  };
  const tenantContext = {
    get: vi.fn<TenantContext['get']>().mockReturnValue({
      prismaClient: null,
      dbName: 'test_csat_listener',
      clienteId: CLIENTE_ID,
    }),
  };
  const logger = { error: vi.fn<ILogger['error']>() };

  const listener = new TicketCsatListener(
    ticketRepo,
    clienteRepo,
    contactoResolver,
    emitirEncuestaUseCase,
    tenantContext,
    logger,
  );

  return { listener, ticketRepo, clienteRepo, contactoResolver, emitirEncuestaUseCase, logger };
}

describe('TicketCsatListener', () => {
  it('emite la encuesta cuando el ticket transiciona a CERRADO y el cliente tiene csatHabilitado', async () => {
    const { listener, emitirEncuestaUseCase } = makeListener(true);

    await listener.onTicketEstadoCambiado(makeEvent('CERRADO'));

    expect(emitirEncuestaUseCase.ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: CLIENTE_ID,
        ticketId: TICKET_ID,
        numeroTicket: 'SOP-2026-00042',
        tituloTicket: 'La impresora no imprime',
        destinatarioEmail: 'solicitante@dominio.com',
        // Pincha la URL que el cliente clickea en el mail de encuesta: sale de
        // `entorno.APP_BASE_URL` (contrato validado al arrancar), y hasta acá
        // no la cubría ningún test. Con el `?? ''` de antes, una variable
        // ausente llegaba como cadena vacía sin que nada se pusiera rojo.
        appBaseUrl: 'http://localhost:5173',
      }),
    );
  });

  it('un ticket de solicitante externo recibe la encuesta en su email verificado', async () => {
    const { listener, ticketRepo, contactoResolver, emitirEncuestaUseCase } = makeListener(true);
    const externo = TicketEntity.create(
      {
        numero: 'SOP-2026-00042',
        titulo: 'La impresora no imprime',
        descripcion: null,
        tipoId: 'tipo-uuid',
        estadoId: 'estado-uuid',
        prioridadId: 'prioridad-uuid',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: null,
        solicitanteExternoId: 'externo-uuid',
      },
      TICKET_ID,
    );
    ticketRepo.findById.mockResolvedValue(externo);
    contactoResolver.resolver.mockResolvedValue({
      email: 'externo@dominio.com',
      nombre: 'Externo',
      esExterno: true,
    });

    await listener.onTicketEstadoCambiado(makeEvent('CERRADO'));

    expect(contactoResolver.resolver).toHaveBeenCalledWith(externo);
    expect(emitirEncuestaUseCase.ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: TICKET_ID, destinatarioEmail: 'externo@dominio.com' }),
    );
  });

  it('[TRAMPA] NO emite en RESUELTO — filtro propio, no reusa esEstadoNotificable', async () => {
    const { listener, emitirEncuestaUseCase, clienteRepo } = makeListener(true);

    await listener.onTicketEstadoCambiado(makeEvent('RESUELTO'));

    expect(emitirEncuestaUseCase.ejecutar).not.toHaveBeenCalled();
    // Ni siquiera debería consultar el cliente: el filtro corta ANTES de
    // cualquier lookup — si algún día se reemplaza por esEstadoNotificable,
    // esta aserción también se rompe.
    expect(clienteRepo.findById).not.toHaveBeenCalled();
  });

  it('no emite si el cliente tiene csatHabilitado=false', async () => {
    const { listener, emitirEncuestaUseCase } = makeListener(false);

    await listener.onTicketEstadoCambiado(makeEvent('CERRADO'));

    expect(emitirEncuestaUseCase.ejecutar).not.toHaveBeenCalled();
  });

  it('[CRITICAL] un throw del email/use case de emisión NO propaga — el cierre queda committeado (log-and-swallow, logueado)', async () => {
    const { listener, emitirEncuestaUseCase, logger } = makeListener(true);
    emitirEncuestaUseCase.ejecutar.mockRejectedValue(new Error('SMTP caído'));

    await expect(listener.onTicketEstadoCambiado(makeEvent('CERRADO'))).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
