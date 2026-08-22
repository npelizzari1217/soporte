"use client";

/**
 * EncuestaView — CONTAINER montado por `(publico)/encuesta/:token` (WU8,
 * tarea 8.2). Único punto de la app que se renderiza sin sesión.
 *
 * Estados:
 * - Cargando: `GET` en vuelo (skeleton, ADR-8 — nunca spinner).
 * - Link inválido: `GET` falla. El backend responde el MISMO 404 genérico
 *   para token inexistente, vencido, usado o revocado — no hay forma (ni se
 *   busca) de distinguir el motivo acá, mismo criterio anti-enumeración.
 * - Formulario: `GET` exitoso, respuesta aún no enviada.
 * - Ya respondida: `POST` exitoso EN ESTA VISITA. No existe un segundo `GET`
 *   que confirme "ya respondida" en una vista posterior — sería indistinguible
 *   del 404 de "inválido" (ver arriba), así que no se intenta.
 *
 * Ref spec: sdd/csat/spec. Ref design: ADR-C7. Tarea: 8.2.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/error-state";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { useEncuestaPublica, useResponderEncuesta } from "../hooks/use-encuesta";
import { EncuestaForm } from "./encuesta-form";
import type { EncuestaFormValues } from "../schemas";

export interface EncuestaViewProps {
  token: string;
}

const MENSAJE_LINK_INVALIDO = "Este link de encuesta no es válido o ya fue utilizado.";

export function EncuestaView({ token }: EncuestaViewProps) {
  const encuestaQuery = useEncuestaPublica(token);
  const responderMutation = useResponderEncuesta(token);

  function handleSubmit(values: EncuestaFormValues) {
    responderMutation.mutate({
      puntaje: values.puntaje,
      comentario: values.comentario ? values.comentario : undefined,
    });
  }

  if (encuestaQuery.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <DetailSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (encuestaQuery.isError || !encuestaQuery.data) {
    return <ErrorState message={MENSAJE_LINK_INVALIDO} />;
  }

  if (responderMutation.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¡Gracias por tu respuesta!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ya registramos tu calificación para el ticket {encuestaQuery.data.numero}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Encuesta de satisfacción</CardTitle>
        <CardDescription>Ticket {encuestaQuery.data.numero}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <EncuestaForm onSubmit={handleSubmit} isLoading={responderMutation.isPending} />
        {responderMutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            No pudimos registrar tu respuesta. Probá de nuevo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
