import { Module } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../clientes/domain/ports/i-cliente.repository';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { THROTTLER_STORAGE_POSTGRES } from '../shared/infrastructure/throttler/postgres-throttler-storage';
import { ConsultarAsistenteUseCase } from './application/consultar-asistente.use-case';
import { FUENTE_AYUDA, IFuenteAyuda } from './domain/fuente-ayuda.port';
import {
  ASISTENTE_LIMITE,
  ASISTENTE_VENTANA_MS,
  AsistenteThrottlerGuard,
} from './infrastructure/asistente-throttler.guard';
import { PrismaFuenteAyuda } from './infrastructure/prisma-fuente-ayuda.adapter';
import { AsistenteController } from './interface/asistente.controller';
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

/**
 * Asistente de IA que responde con la Ayuda (odd/asistente-ia-ayuda).
 *
 * Throttler con opciones y storage LOCALES, sin `ThrottlerModule.forRoot*`, como `ApiV1Module`: el
 * cupo por persona vive en Postgres (`throttler_contadores`) y no se mezcla con los de otros módulos.
 */
@Module({
  imports: [AuthModule],
  controllers: [IaClienteController, AsistenteController],
  providers: [
    {
      provide: getOptionsToken(),
      useFactory: () => [{ limit: ASISTENTE_LIMITE, ttl: ASISTENTE_VENTANA_MS }],
    },
    THROTTLER_STORAGE_POSTGRES,
    AsistenteThrottlerGuard,
    {
      provide: FUENTE_AYUDA,
      useFactory: (prisma: PrismaService) => new PrismaFuenteAyuda(prisma),
      inject: [PrismaService],
    },
    {
      provide: ConsultarAsistenteUseCase,
      useFactory: (
        fuente: IFuenteAyuda,
        configs: IAsistenteIaConfigRepository,
        claves: ClaveIaCifrada,
        modelo: IModeloIa,
      ) => new ConsultarAsistenteUseCase(fuente, configs, claves, modelo),
      inject: [FUENTE_AYUDA, ASISTENTE_IA_CONFIG_REPOSITORY, ClaveIaCifrada, MODELO_IA],
    },
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
        modelo: IModeloIa,
      ) => new ConfigurarIaClienteUseCase(clientes, configs, claves, modelo),
      inject: [CLIENTE_REPOSITORY, ASISTENTE_IA_CONFIG_REPOSITORY, ClaveIaCifrada, MODELO_IA],
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
