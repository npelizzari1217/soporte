import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { verificarCompraVisible } from '../../application/services/visibilidad-compra';
import { COMPRA_REPOSITORY, ICompraRepository } from '../../domain/ports/i-compra.repository';

/** Lo que el guard lee del request: el actor que dejó `JwtAuthGuard` y los parámetros de ruta. */
interface RequestConCompra {
  user?: JwtPayload | null;
  params?: Record<string, string | undefined>;
}

/**
 * VisibilidadCompraGuard — punto ÚNICO de visibilidad de las rutas `/compras/:id...`
 * (odd/compras-por-tipo, S2, L3): sobre una compra cuyo tipo el actor no tiene con LECTURA,
 * cualquier ruta responde 404, sin efecto ninguno, porque el guard corta antes del caso de uso.
 * Centralizarlo acá evita repetir el chequeo en cada uno de los casos de uso por id, donde un
 * mutador nuevo podría olvidarlo.
 *
 * Va DESPUÉS de `JwtAuthGuard`, `TenantGuard` (la lectura usa el tenant ya ligado) y `AccionesGuard`
 * (sin la casilla de Compras el actor recibe el 403 de siempre). Las rutas sin `:id` (alta, listado,
 * exportación) pasan: el alta exige ALTAS en su caso de uso y el listado filtra en la consulta.
 *
 * Un `:id` que no es UUID también pasa: no hay compra que proteger y el caso de uso responde lo
 * mismo que antes de existir este guard.
 */
@Injectable()
export class VisibilidadCompraGuard implements CanActivate {
  constructor(
    @Inject(COMPRA_REPOSITORY)
    private readonly compraRepo: Pick<ICompraRepository, 'findParaVisibilidad'>,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /**
   * @param context Contexto de la request.
   * @returns `true` si la ruta no tiene `:id` o el actor ve la compra.
   * @throws NotFoundException si la compra existe y el actor no la ve.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestConCompra>();
    const compraId = request.params?.id;
    const user = request.user;
    if (compraId === undefined || !isUUID(compraId) || !user) return true;

    const resultado = await verificarCompraVisible(
      this.compraRepo,
      compraId,
      await this.alcances.cargar(user),
    );
    if (resultado.isFail()) {
      throw new NotFoundException(resultado.getError().message);
    }
    return true;
  }
}
