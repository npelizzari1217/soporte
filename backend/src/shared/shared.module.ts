import { Global, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { TenantContext } from './tenancy/tenant-context';
import { MasterContext } from './tenancy/master-context';
import { LOGGER } from './domain/ports/i-logger.port';
import { NestLoggerAdapter } from './infrastructure/logging/nest-logger.adapter';
import {
  PrismaTenantTransactionRunner,
  TENANT_TX_RUNNER,
} from './infrastructure/persistence/tenant-transaction-runner';
import { DOMAIN_EVENT_PUBLISHER } from './domain/ports/i-domain-event-publisher';
import { EventEmitter2DomainEventPublisher } from './infrastructure/events/event-emitter2-domain-event-publisher';
import { FILE_STORAGE } from './domain/ports/i-file-storage';
import { LocalDiskFileStorage } from './infrastructure/storage/local-disk-file-storage';
import { SECRET_CIPHER } from './domain/ports/i-secret-cipher.port';
import { AesGcmSecretCipher } from './infrastructure/crypto/aes-gcm-secret-cipher';
import { TENANT_ENUMERATOR } from './domain/ports/i-tenant-enumerator';
import { PrismaTenantEnumerator } from './infrastructure/persistence/prisma/prisma-tenant-enumerator';
import { entorno } from '../config/entorno';

/**
 * SharedModule — módulo global de infraestructura transversal.
 *
 * Provee y exporta los servicios que necesitan todos los módulos de negocio:
 *   - PrismaService        → factory multi-tenant (master + Map de tenant clients)
 *   - TenantContext        → AsyncLocalStorage del tenant activo por request
 *   - MasterContext        → AsyncLocalStorage de transacciones sobre tablas MASTER
 *   - TENANT_TX_RUNNER     → ITenantTransactionRunner (PrismaTenantTransactionRunner),
 *     transacciones atómicas del tenant activo (T12, T24). Fase 2 PR1.
 *   - DOMAIN_EVENT_PUBLISHER → IDomainEventPublisher (EventEmitter2DomainEventPublisher,
 *     in-process, fire-and-forget). Fase 2 PR1 (ADR-6).
 *   - FILE_STORAGE         → IFileStorage (LocalDiskFileStorage, disco local).
 *     Fase 2 PR1 (ADR-7). En producción este binding se sobreescribe con S3.
 *   - LOGGER               → ILogger (NestLoggerAdapter) — único punto donde
 *     `application/` toca (vía el puerto) el framework de logging.
 *     Primer consumidor real: `SwitchTenantUseCase` (R10, PR6).
 *   - SECRET_CIPHER        → ISecretCipher (AesGcmSecretCipher) — cifrado
 *     simétrico de secretos en reposo (AES-256-GCM). Registrado acá porque el
 *     adaptador vive en `shared/infrastructure/crypto/` (WU1/WU4,
 *     sdd/configuracion-correo-por-cliente). Único consumidor: el borde de
 *     persistencia `PrismaClienteEmailConfigRepository` — ningún use case lo
 *     inyecta directamente (ver mem #2366).
 *   - TENANT_ENUMERATOR    → ITenantEnumerator (PrismaTenantEnumerator),
 *     enumeración de tenants activos desde `master.clientes`. Promovido acá
 *     desde `sla/` (ola-2 WU-0, ventana serial): infraestructura pura, sin
 *     razón para acoplar otros módulos (`preventivo`) a `sla` para
 *     consumirla. Tiene que ser el único provider del token en toda la app,
 *     y eso NADIE lo verifica: los providers de Nest son de alcance módulo,
 *     así que registrar `TENANT_ENUMERATOR` en otro módulo no falla al
 *     compilar NI al bootear — crea una segunda instancia en silencio. En
 *     este mismo repo pasa con `CLIENTE_EMAIL_CONFIG_REPOSITORY`, provisto
 *     por `ClientesModule` y por `NotificacionesModule`. No lo repitas acá.
 *
 * Todos los providers transversales usan tokens Symbol (principio de
 * inversión de dependencias): los consumidores dependen del puerto, no de
 * la implementación concreta.
 *
 * `EventEmitterModule.forRoot()` se importa acá (no solo en AppModule) porque
 * el factory de DOMAIN_EVENT_PUBLISHER, definido en este propio módulo,
 * inyecta EventEmitter2 — regla estándar de Nest: el módulo que consume un
 * token en su propio provider debe importar el módulo que lo exporta.
 * `forRoot()` es `global: true` por defecto, así que sigue disponible para
 * toda la app sin duplicar wiring en cada módulo de feature.
 *
 * @Global() evita reimportar SharedModule en cada módulo de feature.
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    // PrismaService: factory multi-tenant inyectada con la URL master desde
    // la variable de entorno DATABASE_URL_MASTER (ya validada al arranque por
    // `entorno.ts` — ver sdd/fail-fast-env). pg.Pool es lazy: construir el
    // servicio NO abre conexiones (recién en la primera query).
    {
      provide: PrismaService,
      useFactory: () => new PrismaService(entorno.DATABASE_URL_MASTER),
    },
    TenantContext,
    MasterContext,
    { provide: LOGGER, useClass: NestLoggerAdapter },
    { provide: SECRET_CIPHER, useClass: AesGcmSecretCipher },

    // TENANT_TX_RUNNER: implementación del puerto ITenantTransactionRunner.
    { provide: TENANT_TX_RUNNER, useClass: PrismaTenantTransactionRunner },

    // TENANT_ENUMERATOR: implementación del puerto ITenantEnumerator.
    { provide: TENANT_ENUMERATOR, useClass: PrismaTenantEnumerator },

    // FILE_STORAGE: IFileStorage → LocalDiskFileStorage. `STORAGE_DIR` es
    // configurable por entorno (default `./storage` — ver LocalDiskFileStorage).
    {
      provide: FILE_STORAGE,
      useFactory: () =>
        new LocalDiskFileStorage(process.env.STORAGE_DIR ? process.env.STORAGE_DIR : undefined),
    },

    // DOMAIN_EVENT_PUBLISHER: IDomainEventPublisher → EventEmitter2DomainEventPublisher.
    {
      provide: DOMAIN_EVENT_PUBLISHER,
      useFactory: (emitter: EventEmitter2) => new EventEmitter2DomainEventPublisher(emitter),
      inject: [EventEmitter2],
    },
  ],
  exports: [
    PrismaService,
    TenantContext,
    MasterContext,
    LOGGER,
    TENANT_TX_RUNNER,
    FILE_STORAGE,
    DOMAIN_EVENT_PUBLISHER,
    SECRET_CIPHER,
    TENANT_ENUMERATOR,
  ],
})
export class SharedModule {}
