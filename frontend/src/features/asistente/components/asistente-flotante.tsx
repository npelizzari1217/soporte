"use client";

/**
 * AsistenteFlotante — botón flotante con el chat del asistente de la Ayuda, en todas las pantallas
 * (odd/asistente-ia-ayuda, S5 y S6). Lo ve quien puede leer la Ayuda (`KB:LECTURA`), que es el mismo
 * permiso que exige el backend.
 *
 * La conversación vive solo en este componente: no se guarda en el servidor ni sobrevive a una
 * recarga. Cada respuesta cita los artículos usados con un enlace a cada uno; si vino de la Ayuda
 * sin IA, lo dice.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/shared/api/types";
import { useSession } from "@/shared/hooks/use-session";
import { useConsultarAsistente } from "../hooks/use-consultar-asistente";
import { LARGO_MAXIMO_CONSULTA, type RespuestaAsistente } from "../types";

type Mensaje =
  | { tipo: "consulta"; texto: string }
  | { tipo: "respuesta"; respuesta: RespuestaAsistente }
  | { tipo: "error"; texto: string };

/** Texto del error para mostrar en la conversación. El 429 del throttler llega en inglés. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 429) {
      return "Alcanzó el límite de consultas. Espere un minuto e intente de nuevo.";
    }
    if (err.statusCode === 400) return err.messages.join(" ");
  }
  return "No se pudo obtener una respuesta. Intente de nuevo en unos minutos.";
}

/** @returns el botón flotante y, abierto, el panel del asistente; nada sin `KB:LECTURA` */
export function AsistenteFlotante() {
  const { can } = useSession();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const consultar = useConsultarAsistente();
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView?.({ block: "end" });
  }, [mensajes, consultar.isPending]);

  if (!can("KB:LECTURA")) return null;

  const texto = consulta.trim();
  const puedeEnviar = texto.length > 0 && texto.length <= LARGO_MAXIMO_CONSULTA && !consultar.isPending;

  function enviar() {
    if (!puedeEnviar) return;
    setMensajes((previos) => [...previos, { tipo: "consulta", texto }]);
    setConsulta("");
    consultar.mutate(texto, {
      onSuccess: (respuesta) => setMensajes((previos) => [...previos, { tipo: "respuesta", respuesta }]),
      onError: (err) => setMensajes((previos) => [...previos, { tipo: "error", texto: mensajeDeError(err) }]),
    });
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
      {abierto && (
        <section
          aria-labelledby="asistente-titulo"
          className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-border bg-background shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 id="asistente-titulo" className="text-sm font-semibold text-foreground">
              Asistente de la Ayuda
            </h2>
            <button
              type="button"
              aria-label="Cerrar el asistente"
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setAbierto(false)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {mensajes.length === 0 && (
              <p className="text-muted-foreground">
                Escriba su consulta sobre el uso del sistema. Las respuestas salen de los artículos de la Ayuda.
              </p>
            )}
            {mensajes.map((m, i) => (
              <MensajeConversacion key={i} mensaje={m} />
            ))}
            {consultar.isPending && <p className="text-muted-foreground">Buscando en la Ayuda…</p>}
            <div ref={finRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="asistente-consulta" className="sr-only">
                Su consulta
              </label>
              <Textarea
                id="asistente-consulta"
                rows={2}
                value={consulta}
                placeholder="Por ejemplo: ¿cómo creo un ticket?"
                onChange={(e) => setConsulta(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envía; Mayús+Enter agrega un salto de línea.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
              />
              <span
                className={`text-xs ${texto.length > LARGO_MAXIMO_CONSULTA ? "text-destructive" : "text-muted-foreground"}`}
              >
                {texto.length}/{LARGO_MAXIMO_CONSULTA}
              </span>
            </div>
            <Button type="submit" size="sm" aria-label="Enviar consulta" disabled={!puedeEnviar}>
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </section>
      )}

      <Button
        type="button"
        className="h-12 w-12 rounded-full shadow-lg"
        aria-label={abierto ? "Cerrar el asistente" : "Abrir el asistente de la Ayuda"}
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function MensajeConversacion({ mensaje }: { mensaje: Mensaje }) {
  if (mensaje.tipo === "consulta") {
    return (
      <p className="ml-8 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-foreground">{mensaje.texto}</p>
    );
  }
  if (mensaje.tipo === "error") {
    return (
      <p role="alert" className="mr-8 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
        {mensaje.texto}
      </p>
    );
  }
  const { respuesta, modo, fuentes } = mensaje.respuesta;
  return (
    <div className="mr-8 space-y-2 rounded-lg bg-muted px-3 py-2 text-foreground">
      {modo === "respaldo" && <p className="text-xs text-muted-foreground">Texto tomado de la Ayuda:</p>}
      <p className="whitespace-pre-wrap">{respuesta}</p>
      {modo === "sin_resultados" && (
        <Link href="/tickets" className="text-xs font-medium text-primary underline">
          Ir a Tickets para crear uno
        </Link>
      )}
      {fuentes.length > 0 && (
        <div className="text-xs">
          <span className="text-muted-foreground">Artículos: </span>
          {fuentes.map((f, i) => (
            <span key={f.articuloId}>
              {i > 0 && ", "}
              <Link href={`/kb/${f.articuloId}`} className="text-primary underline">
                {f.titulo}
              </Link>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
