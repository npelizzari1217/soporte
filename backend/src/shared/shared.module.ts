import { Global, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { FILE_STORAGE } from './domain/ports/i-file-storage';
import { LocalFileStorage } from './infrastructure/storage/local-file-storage';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { TenantContext } from './tenancy/tenant-context';
import { MasterContext } from './tenancy/master-context';
import {
  TenantTransactionRunner,
  TENANT_TRANSACTION_RUNNER,
} from './infrastructure/persistence/tenant-transaction-runner';
import {
  MasterTransactionRunner,
  MASTER_TRANSACTION_RUNNER,
} from './infrastructure/persistence/master-transaction-runner';
import { DOMAIN_EVENT_PUBLISHER } from './domain/ports/i-domain-event-publisher';
import { EventEmitterPublisher } from './infrastructure/events/event-emitter.publisher';
import { LOGGER } from './domain/ports/i-logger.port';
import { NestLoggerAdapter } from './infrastructure/logging/nest-logger.adapter';

/**
 * SharedModule — módulo global de infraestructura compartida.
 *
 * Provee y exporta los servicios transversales que necesitan todos los módulos:
 *   - PrismaService       → factory multi-tenant (master + Map de tenant clients)
 *   - TenantContext       → AsyncLocalStorage del tenant activo por request
 *   - TenantTransactionRunner → wrapper de $transaction con re-bind de TenantContext
 *   - FILE_STORAGE        → IFileStorage (LocalFileStorage en dev/test)
 *   - DOMAIN_EVENT_PUBLISHER → IDomainEventPublisher (EventEmitterPublisher,
 *     in-process sobre EventEmitter2)
 *   - LOGGER                → ILogger (NestLoggerAdapter, envuelve el Logger
 *     de @nestjs/common — único punto donde application/ toca el framework
 *     de logging, vía el puerto)
 *
 * Todos los providers usan tokens Symbol para respetar el principio de
 * inversión de dependencias: los consumidores dependen de la interfaz (token),
 * no de la implementación concreta.
 *
 * `EventEmitterModule.forRoot()` se importa ACÁ (no solo en AppModule) porque
 * el factory de DOMAIN_EVENT_PUBLISHER, definido en este propio módulo, inyecta
 * EventEmitter2 — regla estándar de Nest: el módulo que consume un token en su
 * propio provider debe importar el módulo que lo exporta. `forRoot()` es
 * `global: true` por defecto, así que sigue disponible para toda la app sin
 * duplicar wiring en cada módulo de feature. Ver notif-email-estado-ticket PR1:
 * tests que bootstrapean SharedModule de forma aislada (fuera de AppModule)
 * necesitan que EventEmitter2 resuelva sin depender de AppModule.
 *
 * Tarea: 0.C.7
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    // PrismaService: factory multi-tenant inyectada con la URL master
    // desde la variable de entorno. En producción, DATABASE_URL_MASTER.
    {
      provide: PrismaService,
      useFactory: () => new PrismaService(process.env.DATABASE_URL_MASTER ?? ''),
    },

    // TenantContext: wrapper de AsyncLocalStorage. Singleton por proceso.
    TenantContext,

    // MasterContext: análogo a TenantContext pero para la DB master.
    // Almacena el cliente tx durante una transacción MasterTransactionRunner.
    MasterContext,

    // TenantTransactionRunner: implementación del puerto ITenantTransactionRunner.
    {
      provide: TENANT_TRANSACTION_RUNNER,
      useClass: TenantTransactionRunner,
    },

    // MasterTransactionRunner: implementación del puerto IMasterTransactionRunner.
    // Provee transacciones atómicas para tablas MASTER (usuarios, refresh_tokens).
    {
      provide: MASTER_TRANSACTION_RUNNER,
      useClass: MasterTransactionRunner,
    },

    // FILE_STORAGE: IFileStorage → LocalFileStorage (dev/test).
    // En producción, este binding se sobreescribe con S3FileStorage.
    {
      provide: FILE_STORAGE,
      useClass: LocalFileStorage,
    },

    // DOMAIN_EVENT_PUBLISHER: IDomainEventPublisher → EventEmitterPublisher.
    // @Global() para que TicketsModule (y cualquier módulo futuro) lo inyecte
    // sin re-importar SharedModule explícitamente en sus providers.
    {
      provide: DOMAIN_EVENT_PUBLISHER,
      useFactory: (emitter: EventEmitter2) => new EventEmitterPublisher(emitter),
      inject: [EventEmitter2],
    },

    // LOGGER: ILogger → NestLoggerAdapter. @Global() para que cualquier use
    // case de application/ lo inyecte sin importar @nestjs/common directo
    // (clean-arch/SKILL.md dependency rule — Judgment Day PR4 Ronda 2).
    {
      provide: LOGGER,
      useClass: NestLoggerAdapter,
    },
  ],
  exports: [
    // Exportar PrismaService para que los módulos de infraestructura
    // puedan inyectarlo en sus repositorios.
    PrismaService,

    // TenantContext exportado para TenantGuard y repos tenant.
    TenantContext,

    // MasterContext exportado para repos MASTER transaction-aware.
    MasterContext,

    // Token de transacción tenant.
    TENANT_TRANSACTION_RUNNER,

    // Token de transacción master.
    MASTER_TRANSACTION_RUNNER,

    // Token de storage: los casos de uso inyectan este token.
    FILE_STORAGE,

    // Token de publicación de eventos de dominio.
    DOMAIN_EVENT_PUBLISHER,

    // Token de logging: los use cases de application/ inyectan este token
    // en vez de importar @nestjs/common Logger directamente.
    LOGGER,
  ],
})
export class SharedModule {}
