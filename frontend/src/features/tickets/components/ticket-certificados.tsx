"use client";

/**
 * TicketCertificados — certificados de avance de obra de un ticket EXTERNA
 * (odd/edilicia-obra-externa, T4, S5, S6, S8). Lo monta el detalle del ticket solo en EXTERNA.
 *
 * - Lista los certificados, vigentes y anulados, con quién los emitió y cuándo, su porcentaje y las
 *   tareas con el peso que copiaron al emitir.
 * - Con `CERTIFICAR` sobre el tipo, ofrece emitir uno nuevo con las tareas completadas que todavía
 *   no están en un certificado vigente, y anular uno vigente con motivo.
 *
 * Los controles espejan las reglas del backend (suma de 100, ticket cerrado o cancelado), que sigue
 * siendo la autoridad: su rechazo llega como toast con el mensaje del servidor.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import {
  useAnularCertificado,
  useCertificados,
  useDescargarPdfCertificado,
  useEmitirCertificado,
} from "../hooks/use-certificados";
import { useTareasTicket } from "../hooks/use-tareas-ticket";
import { anularCertificadoSchema, PESO_TAREAS_MAX, type AnularCertificadoFormValues } from "../schemas";
import type { CertificadoAvance } from "../types";

export interface TicketCertificadosProps {
  ticketId: string;
  /** `CERTIFICAR` sobre el tipo del ticket (S6); sin él solo se lista. */
  puedeCertificar: boolean;
  /** Código del estado del ticket; en CERRADO o CANCELADO no se emite ni se anula (L26). */
  estadoCodigo: string | undefined;
  /** `IMPRESION` sobre el tipo: descargar el PDF de un certificado (S7), como la ficha del ticket. */
  puedeImprimir: boolean;
}

const ESTADOS_SIN_CERTIFICACION = new Set(["CERRADO", "CANCELADO"]);

function nombre(nombrePila: string | null, apellido: string | null): string {
  return nombrePila || apellido ? `${nombrePila ?? ""} ${apellido ?? ""}`.trim() : "Usuario";
}

/**
 * @param props Ver `TicketCertificadosProps`.
 * @returns La sección de certificados.
 */
export function TicketCertificados({
  ticketId,
  puedeCertificar,
  estadoCodigo,
  puedeImprimir,
}: TicketCertificadosProps) {
  const certificadosQuery = useCertificados(ticketId);
  const tareasQuery = useTareasTicket(ticketId);
  const emitir = useEmitirCertificado(ticketId);
  const [elegidas, setElegidas] = useState<string[]>([]);

  if (certificadosQuery.isLoading || tareasQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando certificados…</p>;
  }
  if (certificadosQuery.isError || !certificadosQuery.data || tareasQuery.isError || !tareasQuery.data) {
    return <p className="text-sm text-destructive">No se pudieron cargar los certificados.</p>;
  }

  const certificados = certificadosQuery.data;
  const tareas = tareasQuery.data.items;
  const certificadas = new Set(
    certificados.filter((c) => c.vigente).flatMap((c) => c.tareas.map((t) => t.tareaId)),
  );
  const candidatas = tareas.filter((t) => t.completada && !certificadas.has(t.id));
  const sumaPesos = tareas.reduce((suma, t) => suma + t.peso, 0);
  const cerrado = estadoCodigo !== undefined && ESTADOS_SIN_CERTIFICACION.has(estadoCodigo);
  // Lo que se ve, se suma y se envía sale de las candidatas VIGENTES: una tarea elegida que dejó de
  // serlo (alguien la descompletó y la lista se refrescó) ya no está en pantalla y no puede viajar.
  const seleccion = candidatas.filter((t) => elegidas.includes(t.id));
  const porcentajeElegido = seleccion.reduce((suma, t) => suma + t.peso, 0);

  // El primer motivo que aplica, en el orden en que el backend los evalúa.
  const motivoSinEmision = cerrado
    ? "Un ticket cerrado o cancelado no admite emitir certificados."
    : sumaPesos !== PESO_TAREAS_MAX
      ? `Los pesos de las tareas suman ${sumaPesos} %: tienen que sumar 100 % antes de certificar.`
      : candidatas.length === 0
        ? "No hay tareas completadas sin certificar."
        : null;

  function alternar(tareaId: string, marcada: boolean) {
    setElegidas((actual) => (marcada ? [...actual, tareaId] : actual.filter((id) => id !== tareaId)));
  }

  return (
    <div className="flex flex-col gap-4">
      {certificados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin certificados todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {certificados.map((certificado) => (
            <FilaCertificado
              key={certificado.id}
              ticketId={ticketId}
              certificado={certificado}
              puedeAnular={puedeCertificar && !cerrado}
              puedeImprimir={puedeImprimir}
            />
          ))}
        </ul>
      )}

      {puedeCertificar && (
        <section aria-labelledby={`emitir-${ticketId}`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <h3 id={`emitir-${ticketId}`} className="text-sm font-medium text-foreground">
            Emitir certificado
          </h3>
          {motivoSinEmision !== null ? (
            <p role="note" className="text-xs text-muted-foreground">
              {motivoSinEmision}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {candidatas.map((tarea) => (
                  <li key={tarea.id}>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={elegidas.includes(tarea.id)}
                        onCheckedChange={(checked) => alternar(tarea.id, checked === true)}
                      />
                      {tarea.descripcion} · {tarea.peso} %
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Certifica {porcentajeElegido} %</span>
                <Button
                  type="button"
                  size="sm"
                  disabled={seleccion.length === 0}
                  isLoading={emitir.isPending}
                  onClick={() =>
                    emitir.mutate(
                      seleccion.map((t) => t.id),
                      { onSuccess: () => setElegidas([]) },
                    )
                  }
                >
                  Emitir certificado
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

interface FilaCertificadoProps {
  ticketId: string;
  certificado: CertificadoAvance;
  puedeAnular: boolean;
  puedeImprimir: boolean;
}

function FilaCertificado({ ticketId, certificado, puedeAnular, puedeImprimir }: FilaCertificadoProps) {
  const descargar = useDescargarPdfCertificado(ticketId);
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border p-2" aria-label={`Certificado N.º ${certificado.numero}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Certificado N.º {certificado.numero} · {certificado.porcentaje} %
          </span>
          <Badge variant={certificado.vigente ? "success-light" : "outline"}>
            {certificado.vigente ? "Vigente" : "Anulado"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {puedeImprimir && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              // Distinto del «Descargar PDF» de la ficha del ticket, en la misma pantalla.
              aria-label={`Descargar PDF del certificado N.º ${certificado.numero}`}
              isLoading={descargar.isPending}
              onClick={() => descargar.mutate(certificado)}
            >
              Descargar PDF
            </Button>
          )}
          {certificado.vigente && puedeAnular && (
            <AnularCertificadoDialog ticketId={ticketId} certificado={certificado} />
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        Emitido el {formatearInstante(certificado.emitidoEn)} por{" "}
        {nombre(certificado.emitidoPorNombre, certificado.emitidoPorApellido)}
      </span>
      <ul className="text-xs text-muted-foreground">
        {certificado.tareas.map((tarea) => (
          <li key={tarea.tareaId}>
            {tarea.descripcion ?? "Tarea eliminada"} · {tarea.peso} %
          </li>
        ))}
      </ul>
      {!certificado.vigente && certificado.anuladoEn && (
        <span className="text-xs text-muted-foreground">
          Anulado el {formatearInstante(certificado.anuladoEn)} por{" "}
          {nombre(certificado.anuladoPorNombre, certificado.anuladoPorApellido)}: {certificado.motivoAnulacion}
        </span>
      )}
    </li>
  );
}

function AnularCertificadoDialog({ ticketId, certificado }: { ticketId: string; certificado: CertificadoAvance }) {
  const [open, setOpen] = useState(false);
  const anular = useAnularCertificado(ticketId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AnularCertificadoFormValues>({
    resolver: zodResolver(anularCertificadoSchema),
    defaultValues: { motivo: "" },
  });
  const id = `motivo-anulacion-${certificado.id}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // El diálogo vive en la fila y no se desmonta: cada apertura arranca sin motivo.
        if (next) reset({ motivo: "" });
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Anular
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular el certificado N.º {certificado.numero}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) =>
            anular.mutate(
              { certificadoId: certificado.id, motivo: values.motivo },
              { onSuccess: () => setOpen(false) },
            ),
          )}
          className="flex flex-col gap-3"
          noValidate
        >
          <p className="text-sm text-muted-foreground">
            Sus tareas quedan libres para otro certificado. El certificado anulado queda como registro.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm font-medium text-foreground">
              Motivo
            </label>
            <Textarea id={id} {...register("motivo")} />
            {errors.motivo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          <Button type="submit" variant="destructive" isLoading={anular.isPending} className="self-start">
            Anular certificado
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
