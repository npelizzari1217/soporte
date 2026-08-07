/**
 * DTOs de entrada/salida para `CiclosController` (tenant-scopeado).
 *
 * Tarea: T9.7 (PR9 — Ciclos)
 */
import { IsNotEmpty, IsString } from 'class-validator';

/** Body de `POST /ciclos` — elegir un ciclo del catálogo master (R21). */
export class ElegirCicloDto {
  @IsString()
  @IsNotEmpty()
  cicloVigenteId!: string;
}

/** Respuesta de `POST /ciclos` y `PATCH /ciclos/:id/activar`. */
export interface CicloResponseDto {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
  cicloVigenteId: string;
}

/**
 * Respuesta de `GET /ciclos` (G4, sdd/beta-frontend) — todos los ciclos del
 * tenant + `cicloActivoId` (id del que tiene `activo=true`, `null` si ninguno).
 */
export interface ListarCiclosResponseDto {
  ciclos: CicloResponseDto[];
  cicloActivoId: string | null;
}
