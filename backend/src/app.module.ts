import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { ClientesModule } from './clientes/clientes.module';
import { TiposComponenteModule } from './tipos-componente/tipos-componente.module';
import { TicketsModule } from './tickets/tickets.module';
import { ComprasModule } from './compras/compras.module';
import { ReparacionesModule } from './reparaciones/reparaciones.module';
import { EquiposModule } from './equipos/equipos.module';
import { SlaModule } from './sla/sla.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { KbModule } from './kb/kb.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { SectoresModule } from './sectores/sectores.module';
import { TenantScopeMiddleware } from './shared/tenancy/tenant-scope.middleware';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Andamiaje (Fase 0): la mayoría de los módulos de negocio siguen vacíos
 * (sin providers/controllers todavía). Se completan a medida que se
 * implementan los use cases de cada dominio, en orden hexagonal (domain →
 * application → infrastructure → interface). AuthModule (PR6) es el primer
 * módulo con wiring completo.
 *
 * ValidationPipe global vía APP_PIPE (whitelist + transform) en lugar de
 * `app.useGlobalPipes()` en main.ts, para que también lo hereden los tests
 * que bootstrapean AppModule directamente con `Test.createTestingModule()`.
 *
 * `TenantScopeMiddleware` (R15) se aplica a TODAS las rutas, ANTES de los
 * guards: abre el scope mutable de `TenantContext` que `TenantGuard` (PR6,
 * R12) necesita para que `bind()` propague correctamente a través de la
 * cadena de guards async + controller (ver doc de la propia middleware).
 * Rutas master/root (sin `TenantGuard`) simplemente no lo consumen — abrir
 * el scope igual es inocuo (`get()` retorna `undefined` hasta el primer `bind()`).
 */
@Module({
  imports: [
    SharedModule,
    AuthModule,
    ClientesModule,
    TiposComponenteModule,
    TicketsModule,
    ComprasModule,
    ReparacionesModule,
    EquiposModule,
    SlaModule,
    DashboardModule,
    KbModule,
    NotificacionesModule,
    SectoresModule,
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
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}
