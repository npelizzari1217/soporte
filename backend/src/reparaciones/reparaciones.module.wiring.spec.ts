/**
 * TEST — Wiring de DI REAL para ReparacionesModule (R2, ciclos-master-tenant Fase 4 PR4).
 *
 * Por qué este test existe: `tsc --noEmit` NO detecta errores de wiring de
 * NestJS (tokens faltantes en `inject`, providers no exportados, etc.) —
 * esos errores solo aparecen en runtime, cuando Nest intenta resolver el
 * grafo de dependencias. R2 (design-fase4.md) señala este riesgo como ALTO.
 *
 * Este test bootstrapea `ReparacionesModule` con `Test.createTestingModule`
 * (compilación REAL del grafo de módulos: ReparacionesModule → AuthModule +
 * TicketsModule → SharedModule @Global) SIN mocks, y confirma que:
 * - El módulo compila sin errores de DI.
 * - `CrearTicketEdilicioUseCase` resuelve con `ResolverCicloActivoParaCreacion`
 *   inyectado (exportado por `TicketsModule`, ADR-1).
 * - `ListarReparacionesUseCase` resuelve con `CICLO_CLIENTE_REPOSITORY`
 *   inyectado (exportado por `TicketsModule`, ADR-4-Repo).
 *
 * No se llama `.init()` — solo `.compile()` construye e instancia todo el
 * árbol de providers (constructores), sin abrir conexiones de red reales:
 * `PrismaService` crea un `pg.Pool` de forma perezosa (no conecta en el
 * constructor) y `JwtModule.register` solo necesita un secret string.
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md R2, ADR-1, ADR-4-Repo
 * Tarea: 4.x (Fase 4, PR4) — riesgo crítico R2 pedido explícitamente para este PR
 */
import { Test } from '@nestjs/testing';

import { SharedModule } from '../shared/shared.module';
import { ReparacionesModule } from './reparaciones.module';

import { CrearTicketEdilicioUseCase } from './application/use-cases/crear-ticket-edilicio.use-case';
import { ListarReparacionesUseCase } from './application/use-cases/listar-reparaciones.use-case';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';
import { CICLO_CLIENTE_REPOSITORY } from '../tickets/domain/ports/i-ciclo-cliente.repository';

describe('ReparacionesModule — wiring DI real (R2, ciclos-master-tenant Fase 4 PR4)', () => {
  beforeAll(() => {
    // SharedModule (@Global) lee DATABASE_URL_MASTER en su useFactory de PrismaService.
    // pg.Pool no conecta en el constructor — un valor sintácticamente válido basta
    // para que el grafo de DI compile sin abrir conexiones reales.
    process.env.DATABASE_URL_MASTER =
      process.env.DATABASE_URL_MASTER ??
      'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
  });

  it('compila el módulo real (AuthModule + TicketsModule + SharedModule) sin errores de DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ReparacionesModule],
    }).compile();

    expect(moduleRef).toBeDefined();
  });

  it('resuelve CrearTicketEdilicioUseCase con ResolverCicloActivoParaCreacion inyectado', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ReparacionesModule],
    }).compile();

    const useCase = moduleRef.get(CrearTicketEdilicioUseCase);
    expect(useCase).toBeInstanceOf(CrearTicketEdilicioUseCase);
  });

  it('resuelve ListarReparacionesUseCase con CICLO_CLIENTE_REPOSITORY inyectado', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ReparacionesModule],
    }).compile();

    const useCase = moduleRef.get(ListarReparacionesUseCase);
    expect(useCase).toBeInstanceOf(ListarReparacionesUseCase);
  });

  it('CICLO_CLIENTE_REPOSITORY y ResolverCicloActivoParaCreacion son resolvibles dentro del grafo de ReparacionesModule (exportados por TicketsModule)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ReparacionesModule],
    }).compile();

    expect(moduleRef.get(CICLO_CLIENTE_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(ResolverCicloActivoParaCreacion)).toBeInstanceOf(
      ResolverCicloActivoParaCreacion,
    );
  });
});
