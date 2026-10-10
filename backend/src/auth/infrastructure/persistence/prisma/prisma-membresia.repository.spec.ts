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
import { vi } from 'vitest';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  MEMBRESIA_RESUELTA_INCLUDE,
  PrismaMembresiaRepository,
} from './prisma-membresia.repository';

describe('MEMBRESIA_RESUELTA_INCLUDE (fix post-verify C2)', () => {
  it('[CRITICAL] no incluye rol.rolesPermisos (JOIN muerto sobre tablas que WU-9 dropea)', () => {
    expect(MEMBRESIA_RESUELTA_INCLUDE.rol).not.toHaveProperty('include');
    expect(MEMBRESIA_RESUELTA_INCLUDE.rol).toBe(true);
  });

  it('sigue incluyendo cliente (login necesita clienteId/clienteNombre)', () => {
    expect(MEMBRESIA_RESUELTA_INCLUDE.cliente).toBe(true);
  });
});

describe('PrismaMembresiaRepository.findActivasByCliente — esIntegracion (sdd/api-publica)', () => {
  it('propaga la marca del usuario a cada fila', async () => {
    const usuario = (id: string, esIntegracion: boolean) => ({
      id,
      nombre: 'N',
      apellido: 'A',
      email: `${id}@x.com`,
      esIntegracion,
    });
    const findMany = vi.fn().mockResolvedValue([
      { id: 'm1', usuario: usuario('u1', false), rol: { codigo: 'USUARIO' } },
      { id: 'm2', usuario: usuario('u2', true), rol: { codigo: 'USUARIO' } },
    ]);
    const prisma: PrismaService = Object.assign(Object.create(PrismaService.prototype), {
      getMasterClient: () => ({ membresia: { findMany } }),
    });

    const filas = await new PrismaMembresiaRepository(prisma).findActivasByCliente('c-1');

    expect(filas.map((f) => [f.usuarioId, f.esIntegracion])).toEqual([
      ['u1', false],
      ['u2', true],
    ]);
  });
});
