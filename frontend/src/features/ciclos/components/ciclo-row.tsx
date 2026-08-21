"use client";

/**
 * CicloRow — PRESENTATIONAL. Activar SIEMPRE detrás de `ConfirmDialog`
 * (activa este ciclo, desactiva TODOS los demás del tenant en la misma
 * transacción — R22 backend, efecto no trivial de deshacer). Desactivar es
 * directo (sin confirm): no tiene cascada, solo deja al tenant sin ciclo
 * activo (0 activos es válido) y se revierte volviendo a activar.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { useActivarCiclo, useDesactivarCiclo } from "../hooks/use-ciclos-mutations";
import type { CicloTenant } from "@/features/dashboard/types";

export interface CicloRowProps {
  ciclo: CicloTenant;
}

export function CicloRow({ ciclo }: CicloRowProps) {
  const activar = useActivarCiclo();
  const desactivar = useDesactivarCiclo();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className="flex-1 text-sm font-medium text-foreground">{ciclo.nombre}</span>
      {/* CicloTenant.fechaInicio / fechaFin son @db.Date — fecha de calendario. */}
      <span className="text-xs text-muted-foreground">
        {formatearFechaCalendario(ciclo.fechaInicio)} → {formatearFechaCalendario(ciclo.fechaFin)}
      </span>
      {ciclo.activo ? (
        <>
          <Badge variant="success">Activo</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={desactivar.isPending}
            onClick={() => desactivar.mutate(ciclo.id)}
          >
            Desactivar
          </Button>
        </>
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              Activar
            </Button>
          }
          title="Activar ciclo"
          description={`¿Confirmás activar "${ciclo.nombre}"? Se desactivará el ciclo actualmente activo del tenant.`}
          confirmLabel="Confirmar"
          isConfirming={activar.isPending}
          onConfirm={() => activar.mutate(ciclo.id)}
        />
      )}
    </div>
  );
}
