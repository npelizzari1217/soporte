/**
 * ClienteLinkSoporteController — link genérico de soporte del cliente de la sesión.
 *
 * Ruta: GET /clientes/actual/link-soporte → VerLinkSoporteClienteUseCase
 *
 * Controller aparte de `ClientesController` por la misma razón que `ClienteLogoController`: ese
 * aplica `GlobalAdminGuard` a nivel de clase y esta ruta la ve CUALQUIER usuario autenticado del
 * cliente. Solo `JwtAuthGuard`, sin permiso adicional: el link es público por naturaleza. El
 * cliente sale siempre del JWT, nunca de un parámetro.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { VerLinkSoporteClienteUseCase } from '../../application/use-cases/ver-link-soporte-cliente.use-case';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

interface LinkSoporteResponseDto {
  url: string | null;
}

@Controller('clientes')
export class ClienteLinkSoporteController {
  constructor(private readonly verLinkSoporteClienteUseCase: VerLinkSoporteClienteUseCase) {}

  /**
   * GET /clientes/actual/link-soporte
   * @returns 200 + `{ url }`. `url` es `null` si no hay link vigente. Una sesión sin
   * `cliente_id` (ROOT fuera de un cliente) tampoco tiene link: `{ url: null }`, sin tocar el
   * repositorio — "sin link" es un estado normal, no un error.
   */
  @Get('actual/link-soporte')
  @UseGuards(JwtAuthGuard)
  async ver(@CurrentUser() user: JwtPayload): Promise<LinkSoporteResponseDto> {
    if (!user.cliente_id) {
      return { url: null };
    }
    return this.verLinkSoporteClienteUseCase.execute(user.cliente_id);
  }
}
