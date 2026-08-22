/**
 * PublicoLayout — layout de las rutas públicas, sin sesión (WU8, tarea 8.2).
 *
 * SIN `AppShell` (sidebar/header del dashboard): el destinatario del link de
 * la encuesta no tiene sesión ni tenant resuelto en este momento. Mismo
 * fondo centrado que `/login` — `RootLayout` ya aporta `<html>`/`<body>`/
 * `<Providers>`, así que este layout solo agrega el wrapper visual.
 *
 * El route group `(publico)` es transparente a la URL (Next no lo expone en
 * el path) — la protección real de acceso vive en `middleware.ts` (ADR-C7),
 * no en este layout.
 *
 * Ref design: ADR-C7. Tarea: 8.2.
 */
export default function PublicoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,var(--background)_0%,var(--login-gradient-accent)_100%)] p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
