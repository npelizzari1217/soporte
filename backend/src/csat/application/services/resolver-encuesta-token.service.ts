import * as crypto from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { EncuestaLinkInvalidoError } from '../../domain/errors/csat.errors';
import {
  ENCUESTA_TOKEN_REPOSITORY,
  IEncuestaTokenRepository,
} from '../../domain/ports/i-encuesta-token.repository';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../../../clientes/domain/ports/i-cliente.repository';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';

/**
 * EncuestaTokenResuelto — datos del token ya validado y con el tenant
 * bindeado (`ResolverEncuestaTokenService.resolver`). `clienteId` viaja acá
 * para que los use cases consumidores (WU6/WU7) no tengan que releer
 * `TenantContext.get()` — pero su ÚNICA fuente en todo el flujo es la fila de
 * MASTER, nunca un valor recibido del caller (ADR-C1).
 *
 * Ref design: ADR-C1, sección "Contratos". Tarea: 5.1.
 */
export interface EncuestaTokenResuelto {
  readonly tokenId: string;
  readonly ticketId: string;
  readonly clienteId: string;
}

/**
 * ResolverEncuestaTokenService — punto único de validación del token opaco
 * de encuesta (ADR-C1). Ejecuta, en orden y sin ramas alternativas:
 *
 * 1. `sha256(rawToken)` → `IEncuestaTokenRepository.findByHash`.
 * 2. Rechaza si no hay fila, o si está revocado/usado/vencido.
 * 3. `IClienteRepository.findById(token.clienteId)` — el `clienteId` sale
 *    SIEMPRE de la fila del token, nunca de un parámetro adicional: la
 *    firma de `resolver()` solo acepta el token crudo, así que no hay
 *    ninguna otra fuente posible de dónde tomarlo.
 * 4. Rechaza si el cliente no existe, no está `activo`, está `isDeleted()`,
 *    o no tiene `csatHabilitado`.
 * 5. `TenantContext.bind()` con el `clienteId` resuelto en el paso 3.
 *
 * Todo rechazo devuelve el MISMO `EncuestaLinkInvalidoError` (spec:
 * "Validación del token en el endpoint público") — un endpoint anónimo no
 * puede distinguir motivo sin filtrarle información a un actor no
 * autenticado.
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público", "Cliente inactivo o eliminado no acepta escrituras". Ref design:
 * ADR-C1. Tarea: 5.1.
 */
@Injectable()
export class ResolverEncuestaTokenService {
  constructor(
    @Inject(ENCUESTA_TOKEN_REPOSITORY) private readonly tokenRepo: IEncuestaTokenRepository,
    @Inject(CLIENTE_REPOSITORY) private readonly clienteRepo: IClienteRepository,
    private readonly prismaService: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async resolver(
    rawToken: string,
  ): Promise<Result<EncuestaTokenResuelto, EncuestaLinkInvalidoError>> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const token = await this.tokenRepo.findByHash(tokenHash);

    if (!token || token.isRevoked() || token.isUsed() || token.isExpired()) {
      return Result.fail(new EncuestaLinkInvalidoError());
    }

    // El clienteId sale ÚNICAMENTE de la fila del token — no hay otro
    // parámetro en esta función del que pudiera salir (ADR-C1).
    const cliente = await this.clienteRepo.findById(token.clienteId);
    if (!cliente || !cliente.activo || cliente.isDeleted() || !cliente.csatHabilitado) {
      return Result.fail(new EncuestaLinkInvalidoError());
    }

    this.tenantContext.bind({
      prismaClient: this.prismaService.getTenantClient(cliente.dbName),
      dbName: cliente.dbName,
      clienteId: token.clienteId,
    });

    return Result.ok({
      tokenId: token.id,
      ticketId: token.ticketId,
      clienteId: token.clienteId,
    });
  }
}
