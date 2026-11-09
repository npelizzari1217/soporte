import { toast } from "sonner";
import { ApiError } from "@/shared/api/types";

/**
 * Aviso de servidor saturado (odd/saturacion-conexiones, S2). El backend responde 503 con
 * `code: "SERVICIO_SATURADO"` cuando la base no tiene conexiones libres; no es un error de los
 * datos sino de capacidad, y reintentar en unos segundos funciona.
 */

/** Id fijo: varias consultas que fallan juntas muestran UN aviso, no uno por consulta. */
export const ID_AVISO_SATURACION = "servicio-saturado";

/**
 * @param err Error capturado.
 * @returns `true` si el backend lo marcó como saturación.
 */
export function esSaturacion(err: unknown): boolean {
  return err instanceof ApiError && err.code === "SERVICIO_SATURADO";
}

/**
 * Muestra el aviso de saturación con la explicación y los pasos a seguir.
 *
 * @param reintentar Vuelve a pedir lo que falló; sin él, el aviso indica reintentar a mano.
 */
export function avisarSaturacion(reintentar?: () => void): void {
  toast.error("El sistema está saturado en este momento", {
    id: ID_AVISO_SATURACION,
    duration: 15_000,
    description: reintentar
      ? "Hay muchas consultas al mismo tiempo y no se pudo mostrar lo que pidió. Sus datos no se perdieron. " +
        "Para verlo: 1) espere unos segundos; 2) presione «Reintentar»; 3) si sigue sin aparecer, actualice la página (F5)."
      : "Hay muchas consultas al mismo tiempo y no se pudo completar lo que pidió. Sus datos no se perdieron. " +
        "Espere unos segundos y vuelva a intentarlo; si sigue fallando, actualice la página (F5).",
    action: reintentar ? { label: "Reintentar", onClick: reintentar } : undefined,
  });
}
