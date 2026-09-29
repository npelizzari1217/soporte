"use client";

/**
 * OlvidePasswordPage — página pública de solicitud de reset
 * (`/olvide-password`). Wires SolicitarResetForm (presentational) con
 * use-solicitar-reset (container).
 *
 * Anti-enumeración (Req 1): tras un envío que terminó (éxito o rechazo NO
 * transitorio), SIEMPRE se muestra el mismo mensaje genérico
 * (`use-solicitar-reset.mensaje`), exista o no el email, y el formulario
 * desaparece — no invita a un reintento que revele nada.
 *
 * [S3] 429/red/5xx SÍ son distintos: son fallas de infraestructura, no un
 * resultado de la solicitud. El formulario sigue visible con el mensaje
 * arriba para reintentar, mismo criterio que `/restablecer-password`
 * (`errorTransitorio`).
 *
 * Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
 * flujo completo de self-service", escenario "La solicitud muestra el mismo
 * mensaje siempre". Design ADR-8.
 */
import Link from "next/link";
import { SolicitarResetForm } from "@/features/auth/components/SolicitarResetForm";
import { useSolicitarReset } from "@/features/auth/hooks/use-solicitar-reset";
import type { SolicitarResetFormValues } from "@/features/auth/schemas";

export default function OlvidePasswordPage() {
  const { solicitar, isPending, mensaje, esTransitorio } = useSolicitarReset();

  function submit(values: SolicitarResetFormValues) {
    solicitar(values.email);
  }

  // [S3] El formulario sigue visible mientras no se envió nada, o si lo
  // último que pasó fue una falla transitoria (429/red/5xx).
  const mostrarForm = mensaje === null || esTransitorio;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,var(--background)_0%,var(--login-gradient-accent)_100%)] p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card/80 p-8 shadow-xl backdrop-blur">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            ¿Olvidaste tu contraseña?
          </h1>
          {mostrarForm && (
            <p className="mt-1 text-sm text-muted-foreground">
              Ingresá tu email y te enviamos un link para restablecerla
            </p>
          )}
        </div>

        {mostrarForm ? (
          <div className="flex flex-col gap-4">
            {esTransitorio && mensaje !== null && (
              <p role="alert" className="text-center text-sm text-destructive">
                {mensaje}
              </p>
            )}
            <SolicitarResetForm onSubmit={submit} isLoading={isPending} />
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-center">
            <p role="status" className="text-sm text-foreground">
              {mensaje}
            </p>
            <Link
              href="/login"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Volver a iniciar sesión
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
