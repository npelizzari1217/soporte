import { Module } from '@nestjs/common';
import {
  ENCUESTA_SATISFACCION_REPOSITORY,
  IEncuestaSatisfaccionRepository,
} from './domain/ports/i-encuesta-satisfaccion.repository';
import { PrismaEncuestaSatisfaccionRepository } from './infrastructure/persistence/prisma/prisma-encuesta-satisfaccion.repository';
import { ObtenerCsatTicketUseCase } from './application/use-cases/obtener-csat-ticket.use-case';

/**
 * CsatLecturaModule — módulo NestJS de SOLO LECTURA de respuestas CSAT
 * (ADR-C3 del design).
 *
 * Provee `ENCUESTA_SATISFACCION_REPOSITORY` (repo Prisma del tenant —
 * depende solo de `TenantContext`, global vía `SharedModule`, sin necesidad
 * de reimportarlo) y `ObtenerCsatTicketUseCase` (WU9.2 — puntaje/comentario
 * de la última respuesta, gateado y scopeado por rol). Lo importan
 * `TicketsModule` (detalle del ticket) y `DashboardModule` (KPI del
 * dashboard, WU9.1) para leer puntaje/comentario y el resumen agregado.
 *
 * Partido de `CsatModule` a propósito: si el detalle del ticket leyera el
 * CSAT desde `CsatModule` directamente, quedaría
 * `TicketsModule → CsatModule → TicketsModule` (`CsatModule` necesita
 * `TICKET_REPOSITORY` para el listener). Este módulo corta el ciclo sin
 * `forwardRef`.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 *
 * Ref design: ADR-C3, ADR-C5. Tarea: 6.3, 9.1, 9.2.
 */
@Module({
  providers: [
    { provide: ENCUESTA_SATISFACCION_REPOSITORY, useClass: PrismaEncuestaSatisfaccionRepository },
    {
      provide: ObtenerCsatTicketUseCase,
      useFactory: (encuestaRepo: IEncuestaSatisfaccionRepository) =>
        new ObtenerCsatTicketUseCase(encuestaRepo),
      inject: [ENCUESTA_SATISFACCION_REPOSITORY],
    },
  ],
  exports: [ENCUESTA_SATISFACCION_REPOSITORY, ObtenerCsatTicketUseCase],
})
export class CsatLecturaModule {}
