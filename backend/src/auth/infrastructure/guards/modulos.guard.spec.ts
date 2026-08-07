/**
 * modulos.guard.spec.ts — feature 5.2 CAPA 2 (enforcement backend del eje
 * "módulos asignados por usuario").
 *
 * ModulosGuard: exige que el módulo declarado vía `@RequireModulo(...)` esté
 * en `payload.modulos`. Sin metadata → pass-through. `request.user` null →
 * 403. ROOT (`is_global_admin`) bypassea. NUNCA consulta DB (lee el JWT).
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModulosGuard } from './modulos.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

function buildContext(user: JwtPayload | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const BASE_PAYLOAD: JwtPayload = {
  sub: 'usuario-1',
  cliente_id: 'cliente-1',
  rol: 'TECNICO',
  permisos: [],
  is_global_admin: false,
  cliente_nombre: 'Cliente 1',
  membresias: [],
  modulos: ['SOPORTE', 'COMPRAS'],
};

describe('ModulosGuard (5.2 CAPA 2)', () => {
  function buildGuard(moduloRequerido: string | null): ModulosGuard {
    const reflector = {
      getAllAndOverride: () => moduloRequerido,
    } as unknown as Reflector;
    return new ModulosGuard(reflector);
  }

  it('sin metadata de módulo → pass-through (true)', () => {
    const guard = buildGuard(null);
    const context = buildContext(BASE_PAYLOAD);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('request.user null con metadata presente → ForbiddenException', () => {
    const guard = buildGuard('COMPRAS');
    const context = buildContext(null);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('ROOT (is_global_admin=true, modulos=[]) → true (bypass, ROOT puede TODO)', () => {
    const guard = buildGuard('EDILICIA');
    const rootUser: JwtPayload = {
      ...BASE_PAYLOAD,
      is_global_admin: true,
      modulos: [],
      cliente_id: null,
      rol: null,
    };
    const context = buildContext(rootUser);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('usuario CON el módulo requerido → true', () => {
    const guard = buildGuard('COMPRAS');
    const context = buildContext(BASE_PAYLOAD);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('usuario SIN el módulo requerido → ForbiddenException', () => {
    const guard = buildGuard('EDILICIA');
    const context = buildContext(BASE_PAYLOAD);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
