/**
 * acciones.guard.spec.ts — WU-6 (sdd/matriz-permisos-por-usuario).
 *
 * AccionesGuard reemplaza a PermissionsGuard + ModulosGuard (WU-7.3, todavía
 * no aplicado a ningún controller acá). Los 5 pasos en orden, R3/ADR-P4:
 * (1) sin metadata en handler NI clase → true; (2) !user → 403; (3)
 * is_global_admin → true; (4) rol ADMINISTRADOR con el par en el catálogo →
 * true; (5) AND de todas las celdas requeridas, 403 con los faltantes.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccionesGuard } from './acciones.guard';
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
  permisos: ['TICKETS:ASIGNAR'],
  is_global_admin: false,
  cliente_nombre: 'Cliente 1',
  membresias: [],
  modulos: ['TICKETS'],
  nombre: 'Test',
  apellido: 'Usuario',
};

function buildGuard(requiredCodigos: string[] | null): AccionesGuard {
  const reflector = { getAllAndOverride: () => requiredCodigos } as unknown as Reflector;
  return new AccionesGuard(reflector);
}

describe('AccionesGuard — paso 1: sin metadata → pass-through', () => {
  it.each([null, []])('metadata %s → true, endpoint abierto a cualquier autenticado', (meta) => {
    const guard = buildGuard(meta);
    expect(guard.canActivate(buildContext(BASE_PAYLOAD))).toBe(true);
  });
});

describe('AccionesGuard — paso 2: sin user → 403 defensivo', () => {
  it('metadata presente y request.user null → ForbiddenException', () => {
    const guard = buildGuard(['TICKETS:ALTAS']);
    expect(() => guard.canActivate(buildContext(null))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(buildContext(null))).toThrow(/usuario no autenticado/);
  });
});

describe('AccionesGuard — paso 3: ROOT bypassea todo', () => {
  it('is_global_admin=true, sin la celda requerida → true', () => {
    const guard = buildGuard(['COMPRAS:APROBACION']);
    const root: JwtPayload = { ...BASE_PAYLOAD, is_global_admin: true, permisos: [], rol: null };
    expect(guard.canActivate(buildContext(root))).toBe(true);
  });
});

describe('AccionesGuard — paso 4: ADMINISTRADOR bypassea cualquier par del catálogo', () => {
  it('rol ADMINISTRADOR sin la celda propia, pero el par es válido → true', () => {
    const guard = buildGuard(['COMPRAS:APROBACION']);
    const admin: JwtPayload = { ...BASE_PAYLOAD, rol: 'ADMINISTRADOR', permisos: [] };
    expect(guard.canActivate(buildContext(admin))).toBe(true);
  });

  it('rol ADMINISTRADOR con un par INEXISTENTE en el catálogo → 403 (no hay bypass mágico)', () => {
    const guard = buildGuard(['DASHBOARD:APROBACION']);
    const admin: JwtPayload = { ...BASE_PAYLOAD, rol: 'ADMINISTRADOR', permisos: [] };
    expect(() => guard.canActivate(buildContext(admin))).toThrow(ForbiddenException);
  });
});

describe('AccionesGuard — paso 5: AND de permisos, mensaje exacto', () => {
  it('usuario con la celda requerida → true', () => {
    const guard = buildGuard(['TICKETS:ASIGNAR']);
    expect(guard.canActivate(buildContext(BASE_PAYLOAD))).toBe(true);
  });

  it('usuario sin la celda requerida → 403 con mensaje exacto de faltantes', () => {
    const guard = buildGuard(['TICKETS:TRANSICIONAR']);
    expect(() => guard.canActivate(buildContext(BASE_PAYLOAD))).toThrow(
      'Acceso denegado: permisos faltantes [TICKETS:TRANSICIONAR]',
    );
  });

  it('AND de dos celdas: falta una sola → 403 lista SOLO la faltante (S8)', () => {
    const guard = buildGuard(['TICKETS:ASIGNAR', 'TICKETS:TRANSICIONAR']);
    const actor: JwtPayload = { ...BASE_PAYLOAD, permisos: ['TICKETS:ASIGNAR'] };
    expect(() => guard.canActivate(buildContext(actor))).toThrow(
      'Acceso denegado: permisos faltantes [TICKETS:TRANSICIONAR]',
    );
  });

  it('caso permisos undefined (payload legacy) → deniega sin crashear (S5, fail-closed)', () => {
    const guard = buildGuard(['TICKETS:ALTAS']);
    const actor = { ...BASE_PAYLOAD, permisos: undefined } as unknown as JwtPayload;
    expect(() => guard.canActivate(buildContext(actor))).toThrow(ForbiddenException);
  });
});
