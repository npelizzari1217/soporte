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
import { API_CLAVE_REPOSITORY, IApiClaveRepository } from './domain/api-clave-repository.port';
import { PrismaApiClaveRepository } from './infrastructure/prisma-api-clave.repository';
import { ApiClienteController } from './interface/api-cliente.controller';
import { ApiClavesController } from './interface/api-claves.controller';

/** Modulo de la API publica (sdd/api-publica). T2: habilitacion por ROOT. T3: claves para el ADMINISTRADOR. */
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
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        roleRepo: IRoleRepository,
        hashProvider: IHashProvider,
      ) =>
        new ConfigurarApiClienteUseCase(
          clienteRepo,
          usuarioRepo,
          membresiaRepo,
          roleRepo,
          hashProvider,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        ROLE_REPOSITORY,
        HASH_PROVIDER,
      ],
    },
  ],
})
export class IntegracionesModule {}
