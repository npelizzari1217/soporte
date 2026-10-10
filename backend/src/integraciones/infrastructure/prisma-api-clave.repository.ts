import { Injectable } from '@nestjs/common';
import { Result } from '../../shared/domain/result';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { ApiClave, esPermisoApi, NuevaApiClave } from '../domain/api-clave';
import { ApiClaveDuplicadaError, IApiClaveRepository } from '../domain/api-clave-repository.port';

interface FilaApiClave extends Omit<ApiClave, 'permisos'> {
  permisos: string[];
}

/** Repositorio de `api_claves` en master. */
@Injectable()
export class PrismaApiClaveRepository implements IApiClaveRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  private aDominio(fila: FilaApiClave): ApiClave {
    return { ...fila, permisos: fila.permisos.filter(esPermisoApi) };
  }

  async crear(datos: NuevaApiClave): Promise<Result<ApiClave, ApiClaveDuplicadaError>> {
    try {
      const fila = await this.client.apiClave.create({ data: datos });
      return Result.ok(this.aDominio(fila));
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
        return Result.fail(new ApiClaveDuplicadaError());
      }
      throw err;
    }
  }

  async buscarPorHash(hash: string): Promise<ApiClave | null> {
    const fila = await this.client.apiClave.findUnique({ where: { hash } });
    return fila ? this.aDominio(fila) : null;
  }

  async listarPorCliente(clienteId: string): Promise<ApiClave[]> {
    const filas = await this.client.apiClave.findMany({
      where: { clienteId },
      orderBy: { creadaAt: 'desc' },
    });
    return filas.map((f) => this.aDominio(f));
  }

  async revocar(clienteId: string, id: string, ahora: Date): Promise<boolean> {
    // `revocadaAt: null` conserva la fecha de la primera revocacion; el count no sirve para
    // distinguir "ya revocada" de "inexistente", por eso se consulta la pertenencia aparte.
    await this.client.apiClave.updateMany({
      where: { id, clienteId, revocadaAt: null },
      data: { revocadaAt: ahora },
    });
    const existe = await this.client.apiClave.count({ where: { id, clienteId } });
    return existe > 0;
  }

  async registrarUso(id: string, ahora: Date): Promise<void> {
    await this.client.apiClave.updateMany({ where: { id }, data: { ultimoUsoAt: ahora } });
  }
}
