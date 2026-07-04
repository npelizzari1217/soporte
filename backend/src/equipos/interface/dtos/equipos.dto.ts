/**
 * DTOs de entrada/salida para los controllers del módulo de equipos:
 * EquiposController, ComponentesController, TicketSoporteController.
 *
 * Siguiendo el patrón de reparaciones.dto.ts: interfaces planas, sin class-validator.
 *
 * Tarea: 6.D.2
 */

// ─── Input DTOs — Equipos ─────────────────────────────────────────────────────

/**
 * Cuerpo HTTP para POST /equipos.
 */
export interface CreateEquipoHttpDto {
  /** Nombre o identificador descriptivo. Ej: "PC Contabilidad 03". */
  nombre: string;
  /** Número de serie del fabricante (opcional, UNIQUE parcial WHERE NOT NULL). */
  numeroSerie?: string | null;
  /** Fabricante. Ej: Dell, HP, Lenovo. */
  marca?: string | null;
  /** Modelo comercial. */
  modelo?: string | null;
  /** Fecha de compra o incorporación al inventario (ISO string). */
  fechaAdquisicion?: string | null;
  /** UUID de la ubicación física del equipo (null si sin ubicar). */
  ubicacionId?: string | null;
}

/**
 * Cuerpo HTTP para PATCH /equipos/:id.
 * clienteId y autorId se extraen del JWT via @CurrentUser().
 */
export interface UpdateEquipoHttpDto {
  /** Nombre o identificador descriptivo. */
  nombre: string;
  /** Número de serie del fabricante (opcional). */
  numeroSerie?: string | null;
  /** Fabricante. */
  marca?: string | null;
  /** Modelo comercial. */
  modelo?: string | null;
  /** Fecha de compra o incorporación (ISO string). */
  fechaAdquisicion?: string | null;
  /** UUID de la ubicación física (null para desasociar). */
  ubicacionId?: string | null;
}

/**
 * Cuerpo HTTP para POST /equipos/:id/asignar.
 */
export interface AsignarEquipoHttpDto {
  /** UUID del usuario de master.usuarios al que se asigna el equipo. */
  asignadoAId: string;
}

// ─── Input DTOs — Componentes ─────────────────────────────────────────────────

/**
 * Cuerpo HTTP para POST /equipos/:id/componentes.
 */
export interface CreateComponenteHttpDto {
  /** UUID del tipo de componente (FK → tipos_componente.id). Obligatorio. */
  tipoComponenteId: string;
  /** Descripción adicional: modelo, especificación técnica. */
  descripcion?: string | null;
  /** Número de serie del componente individual. */
  numeroSerie?: string | null;
  /** Capacidad/especificación: ej. "16GB DDR4", "1TB NVMe". */
  capacidad?: string | null;
}

// ─── Input DTOs — Ticket Soporte ──────────────────────────────────────────────

/**
 * Cuerpo HTTP para POST /tickets-soporte.
 * clienteId y autorId se extraen del JWT via @CurrentUser().
 *
 * Fase 4 (ciclos-master-tenant, ADR-1/ADR-3): `cicloId` fue REMOVIDO del contrato.
 * El servidor determina el ciclo activo del tenant — el cliente ya no lo provee
 * (contrato honesto: un campo ignorado silenciosamente induce a error). Nota:
 * como este DTO es una interface TS plana (no class-validator), NestJS resuelve
 * `metatype === Object` y el ValidationPipe global ({ whitelist: true, transform:
 * true }, sin forbidNonWhitelisted) salta la validación/whitelist por completo —
 * un `cicloId` sobrante en el body pasaría sin 400, pero el controller/use case
 * ya no lo lee (ver `tickets.dto.validation-pipe.spec.ts`, Fase 4 PR1).
 */
export interface CreateTicketSoporteHttpDto {
  titulo: string;
  descripcion?: string | null;
  /** UUID del tipo de ticket SOPORTE (FK → tipos_ticket). */
  tipoId: string;
  /** UUID de la prioridad (FK → prioridades). */
  prioridadId: string;
  /** UUID del solicitante (soft ref → master.usuarios). */
  solicitanteId: string;
  /** Fecha de resolución ISO (opcional). */
  fechaCierre?: string | null;
  /**
   * UUID del equipo afectado (opcional).
   * NULL si el ticket no refiere a un equipo específico (ej. problema de red).
   */
  equipoId?: string | null;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Shape de respuesta para un equipo informático. */
export interface EquipoResponseDto {
  id: string;
  nombre: string;
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaAdquisicion: string | null;
  ubicacionId: string | null;
  asignadoAId: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Shape de respuesta para un componente de equipo. */
export interface ComponenteEquipoResponseDto {
  id: string;
  equipoId: string;
  tipoComponenteId: string;
  descripcion: string | null;
  numeroSerie: string | null;
  capacidad: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape de respuesta para un ticket de soporte creado. */
export interface TicketSoporteResponseDto {
  id: string;
  numero: string;
  titulo: string;
  estadoId: string;
  createdAt: string;
  updatedAt: string;
}
