/**
 * auth.module.spec.ts — TDD RED phase (T6.6, PR6).
 *
 * Test de wiring de AuthModule: inspecciona la metadata del decorador
 * `@Module()` directamente (sin compilar el árbol de módulos ni requerir
 * DB) — verifica que los guards estén declarados como providers/exports y
 * que el controller esté registrado. La cobertura funcional completa (DI
 * real contra Postgres) vive en `auth.e2e.spec.ts` de este mismo PR.
 */
import 'reflect-metadata';
import { AuthModule } from './auth.module';
import { AuthController } from './interface/controllers/auth.controller';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from './infrastructure/guards/tenant.guard';
import { PermissionsGuard } from './infrastructure/guards/permissions.guard';
import { GlobalAdminGuard } from './infrastructure/guards/global-admin.guard';
import { TOKEN_SERVICE } from './domain/ports/i-token.service';

describe('AuthModule wiring (T6.6)', () => {
  it('registra AuthController', () => {
    const controllers = (Reflect.getMetadata('controllers', AuthModule) ?? []) as unknown[];
    expect(controllers).toContain(AuthController);
  });

  it.each([JwtAuthGuard, TenantGuard, PermissionsGuard, GlobalAdminGuard])(
    '%s está en providers[]',
    (guard) => {
      const providers = (Reflect.getMetadata('providers', AuthModule) ?? []) as unknown[];
      expect(providers).toContain(guard);
    },
  );

  it.each([JwtAuthGuard, TenantGuard, PermissionsGuard, GlobalAdminGuard])(
    '%s está en exports[] (consumido por otros módulos vía UseGuards)',
    (guard) => {
      const exportsList = (Reflect.getMetadata('exports', AuthModule) ?? []) as unknown[];
      expect(exportsList).toContain(guard);
    },
  );

  it('exporta TOKEN_SERVICE', () => {
    const exportsList = (Reflect.getMetadata('exports', AuthModule) ?? []) as unknown[];
    expect(exportsList).toContain(TOKEN_SERVICE);
  });

  it('importa JwtModule', () => {
    const imports = (Reflect.getMetadata('imports', AuthModule) ?? []) as unknown[];
    // JwtModule.register() retorna un DynamicModule con `module: JwtModule`.
    const hasJwtModule = imports.some((m) => typeof m === 'object' && m !== null && 'module' in m);
    expect(hasJwtModule).toBe(true);
  });
});
