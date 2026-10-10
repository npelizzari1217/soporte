/**
 * Contrato publico `v1` de catalogos (api-publica, T5c). Son los ids que exige el alta de tickets
 * (`tipoId`, `prioridadId`) y los que devuelven los tickets (`estadoId`). DTOs PROPIOS de la API:
 * no exponen color, SLA, modulo ni datos de auditoria del catalogo interno.
 */

/** Tipo de ticket usable en el alta. `codigo` es estable; `nombre` lo edita el cliente. */
export interface TipoTicketV1 {
  id: string;
  codigo: string;
  nombre: string;
}

/** Prioridad usable en el alta. `orden` crece hacia la mas urgente segun el catalogo del cliente. */
export interface PrioridadV1 {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
}

/** Estado del ciclo de vida. `codigo` es el mismo que `TicketV1.estado` (`NUEVO`, `CERRADO`, ...). */
export interface EstadoV1 {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
}

export interface CatalogosV1 {
  tipos: TipoTicketV1[];
  prioridades: PrioridadV1[];
  estados: EstadoV1[];
}
