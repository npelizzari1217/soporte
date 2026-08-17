/**
 * prisma-membresia.repository.spec.ts — unit, sin DB (fix post-verify C2,
 * sdd/matriz-permisos-por-usuario).
 *
 * RED→GREEN puntual: `MEMBRESIA_RESUELTA_INCLUDE` NO debe pedir
 * `rol.rolesPermisos` — ese JOIN toca `roles_permisos`/`permisos`, las tablas
 * que `drop-legacy-rbac-matriz-vieja.sql` (WU-9) dropea. Si el include
 * volviera a pedirlo, `findActivaByUsuarioYCliente` (login/switch/refresh)
 * rompería el día que corra ese DROP. Test de forma, no de contenido de DB:
 * no requiere Postgres, corre en el loop TDD normal.
 */
import { MEMBRESIA_RESUELTA_INCLUDE } from './prisma-membresia.repository';

describe('MEMBRESIA_RESUELTA_INCLUDE (fix post-verify C2)', () => {
  it('[CRITICAL] no incluye rol.rolesPermisos (JOIN muerto sobre tablas que WU-9 dropea)', () => {
    expect(MEMBRESIA_RESUELTA_INCLUDE.rol).not.toHaveProperty('include');
    expect(MEMBRESIA_RESUELTA_INCLUDE.rol).toBe(true);
  });

  it('sigue incluyendo cliente (login necesita clienteId/clienteNombre)', () => {
    expect(MEMBRESIA_RESUELTA_INCLUDE.cliente).toBe(true);
  });
});
