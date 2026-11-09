"use client";

/**
 * OperacionAdminView — estado operativo del servicio para ROOT (odd/saturacion-conexiones, S3):
 * saturaciones recientes de la base, el último aviso y un correo de prueba para confirmar que las
 * alertas llegan antes de que pase algo de verdad.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/client";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";

interface EstadoSaturacion {
  eventosRecientes: number;
  ultimoAviso: { avisadoEn: string; eventos: number } | null;
}

type ResultadoCorreoPrueba = { ok: true; destinatarios: string[] } | { ok: false; motivo: string };

export function OperacionAdminView() {
  const estado = useQuery({
    queryKey: ["operacion", "saturacion"],
    queryFn: () => apiFetch<EstadoSaturacion>("operacion/saturacion"),
    refetchInterval: 60_000,
  });
  const prueba = useMutation({
    mutationFn: () => apiFetch<ResultadoCorreoPrueba>("operacion/saturacion/correo-prueba", { method: "POST" }),
    onError: notifyError,
  });

  const aviso = estado.data?.ultimoAviso;
  const resultado = prueba.data;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Operación</h1>
        {estado.data && (
          <>
            <p className="text-sm text-foreground">
              Saturaciones en los últimos 10 minutos: {estado.data.eventosRecientes}
            </p>
            <p className="text-sm text-muted-foreground">
              {aviso
                ? `Último aviso: ${aviso.eventos} saturaciones, avisado el ${formatearInstante(aviso.avisadoEn)}.`
                : "No hubo avisos de saturación desde el último reinicio del servicio."}
            </p>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium text-foreground">Correo de alertas</h2>
        <p className="text-sm text-muted-foreground">
          Envía un correo de prueba a los usuarios ROOT que reciben las alertas, para confirmar que la cuenta de
          correo del sistema funciona.
        </p>
        <Button onClick={() => prueba.mutate()} disabled={prueba.isPending}>
          {prueba.isPending ? "Enviando…" : "Enviar correo de prueba"}
        </Button>
        {resultado?.ok === true && (
          <p role="status" className="text-sm text-foreground">
            Se envió el correo de prueba a {resultado.destinatarios.join(", ")}. Revise la bandeja de entrada y la
            carpeta de correo no deseado.
          </p>
        )}
        {resultado?.ok === false && (
          <p role="alert" className="text-sm text-destructive">
            No se envió el correo de prueba. {resultado.motivo}
          </p>
        )}
      </section>
    </div>
  );
}
