/**
 * W1 Bootstrap test — Regression guard para el DI graph de AppModule.
 *
 * Compila el módulo completo sin necesidad de una DB activa:
 * PrismaService se construye con DATABASE_URL_MASTER ?? '' (SharedModule factory),
 * y ni Pool ni MasterPrismaClient abren conexiones hasta la primera query.
 *
 * ESTE TEST FALLA (RED) cuando ClientesModule.providers declara PrismaService
 * localmente (shorthand = useClass: PrismaService) porque NestJS no encuentra
 * un provider para el token String requerido por el constructor de PrismaService
 * → UnknownDependenciesException en la fase de compile().
 *
 * PASA (GREEN) una vez que PrismaService se elimina de ClientesModule.providers:
 * los repositorios reciben el singleton global de SharedModule (@Global).
 */
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ClientesController } from './clientes/interface/controllers/clientes.controller';
import { RegistrarClienteUseCase } from './clientes/application/use-cases/registrar-cliente.use-case';
import { AuthController } from './auth/interface/controllers/auth.controller';
import { JwtAuthGuard } from './auth/infrastructure/guards/jwt-auth.guard';
import { TicketsController } from './tickets/interface/controllers/tickets.controller';
import { CrearTicketUseCase } from './tickets/application/use-cases/crear-ticket.use-case';
import { TICKET_REPOSITORY } from './tickets/domain/ports/i-ticket.repository';
import {
  TicketStateMachineFactory,
  TICKET_STATE_MACHINE_FACTORY,
} from './tickets/domain/state-machine/ticket-state-machine.factory';
import { ComprasController } from './compras/interface/controllers/compras.controller';
import { ComprasStateMachine } from './compras/domain/state-machine/compras-state-machine';

describe('AppModule bootstrap', () => {
  it('compila el grafo de módulos sin UnknownDependenciesException (C1 DI regression guard)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(ClientesController)).toBeInstanceOf(ClientesController);
    expect(moduleRef.get(RegistrarClienteUseCase)).toBeInstanceOf(RegistrarClienteUseCase);
    // PR-06: AuthModule wired correctly
    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
    expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);
    // PR-11: TicketsModule wired correctly (WARNING-2 bootstrap guard)
    expect(moduleRef.get(TicketsController)).toBeInstanceOf(TicketsController);
    expect(moduleRef.get(CrearTicketUseCase)).toBeInstanceOf(CrearTicketUseCase);
    expect(moduleRef.get(TICKET_REPOSITORY)).toBeDefined();
    // PR-13b: ComprasModule wired correctly
    expect(moduleRef.get(ComprasController)).toBeInstanceOf(ComprasController);
    // W1: onModuleInit debe registrar ComprasStateMachine — requires moduleRef.init()
    const factory = moduleRef.get<TicketStateMachineFactory>(TICKET_STATE_MACHINE_FACTORY);
    expect(factory.resolve('COMPRAS')).toBeInstanceOf(ComprasStateMachine);

    await moduleRef.close();
  });
});
