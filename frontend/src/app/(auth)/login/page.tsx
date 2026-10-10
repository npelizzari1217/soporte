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
import { EnrolamientoTfa } from "@/features/auth/components/enrolamiento-tfa";
import { CodigosRecuperacion } from "@/features/auth/components/codigos-recuperacion";
import { Button } from "@/components/ui/button";
import { ClienteSelection } from "@/features/auth/components/ClienteSelection";
import { AvisoMotivo } from "@/features/auth/components/AvisoMotivo";
import { BotonesSso } from "@/features/auth/components/botones-sso";
import { useLogin } from "@/features/auth/hooks/use-login";
import { useProveedoresSso } from "@/features/auth/hooks/use-proveedores-sso";

export default function LoginPage() {
  const {
    login,
    volver,
    verificarCodigo,
    selectCliente,
    confirmarEnrolamiento,
    continuarTrasCodigos,
    datosEnrolamiento,
    codigosRecuperacion,
    paso,
    membresias,
    isPending,
  } = useLogin();
  const { proveedores } = useProveedoresSso();

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
            {paso === "codigos" && "Guardá tus códigos de recuperación"}
            {paso === "enrolamiento" && "Tu cuenta necesita activar la verificación en dos pasos"}
            {paso === "credenciales" && "Ingresá tus credenciales para continuar"}
          </p>
        </div>

        {paso === "seleccion" && membresias && (
          <ClienteSelection membresias={membresias} onSelect={selectCliente} isLoading={isPending} />
        )}
        {paso === "codigo" && (
          <DesafioTfaForm
            onSubmit={({ codigo }) => verificarCodigo(codigo)}
            isLoading={isPending}
          />
        )}
        {paso === "enrolamiento" && (
          <EnrolamientoTfa datos={datosEnrolamiento} onConfirmar={confirmarEnrolamiento} isLoading={isPending} />
        )}
        {paso === "codigos" && codigosRecuperacion && (
          <CodigosRecuperacion codigos={codigosRecuperacion} onContinuar={continuarTrasCodigos} isLoading={isPending} />
        )}
        {paso === "credenciales" && (
          <>
            <LoginForm
              onSubmit={({ email, password }) => login(email, password)}
              isLoading={isPending}
            />
            {/* Los botones solo existen tras la consulta (cliente): leer la URL acá no rompe la hidratación. */}
            <BotonesSso
              proveedores={proveedores}
              siguiente={proveedores.length > 0 ? new URLSearchParams(window.location.search).get("siguiente") : null}
            />
          </>
        )}
        {paso !== "credenciales" && paso !== "codigos" && (
          <Button type="button" variant="ghost" className="mt-4 w-full" onClick={volver} disabled={isPending}>
            Volver
          </Button>
        )}
      </div>
    </div>
  );
}
