"use client";

/**
 * PedidoPublicoView — CONTAINER de `/c/:slug/pedido` (sdd/formulario-publico-qr, WU-16).
 *
 * Estados:
 * - Cargando: contexto en vuelo (skeleton).
 * - No disponible: 404 uniforme (slug inexistente, formulario apagado, cliente inactivo). No se
 *   distingue el motivo. Otro error (red, 5xx, 429) ofrece reintentar.
 * - `SESION`: el cliente no tiene correo propio listo; el pedido se hace con sesión. Redirige a
 *   `/login?siguiente=/pedido-qr?c=<slug>&e=<token>` (ADR-9, D3). El destino post-login es WU-18.
 * - `EXTERNO`: formulario. El 202 es constante: el ticket recién existe al confirmar por mail.
 *
 * Ref spec: sdd/formulario-publico-qr, pedido-publico, D3. Tarea: 16.3.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/error-state";
import { DetailSkeleton } from "@/components/shared/skeletons";
import {
  MENSAJE_FORMULARIO_NO_DISPONIBLE,
  MENSAJE_PEDIDO_ENVIADO,
  mensajeDeErrorPedido,
  useContextoPedido,
  useEnviarPedido,
} from "../hooks/use-pedido-publico";
import { PedidoPublicoForm } from "./pedido-publico-form";

export interface PedidoPublicoViewProps {
  slug: string;
  tokenQr: string | null;
}

/** Destino del login para el modo `SESION`; el query interno viaja codificado. */
export function destinoLoginSesion(slug: string, tokenQr: string | null): string {
  const interno = `/pedido-qr?c=${encodeURIComponent(slug)}${tokenQr ? `&e=${encodeURIComponent(tokenQr)}` : ""}`;
  return `/login?siguiente=${encodeURIComponent(interno)}`;
}

export function PedidoPublicoView({ slug, tokenQr }: PedidoPublicoViewProps) {
  const router = useRouter();
  const contexto = useContextoPedido(slug, tokenQr);
  const enviar = useEnviarPedido(slug, tokenQr);
  const modo = contexto.data?.modo;

  useEffect(() => {
    if (modo === "SESION") router.replace(destinoLoginSesion(slug, tokenQr));
  }, [modo, router, slug, tokenQr]);

  if (contexto.isLoading || modo === "SESION") {
    return (
      <Card>
        <CardContent className="pt-6">
          <DetailSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (contexto.isError || !contexto.data) {
    const noDisponible = contexto.error?.statusCode === 404;
    return (
      <ErrorState
        message={noDisponible ? MENSAJE_FORMULARIO_NO_DISPONIBLE : mensajeDeErrorPedido(contexto.error)}
        onRetry={noDisponible ? undefined : () => void contexto.refetch()}
      />
    );
  }

  const { cliente, equipo } = contexto.data;

  if (enviar.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisá tu correo</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-sm text-foreground">
            {MENSAJE_PEDIDO_ENVIADO}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pedido de soporte</CardTitle>
        <CardDescription>
          {cliente.nombre}
          {equipo ? ` — ${equipo.nombre}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {enviar.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mensajeDeErrorPedido(enviar.error)}
          </p>
        )}
        <PedidoPublicoForm onSubmit={(values) => enviar.mutate(values)} isLoading={enviar.isPending} />
      </CardContent>
    </Card>
  );
}
