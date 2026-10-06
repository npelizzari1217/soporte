/**
 * TicketPdfController — `GET /tickets/:id/pdf`: la ficha PDF de un ticket.
 *
 * Vive en su propio módulo (`TicketPdfModule`) y no en `TicketsController`
 * porque la ficha combina datos de tickets, equipos, reparaciones y clientes,
 * y `equipos`/`reparaciones` ya dependen de `tickets`: ponerla en
 * `TicketsModule` crearía un ciclo de módulos.
 *
 * Misma acción que el detalle (`TICKETS:LECTURA`) y mismo scope de filas:
 * sin `TICKETS:VER_TODOS`, solo el solicitante; cualquier otro recibe 404.
 * Sirve tickets de soporte y edilicios (la reparación es un ticket).
 *
 * El controller NO lee `TICKETS:OBSERVAR` a propósito: el PDF nunca incluye
 * comentarios internos (ver `GenerarPdfTicketUseCase`).
 *
 * El cuerpo binario se devuelve como `StreamableFile`, nunca como `Buffer`
 * desnudo: con `@Res({ passthrough: true })` Nest serializaría el `Buffer`
 * como JSON (ver el comentario largo de `ClienteLogoController.ver`).
 */
import { Controller, Get, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { puedeEjecutar } from '../../../auth/domain/permisos.util';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { toHttpException } from '../../../tickets/interface/controllers/tickets.controller';
import { GenerarPdfTicketUseCase } from '../../application/use-cases/generar-pdf-ticket.use-case';

const ACCION_VER_TODOS = 'TICKETS:VER_TODOS';

/** Lo único que este controller necesita de la respuesta HTTP: escribir headers. */
interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('tickets')
export class TicketPdfController {
  constructor(private readonly generarPdfTicketUseCase: GenerarPdfTicketUseCase) {}

  /**
   * GET /tickets/:id/pdf
   * @returns 200 + el PDF como descarga (`ticket-<numero>.pdf`)
   * @throws 404 ticket inexistente, de otro tenant o ajeno al solicitante
   */
  @Get(':id/pdf')
  @RequiereAcciones('TICKETS:LECTURA')
  async pdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: RespuestaConHeaders,
  ): Promise<StreamableFile> {
    const result = await this.generarPdfTicketUseCase.execute({
      ticketId: id,
      actorId: user.sub,
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
      // `TenantGuard` garantiza un tenant resuelto: el token MASTER no llega acá.
      clienteId: user.cliente_id ?? '',
      clienteNombre: user.cliente_nombre ?? '',
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { buffer, nombreArchivo } = result.getValue();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    // El navegador no puede leer un header que no esté expuesto por CORS, y
    // sin esto el frontend no tiene de dónde sacar el nombre del archivo.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    return new StreamableFile(buffer);
  }
}
