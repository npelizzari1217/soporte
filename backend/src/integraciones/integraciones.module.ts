import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { USUARIO_REPOSITORY, IUsuarioRepository } from '../auth/domain/ports/i-usuario.repository';
import {
  MEMBRESIA_REPOSITORY,
  IMembresiaRepository,
} from '../auth/domain/ports/i-membresia.repository';
import { ROLE_REPOSITORY, IRoleRepository } from '../auth/domain/ports/i-role.repository';
import { HASH_PROVIDER, IHashProvider } from '../auth/domain/ports/i-hash.provider';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../clientes/domain/ports/i-cliente.repository';
import { ILogger, LOGGER } from '../shared/domain/ports/i-logger.port';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { ITenantEnumerator, TENANT_ENUMERATOR } from '../shared/domain/ports/i-tenant-enumerator';
import { ESTADO_REPOSITORY, IEstadoRepository } from '../tickets/domain/ports/i-estado.repository';
import { ITicketRepository, TICKET_REPOSITORY } from '../tickets/domain/ports/i-ticket.repository';
import {
  ITipoTicketRepository,
  TIPO_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-tipo-ticket.repository';
import { TicketsModule } from '../tickets/tickets.module';
import { EncolarWebhookUseCase } from './application/encolar-webhook.use-case';
import { EnviarWebhooksPendientesUseCase } from './application/enviar-webhooks-pendientes.use-case';
import { CLIENTE_HTTP_WEBHOOK, IClienteHttpWebhook } from './domain/cliente-http-webhook.port';
import { HttpsClienteWebhook } from './infrastructure/https-cliente-webhook.adapter';
import { WebhookEnvioScheduler } from './infrastructure/webhook-envio.scheduler';
import { ConfigurarApiClienteUseCase } from './application/configurar-api-cliente.use-case';
import { CrearApiClaveUseCase } from './application/crear-api-clave.use-case';
import { ListarApiClavesUseCase } from './application/listar-api-claves.use-case';
import { RevocarApiClaveUseCase } from './application/revocar-api-clave.use-case';
import { SecretoWebhookCifrado } from './application/secreto-webhook-cifrado';
import { API_CLAVE_REPOSITORY, IApiClaveRepository } from './domain/api-clave-repository.port';
import {
  API_HABILITADA_REPOSITORY,
  IApiHabilitadaRepository,
} from './domain/api-habilitada-repository.port';
import { PrismaApiClaveRepository } from './infrastructure/prisma-api-clave.repository';
import {
  USUARIO_INTEGRACION_REPOSITORY,
  IUsuarioIntegracionRepository,
} from './domain/usuario-integracion-repository.port';
import { PrismaApiHabilitadaRepository } from './infrastructure/prisma-api-habilitada.repository';
import { PrismaUsuarioIntegracionRepository } from './infrastructure/prisma-usuario-integracion.repository';
import {
  IWebhookDestinoRepository,
  WEBHOOK_DESTINO_REPOSITORY,
} from './domain/webhook-destino-repository.port';
import { PrismaWebhookDestinoRepository } from './infrastructure/prisma-webhook-destino.repository';
import {
  IWebhookEntregaRepository,
  WEBHOOK_ENTREGA_REPOSITORY,
} from './domain/webhook-entrega-repository.port';
import { PrismaWebhookEntregaRepository } from './infrastructure/prisma-webhook-entrega.repository';
import { WebhookEncoladoListener } from './infrastructure/webhook-encolado.listener';
import { ApiClienteController } from './interface/api-cliente.controller';
import { ApiClavesController } from './interface/api-claves.controller';
import { WebhookController } from './interface/webhook.controller';
import { ConsultarWebhookDestinoUseCase } from './application/consultar-webhook-destino.use-case';
import { GuardarWebhookDestinoUseCase } from './application/guardar-webhook-destino.use-case';
import { RegenerarSecretoWebhookUseCase } from './application/regenerar-secreto-webhook.use-case';
import { ListarEntregasWebhookUseCase } from './application/listar-entregas-webhook.use-case';
import {
  BUSCAR_DIRECCIONES_WEBHOOK,
  BuscarDirecciones,
  buscarDireccionesPorDefecto,
} from './domain/destino-webhook-seguro';

/**
 * Modulo de la API publica (sdd/api-publica). T2: habilitacion por ROOT. T3: claves para el
 * ADMINISTRADOR. Webhooks (odd/webhooks) T1: destino por cliente y cifrado de su secreto. T2: cola
 * y registro de entregas en la base del inquilino. T4: el listener que encola los avisos de los
 * eventos de ticket (por eso importa `TicketsModule`). T5: el barrido que envía los avisos vencidos y purga
 * el registro (`TENANT_ENUMERATOR` viene de `SharedModule`, que es `@Global()`). T6: los endpoints
 * del ADMINISTRADOR; `BUSCAR_DIRECCIONES_WEBHOOK` deja reemplazar el DNS del guardado en los e2e.
 */
@Module({
  imports: [AuthModule, TicketsModule],
  controllers: [ApiClienteController, ApiClavesController, WebhookController],
  exports: [API_CLAVE_REPOSITORY],
  providers: [
    {
      provide: API_CLAVE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaApiClaveRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: API_HABILITADA_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaApiHabilitadaRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: WEBHOOK_DESTINO_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaWebhookDestinoRepository(prisma),
      inject: [PrismaService],
    },
    SecretoWebhookCifrado,
    // Cliente tenant vía TenantContext (SharedModule es @Global), como los repositorios de tickets.
    { provide: WEBHOOK_ENTREGA_REPOSITORY, useClass: PrismaWebhookEntregaRepository },
    {
      provide: EncolarWebhookUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        destinoRepo: IWebhookDestinoRepository,
        ticketRepo: ITicketRepository,
        estadoRepo: IEstadoRepository,
        tipoRepo: ITipoTicketRepository,
        entregaRepo: IWebhookEntregaRepository,
      ) =>
        new EncolarWebhookUseCase(
          clienteRepo,
          destinoRepo,
          ticketRepo,
          estadoRepo,
          tipoRepo,
          entregaRepo,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        WEBHOOK_DESTINO_REPOSITORY,
        TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        WEBHOOK_ENTREGA_REPOSITORY,
      ],
    },
    {
      provide: WebhookEncoladoListener,
      useFactory: (encolar: EncolarWebhookUseCase, tenantContext: TenantContext, logger: ILogger) =>
        new WebhookEncoladoListener(encolar, tenantContext, logger),
      inject: [EncolarWebhookUseCase, TenantContext, LOGGER],
    },
    { provide: CLIENTE_HTTP_WEBHOOK, useFactory: () => new HttpsClienteWebhook() },
    {
      provide: EnviarWebhooksPendientesUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        destinoRepo: IWebhookDestinoRepository,
        secretos: SecretoWebhookCifrado,
        entregaRepo: IWebhookEntregaRepository,
        http: IClienteHttpWebhook,
        logger: ILogger,
      ) =>
        new EnviarWebhooksPendientesUseCase(
          clienteRepo,
          destinoRepo,
          secretos,
          entregaRepo,
          http,
          logger,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        WEBHOOK_DESTINO_REPOSITORY,
        SecretoWebhookCifrado,
        WEBHOOK_ENTREGA_REPOSITORY,
        CLIENTE_HTTP_WEBHOOK,
        LOGGER,
      ],
    },
    {
      provide: WebhookEnvioScheduler,
      useFactory: (
        tenantEnumerator: ITenantEnumerator,
        tenantContext: TenantContext,
        prisma: PrismaService,
        enviar: EnviarWebhooksPendientesUseCase,
        logger: ILogger,
      ) => new WebhookEnvioScheduler(tenantEnumerator, tenantContext, prisma, enviar, logger),
      inject: [
        TENANT_ENUMERATOR,
        TenantContext,
        PrismaService,
        EnviarWebhooksPendientesUseCase,
        LOGGER,
      ],
    },
    { provide: BUSCAR_DIRECCIONES_WEBHOOK, useValue: buscarDireccionesPorDefecto },
    {
      provide: ConsultarWebhookDestinoUseCase,
      useFactory: (destinoRepo: IWebhookDestinoRepository) =>
        new ConsultarWebhookDestinoUseCase(destinoRepo),
      inject: [WEBHOOK_DESTINO_REPOSITORY],
    },
    {
      provide: GuardarWebhookDestinoUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        destinoRepo: IWebhookDestinoRepository,
        secretos: SecretoWebhookCifrado,
        buscar: BuscarDirecciones,
      ) => new GuardarWebhookDestinoUseCase(clienteRepo, destinoRepo, secretos, buscar),
      inject: [
        CLIENTE_REPOSITORY,
        WEBHOOK_DESTINO_REPOSITORY,
        SecretoWebhookCifrado,
        BUSCAR_DIRECCIONES_WEBHOOK,
      ],
    },
    {
      provide: RegenerarSecretoWebhookUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        destinoRepo: IWebhookDestinoRepository,
        secretos: SecretoWebhookCifrado,
      ) => new RegenerarSecretoWebhookUseCase(clienteRepo, destinoRepo, secretos),
      inject: [CLIENTE_REPOSITORY, WEBHOOK_DESTINO_REPOSITORY, SecretoWebhookCifrado],
    },
    {
      provide: ListarEntregasWebhookUseCase,
      useFactory: (entregaRepo: IWebhookEntregaRepository) =>
        new ListarEntregasWebhookUseCase(entregaRepo),
      inject: [WEBHOOK_ENTREGA_REPOSITORY],
    },
    {
      provide: USUARIO_INTEGRACION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaUsuarioIntegracionRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CrearApiClaveUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        usuarioRepo: IUsuarioRepository,
        claveRepo: IApiClaveRepository,
      ) => new CrearApiClaveUseCase(clienteRepo, usuarioRepo, claveRepo),
      inject: [CLIENTE_REPOSITORY, USUARIO_REPOSITORY, API_CLAVE_REPOSITORY],
    },
    {
      provide: ListarApiClavesUseCase,
      useFactory: (claveRepo: IApiClaveRepository) => new ListarApiClavesUseCase(claveRepo),
      inject: [API_CLAVE_REPOSITORY],
    },
    {
      provide: RevocarApiClaveUseCase,
      useFactory: (claveRepo: IApiClaveRepository) => new RevocarApiClaveUseCase(claveRepo),
      inject: [API_CLAVE_REPOSITORY],
    },
    {
      provide: ConfigurarApiClienteUseCase,
      useFactory: (
        clienteRepo: IClienteRepository,
        apiHabilitadaRepo: IApiHabilitadaRepository,
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        usuarioIntegracionRepo: IUsuarioIntegracionRepository,
        roleRepo: IRoleRepository,
        hashProvider: IHashProvider,
      ) =>
        new ConfigurarApiClienteUseCase(
          clienteRepo,
          apiHabilitadaRepo,
          usuarioRepo,
          membresiaRepo,
          usuarioIntegracionRepo,
          roleRepo,
          hashProvider,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        API_HABILITADA_REPOSITORY,
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        USUARIO_INTEGRACION_REPOSITORY,
        ROLE_REPOSITORY,
        HASH_PROVIDER,
      ],
    },
  ],
})
export class IntegracionesModule {}
