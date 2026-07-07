"use client";

/**
 * LoginPage — wires LoginForm (presentational) with use-login (container).
 *
 * Routes: /login
 * Layout: inherits RootLayout only (not DashboardLayout — no AppNav here).
 * The middleware redirects authenticated users away from /login to / (dashboard).
 *
 * Design: §2.2 Login flow. BFF POST /api/auth/login → sets httpOnly cookies → JwtPayload.
 * Spec: [SPEC:frontend-auth/login-exitoso], [SPEC:frontend-auth/creds-invalidas],
 *        [SPEC:frontend-auth/tenant-inactivo], [SPEC:frontend-route-protection/sin-sesion]
 */

import { LoginForm } from "@/features/auth/components/LoginForm";
import { useLogin } from "@/features/auth/hooks/use-login";

export default function LoginPage() {
  const { login, isPending, error } = useLogin();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Card container — rounded-lg (8px) + glassmorphism per constitution §3 */}
      <div className="w-full max-w-sm rounded-lg border border-slate-200/50 bg-card/80 p-8 backdrop-blur dark:border-white/5">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Iniciar sesión
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresá tus credenciales para continuar
          </p>
        </div>

        <LoginForm
          onSubmit={login}
          error={error ?? undefined}
          isLoading={isPending}
        />
      </div>
    </div>
  );
}
