/**
 * PrismaUsuarioRepository — implementación del puerto IUsuarioRepository.
 *
 * findByEmail/findById INCLUYEN soft-deleted a propósito: LoginUseCase (R3)
 * necesita distinguir "no existe" de "existe pero inactivo/borrado" para
 * ejecutar la defensa timing-safe (hashProvider.verify contra DUMMY_HASH)
 * de forma consistente en ambos casos, y el guard de auth necesita poder
 * rechazar cuentas suspendidas.
 *
 * Sin MasterContext-awareness (a diferencia de soporte1): PR5 no introduce
 * transacciones cross-repo — ese wiring queda para el PR que lo necesite en
 * concreto (CrearClienteUseCase, PR8).
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IUsuarioRepository } from '../../../domain/ports/i-usuario.repository';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { UsuarioMapper } from './usuario.mapper';

/** Fila de `usuarios` tal como la devuelve `$queryRaw` (columnas en snake_case). */
interface FilaUsuarioCruda {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  password_hash: string;
  activo: boolean;
  is_global_admin: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

@Injectable()
export class PrismaUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findByEmail(email: string): Promise<UsuarioEntity | null> {
    const row = await this.client.usuario.findUnique({ where: { email } });
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  /**
   * `lower(email) = lower($1)` y NO `mode: 'insensitive'`: Prisma lo traduce a ILIKE, donde `_`
   * y `%` son comodines. Respaldado por `usuarios_email_lower_idx`.
   */
  async findManyByEmailInsensitive(email: string): Promise<UsuarioEntity[]> {
    const filas = await this.client.$queryRaw<FilaUsuarioCruda[]>`
      SELECT id, email, nombre, apellido, password_hash, activo, is_global_admin,
             created_at, updated_at, deleted_at
      FROM usuarios WHERE lower(email) = lower(${email}) LIMIT 2`;
    return filas.map((f) =>
      UsuarioMapper.toDomain({
        id: f.id,
        email: f.email,
        nombre: f.nombre,
        apellido: f.apellido,
        passwordHash: f.password_hash,
        activo: f.activo,
        isGlobalAdmin: f.is_global_admin,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        deletedAt: f.deleted_at,
      }),
    );
  }

  async findById(id: string): Promise<UsuarioEntity | null> {
    const row = await this.client.usuario.findUnique({ where: { id } });
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  async create(entity: UsuarioEntity): Promise<void> {
    // Delega a save() (upsert): para entidades nuevas (id UUIDv7 generado en
    // el dominio), Prisma hará INSERT porque el id no existe aún en DB.
    await this.save(entity);
  }

  async save(usuario: UsuarioEntity): Promise<void> {
    const data = UsuarioMapper.toPersistence(usuario);
    const { id, ...updateData } = data;

    await this.client.usuario.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }
}
