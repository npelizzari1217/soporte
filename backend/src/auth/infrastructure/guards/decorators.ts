/**
 * Decoradores para guards de autenticación/autorización.
 *
 * @RequiereAcciones('TICKETS:ALTAS') — requiere que el JWT tenga TODAS las
 * celdas `MODULO:ACCION` listadas (AND). Ver `AccionesGuard` (R3).
 * @CurrentUser() — inyecta el `JwtPayload` de `request.user` en el parámetro
 * del handler.
 *
 * WU-7.3 (sdd/matriz-permisos-por-usuario): `RequirePermissions`/
 * `RequireModulo` y sus claves de metadata se RETIRARON — `AccionesGuard`/
 * `AdminClienteGuard` los reemplazan en todos los controllers.
 *
 * Tarea: T6.3 (PR6 — Guards + AuthController + AuthModule)
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { CodigoAccion } from '../../../shared/domain/acciones';

/** Clave de metadatos para AccionesGuard. */
export const ACCIONES_KEY = 'acciones';

/**
 * @RequiereAcciones(...codigos) — declara las celdas `MODULO:ACCION`
 * requeridas para el endpoint. `AccionesGuard` evalúa AND: el usuario debe
 * poder ejecutar TODAS (R3). Un código fuera del catálogo `CodigoAccion` no
 * compila — la ganancia concreta de ADR-P1.
 *
 * @example
 * @RequiereAcciones('TICKETS:ALTAS')
 * @Post('tickets')
 */
export const RequiereAcciones = (...codigos: CodigoAccion[]) => SetMetadata(ACCIONES_KEY, codigos);

/**
 * @CurrentUser() — inyecta el `JwtPayload` del usuario autenticado
 * (poblado por `JwtAuthGuard`).
 *
 * @example
 * @Get('me')
 * getMe(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
