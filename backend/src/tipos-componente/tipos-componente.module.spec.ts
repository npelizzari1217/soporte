/**
 * tipos-componente.module.spec.ts — wiring de `TiposComponenteModule`
 * (sdd/tipos-componente-master, PR2).
 *
 * Inspecciona la metadata del decorador `@Module()` directamente (sin
 * compilar el árbol de módulos ni requerir DB) — mismo patrón que
 * `equipos.module.spec.ts`/`compras.module.spec.ts`.
 */
import 'reflect-metadata';
import { TiposComponenteModule } from './tipos-componente.module';
import { TiposComponenteController } from './interface/controllers/tipos-componente.controller';
import { AuthModule } from '../auth/auth.module';
import { TIPO_COMPONENTE_MASTER_REPOSITORY } from './domain/ports/i-tipo-componente-master.repository';

describe('TiposComponenteModule wiring (sdd/tipos-componente-master, PR2)', () => {
  it('registra TiposComponenteController', () => {
    const controllers = (Reflect.getMetadata('controllers', TiposComponenteModule) ??
      []) as unknown[];
    expect(controllers).toContain(TiposComponenteController);
  });

  it('importa AuthModule (guards JwtAuthGuard/GlobalAdminGuard)', () => {
    const imports = (Reflect.getMetadata('imports', TiposComponenteModule) ?? []) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  it('provee TIPO_COMPONENTE_MASTER_REPOSITORY', () => {
    const providers = (Reflect.getMetadata('providers', TiposComponenteModule) ?? []) as Array<{
      provide?: unknown;
    }>;
    const tokens = providers.map((p) => p.provide);
    expect(tokens).toContain(TIPO_COMPONENTE_MASTER_REPOSITORY);
  });
});
