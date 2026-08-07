import { DomainError, Result } from '../../../shared/domain/result';
import {
  IMembresiaRepository,
  MembresiaConUsuario,
} from '../../domain/ports/i-membresia.repository';

/** Input de `ListarUsuariosTenantUseCase` — `clienteId` es SIEMPRE el del token del actor. */
export interface ListarUsuariosTenantInput {
  clienteId: string;
}

/**
 * ListarUsuariosTenantUseCase — lista los usuarios con membresía ACTIVA en
 * el cliente dado. Cierra los gaps G2 (selector de asignación de ticket) y
 * G3 parcial (vista admin de usuarios) — sdd/beta-frontend/spec §3.
 *
 * Aislamiento estricto: `clienteId` es un parámetro OBLIGATORIO que el
 * controller SIEMPRE deriva de `actor.cliente_id` (JWT) — nunca acepta un
 * `clienteId` de la request. La proyección `MembresiaConUsuario` (repo)
 * NUNCA expone `passwordHash`; la decisión de incluir/ocultar el `email`
 * ("dato sensible" — solo con `usuario:gestionar`) es responsabilidad del
 * controller (capa de presentación/autorización), no de este use case.
 *
 * Ref spec: sdd/beta-frontend/spec §3 G2/G3. Ref design: ADR-5.
 */
export class ListarUsuariosTenantUseCase {
  constructor(private readonly membresiaRepo: Pick<IMembresiaRepository, 'findActivasByCliente'>) {}

  async execute(
    input: ListarUsuariosTenantInput,
  ): Promise<Result<MembresiaConUsuario[], DomainError>> {
    const usuarios = await this.membresiaRepo.findActivasByCliente(input.clienteId);
    return Result.ok(usuarios);
  }
}
