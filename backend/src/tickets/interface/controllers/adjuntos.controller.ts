/**
 * AdjuntosController — entry point HTTP de adjuntos (T20, T21, T22 — PR10).
 *
 * Rutas:
 *   POST /tickets/:id/adjuntos     → AdjuntarArchivoUseCase (adjunta directo al ticket)
 *   POST /operaciones/:id/adjuntos → AdjuntarArchivoUseCase (adjunta a una operación existente)
 *
 * `@Controller()` sin prefijo (para exponer recursos NO anidados bajo
 * `/tickets`): acá el segundo endpoint cuelga de `/operaciones`, una base de
 * ruta distinta a `/tickets`, así que ambos métodos declaran su path completo.
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` + `AccionesGuard` (WU-7.3,
 * sdd/matriz-permisos-por-usuario — mismo patrón que `TicketsController`),
 * con `@RequiereAcciones('TICKETS:ALTAS')` en las dos rutas (R5): subir un
 * adjunto es un alta. El acceso al ticket/operación DUEÑO (solicitante, o
 * `TICKETS:VER_TODOS`/`TICKETS:MODIFICACION`) se resuelve DENTRO de
 * `AdjuntarArchivoUseCase` (mismo criterio que el scope de
 * `TICKETS:VER_TODOS` en `TicketsController.findAll`/`findOne`, R11).
 *
 * `FileInterceptor('archivo')` sin `storage` explícito → multer usa
 * `memoryStorage` por default (el binario llega en `file.buffer`, NUNCA se
 * escribe a un tmp dir del OS — requerido por `AdjuntarArchivoDto.buffer`).
 * `validarAdjunto` (T10.1) corre ANTES de invocar el use case — tamaño/mime
 * fuera de rango nunca llegan a la capa de aplicación.
 *
 * Tarea: T10.5 (PR10 — endpoints multipart de adjuntos)
 */
import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdjuntarArchivoUseCase } from '../../application/use-cases/adjuntar-archivo.use-case';
import { validarAdjunto } from '../pipes/validar-archivo-adjunto';
import { ArchivoResponseDto, toArchivoResponseDto } from '../dtos/ticket.dto';
import { toHttpException } from './tickets.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { puedeEjecutar } from '../../../auth/domain/permisos.util';

const ACCION_VER_TODOS = 'TICKETS:VER_TODOS';
const ACCION_MODIFICACION = 'TICKETS:MODIFICACION';

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller()
export class AdjuntosController {
  constructor(private readonly adjuntarArchivoUseCase: AdjuntarArchivoUseCase) {}

  /**
   * POST /tickets/:id/adjuntos
   * Sube un adjunto y lo vincula directo al ticket (`archivos_ticket`, T22).
   * @throws 404 ticket inexistente/otro tenant, o actor sin acceso (ADR-2)
   * @throws 422 archivo ausente, tamaño/mime inválido (T21, pipe), o `tamanoBytes<=0` (revalidación defensiva)
   */
  @Post('tickets/:id/adjuntos')
  @RequiereAcciones('TICKETS:ALTAS')
  @UseInterceptors(FileInterceptor('archivo'))
  async adjuntarATicket(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) ticketId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ArchivoResponseDto> {
    validarAdjunto(file);
    const archivo = file as Express.Multer.File;

    const result = await this.adjuntarArchivoUseCase.execute({
      ticketId,
      nombreOriginal: archivo.originalname,
      mimeType: archivo.mimetype,
      tamanoBytes: BigInt(archivo.size),
      buffer: archivo.buffer,
      subidoPorId: user.sub,
      actorId: user.sub,
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
      tienePermisoEditar: puedeEjecutar(user, ACCION_MODIFICACION),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toArchivoResponseDto(result.getValue());
  }

  /**
   * POST /operaciones/:id/adjuntos
   * Sube un adjunto y lo vincula a una operación EXISTENTE del timeline
   * (`archivos_operacion`, T22). El acceso se valida contra el ticket
   * DUEÑO de la operación (resuelto internamente por el use case).
   * @throws 404 operación inexistente, ticket inexistente/otro tenant, o actor sin acceso (ADR-2)
   * @throws 422 archivo ausente, tamaño/mime inválido (T21, pipe), o `tamanoBytes<=0` (revalidación defensiva)
   */
  @Post('operaciones/:id/adjuntos')
  @RequiereAcciones('TICKETS:ALTAS')
  @UseInterceptors(FileInterceptor('archivo'))
  async adjuntarAOperacion(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) operacionId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ArchivoResponseDto> {
    validarAdjunto(file);
    const archivo = file as Express.Multer.File;

    const result = await this.adjuntarArchivoUseCase.execute({
      operacionId,
      nombreOriginal: archivo.originalname,
      mimeType: archivo.mimetype,
      tamanoBytes: BigInt(archivo.size),
      buffer: archivo.buffer,
      subidoPorId: user.sub,
      actorId: user.sub,
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
      tienePermisoEditar: puedeEjecutar(user, ACCION_MODIFICACION),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toArchivoResponseDto(result.getValue());
  }
}
