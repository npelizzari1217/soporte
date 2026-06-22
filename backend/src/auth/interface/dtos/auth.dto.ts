/**
 * DTOs de entrada/salida para AuthController y UsuariosController.
 * Sin imports de NestJS class-validator para mantener el PR simple.
 * La validación con class-validator se añade en un PR posterior.
 *
 * Tarea: 2.D.4
 */

// ─── Auth DTO ─────────────────────────────────────────────────────────────────

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshDto {
  /** Token crudo del refresh token (body JSON o httpOnly cookie). */
  refreshToken: string;
}

export interface LogoutDto {
  /** Token crudo a revocar. */
  refreshToken: string;
}

// ─── Usuarios DTO ─────────────────────────────────────────────────────────────

export interface AsignarRolDto {
  rolCodigo: string;
}
