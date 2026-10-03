import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SolicitarPedidoPublicoUseCase } from '../../application/use-cases/solicitar-pedido-publico.use-case';
import { PedidoPendienteInvalidoError } from '../../domain/errors/publico.errors';
import { PedidoPublicoDto } from '../dtos/pedido-publico.dto';
import {
  ConsultarContextoPedidoUseCase,
  ContextoPedidoResult,
} from '../../application/use-cases/consultar-contexto-pedido.use-case';
import { PedidoPublicoThrottlerGuard } from '../../infrastructure/guards/pedido-publico-throttler.guard';

/** Cuerpo ÚNICO del 404: el mismo texto para todo motivo (ADR-1). */
const MENSAJE_NO_DISPONIBLE = 'El formulario no está disponible.';

/** Cuerpo CONSTANTE del 202: no depende del email, del equipo ni del slug (ADR-9). */
const RESPUESTA_SOLICITUD = {
  mensaje: 'Si los datos son correctos, te enviamos un mail para confirmar.',
};

/**
 * PedidoPublicoController — rutas públicas (sin JWT) del formulario `publico/c/:slug/pedido`.
 * La única protección de acceso es el throttler y la resolución del slug dentro del caso de uso.
 * Sin lógica de negocio: traduce HTTP a casos de uso.
 *
 * Cada ruta aplica `@SkipThrottle` sobre los throttlers que no le corresponden (ADR-8): `contexto`
 * solo lleva `contexto`; `solicitud` lleva `email` y `cliente`.
 *
 * Ref design: ADR-1, ADR-8, ADR-9. Tarea: 12.3, 13.3.
 */
@Controller('publico/c/:slug/pedido')
@UseGuards(PedidoPublicoThrottlerGuard)
export class PedidoPublicoController {
  constructor(
    private readonly consultarContextoUseCase: ConsultarContextoPedidoUseCase,
    private readonly solicitarPedidoUseCase: SolicitarPedidoPublicoUseCase,
  ) {}

  @Get('contexto')
  @SkipThrottle({ email: true, cliente: true })
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

  @Post('solicitud')
  @HttpCode(HttpStatus.ACCEPTED)
  @SkipThrottle({ contexto: true })
  async solicitud(
    @Param('slug') slug: string,
    @Body() dto: PedidoPublicoDto,
  ): Promise<typeof RESPUESTA_SOLICITUD> {
    const resultado = await this.solicitarPedidoUseCase.ejecutar({ slug, ...dto });
    if (resultado.isFail()) {
      const error = resultado.getError();
      if (error instanceof PedidoPendienteInvalidoError) {
        throw new BadRequestException(error.message);
      }
      throw new NotFoundException(MENSAJE_NO_DISPONIBLE);
    }
    return RESPUESTA_SOLICITUD;
  }
}
