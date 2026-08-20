/**
 * PrismaClienteEmailConfigRepository — implementación del puerto
 * IClienteEmailConfigRepository (sdd/configuracion-correo-por-cliente, WU3).
 *
 * BORDE DE PERSISTENCIA: acá y solo acá se cifra/descifra la contraseña
 * SMTP con `ISecretCipher` (`clienteId` como AAD, WU1). Fuera de este
 * adaptador la contraseña en texto plano no circula — `save()` la recibe
 * porque el llamador (WU4) no tiene otra forma de proveerla, y
 * `findForSend()` la devuelve porque el sender (WU5) necesita texto plano
 * para nodemailer, pero ningún otro método de este puerto ni ningún
 * consumidor toca el `ISecretCipher` directamente.
 *
 * Trabaja sobre `master.clientes` (mismo cliente Prisma que
 * `PrismaClienteRepository`), pero NUNCA usa `ClienteMapper.toPersistence`
 * ni el `upsert` de `PrismaClienteRepository.save()` — ese `Omit` excluye a
 * propósito las 9 columnas SMTP (ver WU2), así que esta clase escribe esas
 * columnas por su cuenta con `update()` selects/data explícitos.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D1, D3, D6, D7.
 * Ref tasks: WU3 3.3.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ISecretCipher, SECRET_CIPHER } from '../../../../shared/domain/ports/i-secret-cipher.port';
import {
  ClienteEmailConfigForSend,
  ClienteEmailConfigInput,
  ClienteEmailConfigState,
  IClienteEmailConfigRepository,
  VerificacionOutcome,
} from '../../../domain/ports/i-cliente-email-config.repository';

/** Columnas SMTP leídas para armar la config lista-para-enviar. */
const SELECT_FOR_SEND = {
  smtpHost: true,
  smtpPort: true,
  smtpUser: true,
  smtpSecure: true,
  smtpFrom: true,
  smtpPasswordCifrada: true,
  smtpConfigUpdatedAt: true,
} as const;

/** Columnas SMTP leídas para exponer el estado (sin la contraseña cifrada). */
const SELECT_FOR_STATE = {
  smtpHost: true,
  smtpPort: true,
  smtpUser: true,
  smtpSecure: true,
  smtpFrom: true,
  smtpPasswordCifrada: true,
  smtpVerificadoAt: true,
  smtpVerificacionError: true,
} as const;

@Injectable()
export class PrismaClienteEmailConfigRepository implements IClienteEmailConfigRepository {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(SECRET_CIPHER) private readonly secretCipher: ISecretCipher,
  ) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async findForSend(clienteId: string): Promise<ClienteEmailConfigForSend | null> {
    const row = await this.client.cliente.findUnique({
      where: { id: clienteId },
      select: SELECT_FOR_SEND,
    });

    // Todo-o-nada: si falta cualquiera de los campos requeridos, se trata
    // como "no configurado" — el CHECK de la base ya impide un estado
    // intermedio persistido, esto es defensa en profundidad, no la única.
    if (
      !row ||
      !row.smtpPasswordCifrada ||
      row.smtpHost === null ||
      row.smtpPort === null ||
      row.smtpUser === null ||
      row.smtpFrom === null
    ) {
      return null;
    }

    return {
      host: row.smtpHost,
      port: row.smtpPort,
      user: row.smtpUser,
      password: this.secretCipher.decrypt(row.smtpPasswordCifrada, clienteId),
      secure: row.smtpSecure ?? false,
      from: row.smtpFrom,
      configRevision: (row.smtpConfigUpdatedAt ?? new Date(0)).getTime(),
    };
  }

  async findState(clienteId: string): Promise<ClienteEmailConfigState> {
    const row = await this.client.cliente.findUnique({
      where: { id: clienteId },
      select: SELECT_FOR_STATE,
    });

    return {
      configurado: Boolean(row?.smtpPasswordCifrada),
      host: row?.smtpHost ?? null,
      port: row?.smtpPort ?? null,
      user: row?.smtpUser ?? null,
      secure: row?.smtpSecure ?? null,
      from: row?.smtpFrom ?? null,
      verificadoAt: row?.smtpVerificadoAt ?? null,
      verificacionError: row?.smtpVerificacionError ?? null,
    };
  }

  async save(clienteId: string, config: ClienteEmailConfigInput): Promise<void> {
    const passwordCifrada = this.secretCipher.encrypt(config.password, clienteId);

    await this.client.cliente.update({
      where: { id: clienteId },
      data: {
        smtpHost: config.host,
        smtpPort: config.port,
        smtpUser: config.user,
        smtpSecure: config.secure,
        smtpFrom: config.from,
        smtpPasswordCifrada: passwordCifrada,
        // Revisión de caché de transporters (D3) — deliberadamente distinta
        // de `updatedAt` del cliente.
        smtpConfigUpdatedAt: new Date(),
      },
    });
  }

  async saveVerificationOutcome(clienteId: string, outcome: VerificacionOutcome): Promise<void> {
    // No toca `smtpConfigUpdatedAt`: verificar no es reconfigurar. Tampoco
    // limpia `smtpVerificadoAt` en un fallo — esa columna registra el
    // último ÉXITO, no el último intento; un fallo solo actualiza el motivo.
    await this.client.cliente.update({
      where: { id: clienteId },
      data: outcome.ok
        ? { smtpVerificadoAt: new Date(), smtpVerificacionError: null }
        : { smtpVerificacionError: outcome.motivo },
    });
  }

  async clear(clienteId: string): Promise<void> {
    await this.client.cliente.update({
      where: { id: clienteId },
      data: {
        smtpHost: null,
        smtpPort: null,
        smtpUser: null,
        smtpSecure: null,
        smtpFrom: null,
        smtpPasswordCifrada: null,
        smtpConfigUpdatedAt: null,
        smtpVerificadoAt: null,
        smtpVerificacionError: null,
      },
    });
  }
}
