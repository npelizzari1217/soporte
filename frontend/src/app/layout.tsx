import type { Metadata } from "next";
import "../styles/globals.css";
import { Providers } from "@/shared/providers/providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Soporte",
  description: "Plataforma multi-tenant de tickets: soporte, compras y reparaciones edilicias",
};

/**
 * Script FOUC (Flash Of Unstyled Content) — inline bloqueante.
 *
 * Corre sincrónicamente antes del primer paint, aplicando la clase .dark en
 * <html> antes de que React hidrate. Sin este script el SSR emitiría HTML sin
 * clase y el cliente la aplicaría con un flash visible.
 *
 * Lógica (misma fórmula que resolveTheme):
 *   1. Lee preferencia explícita del usuario en localStorage ('light' | 'dark')
 *   2. Si no hay preferencia guardada: sigue prefers-color-scheme del OS SOLO
 *      como fallback inicial (nunca como fuente de verdad persistente)
 *   3. Fallback final: 'dark'
 *
 * El try/catch protege contextos sin localStorage (incógnito, iframe sandboxed).
 */
const FOUC_SCRIPT = `(function(){try{var p=localStorage.getItem('theme');var s=matchMedia('(prefers-color-scheme: light)').matches;var t=p||(!s?'dark':'light');document.documentElement.classList.toggle('dark',t!=='light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/*
         * Script bloqueante: dangerouslySetInnerHTML es intencional acá — el
         * contenido es código estático sin interpolación de datos externos,
         * por lo que no hay riesgo XSS.
         */}
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" theme="system" />
      </body>
    </html>
  );
}
