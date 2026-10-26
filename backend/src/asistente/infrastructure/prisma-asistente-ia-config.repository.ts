import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import {
  IAsistenteIaConfigRepository,
  ResultadoVerificacionIa,
} from '../domain/asistente-ia-config-repository.port';
import { ConfigIa, DatosConfigIa } from '../domain/config-ia';

const codigoPrisma = (err: unknown): unknown =>
  typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;

const SELECCION = {
  clienteId: true,
  url: true,
  modelo: true,
  claveCifrada: true,
  verificadoAt: true,
  verificacionError: true,
} as const;

/** Repositorio de `asistente_ia_config` en master. Guarda y devuelve la clave cifrada tal cual. */
@Injectable()
export class PrismaAsistenteIaConfigRepository implements IAsistenteIaConfigRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async buscarPorCliente(clienteId: string): Promise<ConfigIa | null> {
    return this.client.asistenteIaConfig.findUnique({ where: { clienteId }, select: SELECCION });
  }

  async guardar(datos: DatosConfigIa): Promise<ConfigIa> {
    const { clienteId, url, modelo, claveCifrada } = datos;
    const configuracion = {
      url,
      modelo,
      claveCifrada,
      verificadoAt: null,
      verificacionError: null,
    };
    return this.client.asistenteIaConfig.upsert({
      where: { clienteId },
      create: { clienteId, ...configuracion },
      update: configuracion,
      select: SELECCION,
    });
  }

  // P2025: el cliente ya no tiene configuración (se quitó entre la lectura y esta escritura).
  async guardarVerificacion(
    clienteId: string,
    resultado: ResultadoVerificacionIa,
  ): Promise<ConfigIa | null> {
    try {
      return await this.client.asistenteIaConfig.update({
        where: { clienteId },
        data: resultado.ok
          ? { verificadoAt: new Date(), verificacionError: null }
          : { verificacionError: resultado.motivo },
        select: SELECCION,
      });
    } catch (err) {
      if (codigoPrisma(err) === 'P2025') return null;
      throw err;
    }
  }

  async quitar(clienteId: string): Promise<void> {
    await this.client.asistenteIaConfig.deleteMany({ where: { clienteId } });
  }
}
