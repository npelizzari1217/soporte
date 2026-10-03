/**
 * ClienteMapper — convierte entre Prisma Cliente y ClienteEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext), consumido
 * por PrismaClienteRepository (findById requerido por `resolverScope`, R5/R10).
 */
import type { Cliente as PrismaCliente } from '.prisma/master';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';

export class ClienteMapper {
  static toDomain(row: PrismaCliente): ClienteEntity {
    return ClienteEntity.reconstitute(
      {
        nombre: row.nombre,
        razonSocial: row.razonSocial ?? null,
        cuit: row.cuit ?? null,
        dbName: row.dbName,
        activo: row.activo,
        csatHabilitado: row.csatHabilitado,
        logoStorageKey: row.logoStorageKey ?? null,
        logoMimeType: row.logoMimeType ?? null,
        logoUpdatedAt: row.logoUpdatedAt ?? null,
        slug: row.slug ?? null,
        formularioPublicoHabilitado: row.formularioPublicoHabilitado,
        slugCongeladoAt: row.slugCongeladoAt ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * `Omit` ensancha además las 9 columnas SMTP (sdd/configuracion-correo-por-cliente,
   * WU2): `PrismaClienteRepository.save()` hace `update: updateData` con lo
   * que este método devuelve, así que omitirlas es lo que hace
   * estructuralmente imposible que una edición comercial (nombre, cuit, etc.)
   * borre la config de correo sin querer. La lectura/escritura de esas
   * columnas va por `IClienteEmailConfigRepository` (WU3), no por acá.
   *
   * `slug` y `slug_congelado_at` tambien se omiten (sdd/formulario-publico-qr,
   * ADR-2): se escriben SOLO por los CAS de `IClienteRepository`. Si el upsert
   * los reescribiera, un `save()` con una entidad leida antes de emitir un QR
   * descongelaria el slug. `formularioPublicoHabilitado` si es espejo.
   *
   * Las 3 columnas de logo NO se omiten (design.md D4, a diferencia de
   * `smtp_*`): el logo no tiene cifrado ni invariante todo-o-nada que
   * justifique un repo satélite, así que es espejo completo. Omitirlas acá
   * sería el mismo bug que motivó el test de round-trip de T1.7: un `PATCH`
   * comercial borraría el logo en el `upsert` de
   * `PrismaClienteRepository.save()`.
   */
  static toPersistence(
    entity: ClienteEntity,
  ): Omit<
    PrismaCliente,
    | 'createdAt'
    | 'updatedAt'
    | 'smtpHost'
    | 'smtpPort'
    | 'smtpUser'
    | 'smtpSecure'
    | 'smtpFrom'
    | 'smtpPasswordCifrada'
    | 'smtpConfigUpdatedAt'
    | 'smtpVerificadoAt'
    | 'smtpVerificacionError'
    | 'slug'
    | 'slugCongeladoAt'
  > {
    return {
      id: entity.id,
      nombre: entity.nombre,
      razonSocial: entity.razonSocial,
      cuit: entity.cuit,
      dbName: entity.dbName,
      activo: entity.activo,
      csatHabilitado: entity.csatHabilitado,
      formularioPublicoHabilitado: entity.formularioPublicoHabilitado,
      logoStorageKey: entity.logoStorageKey,
      logoMimeType: entity.logoMimeType,
      logoUpdatedAt: entity.logoUpdatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
