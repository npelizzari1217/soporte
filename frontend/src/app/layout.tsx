import type { Metadata } from "next";
import "../styles/globals.css";
import { Providers } from "@/shared/providers/providers";

export const metadata: Metadata = {
  title: "Soporte",
  description: "Sistema de soporte de incidencias, compras y reparaciones edilicias",
};

/**
 * RootLayout — wraps all routes with global providers and dark-mode html class.
 *
 * - `<html lang="es" className="dark">` — dark theme, Spanish locale
 * - `<Providers>` — QueryClient + SessionContext (no initialUser at root; isLoading=true)
 * - The DashboardLayout provides its own <Providers initialUser={user}> to hydrate the session.
 *
 * Spec: [SPEC:frontend-design-system/dark-mode]
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
