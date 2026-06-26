/**
 * Equipo domain type — mirrors the backend EquipoEntity fields returned by GET /api/equipos.
 * Equipos is a device inventory — no estado/prioridad catalog UUIDs.
 * activo is a boolean flag rendered as "Activo"/"Inactivo" badge.
 *
 * Spec: [SPEC:frontend-equipos/types]
 */
export type Equipo = {
  id: string;
  nombre: string;
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaAdquisicion: string | null;  // ISO date string or null
  ubicacionId: string | null;
  asignadoAId: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};
