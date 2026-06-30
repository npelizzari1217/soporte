/**
 * W1 [RED] — Test de wiring de AuthModule: GlobalAdminGuard debe estar en providers y exports.
 *
 * Usa Reflect.getMetadata para inspeccionar la metadata del decorador @Module()
 * directamente — sin compilar el módulo completo ni mockar dependencias de DB.
 * Esto es atómico: prueba exactamente que el guard está declarado en el wiring,
 * que es la causa raíz del defecto ("funciona de casualidad, no por diseño").
 *
 * Spec ref: admin-general/verify-report — W1 — GlobalAdminGuard en AuthModule
 * Tarea: PR1 corrección post-verify
 */

import 'reflect-metadata';
import { GlobalAdminGuard } from './infrastructure/guards/global-admin.guard';
import { AuthModule } from './auth.module';

describe('AuthModule wiring — GlobalAdminGuard', () => {
  it('debe tener GlobalAdminGuard en providers[]', () => {
    // @Module({ providers: [...] }) almacena la lista bajo la clave 'providers'
    const providers = (Reflect.getMetadata('providers', AuthModule) ?? []) as unknown[];
    expect(providers).toContain(GlobalAdminGuard);
  });

  it('debe tener GlobalAdminGuard en exports[]', () => {
    // @Module({ exports: [...] }) almacena la lista bajo la clave 'exports'
    const exports = (Reflect.getMetadata('exports', AuthModule) ?? []) as unknown[];
    expect(exports).toContain(GlobalAdminGuard);
  });
});
