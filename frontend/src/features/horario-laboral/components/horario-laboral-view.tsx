"use client";

/**
 * HorarioLaboralView — CONTAINER client component montado por
 * `/horario-laboral` (task 8b.1, WU-8b, sdd/horario-laboral-por-cliente).
 * Orquesta `useHorarioLaboral`/`useGuardarHorarioLaboral` (WU-7c) sobre
 * `HorarioLaboralForm` (WU-8a-ii), que es puramente presentacional.
 *
 * UX de errores, D16 (design.md) — sin callejón sin salida:
 * - El skeleton depende SOLO de `isLoading` (primera carga), nunca de
 *   `isFetching`: el refetch en segundo plano que dispara
 *   `useGuardarHorarioLaboral` al invalidar la query (WU-7c) no debe
 *   reemplazar el form que el usuario está viendo.
 * - `ErrorState` con retry solo cuando `isError && !data` — con un dato ya
 *   en caché, un refetch fallido no tapa la grilla.
 * - Un error de la mutación (422 de dominio o 500) NUNCA desmonta el form:
 *   se conservan los valores, se muestra un alert inline (`errorServidor`,
 *   ya soportado por `HorarioLaboralForm`, WU-8a-ii) y se dispara
 *   `notifyError`.
 * - El botón se deshabilita solo mientras `guardarMutation.isPending`
 *   (`guardando`, prop de `HorarioLaboralForm`).
 * - Al tener éxito: `useGuardarHorarioLaboral` (WU-9, fix W1) escribe el
 *   horario devuelto DIRECTO en la cache de `useHorarioLaboral` vía
 *   `setQueryData`, así que `valoresIniciales` — que acá SOLO sale de
 *   `horarioQuery.data`, nunca de `guardarMutation.data` — se actualiza y
 *   dispara el `reset` interno de `HorarioLaboralForm` (su `useEffect` sobre
 *   `valoresIniciales`) sin esperar el refetch en segundo plano — y
 *   `notifySuccess`.
 *
 * D16 tenía un agujero (W1, verify-report.md): `valoresIniciales` salía de
 * `guardarMutation.data ?? horarioQuery.data`, y `data` de una mutación de
 * React Query vuelve a `undefined` apenas arranca la SIGUIENTE `mutate` — así
 * que un segundo guardado fallido, después de uno exitoso, reseteaba el form
 * a `horarioQuery.data` (todavía sin refetchear) ANTES de que llegara el 422
 * o el 500, y la edición en curso se perdía. Con `valoresIniciales` atado
 * SOLO a la query (y esa query ya actualizada por `setQueryData` en el
 * guardado previo), un guardado en curso no toca la fuente del form.
 */
import { useSession } from "@/shared/hooks/use-session";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { ApiError } from "@/shared/api/types";
import { useHorarioLaboral } from "../hooks/use-horario-laboral";
import { useGuardarHorarioLaboral } from "../hooks/use-guardar-horario-laboral";
import { HorarioLaboralForm } from "./horario-laboral-form";
import type { HorarioLaboralDto } from "../types";

/** Mismo criterio de normalización que `notifyError`: mensaje de dominio o fallback genérico. */
function mensajeErrorGuardado(error: unknown): string {
  if (error instanceof ApiError) return error.messages.join(" ");
  return "No se pudo guardar el horario laboral. Intentá de nuevo.";
}

export function HorarioLaboralView() {
  const { esAdminCliente } = useSession();
  const horarioQuery = useHorarioLaboral();
  const guardarMutation = useGuardarHorarioLaboral();

  function guardar(dto: HorarioLaboralDto): void {
    guardarMutation.mutate(dto, {
      onSuccess: () => notifySuccess("Horario laboral guardado."),
      onError: (error) => notifyError(error),
    });
  }

  if (horarioQuery.isLoading) {
    return <DetailSkeleton />;
  }

  if (horarioQuery.isError && !horarioQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar el horario laboral."
        onRetry={() => horarioQuery.refetch().catch(notifyError)}
      />
    );
  }

  if (!horarioQuery.data) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Horario laboral"
        description="Ventana horaria semanal usada para calcular los vencimientos de SLA hábiles."
      />
      <HorarioLaboralForm
        valoresIniciales={horarioQuery.data}
        soloLectura={!esAdminCliente}
        guardando={guardarMutation.isPending}
        errorServidor={guardarMutation.isError ? mensajeErrorGuardado(guardarMutation.error) : null}
        onGuardar={guardar}
      />
    </div>
  );
}
