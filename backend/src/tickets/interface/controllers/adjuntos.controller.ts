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
 * sin `@RequiereAcciones` (odd/permisos-por-tipo-ticket, D5 d): la celda
 * `TICKETS:ALTAS` ya no decide. El acceso al ticket/operación DUEÑO se resuelve
 * DENTRO de `AdjuntarArchivoUseCase` con el alcance por tipo que carga
 * `CargadorAlcanceTicket`: ver el ticket, como en el detalle, y además `ALTAS`
 * o `MODIFICACION` sobre su tipo (D5 c).
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
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CargadorAlcanceTicket } from '../alcance-ticket';

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller()
export class AdjuntosController {
  constructor(
    private readonly adjuntarArchivoUseCase: AdjuntarArchivoUseCase,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /**
   * POST /tickets/:id/adjuntos
   * Sube un adjunto y lo vincula directo al ticket (`archivos_ticket`, T22).
   * @throws 403 ve el ticket sin `ALTAS` ni `MODIFICACION` sobre su tipo
   * @throws 404 ticket inexistente/otro tenant, o actor que no ve el ticket (S0)
   * @throws 422 archivo ausente, tamaño/mime inválido (T21, pipe), o `tamanoBytes<=0` (revalidación defensiva)
   * @throws 422 ticket RESUELTO/CERRADO/CANCELADO y el actor no es ADMINISTRADOR ni ROOT (odd/cerrado-solo-comentarios)
   */
  @Post('tickets/:id/adjuntos')
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
      ...(await this.alcances.cargar(user)),
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
   * @throws 403 ve el ticket sin `ALTAS` ni `MODIFICACION` sobre su tipo
   * @throws 404 operación inexistente, ticket inexistente/otro tenant, o actor que no ve el ticket (S0)
   * @throws 422 archivo ausente, tamaño/mime inválido (T21, pipe), o `tamanoBytes<=0` (revalidación defensiva)
   * @throws 422 ticket RESUELTO/CERRADO/CANCELADO y el actor no es ADMINISTRADOR ni ROOT (odd/cerrado-solo-comentarios)
   */
  @Post('operaciones/:id/adjuntos')
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
      ...(await this.alcances.cargar(user)),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toArchivoResponseDto(result.getValue());
  }
}
