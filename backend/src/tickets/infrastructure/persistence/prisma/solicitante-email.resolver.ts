/**
 * SolicitanteEmailResolver — implementación del puerto ISolicitanteEmailResolver.
 *
 * Resuelve el email del solicitante consultando `master.usuarios` vía
 * MasterPrismaClient (PrismaService). Espejo de `UsuarioMasterChecker`:
 *
 * IMPORTANTE:
 * - Opera sobre la DB MASTER (no sobre el tenant activo).
 * - NO usa TenantContext — el listener async que invoca este resolver puede
 *   correr fuera del ciclo request/response donde vivía el TenantContext
 *   original. El aislamiento multi-tenant se garantiza filtrando por
 *   `clienteId` explícito en el WHERE (mismo patrón que existeEnTenant).
 * - NUNCA lanza excepción para fallos esperados — retorna Result.fail
 *   tipado (USUARIO_NO_ENCONTRADO | EMAIL_NO_DISPONIBLE).
 *
 * Ref spec: Requirement 8, NFR "Resolución del solicitante siempre ocurre
 * contra el tenant correcto".
 * Ref design: §5, §7.
 * Tarea: 2.7/2.8 (PR2, notif-email-estado-ticket)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ISolicitanteEmailResolver } from '../../../domain/ports/i-solicitante-email.resolver';
import { Email } from '../../../domain/value-objects/email.vo';
import { Result } from '../../../../shared/domain/result';
import { ResolverEmailError } from '../../../domain/errors/email.errors';

@Injectable()
export class SolicitanteEmailResolver implements ISolicitanteEmailResolver {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  async resolver(
    solicitanteId: string,
    clienteId: string,
  ): Promise<Result<Email, ResolverEmailError>> {
    let row: { email: string | null } | null;
    try {
      row = await this.masterClient.usuario.findFirst({
        where: {
          id: solicitanteId,
          clienteId,
          deletedAt: null,
        },
        select: { email: true },
      });
    } catch {
      // Fallo de infraestructura (conexión/timeout/pool caído en la master
      // DB) — se mapea al límite a un ResolverEmailError tipado en vez de
      // dejar rechazar la promesa (corre en un listener async, Requirement
      // 8 "nunca lanza excepción"). No se propaga el mensaje crudo del
      // driver: puede contener detalles de conexión sensibles.
      return Result.fail(
        new ResolverEmailError(
          'INFRAESTRUCTURA_INDISPONIBLE',
          `No se pudo consultar master.usuarios para resolver el solicitante "${solicitanteId}" del tenant "${clienteId}".`,
        ),
      );
    }

    if (!row) {
      return Result.fail(
        new ResolverEmailError(
          'USUARIO_NO_ENCONTRADO',
          `Solicitante "${solicitanteId}" no encontrado en master.usuarios para el tenant "${clienteId}".`,
        ),
      );
    }

    if (!row.email || row.email.trim().length === 0) {
      return Result.fail(
        new ResolverEmailError(
          'EMAIL_NO_DISPONIBLE',
          `El solicitante "${solicitanteId}" no tiene un email disponible.`,
        ),
      );
    }

    const emailResult = Email.create(row.email);
    if (emailResult.isFail()) {
      return Result.fail(
        new ResolverEmailError(
          'EMAIL_NO_DISPONIBLE',
          `El email registrado para el solicitante "${solicitanteId}" tiene un formato inválido.`,
        ),
      );
    }

    return Result.ok(emailResult.getValue());
  }
}
