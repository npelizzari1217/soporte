"use client";

/**
 * LoginPage — wires LoginForm/ClienteSelection (presentational) with use-login (container).
 *
 * Routes: /login. Layout: RootLayout only (no dashboard shell). The middleware
 * redirects authenticated users away from /login to / (dashboard).
 *
 * Design: BFF POST /api/auth/login → sets httpOnly cookies → JwtPayload, OR
 * `{ needsClienteSelection: true, membresias }` for multi-membership users.
 *
 * Spec: [R23] BFF login route.
 */

import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { DesafioTfaForm } from "@/features/auth/components/desafio-tfa-form";
import { ClienteSelection } from "@/features/auth/components/ClienteSelection";
import { AvisoMotivo } from "@/features/auth/components/AvisoMotivo";
import { useLogin } from "@/features/auth/hooks/use-login";

export default function LoginPage() {
  const { login, verificarCodigo, selectCliente, paso, membresias, recordarDisponible, isPending } = useLogin();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,var(--background)_0%,var(--login-gradient-accent)_100%)] p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card/80 p-8 shadow-xl backdrop-blur">
        {/* useSearchParams() requiere un boundary de Suspense o falla el prerender del build. */}
        <Suspense fallback={null}>
          <AvisoMotivo />
        </Suspense>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {paso === "seleccion" && "Elegí con qué cliente querés ingresar"}
            {paso === "codigo" && "Confirmá que sos vos con un segundo paso"}
            {paso === "enrolamiento" && "Tu cuenta necesita activar la verificación en dos pasos"}
            {paso === "credenciales" && "Ingresá tus credenciales para continuar"}
          </p>
        </div>

        {paso === "seleccion" && membresias && (
          <ClienteSelection membresias={membresias} onSelect={selectCliente} isLoading={isPending} />
        )}
        {paso === "codigo" && (
          <DesafioTfaForm
            onSubmit={({ codigo, recordar }) => verificarCodigo(codigo, recordar)}
            isLoading={isPending}
            recordarDisponible={recordarDisponible}
          />
        )}
        {paso === "enrolamiento" && (
          // Placeholder: la pantalla de enrolamiento obligatorio llega en WU-11b.
          <p role="status" className="text-center text-sm text-muted-foreground">
            La activación de la verificación en dos pasos todavía no está disponible desde esta pantalla.
          </p>
        )}
        {paso === "credenciales" && (
          <LoginForm
            onSubmit={({ email, password }) => login(email, password)}
            isLoading={isPending}
          />
        )}
      </div>
    </div>
  );
}
