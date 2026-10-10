import { Result } from '../../shared/domain/result';
import { IApiClaveRepository } from '../domain/api-clave-repository.port';
import { ApiClaveNoEncontradaError } from '../domain/integraciones.errors';

/**
 * RevocarApiClaveUseCase — revoca una clave del cliente del actor. Idempotente: revocar una
 * clave ya revocada es exito. Una clave de otro cliente o inexistente da el mismo error.
 */
export class RevocarApiClaveUseCase {
  constructor(private readonly claveRepo: Pick<IApiClaveRepository, 'revocar'>) {}

  async execute(
    clienteId: string,
    id: string,
    ahora: Date = new Date(),
  ): Promise<Result<void, ApiClaveNoEncontradaError>> {
    const existe = await this.claveRepo.revocar(clienteId, id, ahora);
    return existe ? Result.ok(undefined) : Result.fail(new ApiClaveNoEncontradaError());
  }
}
