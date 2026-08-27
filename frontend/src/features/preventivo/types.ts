/**
 * Tipos del dominio Preventivo — espejo de los DTOs reales del backend
 * (`backend/src/preventivo/interface/dtos/preventivo.dto.ts`).
 *
 * El backend NO expone `GET /preventivo/planes/:id` (solo `GET /preventivo/planes`
 * y `GET /preventivo/planes/:id/generaciones`, WU-4) — el detalle de un plan se
 * deriva del listado cacheado (ver `hooks/use-planes-preventivo.ts`).
 *
 * Tarea: 7.1.
 */

export type IntervaloUnidad = "DIAS" | "MESES";

/** Los 4 códigos del CHECK `preventivo_generacion_resultado_check`. `RESERVADO` es
 * transitorio dentro de la transacción del ciclo (ADR-PV2) y nunca queda committeado
 * — no debería aparecer en una respuesta HTTP real, pero el tipo lo declara para
 * que el shape sea exhaustivo y no truene ante un dato inesperado. */
export type ResultadoGeneracion = "RESERVADO" | "GENERADO" | "SALTEADO_PENDIENTE" | "SALTEADO_ATRASO";

export interface PlanPreventivo {
  id: string;
  titulo: string;
  instrucciones: string | null;
  /** Objetivo excluyente (ADR-PV1): exactamente uno de `equipoId`/`ubicacion` viene seteado. */
  equipoId: string | null;
  /** Texto libre, normalizado a mayúscula por el backend. */
  ubicacion: string | null;
  prioridadId: string;
  responsableId: string;
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
  fechaInicio: string;
  proximaEjecucionEn: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Fila de auditoría de una generación (`GET /preventivo/planes/:id/generaciones`). */
export interface PreventivoGeneracion {
  id: string;
  planId: string;
  /**
   * SIEMPRE un ISO 8601 con offset fijo (`Date.toISOString()` en el backend,
   * `toPreventivoGeneracionResponseDto`) — nunca formato libre. `ultimaGeneracion`
   * (`hooks/use-planes-preventivo.ts`) depende de esta garantía para poder
   * comparar dos valores con `>` de strings sin parsear a `Date`.
   */
  fechaProgramada: string;
  resultado: ResultadoGeneracion;
  ticketId: string | null;
  createdAt: string;
}

/** Body de `POST /preventivo/planes`. */
export interface CreatePlanPreventivoDto {
  titulo: string;
  instrucciones?: string | null;
  equipoId?: string | null;
  ubicacion?: string | null;
  prioridadId: string;
  responsableId: string;
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
  fechaInicio: string;
}
