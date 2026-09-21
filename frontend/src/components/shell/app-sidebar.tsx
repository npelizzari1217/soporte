"use client";

/**
 * AppSidebar — role-driven navigation shell (ADR-1, ADR-4). Filters
 * `NAV_ITEMS` (shared/nav/nav-config.ts) through the current user's
 * permisos/is_global_admin via `visibleNavItems`, highlights the active
 * route, and collapses to a narrower rail (desktop) / hidden drawer content
 * (mobile handled by the parent shell wrapping this in a Sheet — see
 * app.shell.tsx, T0.5).
 *
 * Un bloque de identidad (nombre completo + tipo de usuario, vía
 * `tipoUsuario`) vive ENCIMA de las secciones de navegación — es contexto de
 * "quién soy" que precede al "a dónde voy". Es collapse-aware: expandido
 * muestra nombre + tipo; colapsado (riel angosto) muestra solo un círculo de
 * iniciales, mismo criterio que el resto del riel (texto se oculta, ícono
 * queda).
 *
 * Spec: R-M0 Shell/layout premium.
 */
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/shared/hooks/use-session";
import { visibleNavSections } from "@/shared/nav/nav-config";
import { tipoUsuario } from "@/shared/auth/tipo-usuario";
import type { JwtPayload } from "@/shared/api/types";

/**
 * Iniciales para el avatar compacto (riel colapsado): primera letra de
 * nombre + primera letra de apellido, en mayúsculas. Si ambos vienen vacíos
 * (token pre-rollout sin identidad, ver `decodeJwtPayload`) cae a "?" — nunca
 * un círculo vacío.
 */
function iniciales(nombre: string, apellido: string): string {
  const ini = `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
  return ini || "?";
}

/**
 * SidebarBrand — bloque de marca del sidebar (sdd/logo-por-cliente, WU3).
 * NUEVO: no existía antes de este cambio (design.md H5, spec regla 7).
 *
 * `Building2` es el fallback en TODOS los casos donde no hay un logo
 * confiable que mostrar: sin `cliente_logo_v` (token pre-rollout o cliente
 * sin logo), sesión MASTER (`cliente_id: null`, root sin tenant elegido —
 * no hay cliente al que asociarle un logo), o si la carga del binario
 * falla (401/404 incluidos). Nunca una imagen rota, nunca un hueco de
 * layout: el contenedor cuadrado (`h-9 w-9`, mismo tamaño que el círculo de
 * iniciales del bloque de identidad) está SIEMPRE presente,
 * colapsado o expandido — sin condicional de ancho (design.md D6/§corte).
 *
 * El `key` en el `<img>` fuerza un remount al cambiar de cliente o de
 * versión de logo: sin él, un error de carga anterior (`logoError=true`)
 * seguiría ocultando el logo del cliente NUEVO tras un switch. El `useEffect`
 * cumple el mismo rol para el estado de error en sí.
 */
function SidebarBrand({ user, collapsed }: { user: JwtPayload | null; collapsed: boolean }) {
  const [logoError, setLogoError] = useState(false);
  const clienteId = user?.cliente_id ?? null;
  const logoVersion = user?.cliente_logo_v ?? null;
  const tieneLogo = clienteId !== null && logoVersion !== null;

  useEffect(() => {
    setLogoError(false);
  }, [clienteId, logoVersion]);

  return (
    <div
      data-testid="sidebar-brand"
      className={cn(
        "flex items-center border-b border-border",
        collapsed ? "justify-center py-3" : "gap-3 px-3 py-3",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {tieneLogo && !logoError ? (
          // eslint-disable-next-line @next/next/no-img-element -- binario autenticado servido por el proxy BFF (design.md D6), no un asset estático optimizable
          <img
            key={`${clienteId}-${logoVersion}`}
            src={`/api/clientes/${clienteId}/logo?v=${logoVersion}`}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <Building2
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
            data-testid="sidebar-brand-fallback"
          />
        )}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const { user } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const sections = visibleNavSections(user);

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-10 items-center justify-center border-b border-border text-muted-foreground hover:bg-muted transition-colors"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      <SidebarBrand user={user} collapsed={collapsed} />

      {user && (
        <div
          className={cn(
            "flex items-center border-b border-border",
            collapsed ? "justify-center py-3" : "gap-3 px-3 py-3",
          )}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            {iniciales(user.nombre, user.apellido)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-foreground">
                {`${user.nombre} ${user.apellido}`.trim() || "Usuario"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{tipoUsuario(user)}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {sections.map((section) => {
          // Enlaza el encabezado de sección con su lista vía `aria-labelledby`
          // para que el lector de pantalla anuncie el grupo (ej. "ROOT"). Solo
          // aplica expandido: colapsado el label es un `<hr>` decorativo.
          const headingId =
            section.title !== null && !collapsed
              ? `nav-section-${section.title.toLowerCase().replace(/\s+/g, "-")}`
              : undefined;
          return (
            <Fragment key={section.title ?? "default"}>
              {section.title !== null &&
                (collapsed ? (
                  // Colapsado: el label de texto no entra en el riel angosto —
                  // un divisor fino marca el corte de sección sin romper el
                  // layout compacto.
                  <hr className="my-1 border-t border-border" aria-hidden="true" />
                ) : (
                  <span
                    id={headingId}
                    className="px-3 pt-3 text-xs font-semibold uppercase text-muted-foreground"
                  >
                    {section.title}
                  </span>
                ))}
              <ul className="flex flex-col gap-1" aria-labelledby={headingId}>
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
