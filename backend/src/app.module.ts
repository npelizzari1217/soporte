import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { SharedModule } from './shared/shared.module';
import { ClientesModule } from './clientes/clientes.module';
import { AuthModule } from './auth/auth.module';
import { TicketsModule } from './tickets/tickets.module';
import { ComprasModule } from './compras/compras.module';
import { ReparacionesModule } from './reparaciones/reparaciones.module';
import { EquiposModule } from './equipos/equipos.module';
import { ReportesModule } from './reportes/reportes.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { TenantScopeMiddleware } from './shared/tenancy/tenant-scope.middleware';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Los módulos de negocio se importan aquí a medida que se implementan en PRs.
 * PR-04 agrega ClientesModule (tenants master: clientes + ciclos vigentes).
 * PR-06 agrega AuthModule (autenticación JWT + RBAC).
 * PR-11 agrega TicketsModule (tickets-core: dominio + use cases + infra + interface).
 * PR-13b agrega ComprasModule (compras: dominio + use cases + infra + interface).
 * PR-15b agrega ReparacionesModule (reparaciones: dominio + infra + interface).
 * PR-17b agrega EquiposModule (equipos: controllers + DTOs + module wiring).
 * PR4 admin-general agrega ReportesModule (reportes: 4 agregaciones por tenant+ciclo).
 * runtime-config-table PR5 agrega ConfiguracionModule (API de gestión de config
 * runtime — categoría smtp, RBAC configuracion:gestionar) — hace la feature
 * alcanzable por HTTP por primera vez (PR1-PR4 la construyeron sin cablear).
 *
 * PR-18 Batch 4: agrega TenantScopeMiddleware — inicializa el scope AsyncLocalStorage
 * ANTES de que los guards corran. Esto permite que TenantGuard.bind() use el patrón
 * de store mutable en lugar de enterWith(), garantizando la propagación correcta del
 * contexto en entornos donde múltiples guards async preceden al handler.
 *
 * tech-debt-validation-pipe: agrega ValidationPipe global via APP_PIPE (whitelist +
 * transform, SIN forbidNonWhitelisted — progresivo). Se registra como provider en
 * lugar de `app.useGlobalPipes()` en main.ts para que lo hereden los tests que
 * bootstrapean AppModule directamente con Test.createTestingModule() (bypasean
 * bootstrap()). Config: `{ whitelist: true, transform: true }`.
 *
 * notif-email-estado-ticket PR1: EventEmitter2 queda disponible globalmente
 * porque SharedModule (importado abajo, @Global) trae su propio
 * `EventEmitterModule.forRoot()` — el módulo que lo consume en su factory de
 * DOMAIN_EVENT_PUBLISHER es quien lo importa, no AppModule. Evita duplicar el
 * wiring de EventEmitterModule en dos lugares distintos.
 */
@Module({
  imports: [
    SharedModule,
    ClientesModule,
    AuthModule,
    TicketsModule,
    ComprasModule,
    ReparacionesModule,
    EquiposModule,
    // PR4 — reportes: 4 agregaciones de solo lectura por tenant+ciclo
    ReportesModule,
    // runtime-config-table PR5 — API de gestión de configuración runtime (smtp)
    ConfiguracionModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}
