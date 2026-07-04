/**
 * EquiposModule bootstrap test — DI regression guard (Fase 4, ciclos-master-tenant, R2).
 *
 * Compila EquiposModule de forma AISLADA (no AppModule completo) para confirmar
 * que el wiring de `ResolverCicloActivoParaCreacion` (exportado por TicketsModule,
 * ver ADR-1/ADR-4-Repo) resuelve correctamente en runtime. `tsc --noEmit` NO
 * detecta este tipo de error: un token de `inject` sin provider correspondiente
 * solo falla al invocar `Test.createTestingModule({...}).compile()`.
 *
 * SharedModule se importa explícitamente porque es @Global pero necesita estar
 * presente en el árbol de módulos compilado para registrar sus providers
 * (PrismaService, TenantContext, TENANT_TRANSACTION_RUNNER) — en AppModule esto
 * ocurre automáticamente porque AppModule lo importa; aquí, al testear
 * EquiposModule en aislamiento, hay que importarlo a mano.
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md §6 R2
 * Ref tasks: tasks-fase4.md Phase 5 (PR5, equipos/soporte) — riesgo crítico R2
 */
import { Test } from '@nestjs/testing';
import { EquiposModule } from './equipos.module';
import { SharedModule } from '../shared/shared.module';
import { EquiposController } from './interface/controllers/equipos.controller';
import { ComponentesController } from './interface/controllers/componentes.controller';
import { TicketSoporteController } from './interface/controllers/ticket-soporte.controller';
import { CrearTicketSoporteUseCase } from './application/use-cases/crear-ticket-soporte.use-case';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';
import { CICLO_CLIENTE_REPOSITORY } from '../tickets/domain/ports/i-ciclo-cliente.repository';

describe('EquiposModule bootstrap (Fase 4, R2 — DI de ciclo activo)', () => {
  it('compila el módulo sin UnknownDependenciesException', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, EquiposModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  });

  it('resuelve CrearTicketSoporteUseCase con ResolverCicloActivoParaCreacion inyectado', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, EquiposModule],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(EquiposController)).toBeInstanceOf(EquiposController);
    expect(moduleRef.get(ComponentesController)).toBeInstanceOf(ComponentesController);
    expect(moduleRef.get(TicketSoporteController)).toBeInstanceOf(TicketSoporteController);
    expect(moduleRef.get(CrearTicketSoporteUseCase)).toBeInstanceOf(CrearTicketSoporteUseCase);
    expect(moduleRef.get(ResolverCicloActivoParaCreacion)).toBeInstanceOf(
      ResolverCicloActivoParaCreacion,
    );
    expect(moduleRef.get(CICLO_CLIENTE_REPOSITORY)).toBeDefined();

    await moduleRef.close();
  });
});
