import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../clientes/domain/ports/i-cliente.repository';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { ClaveIaCifrada } from './application/clave-ia-cifrada';
import { ConfigurarIaClienteUseCase } from './application/configurar-ia-cliente.use-case';
import { ProbarIaClienteUseCase } from './application/probar-ia-cliente.use-case';
import { QuitarIaClienteUseCase } from './application/quitar-ia-cliente.use-case';
import { VerIaClienteUseCase } from './application/ver-ia-cliente.use-case';
import {
  ASISTENTE_IA_CONFIG_REPOSITORY,
  IAsistenteIaConfigRepository,
} from './domain/asistente-ia-config-repository.port';
import { IModeloIa, MODELO_IA } from './domain/modelo-ia.port';
import { OpenAiCompatibleModeloIa } from './infrastructure/openai-compatible-modelo-ia.adapter';
import { PrismaAsistenteIaConfigRepository } from './infrastructure/prisma-asistente-ia-config.repository';
import { IaClienteController } from './interface/ia-cliente.controller';

/** Asistente de IA que responde con la Ayuda (odd/asistente-ia-ayuda). */
@Module({
  imports: [AuthModule],
  controllers: [IaClienteController],
  providers: [
    {
      provide: ASISTENTE_IA_CONFIG_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAsistenteIaConfigRepository(prisma),
      inject: [PrismaService],
    },
    { provide: MODELO_IA, useFactory: () => new OpenAiCompatibleModeloIa() },
    ClaveIaCifrada,
    {
      provide: VerIaClienteUseCase,
      useFactory: (clientes: IClienteRepository, configs: IAsistenteIaConfigRepository) =>
        new VerIaClienteUseCase(clientes, configs),
      inject: [CLIENTE_REPOSITORY, ASISTENTE_IA_CONFIG_REPOSITORY],
    },
    {
      provide: ConfigurarIaClienteUseCase,
      useFactory: (
        clientes: IClienteRepository,
        configs: IAsistenteIaConfigRepository,
        claves: ClaveIaCifrada,
      ) => new ConfigurarIaClienteUseCase(clientes, configs, claves),
      inject: [CLIENTE_REPOSITORY, ASISTENTE_IA_CONFIG_REPOSITORY, ClaveIaCifrada],
    },
    {
      provide: QuitarIaClienteUseCase,
      useFactory: (clientes: IClienteRepository, configs: IAsistenteIaConfigRepository) =>
        new QuitarIaClienteUseCase(clientes, configs),
      inject: [CLIENTE_REPOSITORY, ASISTENTE_IA_CONFIG_REPOSITORY],
    },
    {
      provide: ProbarIaClienteUseCase,
      useFactory: (
        clientes: IClienteRepository,
        configs: IAsistenteIaConfigRepository,
        claves: ClaveIaCifrada,
        modelo: IModeloIa,
      ) => new ProbarIaClienteUseCase(clientes, configs, claves, modelo),
      inject: [CLIENTE_REPOSITORY, ASISTENTE_IA_CONFIG_REPOSITORY, ClaveIaCifrada, MODELO_IA],
    },
  ],
})
export class AsistenteModule {}
