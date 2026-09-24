/**
 * Tipos de la feature `feriados` (globales + por cliente,
 * sdd/feriados-configurables). Espejo de los DTOs reales:
 * `backend/src/calendario-laboral/interface/dtos/feriado.dto.ts`
 * (`/feriados`, master, escritura exclusiva ROOT) y
 * `feriado-cliente.dto.ts` (`/feriados-cliente`, tenant, escritura
 * ADMINISTRADOR de cliente).
 *
 * Dos recursos HTTP separados con el MISMO shape de respuesta
 * (`id`/`fecha`/`descripcion`) pero tipos distintos — igual criterio que el
 * backend usa dos pares de DTOs en vez de compartir uno (owners de
 * escritura distintos, D9 design.md).
 */

/** Respuesta de `GET`/`POST`/`PATCH /feriados` (feriado GLOBAL, master). */
export interface Feriado {
  id: string;
  fecha: string;
  descripcion: string;
}

/** Respuesta de `GET`/`POST`/`PATCH /feriados-cliente` (feriado de TENANT). */
export interface FeriadoCliente {
  id: string;
  fecha: string;
  descripcion: string;
}

/** Body de `POST /feriados`. */
export interface CreateFeriadoDto {
  fecha: string;
  descripcion: string;
}

/**
 * Body de `PATCH /feriados/:id`. Full-replace (no PATCH semántico
 * parcial, mismo criterio que `UpdateFeriadoDto` del backend):
 * `EditarFeriadoGlobalUseCase` reemplaza `fecha` y `descripcion` enteras,
 * así que ambos campos son obligatorios acá.
 */
export interface UpdateFeriadoDto {
  fecha: string;
  descripcion: string;
}

/** Body de `POST /feriados-cliente`. */
export interface CreateFeriadoClienteDto {
  fecha: string;
  descripcion: string;
}

/** Body de `PATCH /feriados-cliente/:id`. Full-replace (mismo criterio que `UpdateFeriadoDto`). */
export interface UpdateFeriadoClienteDto {
  fecha: string;
  descripcion: string;
}

/**
 * Origen de un feriado en la lista COMBINADA (`combinarFeriados()`, tarea
 * 8.1, WU8) — el backend nunca lo devuelve: ni `GET /feriados` ni
 * `GET /feriados-cliente` llevan un campo de origen, lo asigna el merge
 * client-side según de qué endpoint vino cada fila (D8, design.md).
 *
 * Declarado acá (WU6b) y reexportado desde `OrigenFeriadoBadge`
 * (`components/origen-feriado-badge.tsx`, WU6a), que antes lo declaraba
 * localmente porque este archivo todavía no existía.
 */
export type OrigenFeriado = "GLOBAL" | "CLIENTE";
