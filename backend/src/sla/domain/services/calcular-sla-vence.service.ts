/**
 * CalcularSlaVenceService — cálculo puro de dominio del vencimiento de SLA
 * (S2, S3): `venceAt = creadoEn + horas` con reloj 24/7 (calendario corrido,
 * sin horario laboral en beta) — cruza medianoche/fin de semana sin ajuste.
 *
 * Sin dependencias de infraestructura ni framework — dominio puro.
 *
 * Ref spec: sdd/premium/spec S2, S3. Ref design: ADR-P4. Tarea: SA1/SA2.
 */
export class CalcularSlaVenceService {
  /**
   * Calcula la fecha de vencimiento de SLA a partir de la fecha de creación
   * del ticket (ancla fija, S3) y las horas configuradas para su prioridad.
   *
   * @param creadoEn Fecha de creación del ticket (ancla — nunca la fecha de
   *                 repriorización, S3).
   * @param horas    Horas configuradas para la prioridad (`sla_config.horas`).
   *                 Debe ser > 0 — invariante ya validada por `SlaConfigEntity`;
   *                 revalidada acá defensivamente.
   * @throws Error si `horas` no es un entero positivo (config inconsistente).
   */
  venceAt(creadoEn: Date, horas: number): Date {
    if (!Number.isFinite(horas) || horas <= 0) {
      throw new Error(`CalcularSlaVenceService: horas debe ser > 0, se recibió: ${horas}.`);
    }
    return new Date(creadoEn.getTime() + horas * 60 * 60 * 1000);
  }
}
