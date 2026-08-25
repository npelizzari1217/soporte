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
import { AccionesGuard } from './infrastructure/guards/acciones.guard';
import { AdminClienteGuard } from './infrastructure/guards/admin-cliente.guard';
import { GlobalAdminGuard } from './infrastructure/guards/global-admin.guard';
import { TOKEN_SERVICE } from './domain/ports/i-token.service';

describe('AuthModule wiring (T6.6)', () => {
  it('registra AuthController', () => {
    const controllers = (Reflect.getMetadata('controllers', AuthModule) ?? []) as unknown[];
    expect(controllers).toContain(AuthController);
  });

  // WU-7.3 (sdd/matriz-permisos-por-usuario): PermissionsGuard/ModulosGuard
  // se retiran del wiring — AccionesGuard/AdminClienteGuard los reemplazan.
  it.each([JwtAuthGuard, TenantGuard, AccionesGuard, AdminClienteGuard, GlobalAdminGuard])(
    '%s está en providers[]',
    (guard) => {
      const providers = (Reflect.getMetadata('providers', AuthModule) ?? []) as unknown[];
      expect(providers).toContain(guard);
    },
  );

  it.each([JwtAuthGuard, TenantGuard, AccionesGuard, AdminClienteGuard, GlobalAdminGuard])(
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

/**
 * WU-3 (sdd/fail-fast-env): el secreto de `JwtModule.register` tiene que
 * salir del contrato `entorno` (trimeado), no de una lectura cruda de
 * `process.env.JWT_SECRET`. Con un valor con espacios al borde, las dos
 * lecturas divergen — es exactamente la deriva de trim documentada en
 * `entorno.ts` y en el cierre de WU-2 (sdd/fail-fast-env/wu2-cierre-y-hook).
 *
 * `@nestjs/jwt` bakea las options síncronamente en `JwtModule.register`:
 * el DynamicModule resultante trae un provider `{ provide: 'JWT_MODULE_OPTIONS',
 * useValue: options }` (ver `node_modules/@nestjs/jwt/dist/jwt.providers.js`).
 * Inspeccionar ese `useValue.secret` deja verificar el valor congelado en el
 * decorador sin levantar un `TestingModule` completo (mismo criterio que el
 * resto de este archivo).
 */
describe('AuthModule — JWT_SECRET viene del contrato de entorno, no de process.env crudo (WU-3)', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    // También al SALIR: si no, el registro queda con un `entorno` construido a
    // partir del secreto con padding y lo hereda cualquier `describe` que se
    // agregue debajo. Que hoy no rompa nada es suerte posicional, no
    // aislamiento.
    vi.resetModules();
  });

  it('el secreto de JwtModule.register coincide con entorno.JWT_SECRET (trimeado), no con el valor crudo con espacios', async () => {
    process.env.JWT_SECRET = '  jwt-secret-con-padding  ';

    const { entorno } = await import('../config/entorno');
    const { AuthModule: AuthModuleFresco } = await import('./auth.module');
    const { JwtModule } = await import('@nestjs/jwt');

    const imports = (Reflect.getMetadata('imports', AuthModuleFresco) ?? []) as Array<{
      module?: unknown;
      providers?: Array<{ provide: unknown; useValue?: { secret?: string } }>;
    }>;
    // Por `module`, no por "el primero que traiga providers": con un segundo
    // import dinámico adelante, esa búsqueda inspeccionaría el módulo
    // equivocado.
    const jwtDynamicModule = imports.find((m) => m.module === JwtModule);
    const optionsProvider = jwtDynamicModule?.providers?.find(
      (p) => p.provide === 'JWT_MODULE_OPTIONS',
    );

    // Antes de comparar: si `@nestjs/jwt` cambiara la forma interna de su
    // provider, `optionsProvider` sería `undefined` y el `not.toBe` de abajo
    // pasaría por vacuidad en vez de avisar.
    expect(optionsProvider?.useValue?.secret).toBeTypeOf('string');
    expect(optionsProvider?.useValue?.secret).toBe(entorno.JWT_SECRET);
    expect(optionsProvider?.useValue?.secret).not.toBe(process.env.JWT_SECRET);
  });
});
