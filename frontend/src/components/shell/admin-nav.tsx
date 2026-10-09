"use client";

/**
 * AdminNav — sub-navegación de `/admin/*` (Catálogos/Ciclos/Usuarios/
 * Insumos/Unidades). El ítem "SLA" se ELIMINÓ: el SLA pasó a ser un atributo
 * de la prioridad (`slaHoras`/`slaActivo`), editable desde el mismo form de
 * Catálogos > Prioridades — sin sección propia.
 * `NAV_ITEMS` (shared/nav/nav-config.ts) solo tiene UN ítem "Admin" en el
 * sidebar principal (apunta a `/admin/catalogos`) — este componente es el
 * que permite moverse entre las secciones DENTRO del área admin. Las 5
 * secciones (Catálogos/Ciclos/Usuarios/Insumos/Unidades) son configuración
 * de tenant (R4, `sdd/matriz-permisos-por-usuario` ADR-P5) — gateadas por
 * `esAdminCliente` (ADMINISTRADOR-o-ROOT), no por un permiso de la matriz:
 * la escritura de catálogos/ciclos/usuarios/insumos/unidades dejó de tener
 * celda propia. Las lecturas de catálogos siguen abiertas a cualquier
 * autenticado (R4), pero esa sección del nav es para GESTIONAR, no para leer
 * sueltas — mismo criterio que las páginas destino (`catalogos-admin-view.tsx`,
 * `ciclos-admin-view.tsx`, `usuarios-admin-view.tsx`,
 * `insumos-catalogos-admin-view.tsx`, `unidades-medida-admin-view.tsx`, todas
 * gateadas por `<SoloAdminCliente>`). Reusado por las páginas `/admin/*`
 * (decisión de esta sesión, no listada en tasks.md — evita duplicar la barra
 * de navegación en cada una).
 *
 * "Unidades" (issue #156) se agregó con el MISMO gate que el resto — no es
 * un permiso nuevo, es la misma identidad `esAdminCliente` que ya gateaba el
 * ABM cuando vivía adentro de `Admin > Insumos`.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "@/shared/hooks/use-session";

interface AdminNavItem {
  href: string;
  label: string;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin/catalogos", label: "Catálogos" },
  { href: "/admin/ciclos", label: "Ciclos" },
  { href: "/admin/usuarios", label: "Usuarios" },
  // "Familia de Catálogos" y no "Insumos" a secas: este ABM administra las
  // FAMILIAS, y una familia puede tener `esRepuesto` en true o en false, asi
  // que desde acá se crean y editan las de las dos clases. Ojo con el error
  // simétrico: la sección del sidebar principal SÍ se llama "Insumos" y lista
  // solo consumibles — los repuestos tienen la suya propia desde el #149.
  { href: "/admin/insumos", label: "Familia de Catálogos" },
  { href: "/admin/unidades", label: "Unidades" },
  // Catálogo `ModeloEquipo` (ciclo modelos-equipo-catalogo-y-compatibilidad):
  // MISMO gate que el resto, `esAdminCliente` — el backend gatea
  // `crear`/`editar`/`cambiarEstadoActivo` solo con `AdminClienteGuard`, sin
  // permiso propio en la matriz `MODULO:ACCION`.
  { href: "/admin/modelos-equipo", label: "Modelos de equipo" },
  // Reglas de asignación automática por tipo (ciclo asignacion-automatica-por-tipo):
  // MISMO gate `esAdminCliente`; el backend usa `AdminClienteGuard`, sin permiso en la matriz.
  { href: "/admin/reglas-asignacion", label: "Asignación automática" },
  // "Clientes" NO vive en el área Admin: es exclusivo de ROOT (plataforma),
  // no una sección administrable por el ADMINISTRADOR del tenant. Se accede
  // por su ítem top-level propio del sidebar (nav-config.ts), gateado por
  // `is_global_admin`. Ver también el ítem master "Ciclos" (mismo criterio).
];

export function AdminNav() {
  const { esAdminCliente } = useSession();
  const pathname = usePathname();
  const items = esAdminCliente ? ADMIN_NAV_ITEMS : [];

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
