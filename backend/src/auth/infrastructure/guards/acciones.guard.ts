/**
 * AccionesGuard — verifica que el usuario autenticado pueda ejecutar TODAS
 * las celdas `MODULO:ACCION` requeridas (WU-6, sdd/matriz-permisos-por-usuario).
 *
 * Reemplaza a `PermissionsGuard` + `ModulosGuard` fusionando los dos ejes
 * (RBAC + módulos) en uno solo. Aplicado a todos los controllers de negocio
 * en WU-7.3 (deploy atómico, ADR-P8) — junto con WU-7.1 (resolverScope ya
 * lee la matriz), así que ningún endpoint queda con `modulos[]` nuevo pero
 * guard viejo (la ventana de 403 que ADR-P8 advertía).
 *
 * Usa `Reflector.getAllAndOverride` para leer `@RequiereAcciones(...)` del
 * handler/controller — sin metadata en NINGUNO de los dos → pass-through
 * (preserva el patrón `@RequirePermissions()` vacío de `CatalogosController`/
 * `RolesController`, handler gana a clase).
 *
 * IMPORTANTE: NUNCA consulta la DB — evalúa `payload.permisos` del JWT vía
 * `puedeEjecutar` (ADR-P11, mismo predicado que los chequeos inline). Debe
 * correr DESPUÉS de `JwtAuthGuard` + `TenantGuard`.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R3 (S5-S8). Ref design: ADR-P4.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCIONES_KEY } from './decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { puedeEjecutar } from '../../domain/permisos.util';
import { CodigoAccion } from '../../../shared/domain/acciones';

@Injectable()
export class AccionesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const codigosRequeridos = this.reflector.getAllAndOverride<CodigoAccion[] | null>(
      ACCIONES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!codigosRequeridos || codigosRequeridos.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acceso denegado: usuario no autenticado');
    }

    const faltantes = codigosRequeridos.filter((codigo) => !puedeEjecutar(user, codigo));
    if (faltantes.length > 0) {
      throw new ForbiddenException(`Acceso denegado: permisos faltantes [${faltantes.join(', ')}]`);
    }

    return true;
  }
}
