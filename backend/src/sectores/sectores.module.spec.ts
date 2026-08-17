/**
 * sectores.module.spec.ts — wiring de `SectoresModule` (WU-07). Inspecciona
 * la metadata del decorador `@Module()` directamente (sin compilar el árbol
 * de módulos ni requerir DB) — mismo patrón que `tipos-componente.module.spec.ts`.
 * El grafo DI REAL (`useFactory` real) se cubre en `sectores.e2e.spec.ts` (WU-08).
 */
import 'reflect-metadata';
import { SectoresModule } from './sectores.module';
import { SectoresController } from './interface/controllers/sectores.controller';
import { AuthModule } from '../auth/auth.module';
import { SECTOR_REPOSITORY } from './domain/ports/i-sector.repository';

describe('SectoresModule wiring (WU-07)', () => {
  it('registra SectoresController', () => {
    const controllers = (Reflect.getMetadata('controllers', SectoresModule) ?? []) as unknown[];
    expect(controllers).toContain(SectoresController);
  });

  it('importa AuthModule (guards JwtAuthGuard/TenantGuard/AdminClienteGuard)', () => {
    const imports = (Reflect.getMetadata('imports', SectoresModule) ?? []) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  it('provee SECTOR_REPOSITORY y lo exporta (consumido por ComprasModule, WU-09)', () => {
    const providers = (Reflect.getMetadata('providers', SectoresModule) ?? []) as Array<{
      provide?: unknown;
    }>;
    const tokens = providers.map((p) => p.provide);
    expect(tokens).toContain(SECTOR_REPOSITORY);

    const exportsMeta = (Reflect.getMetadata('exports', SectoresModule) ?? []) as unknown[];
    expect(exportsMeta).toContain(SECTOR_REPOSITORY);
  });
});
