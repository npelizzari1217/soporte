import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../../../clientes/domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { SLUG_MAX_LENGTH, SLUG_REGEX } from '../../../clientes/domain/value-objects/slug-cliente';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { FormularioPublicoNoDisponibleError } from '../../domain/errors/publico.errors';

/**
 * ResolverClientePublicoService — punto único de entrada de las rutas públicas por slug
 * (`publico/c/:slug/...`). Ejecuta, en orden y sin ramas alternativas:
 *
 * 1. Rechaza un slug con formato inválido sin tocar la base.
 * 2. `IClienteRepository.findBySlug`.
 * 3. Rechaza si no existe, no está `activo`, está `isDeleted()` o no tiene el formulario
 *    habilitado (D12).
 * 4. `TenantContext.bind()` con el `dbName` y el `id` del cliente resuelto.
 *
 * Todo rechazo devuelve el MISMO `FormularioPublicoNoDisponibleError`: el 404 uniforme. El tenant
 * solo se bindea si el cliente pasó todos los filtros, y siempre con los datos de la fila de
 * master, nunca con un valor del caller.
 *
 * Ref design: ADR-1, ADR-5. Tarea: 12.3.
 */
@Injectable()
export class ResolverClientePublicoService {
  constructor(
    @Inject(CLIENTE_REPOSITORY) private readonly clienteRepo: IClienteRepository,
    private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    private readonly tenantContext: Pick<TenantContext, 'bind'>,
  ) {}

  async resolver(slug: string): Promise<Result<ClienteEntity, FormularioPublicoNoDisponibleError>> {
    if (typeof slug !== 'string' || slug.length > SLUG_MAX_LENGTH || !SLUG_REGEX.test(slug)) {
      return Result.fail(new FormularioPublicoNoDisponibleError());
    }

    const cliente = await this.clienteRepo.findBySlug(slug);
    if (
      !cliente ||
      !cliente.activo ||
      cliente.isDeleted() ||
      !cliente.formularioPublicoHabilitado
    ) {
      return Result.fail(new FormularioPublicoNoDisponibleError());
    }

    this.tenantContext.bind({
      prismaClient: this.prismaService.getTenantClient(cliente.dbName),
      dbName: cliente.dbName,
      clienteId: cliente.id,
    });

    return Result.ok(cliente);
  }
}
