import { Module } from '@nestjs/common';
import { ClientesController } from './interface/controllers/clientes.controller';
import { CiclosVigentesController } from './interface/controllers/ciclos-vigentes.controller';
import { RegistrarClienteUseCase } from './application/use-cases/registrar-cliente.use-case';
import { SuspenderClienteUseCase } from './application/use-cases/suspender-cliente.use-case';
import { ReactivarClienteUseCase } from './application/use-cases/reactivar-cliente.use-case';
import { CrearCicloVigenteUseCase } from './application/use-cases/crear-ciclo-vigente.use-case';
import { CLIENTE_REPOSITORY } from './domain/ports/i-cliente.repository';
import { CICLO_VIGENTE_REPOSITORY } from './domain/ports/i-ciclo-vigente.repository';
import { PrismaClienteRepository } from './infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaCicloVigenteRepository } from './infrastructure/persistence/prisma/prisma-ciclo-vigente.repository';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';

/**
 * ClientesModule — wiring NestJS del módulo de clientes (tenants master).
 *
 * Estructura de providers (Dependency Inversion Principle):
 * - Repositorios registrados con tokens Symbol (IClienteRepository, ICicloVigenteRepository).
 * - Use cases instanciados vía useFactory para inyectar los tokens correctos.
 * - Controllers reciben use cases por constructor (NestJS los inyecta por tipo).
 *
 * Importa SharedModule vía @Global(), así que PrismaService está disponible
 * sin necesidad de importarlo explícitamente aquí.
 *
 * Tarea: 1.D.2
 */
@Module({
  controllers: [ClientesController, CiclosVigentesController],
  providers: [
    // ─── Repositorios (adaptadores de infraestructura) ─────────────────────
    {
      provide: CLIENTE_REPOSITORY,
      useClass: PrismaClienteRepository,
    },
    {
      provide: CICLO_VIGENTE_REPOSITORY,
      useClass: PrismaCicloVigenteRepository,
    },

    // ─── Use Cases (aplicación — plain classes, no @Injectable) ───────────
    {
      provide: RegistrarClienteUseCase,
      useFactory: (repo: typeof CLIENTE_REPOSITORY) => new RegistrarClienteUseCase(repo as any),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: SuspenderClienteUseCase,
      useFactory: (repo: typeof CLIENTE_REPOSITORY) => new SuspenderClienteUseCase(repo as any),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: ReactivarClienteUseCase,
      useFactory: (repo: typeof CLIENTE_REPOSITORY) => new ReactivarClienteUseCase(repo as any),
      inject: [CLIENTE_REPOSITORY],
    },
    {
      provide: CrearCicloVigenteUseCase,
      useFactory: (repo: typeof CICLO_VIGENTE_REPOSITORY) =>
        new CrearCicloVigenteUseCase(repo as any),
      inject: [CICLO_VIGENTE_REPOSITORY],
    },

    // PrismaService disponible via SharedModule (@Global), pero lo registramos
    // explícitamente aquí para que los repositorios puedan recibirlo.
    // Si SharedModule ya lo exporta globalmente, esta línea es redundante
    // pero inofensiva — NestJS usa el singleton del módulo global.
    PrismaService,
  ],
  exports: [
    RegistrarClienteUseCase,
    SuspenderClienteUseCase,
    ReactivarClienteUseCase,
    CrearCicloVigenteUseCase,
  ],
})
export class ClientesModule {}
