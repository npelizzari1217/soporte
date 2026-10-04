"use client";

/**
 * ConfirmarPedidoView — CONTAINER de `/c/:slug/pedido/confirmar#token=<raw>`
 * (sdd/formulario-publico-qr, WU-19).
 *
 * El token viaja en el FRAGMENTO (no llega a logs ni a `Referer`). Se lee una vez y se saca de la
 * barra con `history.replaceState`. Cargar la página NO lo consume: solo el POST del botón, así
 * un escáner de links que abre la URL no quema el link de un solo uso (mismo criterio que el
 * reseteo de contraseña).
 *
 * 404 = mensaje uniforme sin reintento (el motivo no se distingue). 409 (sin ciclo activo), 429,
 * red y 5xx no son terminales: el botón sigue disponible, el token queda en memoria.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MENSAJE_LINK_NO_VALIDO, mensajeDeErrorConfirmacion, useConfirmarPedido } from "../hooks/use-pedido-publico";

export interface ConfirmarPedidoViewProps {
  slug: string;
}

/** Lee `#token=<raw>` y lo saca de la URL. `null` si falta o viene mal codificado. */
function leerYLimpiarToken(): string | null {
  const match = /^#token=(.+)$/.exec(window.location.hash);
  if (!match) return null;

  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function ConfirmarPedidoView({ slug }: ConfirmarPedidoViewProps) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenListo, setTokenListo] = useState(false);
  const confirmar = useConfirmarPedido(slug);

  useEffect(() => {
    setToken(leerYLimpiarToken());
    setTokenListo(true);
  }, []);

  if (!tokenListo) return null;

  const sinToken = token === null;
  const terminal = sinToken || confirmar.error?.statusCode === 404;

  if (confirmar.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pedido registrado</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-sm text-foreground">
            Registramos tu pedido con el número {confirmar.data.numero}. Te vamos a avisar por correo
            cada cambio de estado.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (terminal) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p role="alert" className="text-sm text-destructive">
            {sinToken ? MENSAJE_LINK_NO_VALIDO : mensajeDeErrorConfirmacion(confirmar.error)}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirmá tu pedido</CardTitle>
        <CardDescription>Tocá el botón para registrar tu pedido de soporte.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {confirmar.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mensajeDeErrorConfirmacion(confirmar.error)}
          </p>
        )}
        <Button
          type="button"
          isLoading={confirmar.isPending}
          className="w-full"
          onClick={() => token && confirmar.mutate(token)}
        >
          Confirmar pedido
        </Button>
      </CardContent>
    </Card>
  );
}
