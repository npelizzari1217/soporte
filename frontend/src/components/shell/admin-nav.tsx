"use client";

/**
 * AdminNav — sub-navegación de `/admin/*` (Catálogos/SLA/Ciclos/Clientes).
 * `NAV_ITEMS` (shared/nav/nav-config.ts) solo tiene UN ítem "Admin" en el
 * sidebar principal (apunta a `/admin/catalogos`) — este componente es el
 * que permite moverse entre las 4 secciones DENTRO del área admin, cada una
 * gateada por su propio permiso (ADR-4: gating por `can()`, nunca por rol
 * directo). Reusado por las 4 páginas `/admin/*` (decisión de esta sesión,
 * no listada en tasks.md — evita duplicar la barra de navegación 4 veces).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "@/shared/hooks/use-session";

interface AdminNavItem {
  href: string;
  label: string;
  visible: (can: (permiso: string) => boolean, isGlobalAdmin: boolean) => boolean;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin/catalogos", label: "Catálogos", visible: (can) => can("catalogo:gestionar") },
  { href: "/admin/sla", label: "SLA", visible: (can) => can("catalogo:gestionar") },
  { href: "/admin/ciclos", label: "Ciclos", visible: (can) => can("ciclo:gestionar") },
  { href: "/admin/usuarios", label: "Usuarios", visible: (can) => can("usuario:gestionar") },
  // "Clientes" NO vive en el área Admin: es exclusivo de ROOT (plataforma),
  // no una sección administrable por el ADMINISTRADOR del tenant. Se accede
  // por su ítem top-level propio del sidebar (nav-config.ts), gateado por
  // `is_global_admin`. Ver también el ítem master "Ciclos" (mismo criterio).
];

export function AdminNav() {
  const { can, isGlobalAdmin } = useSession();
  const pathname = usePathname();
  const items = ADMIN_NAV_ITEMS.filter((item) => item.visible(can, isGlobalAdmin));

  return (
    <nav aria-label="Navegación de administración" className="mb-6 flex flex-wrap gap-1 border-b border-border pb-2">
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
