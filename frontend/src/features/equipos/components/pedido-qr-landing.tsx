"use client";

/**
 * PedidoQrLanding — landing autenticada `/pedido-qr` (sdd/formulario-publico-qr, WU-18, D3).
 *
 * Quien escanea el QR de un equipo con sesión viva llega acá desde `/login?siguiente=...`. Si el
 * QR es de su organización, se abre el diálogo de alta de ticket con el equipo preseleccionado;
 * si es de otra, se avisa sin revelar nada del equipo (404 uniforme del backend).
 * El alta usa `POST /soporte` y la prioridad la elige el usuario (D6 no aplica a esta vía).
 */
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

function mensajeDeError(statusCode: number | undefined): string {
  if (statusCode === 404) return MENSAJE_QR_OTRA_ORGANIZACION;
  if (statusCode === 403) return "No tenés permiso para crear tickets de soporte.";
  return "No pudimos leer el QR. Probá de nuevo en unos minutos.";
}

export function PedidoQrLanding({ slug, tokenQr }: PedidoQrLandingProps) {
  const resolucion = useResolverQr(slug, tokenQr);

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
      <div>
        <TicketSoporteCreateDialog abiertoInicial equipoInicial={equipo ?? undefined} />
      </div>
    </div>
  );
}
