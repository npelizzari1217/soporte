import { Module } from '@nestjs/common';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Los módulos de negocio (TicketsModule, AuthModule, etc.) se importarán
 * aquí a medida que se vayan implementando en los PRs sucesivos.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
