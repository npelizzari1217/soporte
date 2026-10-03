import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import {
  ConsultarContextoPedidoUseCase,
  ContextoPedidoResult,
} from '../../application/use-cases/consultar-contexto-pedido.use-case';
import { PedidoPublicoThrottlerGuard } from '../../infrastructure/guards/pedido-publico-throttler.guard';

/** Cuerpo ÚNICO del 404: el mismo texto para todo motivo (ADR-1). */
const MENSAJE_NO_DISPONIBLE = 'El formulario no está disponible.';

/**
 * PedidoPublicoController — rutas públicas (sin JWT) del formulario `publico/c/:slug/pedido`.
 * La única protección de acceso es el throttler y la resolución del slug dentro del caso de uso.
 * Sin lógica de negocio: traduce HTTP a casos de uso.
 *
 * Ref design: ADR-1, ADR-8, ADR-9. Tarea: 12.3.
 */
@Controller('publico/c/:slug/pedido')
@UseGuards(PedidoPublicoThrottlerGuard)
export class PedidoPublicoController {
  constructor(private readonly consultarContextoUseCase: ConsultarContextoPedidoUseCase) {}

  @Get('contexto')
  async contexto(
    @Param('slug') slug: string,
    @Query('e') token?: unknown,
  ): Promise<ContextoPedidoResult> {
    const resultado = await this.consultarContextoUseCase.ejecutar(slug, token);
    if (resultado.isFail()) {
      throw new NotFoundException(MENSAJE_NO_DISPONIBLE);
    }
    return resultado.getValue();
  }
}
