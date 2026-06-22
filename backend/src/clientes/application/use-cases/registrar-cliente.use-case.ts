import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteConflictError } from '../../domain/errors/clientes.errors';

/**
 * RegistrarClienteDto — datos necesarios para registrar un nuevo cliente/tenant.
 * No incluye provisioning de DB (eso va en Fase 7 — CrearClienteUseCase completo).
 */
export interface RegistrarClienteDto {
  nombre: string;
  razonSocial: string | null;
  cuit: string | null;
  dbName: string;
}

/**
 * RegistrarClienteUseCase — registra un nuevo cliente en el sistema master.
 *
 * Versión básica (PR-04): valida unicidad de db_name y persiste.
 * NO provisiona la DB tenant (eso lo hace CrearClienteUseCase en Fase 7
 * con PostgresAdminService + migraciones + seed + usuario admin inicial).
 *
 * Retorna:
 *   - Result.ok(cliente) si el registro fue exitoso.
 *   - Result.fail(ClienteConflictError) si ya existe un cliente con ese db_name.
 *
 * Tarea: 1.B.2
 */
export class RegistrarClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(dto: RegistrarClienteDto): Promise<Result<ClienteEntity, ClienteConflictError>> {
    // 1. Verificar unicidad de db_name ANTES de crear la entidad
    const existente = await this.clienteRepo.findByDbName(dto.dbName);
    if (existente) {
      return Result.fail(new ClienteConflictError(dto.dbName));
    }

    // 2. Crear la entidad — UUIDv7 generado en BaseEntity constructor
    const cliente = ClienteEntity.create({
      nombre: dto.nombre,
      razonSocial: dto.razonSocial,
      cuit: dto.cuit,
      dbName: dto.dbName,
      activo: true,
    });

    // 3. Persistir
    await this.clienteRepo.save(cliente);

    return Result.ok(cliente);
  }
}
