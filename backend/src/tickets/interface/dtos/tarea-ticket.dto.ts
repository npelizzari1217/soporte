import { IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import {
  TAREA_DESCRIPCION_MAX_LENGTH,
  TareaTicketEntity,
} from '../../domain/entities/tarea-ticket.entity';
import { AvanceTareas } from '../../domain/services/avance-tareas';

/**
 * DTOs de las tareas de un ticket (odd/tareas-con-tecnico, T3). El `ValidationPipe` global
 * (`whitelist`, `transform`) los aplica.
 */

/** Body de `POST /tickets/:id/tareas`. Al menos un carácter visible y hasta 255. */
export class CrearTareaTicketBodyDto {
  @IsString()
  @Matches(/\S/, { message: 'descripcion no puede estar vacía' })
  @MaxLength(TAREA_DESCRIPCION_MAX_LENGTH)
  descripcion!: string;
}

/**
 * Body de `PATCH /tickets/:id/tareas/:tareaId/tecnico`. `tecnicoId: null` quita el técnico; el
 * campo es obligatorio, así que un body vacío es un 400 y no un "quitar" accidental.
 */
export class AsignarTecnicoTareaBodyDto {
  @ValidateIf((dto: AsignarTecnicoTareaBodyDto) => dto.tecnicoId !== null)
  @IsUUID()
  tecnicoId!: string | null;
}

/** Nombre y apellido de un usuario de master, como los devuelve `resolverNombres`. */
export type NombreUsuario = { nombre: string; apellido: string };

/**
 * Una tarea en la respuesta HTTP. Los nombres siguen el patrón de `asignadoNombre` y
 * `asignadoApellido` del detalle del ticket: `null` si no hay usuario o no se pudo resolver.
 */
export interface TareaTicketResponseDto {
  id: string;
  ticketId: string;
  descripcion: string;
  orden: number;
  tecnicoId: string | null;
  tecnicoNombre: string | null;
  tecnicoApellido: string | null;
  completada: boolean;
  completadaEn: string | null;
  completadaPorId: string | null;
  completadaPorNombre: string | null;
  completadaPorApellido: string | null;
  createdAt: string;
}

/** Respuesta de `GET /tickets/:id/tareas`: tareas activas por `orden` y su avance. */
export interface TareasTicketResponseDto {
  items: TareaTicketResponseDto[];
  avance: AvanceTareas;
}

/** Ids de usuario que hay que resolver para mostrar las tareas. */
export function usuariosDeTareas(tareas: readonly TareaTicketEntity[]): string[] {
  const ids = new Set<string>();
  for (const tarea of tareas) {
    if (tarea.tecnicoId) ids.add(tarea.tecnicoId);
    if (tarea.completadaPorId) ids.add(tarea.completadaPorId);
  }
  return [...ids];
}

export function toTareaTicketResponseDto(
  tarea: TareaTicketEntity,
  nombres: ReadonlyMap<string, NombreUsuario>,
): TareaTicketResponseDto {
  const tecnico = tarea.tecnicoId ? nombres.get(tarea.tecnicoId) : undefined;
  const completadaPor = tarea.completadaPorId ? nombres.get(tarea.completadaPorId) : undefined;
  return {
    id: tarea.id,
    ticketId: tarea.ticketId,
    descripcion: tarea.descripcion,
    orden: tarea.orden,
    tecnicoId: tarea.tecnicoId,
    tecnicoNombre: tecnico?.nombre ?? null,
    tecnicoApellido: tecnico?.apellido ?? null,
    completada: tarea.completada,
    completadaEn: tarea.completadaEn ? tarea.completadaEn.toISOString() : null,
    completadaPorId: tarea.completadaPorId,
    completadaPorNombre: completadaPor?.nombre ?? null,
    completadaPorApellido: completadaPor?.apellido ?? null,
    createdAt: tarea.createdAt.toISOString(),
  };
}
