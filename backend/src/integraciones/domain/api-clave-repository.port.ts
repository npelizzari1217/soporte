import { DomainError, Result } from '../../shared/domain/result';
import { ApiClave, NuevaApiClave } from './api-clave';

/** El hash o el prefijo de la clave ya existe (colision practicamente imposible: se reintenta). */
export class ApiClaveDuplicadaError extends DomainError {
  readonly code = 'API_CLAVE_DUPLICADA';

  constructor() {
    super('Ya existe una clave de API con ese hash o prefijo.');
  }
}

/** Persistencia de las claves de la API publica (master). */
export interface IApiClaveRepository {
  crear(datos: NuevaApiClave): Promise<Result<ApiClave, ApiClaveDuplicadaError>>;
  /** Busca por sha256 de la clave. Devuelve tambien las revocadas: el llamador decide. */
  buscarPorHash(hash: string): Promise<ApiClave | null>;
  /** Claves del cliente, las mas nuevas primero. Nunca devuelve las de otro cliente. */
  listarPorCliente(clienteId: string): Promise<ApiClave[]>;
  /** Revoca una clave del cliente. Idempotente. Devuelve false si no existe en ese cliente. */
  revocar(clienteId: string, id: string, ahora: Date): Promise<boolean>;
  /** Marca el ultimo uso de la clave. */
  registrarUso(id: string, ahora: Date): Promise<void>;
}

export const API_CLAVE_REPOSITORY = Symbol('IApiClaveRepository');
