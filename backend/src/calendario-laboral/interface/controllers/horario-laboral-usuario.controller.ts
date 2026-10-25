/**
 * HorarioLaboralUsuarioController — horario laboral propio de cada usuario del
 * tenant (`horario_laboral_usuario`, odd/tasks/tiempo-tecnico.md, T1).
 *
 * Rutas:
 *   GET    /horario-laboral/usuarios/:usuarioId → ObtenerHorarioLaboralUsuarioUseCase  [cualquier autenticado del tenant]
 *   PUT    /horario-laboral/usuarios/:usuarioId → GuardarHorarioLaboralUsuarioUseCase  [ADMINISTRADOR/ROOT — AdminClienteGuard]
 *   DELETE /horario-laboral/usuarios/:usuarioId → BorrarHorarioLaboralUsuarioUseCase   [ADMINISTRADOR/ROOT — AdminClienteGuard]
 *
 * Las tres responden el horario con el que se mide al usuario y su `origen`:
 * `USUARIO` si tiene uno propio, `CLIENTE` si usa el del tenant (S2). El
 * `DELETE` devuelve 200 con el horario del cliente, que es el que queda.
 *
 * La lectura sigue a `GET /horario-laboral`: cualquier autenticado del tenant
 * puede leer el horario de cualquier usuario del tenant. Es un dato de
 * agenda, no de desempeño; la medición contra el SLA tiene su propio alcance
 * (S8). `AdminClienteGuard` va por método, nunca por clase, para no cerrar
 * la lectura (mismo split que `HorarioLaboralController`).
 *
 * El usuario tiene que pertenecer al tenant del JWT; si no, 404 (no se
 * distingue "no existe" de "es de otro cliente"). La forma del body la
 * valida el `ValidationPipe` global → 400; las reglas del horario, el
 * dominio → 422. Un `usuarioId` que no es UUID → 400.
 *
 * Asignar un ticket no consulta este horario (S3).
 */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { DomainError } from '../../../shared/domain/result';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { ObtenerHorarioLaboralUsuarioUseCase } from '../../application/use-cases/obtener-horario-laboral-usuario.use-case';
import { GuardarHorarioLaboralUsuarioUseCase } from '../../application/use-cases/guardar-horario-laboral-usuario.use-case';
import { BorrarHorarioLaboralUsuarioUseCase } from '../../application/use-cases/borrar-horario-laboral-usuario.use-case';
import { UsuarioHorarioNoEncontradoError } from '../../domain/errors/horario-laboral.errors';
import { HorarioLaboralResuelto } from '../../domain/services/resolver-horario-laboral-usuario.service';
import { HorarioLaboralDto, HorarioLaboralUsuarioResponseDto } from '../dtos/horario-laboral.dto';
import { toResponseDto } from './horario-laboral.controller';

/** 404 si el usuario no pertenece al tenant; 422 para las reglas del horario. */
function toHttpException(error: DomainError): NotFoundException | UnprocessableEntityException {
  if (error instanceof UsuarioHorarioNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

/**
 * `TenantGuard` ya rechaza un JWT sin `cliente_id`; esto lo repite para no
 * castear el `null` que el tipo admite.
 */
function clienteIdDe(user: JwtPayload): string {
  if (!user.cliente_id) {
    throw new ForbiddenException('Acceso denegado: tenant no identificado');
  }
  return user.cliente_id;
}

function toUsuarioResponseDto(
  usuarioId: string,
  resuelto: HorarioLaboralResuelto,
): HorarioLaboralUsuarioResponseDto {
  return { usuarioId, origen: resuelto.origen, ...toResponseDto(resuelto.calendario) };
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('horario-laboral/usuarios')
export class HorarioLaboralUsuarioController {
  constructor(
    private readonly obtenerUseCase: ObtenerHorarioLaboralUsuarioUseCase,
    private readonly guardarUseCase: GuardarHorarioLaboralUsuarioUseCase,
    private readonly borrarUseCase: BorrarHorarioLaboralUsuarioUseCase,
  ) {}

  /**
   * GET /horario-laboral/usuarios/:usuarioId — horario con el que se mide al usuario.
   *
   * @throws 400 si `usuarioId` no es un UUID
   * @throws 404 si el usuario no pertenece al tenant
   */
  @Get(':usuarioId')
  async obtener(
    @CurrentUser() user: JwtPayload,
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
  ): Promise<HorarioLaboralUsuarioResponseDto> {
    const result = await this.obtenerUseCase.execute({ usuarioId, clienteId: clienteIdDe(user) });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUsuarioResponseDto(usuarioId, result.getValue());
  }

  /**
   * PUT /horario-laboral/usuarios/:usuarioId — fija o reemplaza el horario propio (las 7 filas).
   *
   * @throws 400 si `usuarioId` no es un UUID o el body no tiene la forma de `HorarioLaboralDto`
   * @throws 403 sin rol ADMINISTRADOR ni ROOT
   * @throws 404 si el usuario no pertenece al tenant
   * @throws 422 si el horario es inválido (incluye los 7 días cerrados)
   */
  @Put(':usuarioId')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.OK)
  async guardar(
    @CurrentUser() user: JwtPayload,
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
    @Body() dto: HorarioLaboralDto,
  ): Promise<HorarioLaboralUsuarioResponseDto> {
    const result = await this.guardarUseCase.execute({
      usuarioId,
      clienteId: clienteIdDe(user),
      dias: dto.dias,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUsuarioResponseDto(usuarioId, result.getValue());
  }

  /**
   * DELETE /horario-laboral/usuarios/:usuarioId — quita el horario propio; el usuario vuelve al del tenant.
   *
   * @throws 400 si `usuarioId` no es un UUID
   * @throws 403 sin rol ADMINISTRADOR ni ROOT
   * @throws 404 si el usuario no pertenece al tenant
   */
  @Delete(':usuarioId')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.OK)
  async borrar(
    @CurrentUser() user: JwtPayload,
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
  ): Promise<HorarioLaboralUsuarioResponseDto> {
    const result = await this.borrarUseCase.execute({ usuarioId, clienteId: clienteIdDe(user) });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toUsuarioResponseDto(usuarioId, result.getValue());
  }
}
