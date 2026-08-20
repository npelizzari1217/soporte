import { DomainError, Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IClienteEmailConfigRepository } from '../../domain/ports/i-cliente-email-config.repository';

/** Cliente + resumen MÍNIMO de correo (D7, decisión #2359 — ver docblock de la clase). */
export interface ClienteConCorreoResumen {
  cliente: ClienteEntity;
  correo: { configurado: boolean; verificadoAt: Date | null };
}

/**
 * ListarClientesUseCase — lista TODOS los clientes (tenants) de la
 * plataforma. Cierra el gap G3 parcial (sdd/beta-frontend/spec §3): admin de
 * plataforma y switcher de ROOT. Restringido a ROOT en la capa de
 * presentación (`GlobalAdminGuard` en `ClientesController`, ya exclusivo de
 * `is_global_admin` para TODO el controller) — este use case no revalida el
 * actor porque no recibe ninguno (a diferencia de `CrearClienteUseCase`, que
 * sí lo hace como defensa en profundidad al mutar estado).
 *
 * Enriquece cada cliente con un resumen MÍNIMO de correo (`configurado` +
 * `verificadoAt`, nunca host/user/from/password) — decisión #2359: el estado
 * "correo no configurado" tiene que ser VISIBLE en el listado, no solo
 * descubrible abriendo la ficha de cada cliente uno por uno. `findState()`
 * es de solo lectura (nunca toca `smtp_config_updated_at`, la revisión de
 * caché de WU5) — enriquecer el listado no invalida ningún transporter.
 *
 * Ref spec: sdd/beta-frontend/spec §3 G3 (parcial — clientes);
 *   sdd/configuracion-correo-por-cliente/spec "Explicit no-send for
 *   unconfigured tenant" (visibilidad, decisión #2359).
 * Ref design: ADR-5; sdd/configuracion-correo-por-cliente D7.
 */
export class ListarClientesUseCase {
  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findAll'>,
    private readonly emailConfigRepo: Pick<IClienteEmailConfigRepository, 'findState'>,
  ) {}

  async execute(): Promise<Result<ClienteConCorreoResumen[], DomainError>> {
    const clientes = await this.clienteRepo.findAll();

    const conCorreo = await Promise.all(
      clientes.map(async (cliente) => {
        const estado = await this.emailConfigRepo.findState(cliente.id);
        return {
          cliente,
          correo: { configurado: estado.configurado, verificadoAt: estado.verificadoAt },
        };
      }),
    );

    return Result.ok(conCorreo);
  }
}
