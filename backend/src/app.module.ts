import { Module } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { ClientesModule } from './clientes/clientes.module';
import { AuthModule } from './auth/auth.module';
import { TicketsModule } from './tickets/tickets.module';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Los módulos de negocio se importan aquí a medida que se implementan en PRs.
 * PR-04 agrega ClientesModule (tenants master: clientes + ciclos vigentes).
 * PR-06 agrega AuthModule (autenticación JWT + RBAC).
 * PR-11 agrega TicketsModule (tickets-core: dominio + infra + interface).
 */
@Module({
  imports: [SharedModule, ClientesModule, AuthModule, TicketsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
