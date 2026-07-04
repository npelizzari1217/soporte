/**
 * TicketsModule — bootstrap/wiring regression guard (Fase 4, PR2, R2).
 *
 * R2 (design-fase4.md, ALTA): el wiring de DI de `ResolverCicloActivoParaCreacion`
 * y `CICLO_CLIENTE_REPOSITORY` en los use cases de creación/listado NO lo atrapa
 * `tsc --noEmit` (es un fallo de runtime de Nest, no de tipos). Este test
 * bootstrapea el módulo REAL (sin mocks unitarios) vía `Test.createTestingModule`
 * y confirma que `CrearTicketUseCase` y `ListarTicketsUseCase` resuelven sus
 * dependencias de ciclo por el contenedor de DI, no por construcción manual.
 *
 * SharedModule se importa junto a TicketsModule porque es @Global pero sus
 * providers (PrismaService, TenantContext, TENANT_TRANSACTION_RUNNER,
 * FILE_STORAGE) solo quedan disponibles si algún módulo del árbol de test lo
 * importa explícitamente — TicketsModule/AuthModule no lo hacen (lo esperan
 * del árbol de AppModule en producción). compile()/init() no abren conexión
 * real a DB (mismo patrón que app.module.spec.ts — PrismaService es lazy).
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md R2
 * Tarea: 2.x (Fase 4, PR2) — pedido explícito de sdd-apply para cubrir R2 en PR2.
 */
import { Test } from '@nestjs/testing';
import { TicketsModule } from './tickets.module';
import { SharedModule } from '../shared/shared.module';
import { TicketsController } from './interface/controllers/tickets.controller';
import { CrearTicketUseCase } from './application/use-cases/crear-ticket.use-case';
import { ListarTicketsUseCase } from './application/use-cases/listar-tickets.use-case';
import { ResolverCicloActivoParaCreacion } from './application/services/resolver-ciclo-activo.service';
import { CICLO_CLIENTE_REPOSITORY } from './domain/ports/i-ciclo-cliente.repository';

describe('TicketsModule bootstrap (Fase 4, PR2 — R2 DI wiring regression guard)', () => {
  it('compila sin UnknownDependenciesException y resuelve el resolver de ciclo activo por DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, TicketsModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(TicketsController)).toBeInstanceOf(TicketsController);

    // CrearTicketUseCase resuelto por el contenedor real (no instanciado a mano
    // en un test unitario) — si el useFactory/inject de TicketsModule no
    // incluyera ResolverCicloActivoParaCreacion, compile() ya habría lanzado
    // UnknownDependenciesException antes de llegar acá.
    const crearTicketUseCase = moduleRef.get(CrearTicketUseCase);
    expect(crearTicketUseCase).toBeInstanceOf(CrearTicketUseCase);

    // El propio resolver debe ser resolvible como provider exportado (ADR-1) —
    // confirma que compras/reparaciones/equipos (PR3-5) van a poder importarlo.
    expect(moduleRef.get(ResolverCicloActivoParaCreacion)).toBeInstanceOf(
      ResolverCicloActivoParaCreacion,
    );

    // Verificación de wiring POSICIONAL (no solo "resuelve algo"): un useFactory
    // con `inject` desalineado respecto de sus parámetros NO lanza en compile()
    // — Nest simplemente pasa los valores en el orden dado, y un parámetro sin
    // entrada correspondiente en `inject` recibe el valor del siguiente token
    // (o `undefined`), silenciosamente. Confirmado empíricamente quitando
    // `ResolverCicloActivoParaCreacion` del array `inject` de CrearTicketUseCase:
    // compile()/init() siguieron pasando, pero el campo quedaba con la instancia
    // de OTRO provider (no `ResolverCicloActivoParaCreacion`). Por eso este test
    // inspecciona el campo real de la instancia, no solo su tipo declarado.
    const resolverInjectado = (crearTicketUseCase as unknown as { resolverCicloActivo: unknown })
      .resolverCicloActivo;
    expect(resolverInjectado).toBeInstanceOf(ResolverCicloActivoParaCreacion);

    // ListarTicketsUseCase resuelto con CICLO_CLIENTE_REPOSITORY wireado (ADR-5).
    const listarTicketsUseCase = moduleRef.get(ListarTicketsUseCase);
    expect(listarTicketsUseCase).toBeInstanceOf(ListarTicketsUseCase);
    expect(moduleRef.get(CICLO_CLIENTE_REPOSITORY)).toBeDefined();
    const cicloRepoInjectado = (listarTicketsUseCase as unknown as { cicloClienteRepo: unknown })
      .cicloClienteRepo;
    expect(cicloRepoInjectado).toBe(moduleRef.get(CICLO_CLIENTE_REPOSITORY));

    await moduleRef.close();
  });
});
