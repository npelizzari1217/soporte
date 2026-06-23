/**
 * TicketsController — endpoints REST para el módulo de tickets.
 *
 * Rutas:
 *   POST   /tickets                  → CrearTicketUseCase      [ticket:crear]
 *   GET    /tickets/:id              → ObtenerTicketUseCase    (autenticado)
 *   PATCH  /tickets/:id/estado       → TransicionarEstadoUseCase (autenticado)
 *   POST   /tickets/:id/asignar      → AsignarTicketUseCase    [ticket:asignar]
 *   POST   /tickets/:id/adjuntos     → AdjuntarArchivoUseCase  [ticket:crear]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 * El TenantGuard resuelve la DB tenant y bindea TenantContext antes de que
 * cualquier repositorio tenant intente acceder a la DB.
 *
 * El controlador no tiene lógica de negocio: solo traduce HTTP ↔ use cases.
 * El mapeo de errores de dominio a HttpException se hace aquí (presentación).
 *
 * Tarea: 3.E.2
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { CurrentUser, RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

import { CrearTicketUseCase } from '../../application/use-cases/crear-ticket.use-case';
import { ObtenerTicketUseCase } from '../../application/use-cases/obtener-ticket.use-case';
import { TransicionarEstadoUseCase } from '../../application/use-cases/transicionar-estado.use-case';
import { AsignarTicketUseCase } from '../../application/use-cases/asignar-ticket.use-case';
import { AdjuntarArchivoUseCase } from '../../application/use-cases/adjuntar-archivo.use-case';

import {
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  ArchivoTamanoCeroError,
  EstadoCatalogoNoEncontradoError,
  EstadoDestinoInvalidoError,
  SolicitanteInvalidoError,
  TicketNoEncontradoError,
  TipoTicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';

import {
  ArchivoResponseDto,
  AsignarTicketHttpDto,
  CreateTicketHttpDto,
  TicketResponseDto,
  TransicionarEstadoHttpDto,
} from '../dtos/tickets.dto';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ArchivoEntity } from '../../domain/entities/archivo.entity';

// ─── Mappers de respuesta ─────────────────────────────────────────────────────

function toTicketResponse(ticket: TicketEntity): TicketResponseDto {
  return {
    id: ticket.id,
    numero: ticket.numero,
    titulo: ticket.titulo,
    descripcion: ticket.descripcion,
    tipoId: ticket.tipoId,
    estadoId: ticket.estadoId,
    prioridadId: ticket.prioridadId,
    cicloId: ticket.cicloId,
    solicitanteId: ticket.solicitanteId,
    asignadoId: ticket.asignadoId,
    fechaVencimiento: ticket.fechaVencimiento?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function toArchivoResponse(archivo: ArchivoEntity): ArchivoResponseDto {
  return {
    id: archivo.id,
    storageKey: archivo.storageKey,
    nombreOriginal: archivo.nombreOriginal,
    mimeType: archivo.mimeType,
    tamanoBytes: archivo.tamanoBytes.toString(),
    subidoPorId: archivo.subidoPorId,
    createdAt: archivo.createdAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class TicketsController {
  constructor(
    private readonly crearTicketUseCase: CrearTicketUseCase,
    private readonly obtenerTicketUseCase: ObtenerTicketUseCase,
    private readonly transicionarEstadoUseCase: TransicionarEstadoUseCase,
    private readonly asignarTicketUseCase: AsignarTicketUseCase,
    private readonly adjuntarArchivoUseCase: AdjuntarArchivoUseCase,
  ) {}

  /**
   * POST /tickets
   * Crea un nuevo ticket. El solicitante_id se valida contra master.usuarios.
   *
   * @returns 201 Created + TicketResponseDto
   * @throws 422 UnprocessableEntityException si solicitante inválido o error de validación
   * @throws 404 NotFoundException si tipo de ticket no existe en catálogo
   * @throws 500 InternalServerErrorException si el catálogo tenant no está sembrado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:crear')
  async crearTicket(
    @Body() dto: CreateTicketHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketResponseDto> {
    const result = await this.crearTicketUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      prioridadId: dto.prioridadId,
      cicloId: dto.cicloId ?? null,
      solicitanteId: dto.solicitanteId,
      fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
      clienteId: user.cliente_id,
      autorId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof SolicitanteInvalidoError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof TipoTicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      // Errores de catálogo interno (seed no ejecutado) → 500
      if (
        error instanceof EstadoCatalogoNoEncontradoError ||
        error instanceof TipoOperacionNoEncontradoError
      ) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo crear el ticket');
    }

    return toTicketResponse(result.getValue());
  }

  /**
   * GET /tickets/:id
   * Obtiene un ticket por su ID técnico.
   *
   * @returns 200 OK + TicketResponseDto
   * @throws 404 NotFoundException si el ticket no existe
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async obtenerTicket(@Param('id') id: string): Promise<TicketResponseDto> {
    const result = await this.obtenerTicketUseCase.execute(id);

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Ticket no encontrado');
    }

    return toTicketResponse(result.getValue());
  }

  /**
   * PATCH /tickets/:id/estado
   * Transiciona el ticket al estado indicado en el body.
   * La validación de la transición la realiza TicketStateMachineFactory.
   *
   * @returns 200 OK + TicketResponseDto con el nuevo estado
   * @throws 422 UnprocessableEntityException si la transición es inválida
   * @throws 404 NotFoundException si el ticket no existe
   */
  @Patch(':id/estado')
  @HttpCode(HttpStatus.OK)
  async transicionarEstado(
    @Param('id') id: string,
    @Body() dto: TransicionarEstadoHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketResponseDto> {
    const result = await this.transicionarEstadoUseCase.execute({
      ticketId: id,
      nuevoEstadoCodigo: dto.nuevoEstadoCodigo,
      autorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TransicionInvalidaError) {
        throw new UnprocessableEntityException(error.message);
      }
      // CRITICAL-1 fix: código de estado destino enviado por el usuario no existe → 422
      if (error instanceof EstadoDestinoInvalidoError) {
        throw new UnprocessableEntityException(error.message);
      }
      // EstadoCatalogoNoEncontradoError: estado ACTUAL del ticket no está en catálogo → corrupción → 500
      if (
        error instanceof EstadoCatalogoNoEncontradoError ||
        error instanceof TipoOperacionNoEncontradoError ||
        error instanceof TipoTicketNoEncontradoError
      ) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo transicionar el estado');
    }

    return toTicketResponse(result.getValue());
  }

  /**
   * POST /tickets/:id/asignar
   * Asigna o reasigna el ticket a un responsable.
   * Valida elegibilidad cross-DB (usuario_tipos_ticket).
   *
   * @returns 200 OK + TicketResponseDto con el asignado actualizado
   * @throws 422 UnprocessableEntityException si asignado inválido o no elegible
   * @throws 404 NotFoundException si el ticket no existe
   */
  @Post(':id/asignar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ticket:asignar')
  async asignarTicket(
    @Param('id') id: string,
    @Body() dto: AsignarTicketHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketResponseDto> {
    const result = await this.asignarTicketUseCase.execute({
      ticketId: id,
      asignadoId: dto.asignadoId,
      clienteId: user.cliente_id,
      autorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof AsignadoInvalidoError || error instanceof AsignadoNoElegibleError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof TipoOperacionNoEncontradoError) {
        throw new InternalServerErrorException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo asignar el ticket');
    }

    return toTicketResponse(result.getValue());
  }

  /**
   * POST /tickets/:id/adjuntos
   * Adjunta un archivo al ticket. El binario se sube a IFileStorage;
   * solo la metadata se persiste en DB.
   *
   * Espera multipart/form-data con campo "file".
   *
   * @returns 201 Created + ArchivoResponseDto
   * @throws 422 UnprocessableEntityException si archivo vacío o ticket inválido
   * @throws 404 NotFoundException si el ticket no existe
   */
  @Post(':id/adjuntos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ticket:crear')
  @UseInterceptors(FileInterceptor('file'))
  async adjuntarArchivo(
    @Param('id') ticketId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ): Promise<ArchivoResponseDto> {
    const result = await this.adjuntarArchivoUseCase.execute({
      ticketId,
      nombreOriginal: file.originalname,
      mimeType: file.mimetype,
      tamanoBytes: BigInt(file.size),
      buffer: file.buffer,
      subidoPorId: user.sub,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof TicketNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ArchivoTamanoCeroError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo adjuntar el archivo');
    }

    return toArchivoResponse(result.getValue());
  }
}
