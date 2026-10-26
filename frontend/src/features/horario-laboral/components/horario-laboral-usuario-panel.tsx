"use client";

/**
 * HorarioLaboralUsuarioPanel — horario semanal propio de UN usuario (odd/tasks/tiempo-tecnico.md T2,
 * S1/S2). Lo monta el botón "Horarios" de la fila del usuario en `/admin/usuarios`
 * (odd/tasks/pedidos-2026-10-26.md, S6). El backend exige `AdminClienteGuard` en el `PUT` y el
 * `DELETE`.
 *
 * Dos estados según `origen`:
 * - `CLIENTE`: el usuario no tiene horario propio y se le muestra el del cliente, editable. Guardar
 *   ("Usar horario propio") hace el `PUT` con lo que haya en la grilla.
 * - `USUARIO`: tiene horario propio. "Guardar" lo reemplaza y "Volver al horario del cliente" lo
 *   borra (`DELETE`), previa confirmación.
 *
 * El form lleva el usuario y el origen en la `key`: pasar a horario propio o volver al del cliente lo
 * vuelve a montar, así que muestra exactamente lo que dice el aviso, sin ediciones pendientes.
 *
 * Los avisos del guardado salen de las opciones del hook y no del `mutate`: si el diálogo se cierra
 * con el `PUT` en vuelo, el resultado igual se avisa (JD-B-005).
 */
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { useHorarioLaboralUsuario } from "../hooks/use-horario-laboral-usuario";
import {
  useBorrarHorarioLaboralUsuario,
  useGuardarHorarioLaboralUsuario,
} from "../hooks/use-horario-laboral-usuario-mutations";
import { mensajeErrorGuardado } from "../mensaje-error-guardado";
import { HorarioLaboralForm } from "./horario-laboral-form";

/** Roles que atienden tickets: los únicos con horario propio para medir su tiempo. */
export const ROLES_CON_HORARIO_PROPIO: readonly string[] = ["TECNICO", "COLABORADOR"];

export interface HorarioLaboralUsuarioPanelProps {
  usuarioId: string;
  /** Nombre y apellido, para los avisos. */
  nombreCompleto: string;
}

/**
 * Horario propio de un usuario, con su aviso de origen y sus acciones.
 *
 * @param props Usuario a mostrar.
 * @returns El panel con la grilla, o su estado de carga o error.
 */
export function HorarioLaboralUsuarioPanel({
  usuarioId,
  nombreCompleto,
}: HorarioLaboralUsuarioPanelProps): ReactElement | null {
  const horarioQuery = useHorarioLaboralUsuario(usuarioId);
  const guardarMutation = useGuardarHorarioLaboralUsuario({
    onSuccess: () => notifySuccess("Horario del técnico guardado."),
    onError: (error) => notifyError(error),
  });
  const borrarMutation = useBorrarHorarioLaboralUsuario();

  function volverAlCliente(): void {
    borrarMutation.mutate(usuarioId, {
      onSuccess: () => {
        guardarMutation.reset();
        notifySuccess("El técnico vuelve a usar el horario laboral del cliente.");
      },
      onError: (error) => notifyError(error),
    });
  }

  if (horarioQuery.isLoading) {
    return <DetailSkeleton />;
  }
  if (horarioQuery.isError && !horarioQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar el horario del técnico."
        onRetry={() => horarioQuery.refetch().catch(notifyError)}
      />
    );
  }
  if (!horarioQuery.data) {
    return null;
  }

  const usaHorarioDelCliente = horarioQuery.data.origen === "CLIENTE";
  return (
    <div className="flex flex-col gap-2">
      {usaHorarioDelCliente ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          {nombreCompleto} usa el horario laboral del cliente. Al usar un horario propio, deja de seguir
          los cambios del horario del cliente.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{nombreCompleto} tiene horario propio.</p>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="sm" disabled={borrarMutation.isPending}>
                Volver al horario del cliente
              </Button>
            }
            title="¿Volver al horario del cliente?"
            description={`Se borra el horario propio de ${nombreCompleto} y pasa a usar el horario laboral del cliente.`}
            confirmLabel="Volver al horario del cliente"
            confirmVariant="destructive"
            isConfirming={borrarMutation.isPending}
            onConfirm={volverAlCliente}
          />
        </div>
      )}
      <HorarioLaboralForm
        key={`${usuarioId}-${horarioQuery.data.origen}`}
        prefijoId="horario-tecnico"
        valoresIniciales={horarioQuery.data}
        soloLectura={false}
        guardando={guardarMutation.isPending}
        errorServidor={guardarMutation.isError ? mensajeErrorGuardado(guardarMutation.error) : null}
        etiquetaGuardar={usaHorarioDelCliente ? "Usar horario propio" : "Guardar"}
        onGuardar={(dto) => guardarMutation.mutate({ usuarioId, dto })}
      />
    </div>
  );
}
