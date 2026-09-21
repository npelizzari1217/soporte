/**
 * Tipos del dominio Admin > Clientes — espejo de
 * `backend/src/clientes/interface/dtos/cliente.dto.ts` (R16-R18, T8.4).
 * Exclusivo ROOT (`is_global_admin`), NUNCA por `permisos` (ortogonal —
 * mismo criterio que `JwtPayload.is_global_admin`).
 */

export interface Cliente {
  id: string;
  nombre: string;
  razonSocial: string | null;
  cuit: string | null;
  dbName: string;
  activo: boolean;
  /**
   * Habilita la emisión de encuestas CSAT al cerrar un ticket de este
   * cliente (sdd/csat). No es un secreto — viaja siempre en `Cliente`,
   * a diferencia de la config de correo que necesita un endpoint aparte.
   */
  csatHabilitado: boolean;
}

export interface CreateClienteDto {
  nombre: string;
  razonSocial?: string;
  cuit?: string;
  adminEmail: string;
  adminNombre: string;
  adminApellido: string;
  adminPassword: string;
}

/**
 * Body de `PATCH /clientes/:id` — edición de datos comerciales (solo ROOT).
 * Espejo de `UpdateClienteDto` (backend). NO incluye `dbName` (inmutable) ni
 * campos de admin.
 */
export interface UpdateClienteDto {
  nombre?: string;
  razonSocial?: string;
  cuit?: string;
}

/**
 * Resumen mínimo de correo embebido en `GET /clientes` — espejo de
 * `ClienteCorreoResumenDto` (backend, D7/#2359). Existe para que "correo no
 * configurado" sea visible en el LISTADO, sin abrir la ficha de cada cliente.
 */
export interface ClienteCorreoResumen {
  configurado: boolean;
  verificadoAt: string | null;
}

/** Item de `GET /clientes` — `Cliente` + resumen de correo. Espejo de `ClienteListItemResponseDto`. */
export interface ClienteListItem extends Cliente {
  correo: ClienteCorreoResumen;
}

/**
 * Detalle de correo de `GET/PATCH/DELETE /clientes/:id/correo` y
 * `POST /clientes/:id/correo/probar` — espejo de `ClienteCorreoResponseDto`
 * (backend, D7). La contraseña NO existe acá bajo NINGUNA forma (ni null, ni
 * "***", ni su longitud): un campo que no existe no se puede filtrar por
 * accidente.
 */
export interface ClienteCorreo {
  configurado: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  secure: boolean | null;
  from: string | null;
  verificadoAt: string | null;
  verificacionError: string | null;
}

/**
 * Body de `PATCH /clientes/:id/correo` — espejo de
 * `ConfigurarCorreoClienteDto` (backend, D7). `password` es el ÚNICO campo
 * opcional: omitirlo preserva la contraseña ya guardada. NUNCA mandar `""`
 * (el backend lo rechaza a propósito — vaciar el campo no borra nada).
 */
export interface ConfigurarCorreoDto {
  host: string;
  port: number;
  user: string;
  secure: boolean;
  from: string;
  password?: string;
}

/** Body de `PATCH /clientes/:id/csat` — espejo de `ConfigurarCsatClienteDto` (backend, sdd/csat WU10.2). */
export interface ConfigurarCsatDto {
  habilitado: boolean;
}

/**
 * Respuesta de `POST /clientes/:id/logo` — espejo de `ClienteLogoResponseDto`
 * (backend, sdd/logo-por-cliente design.md D3/D7). Nunca expone la storage
 * key ni una ruta de filesystem: lo único que viaja es la marca de tiempo
 * que alimenta `cliente_logo_v` en el JWT (WU3).
 */
export interface ClienteLogoDto {
  logoUpdatedAt: string | null;
}
