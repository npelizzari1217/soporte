/**
 * HorarioLaboralController — unit test de guards (D9/D10, `design.md`).
 * Tarea 6a.4, sdd/horario-laboral-por-cliente.
 *
 * Alcance de esta unidad: metadata de guards por método, class-level
 * `JwtAuthGuard, TenantGuard`, `AdminClienteGuard` en `PUT` y NO en `GET`. Se
 * lee la metadata real que Nest adjunta al handler compilado (modismo `?? []`,
 * precedente `modelos-equipo.controller.spec.ts:162`), así que borrar el
 * decorador `@UseGuards(AdminClienteGuard)` del `PUT` pone este test en rojo
 * (prueba por mutación). Cobertura funcional + e2e de aislación queda para
 * WU-6b.
 */
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HorarioLaboralController } from './horario-laboral.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';

type Handler = (...args: never[]) => unknown;

function guardsDe(target: unknown): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target as Handler) as unknown[] | undefined) ?? [];
}

describe('HorarioLaboralController — guards (D9/D10, spec "Permisos de edición y lectura")', () => {
  it('[CRITICAL] a nivel de clase declara JwtAuthGuard y TenantGuard (lectura abierta a cualquier autenticado del tenant)', () => {
    expect(guardsDe(HorarioLaboralController)).toEqual([JwtAuthGuard, TenantGuard]);
  });

  it('[CRITICAL] GET /horario-laboral NO declara AdminClienteGuard por método (lectura para cualquier autenticado del tenant)', () => {
    expect(guardsDe(HorarioLaboralController.prototype.obtener)).toEqual([]);
  });

  it('[CRITICAL] PUT /horario-laboral exige ADMINISTRADOR/ROOT: declara AdminClienteGuard', () => {
    expect(guardsDe(HorarioLaboralController.prototype.guardar)).toContain(AdminClienteGuard);
  });
});
