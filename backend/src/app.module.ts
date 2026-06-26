import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { ClientesModule } from './clientes/clientes.module';
import { AuthModule } from './auth/auth.module';
import { TicketsModule } from './tickets/tickets.module';
import { ComprasModule } from './compras/compras.module';
import { ReparacionesModule } from './reparaciones/reparaciones.module';
import { EquiposModule } from './equipos/equipos.module';
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
 *
 * PR-18 Batch 4: agrega TenantScopeMiddleware — inicializa el scope AsyncLocalStorage
 * ANTES de que los guards corran. Esto permite que TenantGuard.bind() use el patrón
 * de store mutable en lugar de enterWith(), garantizando la propagación correcta del
 * contexto en entornos donde múltiples guards async preceden al handler.
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}
