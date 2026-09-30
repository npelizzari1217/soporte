/**
 * Tipos del dominio Equipos IT — espejo de los DTOs reales del backend
 * (`backend/src/equipos/interface/dtos/equipos.dto.ts`).
 *
 * `GET /equipos/:id` ahora embebe `componentes[]` (item 1 backend-gaps —
 * cierra G7): `EquipoDetailView` pasa esa lista real como dato inicial a
 * `EquipoComponentesSection`, que la usa para sembrar su cache local
 * (`["componentes", equipoId]`). Las mutaciones (agregar/eliminar/editar/
 * reactivar) NO actualizan esa cache optimistamente: invalidan
 * `["equipo", equipoId]` y el `useEffect` de sincronización de props la
 * refresca con el detalle fresco ya enriquecido.
 *
 * PR6 (sdd/tipos-componente-master): `tipoComponenteId` desaparece —
 * `Componente` espeja `ComponenteResponseDto` (`tipoComponenteCodigo`,
 * shape básico sin enriquecer). El componente EMBEBIDO en
 * `EquipoDetalle.componentes` espeja `ComponenteConTipoResponseDto`
 * (`ComponenteConTipo`): además trae `tipoNombre`/`tipoActivo` resueltos
 * del catálogo MASTER — el único lugar confiable para mostrar el nombre de
 * un componente ya asignado (soporta tipos dados de baja).
 */
import type { CondicionStock } from "@/features/insumos/types";

export interface Equipo {
  id: string;
  nombre: string;
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  /**
   * Modelo del catálogo `ModeloEquipo` elegido para este equipo (WU-3,
   * modelos-equipo-catalogo-y-compatibilidad), espejo de
   * `EquipoResponseDto.modeloEquipoId`. Excluyente en la práctica con
   * `marca`/`modelo` de texto libre: elegir un modelo de catálogo los vacía
   * (ADR-4 del design de ese ciclo) — pero el backend no lo impone, así que
   * este tipo no lo modela como unión.
   */
  modeloEquipoId: string | null;
  fechaAdquisicion: string | null;
  /** Ubicación como texto libre (siempre en mayúscula). */
  ubicacion: string | null;
  /** Valor del equipo + fecha de la valoración. */
  importe: number | null;
  fechaValoracion: string | null;
  /** Observaciones libres del técnico. */
  observaciones: string | null;
  /** Valor residual (post-depreciación) + fecha del cálculo. El % NO se persiste. */
  valorResidual: number | null;
  fechaValorResidual: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Componente {
  id: string;
  equipoId: string;
  /** Repuesto del catálogo vinculado: obligatorio; el tipo ya no viaja en la respuesta. */
  insumoId: string;
  descripcion: string | null;
  numeroSerie: string | null;
  capacidad: string | null;
  /** `false` = dado de baja (soft-delete). Listado enriquecido: `GET /equipos/:id` ahora trae TODOS los componentes, no solo los activos. */
  activo: boolean;
  /** `null` si está activo; fecha de baja lógica si fue soft-deleted. */
  deletedAt: string | null;
  /** Campos de baja: el backend los envía siempre; son opcionales acá para no obligar a cada fixture. Desenlace del retiro; `null` si está activo o si la baja es anterior al retiro con destino (legado). */
  bajaDestino?: "STOCK_USADO" | "DESCARTE" | null;
  bajaMotivo?: string | null;
  /** Movimiento de ENTRADA que devolvió la pieza al stock (solo con `STOCK_USADO`). */
  bajaMovimientoId?: string | null;
  bajaUsuarioId?: string | null;
  /** `true` si la pieza devuelta no tenía una SALIDA del depósito vinculada. */
  bajaSinSalidaPrevia?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Componente EMBEBIDO en `GET /equipos/:id` — `Componente` + `tipoNombre`/
 * `tipoActivo` resueltos en batch desde el catálogo MASTER
 * (`ComponenteConTipoResponseDto`).
 */
export interface ComponenteConTipo extends Componente {
  /** Nombre de la familia del repuesto; `null` si no se pudo resolver. */
  tipoNombre: string | null;
  tipoActivo: boolean;
}

/** Shape de `GET /equipos/:id` (`EquipoDetalleResponseDto`, item 1 — cierra G7). */
export interface EquipoDetalle extends Equipo {
  componentes: ComponenteConTipo[];
}

export interface CreateEquipoDto {
  nombre: string;
  numeroSerie?: string | null;
  marca?: string | null;
  modelo?: string | null;
  /** Vacío es AUSENCIA en alta (`undefined`) — ver `equipo-create-dialog.tsx`. */
  modeloEquipoId?: string | null;
  fechaAdquisicion?: string | null;
  ubicacion?: string | null;
  importe?: number | null;
  fechaValoracion?: string | null;
  observaciones?: string | null;
  valorResidual?: number | null;
  fechaValorResidual?: string | null;
}

export interface EditarEquipoDto {
  nombre?: string;
  numeroSerie?: string | null;
  marca?: string | null;
  modelo?: string | null;
  /** Vacío es LIMPIAR en edición (`null`) — ver `equipo-edit-dialog.tsx`. */
  modeloEquipoId?: string | null;
  fechaAdquisicion?: string | null;
  ubicacion?: string | null;
  importe?: number | null;
  fechaValoracion?: string | null;
  observaciones?: string | null;
  valorResidual?: number | null;
  fechaValorResidual?: string | null;
}

/** Body de `POST /equipos/:id/componentes` (espejo de `CreateComponenteHttpDto`): `descontarStock` viaja siempre explícito. */
export interface CreateComponenteDto {
  insumoId: string;
  descontarStock: boolean;
  /** Saldo del que se descuenta; solo se envía con `descontarStock: true` y el selector visible. */
  condicion?: CondicionStock;
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}

/** Body de `PATCH /equipos/:id/componentes/:componenteId` (PATCH semántico: `undefined` = no tocar). */
export interface EditarComponenteDto {
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}

/** Shape unificado del ticket de soporte (`TicketSoporteConTicketResponseDto`). `equipoId` OPCIONAL — vínculo ticket↔equipo. */
export interface TicketSoporte {
  id: string;
  ticketId: string;
  numero: string;
  titulo: string;
  estadoId: string;
  equipoId: string | null;
  descripcionProblema: string | null;
  solucionAplicada: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrearTicketSoporteDto {
  titulo: string;
  descripcion?: string | null;
  prioridadId: string;
  equipoId?: string | null;
  descripcionProblema?: string | null;
}
