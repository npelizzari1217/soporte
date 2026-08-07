/**
 * Tipos del catálogo master de ciclos — espejo de
 * `backend/src/clientes/interface/dtos/ciclo-vigente.dto.ts`
 * (`CicloVigenteResponseDto`, `GET /ciclos-vigentes`, item 4 backend-gaps —
 * cierra G6: antes `AdoptarCicloForm` pedía el id a mano en texto libre).
 */
export interface CicloVigente {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
}
