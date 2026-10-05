"use client";

/**
 * PedidoQrLanding — landing autenticada `/pedido-qr` (sdd/formulario-publico-qr, WU-18, D3).
 *
 * Quien escanea el QR de un equipo con sesión viva llega acá desde `/login?siguiente=...`. Si el
 * QR es de su organización, se abre el diálogo de alta de ticket con el equipo preseleccionado;
 * si es de otra, se avisa sin revelar nada del equipo (404 uniforme del backend).
 * Sin `c` el link está incompleto: no se consulta al backend. Al cerrar el diálogo (cancelar o
 * después de crear) queda un fallback con el link al listado y la opción de reabrirlo.
 * El alta usa `POST /soporte` y la prioridad la elige el usuario (D6 no aplica a esta vía).
 */
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { useResolverQr } from "../hooks/use-resolver-qr";
import { TicketSoporteCreateDialog } from "./ticket-soporte-create-dialog";

export interface PedidoQrLandingProps {
  slug: string | null;
  tokenQr: string | null;
}

export const MENSAJE_QR_OTRA_ORGANIZACION =
  "Este QR es de otra organización. Ingresá con la cuenta de esa organización para pedir soporte.";

export const MENSAJE_QR_INCOMPLETO =
  "El link del QR está incompleto o no es válido. Escaneá el QR del equipo de nuevo.";

function mensajeDeError(statusCode: number | undefined): string {
  if (statusCode === 404) return MENSAJE_QR_OTRA_ORGANIZACION;
  if (statusCode === 403) return "No tenés permiso para crear tickets de soporte.";
  return "No pudimos leer el QR. Probá de nuevo en unos minutos.";
}

export function PedidoQrLanding({ slug, tokenQr }: PedidoQrLandingProps) {
  const resolucion = useResolverQr(slug, tokenQr);
  const [dialogoCerrado, setDialogoCerrado] = useState(false);

  if (!slug) return <ErrorState message={MENSAJE_QR_INCOMPLETO} />;

  if (resolucion.isLoading) return <DetailSkeleton />;

  if (resolucion.isError || !resolucion.data) {
    const status = resolucion.error?.statusCode;
    return (
      <ErrorState
        message={mensajeDeError(status)}
        onRetry={status === 404 || status === 403 ? undefined : () => void resolucion.refetch()}
      />
    );
  }

  const { equipo } = resolucion.data;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground">
        {equipo
          ? `Pedí soporte para ${equipo.nombre}.`
          : "No encontramos el equipo de este QR. Podés pedir soporte igual y elegir el equipo a mano."}
      </p>
      {dialogoCerrado ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">El formulario de soporte está cerrado. Tus tickets están en el listado.</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/tickets">Ir al listado de tickets</Link>
          </Button>
          <Button size="sm" onClick={() => setDialogoCerrado(false)}>
            Pedir soporte de nuevo
          </Button>
        </div>
      ) : (
        <div>
          <TicketSoporteCreateDialog abiertoInicial equipoInicial={equipo ?? undefined} onCerrar={() => setDialogoCerrado(true)} />
        </div>
      )}
    </div>
  );
}
