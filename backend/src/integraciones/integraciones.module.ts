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
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
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
import { WEBHOOK_DESTINO_REPOSITORY } from './domain/webhook-destino-repository.port';
import { PrismaWebhookDestinoRepository } from './infrastructure/prisma-webhook-destino.repository';
import { ApiClienteController } from './interface/api-cliente.controller';
import { ApiClavesController } from './interface/api-claves.controller';

/**
 * Modulo de la API publica (sdd/api-publica). T2: habilitacion por ROOT. T3: claves para el
 * ADMINISTRADOR. Webhooks (odd/webhooks) T1: destino por cliente y cifrado de su secreto.
 */
@Module({
  imports: [AuthModule],
  controllers: [ApiClienteController, ApiClavesController],
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
