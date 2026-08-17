import { Result } from '../../../shared/domain/result';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';

/** Rol (por membresía) que otorga acceso a TODAS las celdas del cliente (R2). */
const ROL_ADMINISTRADOR = 'ADMINISTRADOR';

/**
 * Input de `ObtenerPermisosUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO y
 * SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT del
 * ADMINISTRADOR) — aislamiento estricto, mismo criterio que
 * `CambiarRolUsuarioTenantUseCase`.
 */
export interface ObtenerPermisosUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
}

/** Resultado: celdas de la matriz + si el usuario es ADMINISTRADOR (R2). */
export interface PermisosUsuarioTenant {
  celdas: string[];
  esAdministrador: boolean;
}

export type ObtenerPermisosUsuarioTenantError = MembresiaNoEncontradaError;

/**
 * ObtenerPermisosUsuarioTenantUseCase — `GET /usuarios/:id/permisos` (ABM de
 * la matriz, sdd/matriz-permisos-por-usuario WU-7.4, ADR-P10). `AdminClienteGuard`
 * en el controller.
 *
 * Un ADMINISTRADOR (R2) no tiene filas propias en la matriz — bypassea vía
 * `resolverScope`, no vía `usuario_cliente_permisos` — así que este use case
 * devuelve `celdas: []` sin consultar la matriz cuando el usuario `:id` es
 * ADMINISTRADOR EN ESTE CLIENTE. `esAdministrador` le indica al frontend que
 * la grilla se muestra toda tildada y deshabilitada, en vez de vacía.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R2. Ref design: ADR-P10.
 */
export class ObtenerPermisosUsuarioTenantUseCase {
  constructor(
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>,
    private readonly permisosRepo: Pick<IMatrizPermisosRepository, 'findByUsuarioYCliente'>,
  ) {}

  async execute(
    input: ObtenerPermisosUsuarioTenantInput,
  ): Promise<Result<PermisosUsuarioTenant, ObtenerPermisosUsuarioTenantError>> {
    const membresia = await this.membresiaRepo.findActivaByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    const esAdministrador = membresia.rolCodigo === ROL_ADMINISTRADOR;
    const celdas = esAdministrador
      ? []
      : await this.permisosRepo.findByUsuarioYCliente(input.usuarioId, input.clienteId);

    return Result.ok({ celdas, esAdministrador });
  }
}
