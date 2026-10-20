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
import Image from "next/image";
import { LifeBuoy } from "lucide-react";
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
    <div className="flex min-h-screen bg-background p-4 lg:p-6">
      <div className="flex w-full flex-col justify-center px-2 py-8 sm:px-8 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* useSearchParams() requiere un boundary de Suspense o falla el prerender del build. */}
          <Suspense fallback={null}>
            <AvisoMotivo />
          </Suspense>

          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">¡Bienvenido!</h1>
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

      <PanelMarca />
    </div>
  );
}

/**
 * Panel de la derecha (solo en pantallas anchas): foto de fondo con un degradé
 * oscuro en la parte de abajo, que es lo que mantiene legibles la marca y la
 * frase sobre cualquier zona de la foto, en los dos temas. La foto es
 * decorativa: el panel entero va `aria-hidden`.
 */
function PanelMarca() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden rounded-3xl bg-slate-900 lg:flex lg:w-1/2 lg:flex-col lg:justify-end lg:p-12"
    >
      <Image
        src="/login/panel-soporte.png"
        alt=""
        fill
        priority
        sizes="50vw"
        className="object-cover object-[70%_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
      <div className="relative">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <LifeBuoy className="size-6 text-white" />
          </span>
          <span className="text-2xl font-semibold text-white">Soporte</span>
        </div>
        <p className="max-w-md text-white/90">
          Tickets de soporte, compras y reparaciones edilicias en un solo lugar.
        </p>
      </div>
    </aside>
  );
}
