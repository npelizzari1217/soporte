import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { CrearTicketUseCase } from '../../../tickets/application/use-cases/crear-ticket.use-case';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { IPreventivoGeneracionRepository } from '../../domain/ports/i-preventivo-generacion.repository';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { CalcularCicloService } from '../../domain/services/calcular-ciclo.service';
import { PreventivoGeneradoEvent } from '../../domain/events/preventivo-generado.event';

/** Código FIJO del tipo de ticket que genera este barrido (F3-M1, ya sembrado). */
const TIPO_CODIGO_MANTENIMIENTO = 'MANTENIMIENTO';

/**
 * GenerarPreventivosUseCase — orquestación transaccional del barrido de
 * mantenimiento preventivo (WU-5). Una transacción por plan (ADR-PV2/PV3):
 *
 * 1. `CalcularCicloService.ciclosPendientes` (puro, WU-3) determina los
 *    ciclos atrasados a registrar como `SALTEADO_ATRASO` y el candidato
 *    (ciclo vencido más reciente) a generar.
 * 2. `IPreventivoGeneracionRepository.reservar` — PRIMERA sentencia de la
 *    transacción del candidato: `INSERT ... ON CONFLICT DO NOTHING`. 0 filas
 *    → otra corrida ya se quedó con el ciclo (y ya committeó el avance del
 *    puntero) — no se hace nada más [R6].
 * 3. Regla de pendiente [R8]: si el plan tiene un ticket abierto sin
 *    atender, el ciclo se cierra `SALTEADO_PENDIENTE` y el puntero avanza
 *    igual, sin crear ticket.
 * 4. `CrearTicketUseCase.execute` (reusado, ADR-PV5 — el runner re-entrante
 *    de WU-0 hace que participe de ESTA misma transacción en vez de abrir
 *    una nueva). `Result.fail` (responsable inválido / sin ciclo activo del
 *    tenant) → `throw` → ROLLBACK TOTAL: sin ticket, sin fila, sin avance de
 *    puntero — el siguiente tick reintenta el mismo ciclo [R9].
 * 5. Éxito → `marcarGenerado` + avance del puntero, mismo COMMIT.
 *
 * Aislamiento por plan: un plan roto no aborta el resto del barrido del
 * tenant (try/catch por plan, log con `planId` + mensaje — nunca el error
 * crudo). El aislamiento POR TENANT es responsabilidad del scheduler
 * (`PreventivoSweepScheduler`).
 *
 * WU-6 [R11]: solo cuando el ciclo terminó en GENERADO (paso 5, dentro de la
 * MISMA transacción del plan) se encola `PreventivoGeneradoEvent` vía
 * `txRunner.alCommitear()` — mismo patrón que `CrearTicketUseCase` paso 8
 * (ADR-PV5/#2651): publicar la publicación en un `alCommitear()` en vez de
 * directo evita que, corriendo re-entrante, el evento salga con la
 * transacción externa todavía abierta. NUNCA se encola en `SALTEADO_PENDIENTE`,
 * `SALTEADO_ATRASO` ni cuando `reservar()` pierde la carrera — en esos casos
 * no hay ticket nuevo que notificar. El runner protege cada callback con su
 * propio try/catch (log-and-swallow) — este use case no necesita el suyo.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Idempotencia por clave de
 * base...", "Recuperación de corrida perdida sin ráfaga", "No-solapamiento
 * con preventivo abierto sin atender", "Solicitante del ticket generado...",
 * "Aislamiento por tenant en el barrido", "Notificación solo al generar".
 * Ref design: ADR-PV2, ADR-PV3, ADR-PV4, ADR-PV5. Tarea: 5.3, 5.4, 5.5, 6.1.
 */
export class GenerarPreventivosUseCase {
  constructor(
    private readonly planRepo: Pick<
      IPlanPreventivoRepository,
      'findVencibles' | 'actualizarProximaEjecucion'
    >,
    private readonly generacionRepo: Pick<
      IPreventivoGeneracionRepository,
      | 'reservar'
      | 'marcarGenerado'
      | 'marcarSalteadoPendiente'
      | 'registrarSalteadoAtraso'
      | 'existeTicketAbiertoDelPlan'
    >,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findIdByCodigo'>,
    private readonly crearTicketUseCase: Pick<CrearTicketUseCase, 'execute'>,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly calcularCiclo: Pick<CalcularCicloService, 'ciclosPendientes'>,
    private readonly logger: Pick<ILogger, 'error'>,
    private readonly eventPublisher: Pick<IDomainEventPublisher, 'publish'>,
  ) {}

  /**
   * @param clienteId UUID del cliente activo (`TenantContext.clienteId` del
   *   tenant que el scheduler ya bindeó) — necesario para la validación
   *   cross-DB del solicitante dentro de `CrearTicketUseCase`.
   * @returns No retorna valor: los fallos por-plan se aíslan y se loguean
   *   (`PREVENTIVO_PLAN_ERROR`), nunca se propagan al caller.
   */
  async execute(clienteId: string): Promise<void> {
    const hoy = new Date();
    const anio = hoy.getFullYear();

    const planes = await this.planRepo.findVencibles(hoy);
    if (planes.length === 0) return;

    // Catálogo FIJO (seed de provisioning) — su ausencia es un bug de
    // infraestructura del tenant, no un error esperado de un plan puntual:
    // throw defensivo, igual criterio que CrearTicketSoporteUseCase.
    const tipoMantenimientoId = await this.tipoTicketRepo.findIdByCodigo(TIPO_CODIGO_MANTENIMIENTO);
    if (!tipoMantenimientoId) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo "${TIPO_CODIGO_MANTENIMIENTO}" en el tenant activo.`,
      );
    }

    for (const plan of planes) {
      try {
        await this.procesarPlan(plan, hoy, anio, clienteId, tipoMantenimientoId);
      } catch (error) {
        // Aislamiento por plan: un plan roto no aborta el resto del barrido
        // del tenant. Log con `planId` + mensaje — nunca el error crudo.
        const mensaje = error instanceof Error ? error.message : 'error desconocido';
        this.logger.error(`PREVENTIVO_PLAN_ERROR | planId=${plan.id} | error=${mensaje}`);
      }
    }
  }

  private async procesarPlan(
    plan: PlanPreventivoEntity,
    hoy: Date,
    anio: number,
    clienteId: string,
    tipoMantenimientoId: string,
  ): Promise<void> {
    await this.txRunner.run(async () => {
      const resultado = this.calcularCiclo.ciclosPendientes(
        {
          fechaInicio: plan.fechaInicio,
          intervaloValor: plan.intervaloValor,
          intervaloUnidad: plan.intervaloUnidad,
          proximaEjecucionEn: plan.proximaEjecucionEn,
        },
        hoy,
      );

      // Recuperación (ADR-PV3): todo ciclo atrasado ANTERIOR al candidato
      // (o el único salteo del re-anclaje por TOPE) se registra ANTES de
      // reservar el candidato — todo en la MISMA transacción del plan.
      for (const fechaSalteada of resultado.salteados) {
        await this.generacionRepo.registrarSalteadoAtraso(plan.id, fechaSalteada);
      }

      if (resultado.candidato === null) {
        // Nada vencido, o TOPE agotado y re-anclado (ADR-PV3): sin candidato
        // no hay ticket que generar. El puntero puede haber cambiado
        // (re-anclaje) o no (nada vencido) — se persiste siempre, es
        // idempotente y barato.
        await this.planRepo.actualizarProximaEjecucion(plan.id, resultado.proximaEjecucionEn);
        return;
      }

      // 1. INSERT RESERVADO — PRIMERA sentencia (ADR-PV2). 0 filas → otra
      // corrida ganó la carrera y ya committeó todo, incluido el avance del
      // puntero: no hay nada más que hacer acá [R6].
      //
      // Este guard NO se puede probar por integración, y conviene saberlo
      // antes de intentarlo: sacándolo, el estado observable final no cambia.
      // Con un ticket abierto del plan, la corrida cae en la rama
      // SALTEADO_PENDIENTE de abajo; y sin ticket abierto, sigue de largo
      // hasta `marcarGenerado(null, …)`, que Prisma rechaza con P2025 y el
      // try/catch por plan convierte en ROLLBACK. En los dos casos queda 1
      // ticket y 1 fila, igual que con el guard puesto. Lo que el guard
      // aporta es que el salteo sea LIMPIO en vez de accidental — sin
      // excepción y sin log de error espurio. Por eso lo que lo pincha es el
      // unitario (`[R6] reservar devuelve null … → no hace NADA más`), que
      // sí exige que no se llame a nadie más, y no un caso de integración.
      const generacionId = await this.generacionRepo.reservar(plan.id, resultado.candidato);
      if (generacionId === null) return;

      // 2. Regla de pendiente [R8]: preventivo abierto sin atender → salteo,
      // el puntero avanza igual, sin ticket ni notificación (WU-6).
      const hayAbierto = await this.generacionRepo.existeTicketAbiertoDelPlan(plan.id);
      if (hayAbierto) {
        await this.generacionRepo.marcarSalteadoPendiente(generacionId);
        await this.planRepo.actualizarProximaEjecucion(plan.id, resultado.proximaEjecucionEn);
        return;
      }

      // 3. CrearTicketUseCase reusado (ADR-PV5): el runner re-entrante hace
      // que su propio `txRunner.run()` interno participe de ESTA misma
      // transacción en vez de abrir una nueva.
      const ticketResult = await this.crearTicketUseCase.execute({
        titulo: plan.titulo,
        descripcion: plan.instrucciones,
        tipoId: tipoMantenimientoId,
        prioridadId: plan.prioridadId,
        solicitanteId: plan.responsableId,
        clienteId,
        autorId: plan.responsableId,
        anio,
      });

      if (ticketResult.isFail()) {
        // [R9] Responsable inválido / sin ciclo activo del tenant: el
        // resultado del ciclo quedó INDETERMINADO, no decidido. `throw`
        // fuerza el ROLLBACK TOTAL de Prisma — sin ticket, sin fila, sin
        // avance de puntero. El siguiente tick reintenta el mismo ciclo.
        throw new Error(
          `No se pudo generar el ticket del plan ${plan.id}: ${ticketResult.getError().message}`,
        );
      }

      // 4-5. Éxito: cierra el ciclo GENERADO y avanza el puntero en el
      // mismo COMMIT.
      const ticketId = ticketResult.getValue().id;
      await this.generacionRepo.marcarGenerado(generacionId, ticketId);
      await this.planRepo.actualizarProximaEjecucion(plan.id, resultado.proximaEjecucionEn);

      // [R11] Post-commit, log-and-swallow (ADR-PV2 último paso): encolada
      // vía `alCommitear()`, nunca publicada directo acá — este punto del
      // código corre con la transacción TODAVÍA abierta (ver JSDoc de la
      // clase y ADR-PV5).
      this.txRunner.alCommitear(() => {
        this.eventPublisher.publish(
          new PreventivoGeneradoEvent({
            planId: plan.id,
            ticketId,
            responsableId: plan.responsableId,
          }),
        );
      });
    });
  }
}
