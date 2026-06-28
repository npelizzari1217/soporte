import type { Metadata } from "next";
import "../styles/globals.css";
import { Providers } from "@/shared/providers/providers";
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: "Soporte",
  description: "Sistema de soporte de incidencias, compras y reparaciones edilicias",
};

/**
 * Script FOUC (Flash Of Unstyled Content) — inline bloqueante.
 *
 * Corre sincrónicamente antes del primer paint del body, lo que garantiza
 * que la clase .dark esté aplicada antes de que React hidrate. Sin este script,
 * el SSR emitiría HTML sin clase y el cliente aplicaría dark con un flash visible.
 *
 * Lógica (D2 del design — Constitución §3: dark por defecto):
 *   1. Lee preferencia explícita del usuario en localStorage ('light' | 'dark')
 *   2. Si no hay preferencia: sigue prefers-color-scheme del OS
 *   3. Fallback final: 'dark' (cinematográfico por defecto)
 *
 * El try/catch protege contra contextos sin localStorage (incógnito, iframe sandboxed).
 * dataset.theme='light'|'dark' queda disponible para debug y para el toggle futuro.
 *
 * Ref: design.md FOUC Script Contract, tasks.md T1.5
 */
const FOUC_SCRIPT = `(function(){try{var p=localStorage.getItem('theme');var s=matchMedia('(prefers-color-scheme: light)').matches;var t=p||(!s?'dark':'light');document.documentElement.classList.toggle('dark',t!=='light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;

/**
 * RootLayout — wraps all routes with global providers and theme initialization.
 *
 * - `<html lang="es" suppressHydrationWarning>` — suppressHydrationWarning evita
 *   el warning de React cuando el script FOUC muta classList antes de la hidratación
 * - Script FOUC inline en <head>: aplica .dark antes del primer paint (ver FOUC_SCRIPT)
 * - `<Providers>` — QueryClient + SessionContext (sin initialUser en el root)
 * - El DashboardLayout provee <Providers initialUser={user}> para hidratar la sesión
 *
 * Spec delta: [SPEC:frontend-design-system/dual-mode FOUC prevention]
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/*
         * Script bloqueante: se ejecuta antes del <body>, evitando FOUC de tema.
         * dangerouslySetInnerHTML es intencional — el contenido es código estático
         * sin interpolación de datos externos, por lo que no hay riesgo XSS.
         */}
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground">
        <Providers>{children}</Providers>
        {/*
         * ADR-4: único Toaster global. Post-Providers para que sea un client island
         * independiente. RootLayout permanece Server Component — sonner se autoinyecta
         * como "use client" internamente.
         */}
        <Toaster richColors position="top-right" theme="system" />
      </body>
    </html>
  );
}
