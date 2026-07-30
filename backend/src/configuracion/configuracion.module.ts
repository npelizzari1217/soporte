/**
 * ConfiguracionModule — módulo NestJS del dominio `configuracion/`.
 *
 * Cablea la cadena completa construida en PR1-PR4 (cifrado, resolver
 * cross-DB, audit inmutable, CRUD) + el `ConfiguracionController` (PR5, API
 * HTTP de gestión) — esto hace la feature alcanzable por HTTP por primera
 * vez, una vez importado en `AppModule` (tarea 5.6).
 *
 * `imports: [AuthModule]` — necesario para que `JwtAuthGuard` (`@Inject
 * TOKEN_SERVICE`) sea resolvible dentro del contexto de este módulo, mismo
 * patrón que `TicketsModule` (que usa el MISMO guard chain
 * `JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard`).
 *
 * Dz12 (design §2): **NO** `@Global()`. Solo `tickets/` (envío, PR6) y el
 * propio `configuracion/` (CRUD, este módulo/PR5) consumen `CONFIG_RESOLVER`
 * — import explícito de este módulo en `TicketsModule`, no global implícito
 * (nestjs-modules skill: "Circular imports are a design smell" /
 * preferencia explícita sobre magia global para dependencias acotadas a 2
 * consumidores).
 *
 * `exports: [CONFIG_RESOLVER]` — el único token que un módulo EXTERNO
 * (`TicketsModule`, PR6) necesita importar de acá. `SECRET_CIPHER` NO se
 * re-exporta: ya es `@Global()` desde `SharedModule` (visible en toda la app
 * sin que ningún módulo lo importe explícitamente) — re-exportarlo acá
 * exigiría importar `SharedModule` solo para eso, algo que NINGÚN otro
 * módulo de este proyecto hace para sus tokens globales consumidos
 * (`TicketsModule` tampoco re-exporta `PrismaService`/`LOGGER`/
 * `DOMAIN_EVENT_PUBLISHER`, ver `tickets.module.ts`). DESVIACIÓN documentada
 * respecto a la letra literal de Dz12 ("exporta CONFIG_RESOLVER +
 * SECRET_CIPHER") — el efecto práctico (SECRET_CIPHER disponible donde se
 * lo necesite) ya está garantizado por `@Global()`.
 *
 * `CONFIGURACION_REPOSITORY` y los 2 use cases (`LeerConfigUseCase`/
 * `ActualizarConfigUseCase`) NO se exportan todavía — los consume el
 * `ConfiguracionController` que se agrega en PR5, DENTRO de este mismo
 * módulo (los providers de un módulo son visibles para sus propios
 * controllers sin necesidad de `exports`).
 *
 * Ref design: §2 Dz12, §12. Tarea: 4.12 (PR4).
 */
import { Module } from '@nestjs/common';

// ─── AuthModule (JwtAuthGuard + TenantGuard + PermissionsGuard) ──────────────
import { AuthModule } from '../auth/auth.module';

// ─── Domain ports (tokens + interfaces) ──────────────────────────────────────
import { CONFIG_RESOLVER } from './domain/ports/i-config-resolver';
import {
  CONFIGURACION_REPOSITORY,
  IConfiguracionRepository,
} from './domain/ports/i-configuracion-repository';
import { AUDIT_LOG, AuditLogPort } from './domain/ports/i-audit-log.port';
import { SECRET_CIPHER, ISecretCipher } from '../shared/domain/ports/i-secret-cipher';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '../shared/domain/ports/i-domain-event-publisher';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';

// ─── Infrastructure adapters ──────────────────────────────────────────────────
import { PrismaConfigResolver } from './infrastructure/persistence/prisma/config-resolver.adapter';
import { PrismaConfiguracionRepository } from './infrastructure/persistence/prisma/configuracion-repository.adapter';
import { PrismaAuditLog } from './infrastructure/persistence/prisma/audit-log.adapter';
import { AuditConfiguracionListener } from './infrastructure/events/audit-configuracion.listener';

// ─── Application ──────────────────────────────────────────────────────────────
import { AuditConfiguracionHandler } from './application/event-handlers/audit-configuracion.handler';
import { LeerConfigUseCase } from './application/use-cases/leer-config.use-case';
import { ActualizarConfigUseCase } from './application/use-cases/actualizar-config.use-case';

// ─── Interface — controller (PR5) ────────────────────────────────────────────
import { ConfiguracionController } from './interface/controllers/configuracion.controller';

@Module({
  imports: [AuthModule],
  exports: [CONFIG_RESOLVER],
  controllers: [ConfiguracionController],
  providers: [
    // ─── Resolver cross-DB (PR2) ────────────────────────────────────────────
    {
      provide: CONFIG_RESOLVER,
      useClass: PrismaConfigResolver,
    },

    // ─── Repositorio CRUD genérico (PR4) ────────────────────────────────────
    {
      provide: CONFIGURACION_REPOSITORY,
      useClass: PrismaConfiguracionRepository,
    },

    // ─── Audit inmutable (PR3) ───────────────────────────────────────────────
    {
      provide: AUDIT_LOG,
      useClass: PrismaAuditLog,
    },
    // AuditConfiguracionHandler: plain class (application, sin decorators
    // NestJS) — instanciada via useFactory con el puerto AUDIT_LOG (D2/D3,
    // mismo patrón que NotificarCambioEstadoHandler en tickets.module.ts).
    {
      provide: AuditConfiguracionHandler,
      useFactory: (auditLog: AuditLogPort): AuditConfiguracionHandler =>
        new AuditConfiguracionHandler(auditLog),
      inject: [AUDIT_LOG],
    },
    // AuditConfiguracionListener: clase provider `@Injectable()`/`@OnEvent`
    // para que el DiscoveryService de @nestjs/event-emitter la detecte y
    // suscriba automáticamente al bootstrap (no requiere `exports`).
    AuditConfiguracionListener,

    // ─── Use cases CRUD (PR4) ────────────────────────────────────────────────
    // Plain classes (sin decorators NestJS) — instanciadas via useFactory,
    // mismo patrón que TransicionarEstadoUseCase en tickets.module.ts.
    {
      provide: LeerConfigUseCase,
      useFactory: (repo: IConfiguracionRepository): LeerConfigUseCase =>
        new LeerConfigUseCase(repo),
      inject: [CONFIGURACION_REPOSITORY],
    },
    {
      provide: ActualizarConfigUseCase,
      useFactory: (
        repo: IConfiguracionRepository,
        secretCipher: ISecretCipher,
        publisher: IDomainEventPublisher,
        logger: ILogger,
      ): ActualizarConfigUseCase =>
        new ActualizarConfigUseCase(repo, secretCipher, publisher, logger),
      inject: [CONFIGURACION_REPOSITORY, SECRET_CIPHER, DOMAIN_EVENT_PUBLISHER, LOGGER],
    },
  ],
})
export class ConfiguracionModule {}
