import { Module } from '@nestjs/common';
import { ENCUESTA_SATISFACCION_REPOSITORY } from './domain/ports/i-encuesta-satisfaccion.repository';
import { PrismaEncuestaSatisfaccionRepository } from './infrastructure/persistence/prisma/prisma-encuesta-satisfaccion.repository';

/**
 * CsatLecturaModule — módulo NestJS de SOLO LECTURA de respuestas CSAT
 * (ADR-C3 del design).
 *
 * Provee ÚNICAMENTE `ENCUESTA_SATISFACCION_REPOSITORY` (repo Prisma del
 * tenant — depende solo de `TenantContext`, global vía `SharedModule`, sin
 * necesidad de reimportarlo). Lo importan `TicketsModule` y
 * `DashboardModule` (WU9, fuera del alcance de este WU) para leer
 * puntaje/comentario y el KPI del dashboard.
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
 * Ref design: ADR-C3. Tarea: 6.3.
 */
@Module({
  providers: [
    { provide: ENCUESTA_SATISFACCION_REPOSITORY, useClass: PrismaEncuestaSatisfaccionRepository },
  ],
  exports: [ENCUESTA_SATISFACCION_REPOSITORY],
})
export class CsatLecturaModule {}
