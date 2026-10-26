"use client";

/**
 * HorarioUsuarioControl — botón "Horarios" de la fila del usuario en `/admin/usuarios`
 * (odd/tasks/pedidos-2026-10-26.md, S6). Abre el horario semanal propio del usuario, que mide su
 * tiempo contra el SLA (odd/tasks/tiempo-tecnico.md).
 *
 * Solo aparece en los roles que atienden tickets (`ROLES_CON_HORARIO_PROPIO`): para el resto un
 * horario propio no mide nada. La vista entera ya está detrás de `SoloAdminCliente`, y el backend
 * exige `AdminClienteGuard` para guardar o borrar.
 *
 * El contenido del diálogo se monta al abrir y se desmonta al cerrar, así que cada apertura muestra el
 * horario vigente y no arrastra una edición que se dejó sin guardar.
 */
import { useState, type ReactElement } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  HorarioLaboralUsuarioPanel,
  ROLES_CON_HORARIO_PROPIO,
} from "@/features/horario-laboral/components/horario-laboral-usuario-panel";
import type { UsuarioTenant } from "../types";

export interface HorarioUsuarioControlProps {
  usuario: UsuarioTenant;
}

/**
 * @param props Usuario de la fila.
 * @returns El botón con su diálogo, o nada si el rol no lleva horario propio.
 */
export function HorarioUsuarioControl({ usuario }: HorarioUsuarioControlProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (!ROLES_CON_HORARIO_PROPIO.includes(usuario.rol)) return null;

  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" aria-label={`Horarios de ${nombreCompleto}`}>
          <Clock className="h-4 w-4" aria-hidden="true" />
          Horarios
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Horario de {nombreCompleto}</DialogTitle>
        </DialogHeader>
        {open && <HorarioLaboralUsuarioPanel usuarioId={usuario.id} nombreCompleto={nombreCompleto} />}
      </DialogContent>
    </Dialog>
  );
}
