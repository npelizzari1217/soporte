/**
 * PrismaPreventivoGeneracionRepository — implementación del puerto
 * IPreventivoGeneracionRepository (WU-3).
 *
 * Hasta WU-4 solo `listarPorPlan()` se consumía (vista de auditoría del ABM,
 * `ListarGeneracionesPlanUseCase`, tarea 4.4); `reservar`/`marcarGenerado`/
 * `marcarSalteadoPendiente`/`registrarSalteadoAtraso` ya estaban
 * implementados (interfaz completa, SQL 100% especificado por ADR-PV2/PV3)
 * pero sin consumidor. WU-5 (5.2/5.3) los wirea en
 * `GenerarPreventivosUseCase`, orquestados por el runner re-entrante
 * (ADR-PV5): reservar → regla de pendiente (`existeTicketAbiertoDelPlan`) →
 * `CrearTicketUseCase` → `marcarGenerado`/`marcarSalteadoPendiente` → avance
 * de puntero, todo en la MISMA transacción por plan.
 *
 * Tarea: 4.4 (habilitador), 5.2/5.3 (orquestación).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  IPreventivoGeneracionRepository,
  PreventivoGeneracionProps,
  ResultadoGeneracion,
} from '../../../domain/ports/i-preventivo-generacion.repository';

/**
 * Estados en los que un ticket cuenta como YA ATENDIDO (regla de pendiente
 * [R8]) — mismo criterio que `ESTADOS_EXCLUIDOS_VENCIMIENTO`
 * (`prisma-sla-ticket-query.repository.ts`) y `ESTADOS_SIN_COMENTARIOS_PUBLICOS`
 * (`crear-comentario.use-case.ts`): nombrada acá y no enterrada en el SQL
 * crudo para que un estado terminal nuevo se agregue en UN solo lugar
 * grepeable, no en un `NOT IN` inline que ningún grep de "estado terminal"
 * encuentra.
 */
const ESTADOS_TICKET_ATENDIDO = ['RESUELTO', 'CERRADO', 'CANCELADO'];

@Injectable()
export class PrismaPreventivoGeneracionRepository implements IPreventivoGeneracionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * `$queryRaw` (no `create()` de Prisma) porque el `ON CONFLICT DO NOTHING
   * RETURNING id` es la sección crítica entera: es la ÚNICA forma atómica
   * de "reservar la fila si no existe, y saber si gané la carrera" sin un
   * SELECT previo (lectura-antes-de-escribir perdería la carrera bajo
   * concurrencia real, ADR-PV2). `::date` trunca `fechaProgramada` a fecha
   * pura (la columna es `date`, no `timestamp`) para que la clave
   * `(plan_id, fecha_programada)` del `ON CONFLICT` compare por día
   * calendario, no por instante. `rows[0]?.id ?? null` es la lectura del
   * resultado: si el `INSERT` chocó contra el conflicto, Postgres no
   * devuelve fila y `rows` queda vacío — `null` es la señal de "otra
   * corrida ya reservó este ciclo", no un error.
   * @param planId Plan sobre el que se reserva el ciclo.
   * @param fechaProgramada Fecha del ciclo a reservar (truncada a `::date`).
   * @returns El `id` de la fila insertada, o `null` si otra corrida ya ganó la carrera.
   */
  async reservar(planId: string, fechaProgramada: Date): Promise<string | null> {
    const rows = await this.client.$queryRaw<{ id: string }[]>`
      INSERT INTO preventivo_generacion (plan_id, fecha_programada, resultado)
      VALUES (${planId}::uuid, ${fechaProgramada}::date, 'RESERVADO')
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  }

  /**
   * Cierra el ciclo reservado como `GENERADO`, con el ticket ya creado
   * (contrato: `IPreventivoGeneracionRepository.marcarGenerado`).
   * @param id Id de la fila de `preventivo_generacion` reservada previamente.
   * @param ticketId Id del ticket ya creado para este ciclo.
   * @returns No retorna valor.
   */
  async marcarGenerado(id: string, ticketId: string): Promise<void> {
    await this.client.preventivoGeneracion.update({
      where: { id },
      data: { resultado: 'GENERADO', ticketId },
    });
  }

  /**
   * Cierra el ciclo reservado como `SALTEADO_PENDIENTE` (contrato:
   * `IPreventivoGeneracionRepository.marcarSalteadoPendiente`).
   * @param id Id de la fila de `preventivo_generacion` reservada previamente.
   * @returns No retorna valor.
   */
  async marcarSalteadoPendiente(id: string): Promise<void> {
    await this.client.preventivoGeneracion.update({
      where: { id },
      data: { resultado: 'SALTEADO_PENDIENTE' },
    });
  }

  /**
   * `$executeRaw` con el mismo `ON CONFLICT DO NOTHING` que `reservar()`,
   * por la misma razón: idempotencia ante reintentos del barrido de
   * recuperación (ADR-PV3) sin pagar el costo de un SELECT previo. A
   * diferencia de `reservar()`, acá no hace falta el `id` insertado (no hay
   * ticket que asociarle a un ciclo `SALTEADO_ATRASO`), por eso es
   * `$executeRaw` sin `RETURNING` en vez de `$queryRaw`.
   * @param planId Plan al que pertenece el ciclo atrasado.
   * @param fechaProgramada Fecha del ciclo atrasado a registrar.
   * @returns No retorna valor.
   */
  async registrarSalteadoAtraso(planId: string, fechaProgramada: Date): Promise<void> {
    await this.client.$executeRaw`
      INSERT INTO preventivo_generacion (plan_id, fecha_programada, resultado)
      VALUES (${planId}::uuid, ${fechaProgramada}::date, 'SALTEADO_ATRASO')
      ON CONFLICT DO NOTHING
    `;
  }

  /**
   * Generaciones de un plan, para la vista de auditoría (contrato:
   * `IPreventivoGeneracionRepository.listarPorPlan`).
   * @param planId Plan a consultar.
   * @returns Las generaciones del plan, ordenadas por `fechaProgramada` descendente.
   */
  async listarPorPlan(planId: string): Promise<PreventivoGeneracionProps[]> {
    const rows = await this.client.preventivoGeneracion.findMany({
      where: { planId },
      orderBy: { fechaProgramada: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      fechaProgramada: row.fechaProgramada,
      resultado: row.resultado as ResultadoGeneracion,
      ticketId: row.ticketId ?? null,
      createdAt: row.createdAt,
    }));
  }

  /**
   * ¿El plan tiene un preventivo ya generado y todavía sin atender? Es la
   * regla de pendiente [R8]: si la respuesta es sí, el ciclo se cierra como
   * `SALTEADO_PENDIENTE` en vez de abrir otro ticket encima del anterior.
   * @param planId Plan a consultar.
   * @returns `true` si existe al menos un ticket del plan vivo y sin atender.
   */
  async existeTicketAbiertoDelPlan(planId: string): Promise<boolean> {
    // Calca la consulta de ADR-PV2 (paso 2): un ticket GENERADO de este plan
    // sigue vivo (`deleted_at IS NULL`) y no atendido (`estado.codigo NOT IN`
    // ESTADOS_TICKET_ATENDIDO). Los ciclos RESERVADO/SALTEADO_* no tienen
    // `ticket_id`, así que el JOIN los descarta solos.
    const rows = await this.client.$queryRaw<{ uno: number }[]>`
      SELECT 1 AS uno
      FROM tickets t
      JOIN preventivo_generacion g ON g.ticket_id = t.id
      JOIN estados e ON e.id = t.estado_id
      WHERE g.plan_id = ${planId}::uuid
        AND t.deleted_at IS NULL
        AND e.codigo NOT IN (${Prisma.join(ESTADOS_TICKET_ATENDIDO)})
      LIMIT 1
    `;
    return rows.length > 0;
  }
}
