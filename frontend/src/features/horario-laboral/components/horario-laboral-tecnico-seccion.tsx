"use client";

/**
 * HorarioLaboralTecnicoSeccion — CONTAINER de la sección "Horario por
 * técnico" de `/horario-laboral` (odd/tasks/tiempo-tecnico.md T2, S1/S2).
 * Solo la monta `HorarioLaboralView` para ADMINISTRADOR o ROOT; el backend
 * igual exige `AdminClienteGuard` en el `PUT` y el `DELETE`.
 *
 * Los técnicos salen de `GET /usuarios` (`useUsuariosAsignables`, mismo
 * universo que usa el dashboard), filtrados a TECNICO y COLABORADOR: los
 * roles que atienden tickets.
 *
 * Dos estados según `origen`:
 * - `CLIENTE`: el técnico no tiene horario propio y se le muestra el del
 *   cliente, editable. Guardar ("Usar horario propio") hace el `PUT` con lo
 *   que haya en la grilla.
 * - `USUARIO`: tiene horario propio. "Guardar" lo reemplaza y "Volver al
 *   horario del cliente" lo borra (`DELETE`), previa confirmación.
 *
 * Sincronización al cambiar de técnico: el form lleva el técnico y el origen
 * en la `key`, así que se vuelve a montar con el horario del técnico nuevo y
 * no arrastra la edición del anterior. Por el origen, pasar a horario propio o
 * volver al del cliente también lo vuelve a montar: muestra exactamente lo que
 * dice el aviso, sin ediciones pendientes. Por la misma razón, cambiar de técnico limpia el
 * estado de la última mutación: el alert inline y el "guardando" son del
 * técnico que se guardó. El toast del resultado sí llega, porque sale de las
 * opciones del hook y no del `mutate` que el `reset()` descarta.
 *
 * El técnico elegido se busca en la lista traída en cada render: si un
 * refetch lo saca (membresía desactivada), la selección cae a vacía en vez de
 * dejar el `<select>` mostrando una opción que no corresponde.
 */
import { useMemo, useState, type ReactElement } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { useUsuariosAsignables } from "@/features/tickets/hooks/use-usuarios-asignables";
import type { UsuarioAsignable } from "@/features/tickets/types";
import { useHorarioLaboralUsuario } from "../hooks/use-horario-laboral-usuario";
import {
  useBorrarHorarioLaboralUsuario,
  useGuardarHorarioLaboralUsuario,
} from "../hooks/use-horario-laboral-usuario-mutations";
import { mensajeErrorGuardado } from "../mensaje-error-guardado";
import type { HorarioLaboralDto } from "../types";
import { HorarioLaboralForm } from "./horario-laboral-form";

const ROLES_CON_HORARIO_PROPIO = ["TECNICO", "COLABORADOR"];

function nombreCompleto(usuario: UsuarioAsignable): string {
  return `${usuario.nombre} ${usuario.apellido}`;
}

/** Sección "Horario por técnico": selector de técnico y su horario semanal. */
export function HorarioLaboralTecnicoSeccion(): ReactElement {
  const usuariosQuery = useUsuariosAsignables();
  const [usuarioIdElegido, setUsuarioIdElegido] = useState("");
  const guardarMutation = useGuardarHorarioLaboralUsuario({
    onSuccess: () => notifySuccess("Horario del técnico guardado."),
    onError: (error) => notifyError(error),
  });
  const borrarMutation = useBorrarHorarioLaboralUsuario();

  const tecnicos = useMemo(
    () =>
      (usuariosQuery.data ?? [])
        .filter((usuario) => ROLES_CON_HORARIO_PROPIO.includes(usuario.rol))
        .sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre)),
    [usuariosQuery.data],
  );
  const tecnico = tecnicos.find((usuario) => usuario.id === usuarioIdElegido);
  const horarioQuery = useHorarioLaboralUsuario(tecnico?.id);

  function elegir(usuarioId: string): void {
    guardarMutation.reset();
    setUsuarioIdElegido(usuarioId);
  }

  function guardar(usuarioId: string, dto: HorarioLaboralDto): void {
    guardarMutation.mutate({ usuarioId, dto });
  }

  function volverAlCliente(usuarioId: string): void {
    borrarMutation.mutate(usuarioId, {
      onSuccess: () => {
        guardarMutation.reset();
        notifySuccess("El técnico vuelve a usar el horario laboral del cliente.");
      },
      onError: (error) => notifyError(error),
    });
  }

  function contenido() {
    if (usuariosQuery.isLoading) {
      return <p className="text-sm text-muted-foreground">Cargando técnicos…</p>;
    }
    if (usuariosQuery.isError && !usuariosQuery.data) {
      return (
        <ErrorState
          message="No se pudo cargar la lista de técnicos."
          onRetry={() => usuariosQuery.refetch().catch(notifyError)}
        />
      );
    }
    if (tecnicos.length === 0) {
      return <p className="text-sm text-muted-foreground">Este cliente no tiene técnicos ni colaboradores.</p>;
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex max-w-sm flex-col gap-1">
          <label htmlFor="horario-tecnico-usuario" className="text-sm font-medium text-foreground">
            Técnico
          </label>
          <Select id="horario-tecnico-usuario" value={tecnico?.id ?? ""} onChange={(e) => elegir(e.target.value)}>
            <option value="">Seleccionar técnico</option>
            {tecnicos.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {nombreCompleto(usuario)}
              </option>
            ))}
          </Select>
        </div>
        {tecnico && horarioDe(tecnico)}
      </div>
    );
  }

  function horarioDe(elegido: UsuarioAsignable) {
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
            {nombreCompleto(elegido)} usa el horario laboral del cliente. Al usar un horario propio, deja de
            seguir los cambios del horario del cliente.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{nombreCompleto(elegido)} tiene horario propio.</p>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="sm" disabled={borrarMutation.isPending}>
                  Volver al horario del cliente
                </Button>
              }
              title="¿Volver al horario del cliente?"
              description={`Se borra el horario propio de ${nombreCompleto(elegido)} y pasa a usar el horario laboral del cliente.`}
              confirmLabel="Volver al horario del cliente"
              confirmVariant="destructive"
              isConfirming={borrarMutation.isPending}
              onConfirm={() => volverAlCliente(elegido.id)}
            />
          </div>
        )}
        <HorarioLaboralForm
          key={`${elegido.id}-${horarioQuery.data.origen}`}
          prefijoId="horario-tecnico"
          valoresIniciales={horarioQuery.data}
          soloLectura={false}
          guardando={guardarMutation.isPending}
          errorServidor={guardarMutation.isError ? mensajeErrorGuardado(guardarMutation.error) : null}
          etiquetaGuardar={usaHorarioDelCliente ? "Usar horario propio" : "Guardar"}
          onGuardar={(dto) => guardar(elegido.id, dto)}
        />
      </div>
    );
  }

  return (
    <section aria-labelledby="horario-tecnico-titulo" className="mt-10 flex flex-col gap-4">
      <div>
        <h2 id="horario-tecnico-titulo" className="text-base font-semibold text-foreground">
          Horario por técnico
        </h2>
        <p className="text-sm text-muted-foreground">
          Horario semanal propio de cada técnico. Sin horario propio, se usa el horario laboral del cliente.
        </p>
      </div>
      {contenido()}
    </section>
  );
}
