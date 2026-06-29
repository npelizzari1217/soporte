/**
 * P3.T8 [RED → GREEN con P3.T9] — Unit tests para TransicionEstadoPermisosGuard.
 *
 * El guard mapea `request.body.nuevoEstadoCodigo` a un permiso granular:
 *   APROBADO     → ticket:aprobar
 *   RECHAZADO    → ticket:rechazar
 *   cualquier otro valor válido → ticket:transicionar
 *   body vacío o sin nuevoEstadoCodigo → false (deniega por defecto)
 *
 * Cierra bug activo: PATCH /tickets/:id/estado carecía de autorización granular (ADR-4).
 *
 * Ref design: ADR-4
 * Ref spec: Req Autorización granular por arco (tickets-core/spec.md)
 * Change: tickets-maquina-estados-observaciones / PR3
 * Task: P3.T8
 */

import { ExecutionContext } from '@nestjs/common';
import { TransicionEstadoPermisosGuard } from './transicion-estado-permisos.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(permisos: string[]): JwtPayload {
  return {
    sub: 'user-001',
    cliente_id: 'cli-001',
    email: 'test@test.com',
    roles: ['ADMIN'],
    permisos,
    cliente_nombre: 'Test Corp',
  };
}

function makeContext(
  user: JwtPayload | null,
  body: Record<string, unknown> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, body }),
    }),
  } as unknown as ExecutionContext;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TransicionEstadoPermisosGuard', () => {
  let guard: TransicionEstadoPermisosGuard;

  beforeEach(() => {
    guard = new TransicionEstadoPermisosGuard();
  });

  // ─── Mapeo APROBADO → ticket:aprobar ────────────────────────────────────────

  describe('nuevoEstadoCodigo: APROBADO → requiere ticket:aprobar', () => {
    it('retorna true cuando el usuario tiene ticket:aprobar', () => {
      const ctx = makeContext(makeUser(['ticket:aprobar']), { nuevoEstadoCodigo: 'APROBADO' });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('retorna false cuando el usuario NO tiene ticket:aprobar', () => {
      const ctx = makeContext(makeUser(['ticket:transicionar']), { nuevoEstadoCodigo: 'APROBADO' });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('retorna false cuando el usuario tiene ticket:rechazar pero no ticket:aprobar', () => {
      const ctx = makeContext(makeUser(['ticket:rechazar']), { nuevoEstadoCodigo: 'APROBADO' });
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  // ─── Mapeo RECHAZADO → ticket:rechazar ──────────────────────────────────────

  describe('nuevoEstadoCodigo: RECHAZADO → requiere ticket:rechazar', () => {
    it('retorna true cuando el usuario tiene ticket:rechazar', () => {
      const ctx = makeContext(makeUser(['ticket:rechazar']), { nuevoEstadoCodigo: 'RECHAZADO' });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('retorna false cuando el usuario NO tiene ticket:rechazar', () => {
      const ctx = makeContext(makeUser(['ticket:aprobar']), { nuevoEstadoCodigo: 'RECHAZADO' });
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  // ─── Mapeo arcos técnicos → ticket:transicionar ──────────────────────────────

  describe('arcos técnicos → requieren ticket:transicionar', () => {
    const codigosTecnicos = ['EN_PROGRESO', 'RESUELTO', 'SUSPENDIDO', 'SIN_SOLUCION'];

    codigosTecnicos.forEach((codigo) => {
      it(`retorna true para ${codigo} cuando el usuario tiene ticket:transicionar`, () => {
        const ctx = makeContext(makeUser(['ticket:transicionar']), {
          nuevoEstadoCodigo: codigo,
        });
        expect(guard.canActivate(ctx)).toBe(true);
      });

      it(`retorna false para ${codigo} cuando NO tiene ticket:transicionar`, () => {
        const ctx = makeContext(makeUser(['ticket:aprobar', 'ticket:rechazar']), {
          nuevoEstadoCodigo: codigo,
        });
        expect(guard.canActivate(ctx)).toBe(false);
      });
    });
  });

  // ─── Body vacío o sin nuevoEstadoCodigo ──────────────────────────────────────

  describe('body vacío o sin nuevoEstadoCodigo → false (deny-by-default)', () => {
    it('retorna false cuando body es {}', () => {
      const ctx = makeContext(
        makeUser(['ticket:transicionar', 'ticket:aprobar', 'ticket:rechazar']),
        {},
      );
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('retorna false cuando nuevoEstadoCodigo es undefined', () => {
      const ctx = makeContext(makeUser(['ticket:transicionar']), { nuevoEstadoCodigo: undefined });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('retorna false cuando body es null (sin body)', () => {
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ user: makeUser(['ticket:transicionar']), body: null }),
        }),
      } as unknown as ExecutionContext;
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  // ─── Sin usuario (request.user null) ─────────────────────────────────────────

  describe('sin usuario autenticado → false', () => {
    it('retorna false cuando request.user es null', () => {
      const ctx = makeContext(null, { nuevoEstadoCodigo: 'APROBADO' });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('retorna false cuando user.permisos es undefined', () => {
      const userSinPermisos = { ...makeUser([]), permisos: undefined as unknown as string[] };
      const ctx = makeContext(userSinPermisos, { nuevoEstadoCodigo: 'EN_PROGRESO' });
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  // ─── ADMIN con todos los permisos ────────────────────────────────────────────

  it('ADMIN con todos los permisos puede aprobar, rechazar y transicionar', () => {
    const adminPermisos = ['ticket:aprobar', 'ticket:rechazar', 'ticket:transicionar'];
    const admin = makeUser(adminPermisos);

    expect(guard.canActivate(makeContext(admin, { nuevoEstadoCodigo: 'APROBADO' }))).toBe(true);
    expect(guard.canActivate(makeContext(admin, { nuevoEstadoCodigo: 'RECHAZADO' }))).toBe(true);
    expect(guard.canActivate(makeContext(admin, { nuevoEstadoCodigo: 'EN_PROGRESO' }))).toBe(true);
    expect(guard.canActivate(makeContext(admin, { nuevoEstadoCodigo: 'RESUELTO' }))).toBe(true);
    expect(guard.canActivate(makeContext(admin, { nuevoEstadoCodigo: 'SUSPENDIDO' }))).toBe(true);
    expect(guard.canActivate(makeContext(admin, { nuevoEstadoCodigo: 'SIN_SOLUCION' }))).toBe(true);
  });
});
