/**
 * HorarioLaboralController — entry point HTTP del horario laboral semanal
 * del TENANT (`calendario_laboral_dias_cliente`, WU-6a,
 * sdd/horario-laboral-por-cliente).
 *
 * Rutas:
 *   GET  /horario-laboral → ObtenerHorarioLaboralUseCase  [cualquier autenticado del tenant]
 *   PUT  /horario-laboral → GuardarHorarioLaboralUseCase  [ADMINISTRADOR/ROOT — AdminClienteGuard]
 *
 * `JwtAuthGuard, TenantGuard` a nivel de clase (D9, mismo split que
 * `FeriadosClienteController`): `TenantGuard` resuelve el tenant desde el
 * JWT y liga `TenantContext`. El `PUT` declara `AdminClienteGuard` POR
 * MÉTODO, nunca a nivel de clase (ADR-P5 — un guard a nivel de clase
 * rompería la lectura abierta del `GET`).
 *
 * Gotcha de Nest (D10): `@UseGuards(Clase)` instancia el guard directamente
 * y saltea cualquier provider `useFactory` registrado bajo el mismo token
 * (bug real de WU-4/WU-7 en `reseteo-contrasena-olvidada`). `AdminClienteGuard`
 * no tiene dependencias y ya está registrado como provider plano
 * (`auth.module.ts:358`): no hace falta ningún factory para él.
 *
 * Aislación cross-tenant (D4): NINGÚN chequeo inline de `clienteId` — no hay
 * tal campo en la ruta. El repositorio solo lee/escribe la DB del tenant
 * ligado por `TenantContext`; la aislación es estructural, no un `if`.
 *
 * Error → HTTP (D9): cualquier `HorarioLaboralInvalidoError` (incluye "sin
 * días abiertos") → 422. La forma del DTO (7 días, rango) la resuelve el
 * `ValidationPipe` global → 400, antes del use case.
 *
 * Tarea: 6a.2, sdd/horario-laboral-por-cliente.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ObtenerHorarioLaboralUseCase } from '../../application/use-cases/obtener-horario-laboral.use-case';
import { GuardarHorarioLaboralUseCase } from '../../application/use-cases/guardar-horario-laboral.use-case';
import { HorarioLaboralDto, HorarioLaboralResponseDto } from '../dtos/horario-laboral.dto';
import { CalendarioLaboralSemanal } from '../../domain/services/calcular-sla-habil-vence.service';
import { DomainError } from '../../../shared/domain/result';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';

function toResponseDto(calendario: CalendarioLaboralSemanal): HorarioLaboralResponseDto {
  return {
    dias: calendario.map((ventana, diaSemana) => ({
      diaSemana: diaSemana as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      aperturaMinuto: ventana.aperturaMinuto,
      cierreMinuto: ventana.cierreMinuto,
    })),
  };
}

/** Mapea un `DomainError` de `HorarioLaboralSemanal` a la `HttpException` correspondiente (D9). */
export function toHttpException(error: DomainError): UnprocessableEntityException {
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('horario-laboral')
export class HorarioLaboralController {
  constructor(
    private readonly obtenerHorarioLaboralUseCase: ObtenerHorarioLaboralUseCase,
    private readonly guardarHorarioLaboralUseCase: GuardarHorarioLaboralUseCase,
  ) {}

  /** GET /horario-laboral — horario laboral del tenant activo. Cualquier autenticado del tenant puede leer. */
  @Get()
  async obtener(): Promise<HorarioLaboralResponseDto> {
    const result = await this.obtenerHorarioLaboralUseCase.execute();
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toResponseDto(result.getValue());
  }

  /** PUT /horario-laboral — reemplaza el horario completo. Solo ADMINISTRADOR/ROOT. 200; 422 si el horario es inválido (incluye 7 días cerrados). */
  @Put()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.OK)
  async guardar(@Body() dto: HorarioLaboralDto): Promise<HorarioLaboralResponseDto> {
    const result = await this.guardarHorarioLaboralUseCase.execute({ dias: dto.dias });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toResponseDto(result.getValue());
  }
}
