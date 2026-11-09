"use client";

/**
 * AvisoSaturacionRoot — aviso en pantalla para ROOT cuando la base de datos se saturó de forma
 * repetida en las últimas 24 horas (odd/saturacion-conexiones, S3). Es el mismo episodio que se
 * envía por correo; acá queda visible aunque el correo no esté configurado.
 *
 * Solo pide el estado si la sesión es ROOT: el endpoint responde 403 a cualquier otro.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "@/shared/api/client";
import { useSession } from "@/shared/hooks/use-session";

/** Respuesta de `GET /operacion/saturacion`. */
interface EstadoSaturacion {
  eventosRecientes: number;
  ultimoAviso: { avisadoEn: string; eventos: number; desde: string; hasta: string } | null;
}

const VIGENCIA_MS = 24 * 60 * 60_000;

export function AvisoSaturacionRoot() {
  const { isGlobalAdmin } = useSession();
  const estado = useQuery({
    queryKey: ["operacion", "saturacion"],
    queryFn: () => apiFetch<EstadoSaturacion>("operacion/saturacion"),
    enabled: isGlobalAdmin,
    refetchInterval: 60_000,
  });

  const aviso = estado.data?.ultimoAviso;
  if (!isGlobalAdmin || !aviso || Date.now() - new Date(aviso.avisadoEn).getTime() > VIGENCIA_MS) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">La base de datos se saturó {aviso.eventos} veces en 10 minutos.</p>
        <p>
          Los usuarios vieron el aviso de sistema saturado. Revise la capacidad del servidor y los otros sistemas
          del VPS; el detalle está en el log del backend (SATURACION_CONEXIONES).
        </p>
      </div>
    </div>
  );
}
