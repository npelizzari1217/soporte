import { Result } from '../../../shared/domain/result';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import {
  MembresiaNoEncontradaError,
  PermisosPorTipoInvalidosError,
  PermisosPorTipoSinRestriccionError,
} from '../../domain/errors/auth.errors';
import { obtenerPresetDeRol } from '../../domain/presets-rol';
import {
  ACCIONES_TIPO_TICKET,
  AccionTipoTicket,
  accionesDeTipoDesdeCeldas,
  esAccionTipoTicket,
  problemaDeFilaDeTipo,
} from '../../../tickets/domain/permisos-tipo-ticket';
import {
  IPermisoTipoTicketRepository,
  TipoTicketDePermisos,
} from '../../../tickets/domain/ports/i-permiso-tipo-ticket.repository';

/** Rol (por membresía) que opera todos los tipos sin filas, igual que ROOT. */
const ROL_ADMINISTRADOR = 'ADMINISTRADOR';

/** Una fila de la grilla "Tipos de ticket" de Permisos (S5). */
export interface FilaPermisosPorTipo {
  tipoId: string;
  nombre: string;
  modulo: string;
  /** `false` para un tipo desactivado o dado de baja: sus filas siguen decidiendo (L24). */
  activo: boolean;
  /** Acciones concedidas al usuario sobre el tipo, en el orden del vocabulario. */
  acciones: AccionTipoTicket[];
  /**
   * Acciones que la plantilla del rol del usuario da sobre este tipo, con la traducción de L11
   * (D4). `null` si el rol no tiene plantilla definida.
   */
  plantilla: AccionTipoTicket[] | null;
}

/** Permisos por tipo de un usuario, tal como los edita el administrador. */
export interface PermisosPorTipoDeUsuario {
  /** ROOT o ADMINISTRADOR: opera todos los tipos y no tiene filas editables (`tipos` vacío). */
  sinRestriccion: boolean;
  rolCodigo: string;
  tipos: FilaPermisosPorTipo[];
}

/** Identifica al usuario editado; `clienteId` sale siempre del JWT del administrador. */
export interface UsuarioDelCliente {
  clienteId: string;
  usuarioId: string;
}

/** Acciones pedidas para un tipo en el reemplazo total. */
export interface FilaPedida {
  tipoId: string;
  acciones: string[];
}

/** Lo que se sabe del usuario editado antes de tocar sus filas. */
interface Destino {
  rolCodigo: string;
  sinRestriccion: boolean;
}

/** Ordena las acciones según el vocabulario, para respuestas estables. */
function enOrden(acciones: Iterable<AccionTipoTicket>): AccionTipoTicket[] {
  const conjunto = new Set(acciones);
  return ACCIONES_TIPO_TICKET.filter((accion) => conjunto.has(accion));
}

/**
 * PermisosPorTipoUsuarioTenantUseCase — Admin → Usuarios → Permisos → "Tipos de ticket"
 * (odd/tasks/permisos-por-tipo-ticket.md, T7, S1-S3, S5). `AdminClienteGuard` en el controller.
 *
 * Lee y reemplaza las filas (tipo, acción) del usuario en el tenant que `TenantGuard` dejó ligado
 * (D1): una edición se ve en el próximo request del usuario, sin refrescar el JWT (D5 a). El
 * usuario tiene que tener membresía ACTIVA en el cliente del token (404 si no, mismo aislamiento
 * que la matriz). ROOT y ADMINISTRADOR no tienen filas editables: operan todos los tipos.
 *
 * La plantilla del rol por fila la calcula el backend con `accionesDeTipoDesdeCeldas` (D4): es la
 * misma traducción que usan el alta de usuario y "Reaplicar plantilla del rol".
 */
export class PermisosPorTipoUsuarioTenantUseCase {
  constructor(
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>,
    private readonly usuarioRepo: Pick<IUsuarioRepository, 'findById'>,
    private readonly permisosRepo: Pick<
      IPermisoTipoTicketRepository,
      'listarPorUsuario' | 'reemplazarDeUsuario' | 'listarTiposConDetalle'
    >,
  ) {}

  /**
   * Una fila por tipo del tenant con las acciones del usuario y la plantilla de su rol.
   *
   * @param input Cliente del token y usuario editado.
   * @returns Los permisos por tipo del usuario, o 404 si no tiene membresía activa en el cliente.
   */
  async obtener(
    input: UsuarioDelCliente,
  ): Promise<Result<PermisosPorTipoDeUsuario, MembresiaNoEncontradaError>> {
    const destino = await this.resolver(input);
    if (!destino) return Result.fail(new MembresiaNoEncontradaError());
    return Result.ok(await this.armar(input.usuarioId, destino));
  }

  /**
   * Reemplaza todas las filas del usuario por las pedidas (reemplazo total, no fusiona). Un tipo
   * ausente del pedido queda sin acciones.
   *
   * @param input Cliente, usuario y acciones por tipo.
   * @returns Los permisos guardados; 404 sin membresía; 422 si el usuario es administrador o alguna
   *   fila no se puede guardar.
   */
  async reemplazar(
    input: UsuarioDelCliente & { tipos: FilaPedida[] },
  ): Promise<
    Result<
      PermisosPorTipoDeUsuario,
      | MembresiaNoEncontradaError
      | PermisosPorTipoSinRestriccionError
      | PermisosPorTipoInvalidosError
    >
  > {
    const destino = await this.resolver(input);
    if (!destino) return Result.fail(new MembresiaNoEncontradaError());
    if (destino.sinRestriccion)
      return Result.fail(new PermisosPorTipoSinRestriccionError('destino'));

    const tipos = await this.permisosRepo.listarTiposConDetalle();
    const problema = this.validar(input.tipos, tipos);
    if (problema) return Result.fail(problema);

    await this.permisosRepo.reemplazarDeUsuario(
      input.usuarioId,
      input.tipos.flatMap(({ tipoId, acciones }) =>
        enOrden(acciones.filter(esAccionTipoTicket)).map((accion) => ({ tipoId, accion })),
      ),
    );
    return Result.ok(await this.armar(input.usuarioId, destino, tipos));
  }

  /**
   * Reemplaza todas las filas del usuario por las de otro usuario del mismo cliente ("Copiar
   * permisos de otro usuario", S5).
   *
   * @param input Cliente, usuario editado y usuario de origen.
   * @returns Los permisos guardados; 404 si alguno no tiene membresía activa en el cliente; 422 si
   *   son el mismo usuario o alguno es administrador.
   */
  async copiarDe(
    input: UsuarioDelCliente & { origenId: string },
  ): Promise<
    Result<
      PermisosPorTipoDeUsuario,
      | MembresiaNoEncontradaError
      | PermisosPorTipoSinRestriccionError
      | PermisosPorTipoInvalidosError
    >
  > {
    if (input.origenId === input.usuarioId) {
      return Result.fail(
        new PermisosPorTipoInvalidosError(
          'No se pueden copiar los permisos de un usuario sobre sí mismo.',
        ),
      );
    }
    const destino = await this.resolver(input);
    if (!destino) return Result.fail(new MembresiaNoEncontradaError());
    const origen = await this.resolver({ clienteId: input.clienteId, usuarioId: input.origenId });
    if (!origen) return Result.fail(new MembresiaNoEncontradaError());
    if (destino.sinRestriccion)
      return Result.fail(new PermisosPorTipoSinRestriccionError('destino'));
    if (origen.sinRestriccion) return Result.fail(new PermisosPorTipoSinRestriccionError('origen'));

    const delOrigen = await this.permisosRepo.listarPorUsuario(input.origenId);
    await this.permisosRepo.reemplazarDeUsuario(
      input.usuarioId,
      [...delOrigen].flatMap(([tipoId, acciones]) =>
        enOrden(acciones).map((accion) => ({ tipoId, accion })),
      ),
    );
    return Result.ok(await this.armar(input.usuarioId, destino));
  }

  /** Rol y bypass del usuario en el cliente, o `null` sin membresía activa. */
  private async resolver(input: UsuarioDelCliente): Promise<Destino | null> {
    const membresia = await this.membresiaRepo.findActivaByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) return null;
    if (membresia.rolCodigo === ROL_ADMINISTRADOR) {
      return { rolCodigo: membresia.rolCodigo, sinRestriccion: true };
    }
    // ROOT es un flag del usuario, ortogonal al rol de la membresía.
    const usuario = await this.usuarioRepo.findById(input.usuarioId);
    return { rolCodigo: membresia.rolCodigo, sinRestriccion: usuario?.isGlobalAdmin === true };
  }

  /** Arma la respuesta con las filas actuales del usuario. */
  private async armar(
    usuarioId: string,
    destino: Destino,
    tiposConocidos?: TipoTicketDePermisos[],
  ): Promise<PermisosPorTipoDeUsuario> {
    if (destino.sinRestriccion) {
      return { sinRestriccion: true, rolCodigo: destino.rolCodigo, tipos: [] };
    }
    const tipos = tiposConocidos ?? (await this.permisosRepo.listarTiposConDetalle());
    const actuales = await this.permisosRepo.listarPorUsuario(usuarioId);
    const preset = obtenerPresetDeRol(destino.rolCodigo);
    const celdasDelRol = preset.isFail() ? null : preset.getValue();
    return {
      sinRestriccion: false,
      rolCodigo: destino.rolCodigo,
      tipos: tipos.map((tipo) => ({
        tipoId: tipo.id,
        nombre: tipo.nombre,
        modulo: tipo.modulo,
        activo: tipo.activo,
        acciones: enOrden(actuales.get(tipo.id) ?? []),
        plantilla:
          celdasDelRol === null
            ? null
            : enOrden(accionesDeTipoDesdeCeldas(celdasDelRol, tipo.modulo)),
      })),
    };
  }

  /** Primer problema del pedido, o `null` si todas las filas se pueden guardar. */
  private validar(
    pedidas: readonly FilaPedida[],
    tipos: readonly TipoTicketDePermisos[],
  ): PermisosPorTipoInvalidosError | null {
    const porId = new Map(tipos.map((tipo) => [tipo.id, tipo]));
    const vistos = new Set<string>();
    for (const { tipoId, acciones } of pedidas) {
      const tipo = porId.get(tipoId);
      if (!tipo) {
        return new PermisosPorTipoInvalidosError(`El tipo de ticket ${tipoId} no existe.`);
      }
      if (vistos.has(tipoId)) {
        return new PermisosPorTipoInvalidosError(
          `El tipo de ticket «${tipo.nombre}» aparece más de una vez.`,
        );
      }
      vistos.add(tipoId);

      const problema = problemaDeFilaDeTipo(acciones);
      if (problema?.tipo === 'desconocida') {
        return new PermisosPorTipoInvalidosError(
          `Acción desconocida en el tipo «${tipo.nombre}»: ${problema.acciones.join(', ')}.`,
        );
      }
      if (problema?.tipo === 'no-concedible') {
        return new PermisosPorTipoInvalidosError(
          `No se puede conceder ${problema.acciones.join(', ')} en el tipo «${tipo.nombre}»: ` +
            'borrar tickets todavía no existe.',
        );
      }
      if (problema?.tipo === 'sin-ver') {
        return new PermisosPorTipoInvalidosError(
          `Sin Ver no se puede conceder ninguna otra acción en el tipo «${tipo.nombre}» ` +
            `(se pidió ${problema.acciones.join(', ')}).`,
        );
      }
    }
    return null;
  }
}
