/**
 * Types compartidos del módulo admin (panel de administración multi-tenant).
 * Mirrors de los DTOs de respuesta del backend (camelCase, ver
 * backend/src/clientes/interface/dtos/{cliente,ciclo}-response.dto.ts).
 *
 * Spec: [SPEC:clientes-tenancy/GET /clientes], [SPEC:clientes-tenancy/GET /ciclos]
 * Introducido en: admin-general PR5
 */

/** Cliente (tenant) — GET /clientes. Solo accesible por el operador global. */
export type Cliente = {
  id: string;
  nombre: string;
  activo: boolean;
  dbName: string;
  createdAt: string;
};

/** Ciclo (tenant-level, ciclos_cliente) — GET /ciclos. */
export type Ciclo = {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
};

/**
 * Usuario (tenant-level) — GET /usuarios, POST /usuarios. Mirrors
 * UsuarioResponseDto (backend/src/auth/interface/dtos/auth.dto.ts).
 * NEVER incluye password/passwordHash — invariante de seguridad del backend.
 *
 * Spec: [SPEC:admin-ui/Pantalla Usuarios]
 * Introducido en: admin-general PR6c
 */
export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  clienteId: string;
  activo: boolean;
  isGlobalAdmin: boolean;
  roles: string[];
  createdAt: string;
};

/** Body de POST /usuarios — mirrors CreateUsuarioDto (backend). */
export type NuevoUsuarioInput = {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  /** Uno de: USUARIO | COLABORADOR | TECNICO | ADMINISTRADOR */
  rol: string;
};
