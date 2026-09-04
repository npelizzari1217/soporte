/**
 * insumos.module.spec.ts — wiring de `InsumosModule`. Inspecciona la metadata
 * del decorador `@Module()` directamente (sin compilar el árbol de módulos ni
 * requerir DB) — mismo patrón que `sectores.module.spec.ts`. El grafo DI REAL
 * (con los `useFactory` reales) lo cubre `app.module.smoke.spec.ts`.
 */
import 'reflect-metadata';
import { InsumosModule } from './insumos.module';
import { FamiliasInsumoController } from './interface/controllers/familias-insumo.controller';
import { UnidadesMedidaController } from './interface/controllers/unidades-medida.controller';
import { AuthModule } from '../auth/auth.module';
import { FAMILIA_INSUMO_REPOSITORY } from './domain/ports/i-familia-insumo.repository';
import { UNIDAD_MEDIDA_REPOSITORY } from './domain/ports/i-unidad-medida.repository';

describe('InsumosModule wiring', () => {
  it('registra los controllers de los dos catálogos', () => {
    const controllers = (Reflect.getMetadata('controllers', InsumosModule) ?? []) as unknown[];
    expect(controllers).toContain(FamiliasInsumoController);
    expect(controllers).toContain(UnidadesMedidaController);
  });

  it('importa AuthModule (guards JwtAuthGuard/TenantGuard/AdminClienteGuard)', () => {
    const imports = (Reflect.getMetadata('imports', InsumosModule) ?? []) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  // Los dos puertos se exportan porque el ABM de `Insumo` (fuera de esta
  // tarea) va a resolver familia y unidad desde su propio módulo.
  it.each([
    ['FAMILIA_INSUMO_REPOSITORY', FAMILIA_INSUMO_REPOSITORY],
    ['UNIDAD_MEDIDA_REPOSITORY', UNIDAD_MEDIDA_REPOSITORY],
  ])('provee %s y lo exporta', (_nombre, token) => {
    const providers = (Reflect.getMetadata('providers', InsumosModule) ?? []) as Array<{
      provide?: unknown;
    }>;
    expect(providers.map((p) => p.provide)).toContain(token);

    const exportsMeta = (Reflect.getMetadata('exports', InsumosModule) ?? []) as unknown[];
    expect(exportsMeta).toContain(token);
  });
});
