import { Controller, Get, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { GlobalAdminGuard } from '../../auth/infrastructure/guards/global-admin.guard';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import {
  MONITOR_SATURACION,
  MonitorSaturacion,
} from '../../shared/infrastructure/saturacion/monitor-saturacion';
import { ProbarCorreoAlertas, ResultadoCorreoPrueba } from '../application/probar-correo-alertas';

/** Respuesta de `GET /operacion/saturacion`. */
export interface EstadoSaturacionResponseDto {
  eventosRecientes: number;
  ultimoAviso: {
    avisadoEn: string;
    eventos: number;
    desde: string;
    hasta: string;
    porOrigen: { servidor: number; pool: number; transaccion: number };
  } | null;
}

/**
 * Estado operativo del servicio para ROOT (odd/saturacion-conexiones, S3). Alimenta el aviso en
 * pantalla cuando la base de datos se saturó de forma repetida.
 */
@UseGuards(JwtAuthGuard, GlobalAdminGuard)
@Controller('operacion')
export class OperacionController {
  constructor(
    @Inject(MONITOR_SATURACION) private readonly monitor: Pick<MonitorSaturacion, 'estado'>,
    @Inject(ProbarCorreoAlertas)
    private readonly probarCorreo: Pick<ProbarCorreoAlertas, 'execute'>,
  ) {}

  /**
   * GET /operacion/saturacion
   * @returns Saturaciones de los últimos 10 minutos y el último aviso, si hubo.
   */
  @Get('saturacion')
  saturacion(): EstadoSaturacionResponseDto {
    const { eventosRecientes, ultimoAviso } = this.monitor.estado();
    return {
      eventosRecientes,
      ultimoAviso: ultimoAviso
        ? {
            avisadoEn: ultimoAviso.avisadoEn.toISOString(),
            eventos: ultimoAviso.eventos,
            desde: ultimoAviso.desde.toISOString(),
            hasta: ultimoAviso.hasta.toISOString(),
            porOrigen: { ...ultimoAviso.porOrigen },
          }
        : null,
    };
  }

  /**
   * POST /operacion/saturacion/correo-prueba
   * Manda un correo de prueba a los ROOT que reciben las alertas, verificando antes la conexión.
   * @returns A quiénes salió, o el motivo por el que no salió (200 en los dos casos: el resultado
   *   de la prueba es el contenido, no un error del endpoint).
   */
  @Post('saturacion/correo-prueba')
  @HttpCode(HttpStatus.OK)
  correoPrueba(): Promise<ResultadoCorreoPrueba> {
    return this.probarCorreo.execute();
  }
}
