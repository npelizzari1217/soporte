import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { ClientesModule } from './clientes/clientes.module';
import { TicketsModule } from './tickets/tickets.module';
import { ReglasAsignacionModule } from './reglas-asignacion/reglas-asignacion.module';
import { ComprasModule } from './compras/compras.module';
import { ReparacionesModule } from './reparaciones/reparaciones.module';
import { EquiposModule } from './equipos/equipos.module';
import { TicketPdfModule } from './ticket-pdf/ticket-pdf.module';
import { SlaModule } from './sla/sla.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { KbModule } from './kb/kb.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { SectoresModule } from './sectores/sectores.module';
import { RespuestasPredefinidasModule } from './respuestas-predefinidas/respuestas-predefinidas.module';
import { InsumosModule } from './insumos/insumos.module';
import { CsatModule } from './csat/csat.module';
import { PreventivoModule } from './preventivo/preventivo.module';
import { RecuperacionPasswordModule } from './auth/recuperacion-password.module';
import { FormularioPublicoModule } from './publico/formulario-publico.module';
import { TenantScopeMiddleware } from './shared/tenancy/tenant-scope.middleware';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Cada módulo de negocio se arma en orden hexagonal (domain → application →
 * infrastructure → interface) y se registra acá cuando tiene wiring completo.
 * El andamiaje vacío de la Fase 0 ya no existe: los módulos listados abajo
 * tienen providers y controllers de verdad.
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
 *
 * `ScheduleModule.forRoot()` (ola-2 WU-0): habilita `@Cron` para toda la app.
 * Vive ACÁ, no en un módulo de feature — `SlaModule` lo llamaba antes
 * (GATE G2, dep `@nestjs/schedule`) y se movió acá porque un segundo módulo
 * con `@Cron` (`preventivo`) que también lo llamara duplicaría `forRoot()` y
 * fallaría al bootear, no al compilar.
 */
@Module({
  imports: [
    SharedModule,
    ScheduleModule.forRoot(),
    AuthModule,
    ClientesModule,
    TicketsModule,
    ReglasAsignacionModule,
    ComprasModule,
    ReparacionesModule,
    EquiposModule,
    TicketPdfModule,
    SlaModule,
    DashboardModule,
    KbModule,
    NotificacionesModule,
    SectoresModule,
    RespuestasPredefinidasModule,
    InsumosModule,
    CsatModule,
    PreventivoModule,
    RecuperacionPasswordModule,
    FormularioPublicoModule,
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
