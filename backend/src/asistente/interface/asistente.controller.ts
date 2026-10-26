import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../auth/infrastructure/guards/decorators';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { puedeEjecutar } from '../../auth/domain/permisos.util';
import { ConsultarAsistenteUseCase } from '../application/consultar-asistente.use-case';
import { LARGO_MAXIMO_CONSULTA, ModoRespuesta } from '../domain/consulta-asistente';
import { AsistenteThrottlerGuard } from '../infrastructure/asistente-throttler.guard';

/** Body de `POST /asistente/consultas`. El piso sobre el texto recortado lo mide el dominio. */
export class ConsultarAsistenteDto {
  @IsString()
  @MaxLength(LARGO_MAXIMO_CONSULTA)
  consulta!: string;
}

/** Respuesta de `POST /asistente/consultas`. */
export interface ConsultaAsistenteResponseDto {
  respuesta: string;
  modo: ModoRespuesta;
  fuentes: Array<{ articuloId: string; titulo: string }>;
}

/**
 * Asistente de la Ayuda (odd/asistente-ia-ayuda, S1, S5, S7). Lo usa toda persona con sesión que pueda
 * leer la Ayuda (`KB:LECTURA`), con un cupo de consultas por persona.
 */
@UseGuards(JwtAuthGuard, AccionesGuard, AsistenteThrottlerGuard)
@Controller('asistente')
export class AsistenteController {
  constructor(private readonly consultar: ConsultarAsistenteUseCase) {}

  /**
   * POST /asistente/consultas — responde una consulta con la Ayuda.
   * @returns 200 con la respuesta, su modo y los artículos citados
   * @throws 400 consulta vacía o de más de 600 caracteres
   * @throws 429 se superó el cupo de consultas por minuto
   */
  @Post('consultas')
  @HttpCode(HttpStatus.OK)
  @RequiereAcciones('KB:LECTURA')
  async consultarAyuda(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConsultarAsistenteDto,
  ): Promise<ConsultaAsistenteResponseDto> {
    const result = await this.consultar.execute({
      consulta: dto.consulta,
      clienteId: user.cliente_id,
      veTodosLosArticulos: puedeEjecutar(user, 'KB:VER_TODOS'),
    });
    if (result.isFail()) throw new BadRequestException(result.getError().message);
    const { respuesta, modo, fuentes } = result.getValue();
    return {
      respuesta,
      modo,
      fuentes: fuentes.map((f) => ({ articuloId: f.articuloId, titulo: f.titulo })),
    };
  }
}
