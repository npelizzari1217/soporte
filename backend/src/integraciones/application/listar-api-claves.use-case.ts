import { PermisoApi } from '../domain/api-clave';
import { IApiClaveRepository } from '../domain/api-clave-repository.port';

/** Vista de una clave para la pantalla: nunca incluye el hash ni la clave en claro. */
export interface ApiClaveVista {
  id: string;
  nombre: string;
  prefijo: string;
  permisos: PermisoApi[];
  creadaAt: Date;
  ultimoUsoAt: Date | null;
  revocadaAt: Date | null;
}

/** ListarApiClavesUseCase — claves del cliente del actor, las mas nuevas primero (CA8). */
export class ListarApiClavesUseCase {
  constructor(private readonly claveRepo: Pick<IApiClaveRepository, 'listarPorCliente'>) {}

  async execute(clienteId: string): Promise<ApiClaveVista[]> {
    const claves = await this.claveRepo.listarPorCliente(clienteId);
    return claves.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      prefijo: c.prefijo,
      permisos: c.permisos,
      creadaAt: c.creadaAt,
      ultimoUsoAt: c.ultimoUsoAt,
      revocadaAt: c.revocadaAt,
    }));
  }
}
