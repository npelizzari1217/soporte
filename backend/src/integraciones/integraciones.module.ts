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
import { ConfigurarApiClienteUseCase } from './application/configurar-api-cliente.use-case';
import { ApiClienteController } from './interface/api-cliente.controller';

/** Modulo de la API publica (sdd/api-publica). T2: habilitacion por ROOT. */
@Module({
  imports: [AuthModule],
  controllers: [ApiClienteController],
  providers: [
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
