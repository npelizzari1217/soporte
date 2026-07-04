/**
 * ComprasModule bootstrap test — regression guard para el wiring DI (R2, Fase 4).
 *
 * Riesgo R2 (design-fase4.md): el wiring de `ResolverCicloActivoParaCreacion` y
 * `CICLO_CLIENTE_REPOSITORY` en el `inject` de `CrearTicketCompraUseCase` y
 * `ListarComprasUseCase` NO lo atrapa `tsc` — un token mal escrito o un import
 * faltante solo se manifiesta en runtime como `UnknownDependenciesException`
 * al compilar el módulo NestJS real.
 *
 * Este test bootstrapea `ComprasModule` (+ `SharedModule`, que es `@Global`
 * pero no se auto-registra sin importarlo al menos una vez en el árbol de
 * testing) con `Test.createTestingModule()` real — sin mocks de providers —
 * y confirma que:
 * 1. El módulo compila sin `UnknownDependenciesException`.
 * 2. `CrearTicketCompraUseCase` se resuelve como instancia real (confirma que
 *    `ResolverCicloActivoParaCreacion` + `CICLO_CLIENTE_REPOSITORY` fueron
 *    inyectados correctamente vía `TicketsModule`).
 * 3. `ListarComprasUseCase` se resuelve como instancia real (confirma
 *    `CICLO_CLIENTE_REPOSITORY` inyectado).
 * 4. `ComprasController` se resuelve (confirma el grafo completo del módulo).
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md R2
 * Tarea: 3.2 / CRÍTICO R2 (Fase 4, PR3)
 */
import { Test } from '@nestjs/testing';
import { SharedModule } from '../shared/shared.module';
import { ComprasModule } from './compras.module';
import { ComprasController } from './interface/controllers/compras.controller';
import { CrearTicketCompraUseCase } from './application/use-cases/crear-ticket-compra.use-case';
import { ListarComprasUseCase } from './application/use-cases/listar-compras.use-case';

describe('ComprasModule bootstrap (R2 — wiring DI del ciclo activo)', () => {
  it('compila sin UnknownDependenciesException y resuelve los use cases con sus deps de ciclo activo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ComprasModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(ComprasController)).toBeInstanceOf(ComprasController);
    expect(moduleRef.get(CrearTicketCompraUseCase)).toBeInstanceOf(CrearTicketCompraUseCase);
    expect(moduleRef.get(ListarComprasUseCase)).toBeInstanceOf(ListarComprasUseCase);

    await moduleRef.close();
  });
});
