import { Module } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Los módulos de negocio (TicketsModule, AuthModule, etc.) se importarán
 * aquí a medida que se vayan implementando en los PRs sucesivos.
 */
@Module({
  imports: [SharedModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
