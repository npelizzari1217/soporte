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

import { LoginForm } from "@/features/auth/components/LoginForm";
import { ClienteSelection } from "@/features/auth/components/ClienteSelection";
import { useLogin } from "@/features/auth/hooks/use-login";

export default function LoginPage() {
  const { login, selectCliente, membresias, isPending } = useLogin();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200/50 bg-card/80 p-8 backdrop-blur dark:border-white/5">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {membresias
              ? "Elegí con qué cliente querés ingresar"
              : "Ingresá tus credenciales para continuar"}
          </p>
        </div>

        {membresias ? (
          <ClienteSelection membresias={membresias} onSelect={selectCliente} isLoading={isPending} />
        ) : (
          <LoginForm
            onSubmit={({ email, password }) => login(email, password)}
            isLoading={isPending}
          />
        )}
      </div>
    </div>
  );
}
