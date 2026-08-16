/**
 * AdminClienteGuard — permite únicamente ROOT o ADMINISTRADOR de la
 * membresía activa (WU-6, sdd/matriz-permisos-por-usuario).
 *
 * Gemelo de `GlobalAdminGuard` con una condición más laxa (`is_global_admin
 * || rol === 'ADMINISTRADOR'` en vez de solo `is_global_admin`). Gatea la
 * configuración fuera de la matriz (R4: Usuarios, Ciclos, Catálogos) —
 * reemplaza a los permisos `usuario:gestionar`/`rol:asignar`/
 * `ciclo:gestionar`/`catalogo:gestionar` que desaparecen con `roles_permisos`.
 *
 * SIN metadata — a diferencia de `AccionesGuard`, no hay nada que declarar
 * por ruta. Por eso mismo va SIEMPRE por MÉTODO, nunca a nivel de clase
 * (ADR-P5): un guard sin metadata no se puede anular desde el handler, y
 * aplicarlo a la clase rompería las lecturas abiertas de `CatalogosController`
 * y la regla OR de `GET /usuarios` (R4-excepción). Todavía sin uso en ningún
 * controller — eso es WU-7.3.
 *
 * NUNCA consulta DB — evalúa `payload.is_global_admin`/`payload.rol` del JWT
 * vía `esAdminDeCliente` (mismo predicado que el chequeo inline de
 * `incluirEmail`, R10). Debe correr DESPUÉS de `JwtAuthGuard`.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R4 (S9). Ref design: ADR-P5.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { esAdminDeCliente } from '../../domain/permisos.util';

@Injectable()
export class AdminClienteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acceso denegado: usuario no autenticado');
    }

    if (esAdminDeCliente(user)) {
      return true;
    }

    throw new ForbiddenException('Acceso denegado: se requiere ADMINISTRADOR del cliente');
  }
}
