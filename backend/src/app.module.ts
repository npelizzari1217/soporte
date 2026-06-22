import { Module } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { ClientesModule } from './clientes/clientes.module';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Los módulos de negocio se importan aquí a medida que se implementan en PRs.
 * PR-04 agrega ClientesModule (tenants master: clientes + ciclos vigentes).
 */
@Module({
  imports: [SharedModule, ClientesModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
