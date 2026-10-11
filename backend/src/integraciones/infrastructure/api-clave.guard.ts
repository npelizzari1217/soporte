/**
 * ApiClaveGuard — autenticacion de la API publica por clave (sdd/api-publica, CA3, CA4, CA8).
 *
 * Lee la clave SOLO del header `X-Api-Key`, la hashea (sha256) y busca la fila por hash unico.
 * Cualquier motivo de rechazo responde el MISMO 401 (mismo status y cuerpo, sin pista): clave
 * ausente o mal formada, desconocida, revocada, cliente inactivo o borrado, API deshabilitada,
 * usuario de integracion ausente o inactivo, membresia inactiva. El motivo real solo sale por el
 * log del servidor, sin la clave ni su hash.
 *
 * Timing: la unica comparacion dependiente del secreto es la busqueda por indice unico del hash
 * sha256 en Postgres; no se compara la clave en claro con `===` en ningun punto.
 *
 * Al autenticar, bindea `TenantContext` igual que `TenantGuard` (cliente en master +
 * `getTenantClient`) y deja en `request.user` un actor sintetico con forma de `JwtPayload`, de
 * modo que `AccionesGuard` y los casos de uso existentes lo traten como a cualquier usuario:
 * - `sub` = usuario de integracion; `rol` = siempre `USUARIO`, nunca el de su membresia (un
 *   ADMINISTRADOR pasa todo par valido en `puedeEjecutar`; la clave saltearia su subconjunto de
 *   permisos si alguien cambia el rol del usuario de integracion); `modulos` = ['TICKETS'].
 * - `permisos` = los de la clave, mas `TICKETS:VER_TODOS` si lleva `TICKETS:LECTURA`: una clave
 *   de lectura ve todos los tickets del cliente, no solo los "propios" del usuario tecnico.
 * Tambien deja `request.apiClave = { id, prefijo }` para el limite por clave.
 *
 * `ultimoUsoAt` se actualiza como mucho una vez por clave cada 60 s y sin esperar: un fallo ahi
 * nunca hace fallar el pedido.
 */
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtPayload, VERSION_PAYLOAD_JWT } from '../../auth/domain/ports/i-token.service';
import {
  IMembresiaRepository,
  MEMBRESIA_REPOSITORY,
} from '../../auth/domain/ports/i-membresia.repository';
import {
  IUsuarioRepository,
  USUARIO_REPOSITORY,
} from '../../auth/domain/ports/i-usuario.repository';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../../clientes/domain/ports/i-cliente.repository';
import { ILogger, LOGGER } from '../../shared/domain/ports/i-logger.port';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { API_CLAVE_REPOSITORY, IApiClaveRepository } from '../domain/api-clave-repository.port';
import { hashearClaveApi, PREFIJO_CLAVE_API } from '../domain/generar-clave-api';

export const HEADER_API_KEY = 'x-api-key';
/** Intervalo minimo entre dos escrituras de `ultimoUsoAt` de una misma clave. */
export const INTERVALO_USO_MS = 60_000;
const LARGO_MAXIMO_CLAVE = 128;
const PERMISO_LECTURA = 'TICKETS:LECTURA';
const PERMISO_VER_TODOS = 'TICKETS:VER_TODOS';
/** Rol fijo del actor sintetico: sin privilegio por rol, solo cuentan los permisos de la clave. */
const ROL_ACTOR_API = 'USUARIO';

/** Identidad de la clave que autentico el pedido (para el limite por clave y el uso). */
export interface ApiClaveAutenticada {
  id: string;
  prefijo: string;
}

interface PedidoApi {
  headers: Record<string, string | string[] | undefined>;
  user?: JwtPayload | null;
  apiClave?: ApiClaveAutenticada;
}

@Injectable()
export class ApiClaveGuard implements CanActivate {
  /** Ultima escritura de `ultimoUsoAt` por id de clave (memoria de un solo proceso). */
  private readonly ultimoRegistro = new Map<string, number>();

  constructor(
    @Inject(API_CLAVE_REPOSITORY)
    private readonly claves: Pick<IApiClaveRepository, 'buscarPorHash' | 'registrarUso'>,
    @Inject(CLIENTE_REPOSITORY) private readonly clientes: Pick<IClienteRepository, 'findById'>,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: Pick<IUsuarioRepository, 'findById'>,
    @Inject(MEMBRESIA_REPOSITORY)
    private readonly membresias: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>,
    @Inject(PrismaService) private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    @Inject(TenantContext) private readonly tenantContext: Pick<TenantContext, 'bind'>,
    @Inject(LOGGER) private readonly logger: Pick<ILogger, 'log'>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PedidoApi>();

    const clave = this.leerClave(request);
    if (clave === null) return this.rechazar('clave ausente o mal formada');

    const fila = await this.claves.buscarPorHash(hashearClaveApi(clave));
    if (!fila) return this.rechazar('clave desconocida');
    if (fila.revocadaAt) return this.rechazar('clave revocada', fila.id);

    const cliente = await this.clientes.findById(fila.clienteId);
    if (!cliente || !cliente.activo || cliente.isDeleted()) {
      return this.rechazar('cliente inexistente, inactivo o borrado', fila.id);
    }
    if (!cliente.apiHabilitada) return this.rechazar('API deshabilitada para el cliente', fila.id);

    const usuario = await this.usuarios.findById(fila.usuarioId);
    if (!usuario || usuario.isDeleted() || !usuario.activo) {
      return this.rechazar('usuario de integracion ausente o inactivo', fila.id);
    }
    const membresia = await this.membresias.findActivaByUsuarioYCliente(usuario.id, cliente.id);
    if (!membresia) return this.rechazar('membresia de integracion inactiva', fila.id);

    this.tenantContext.bind({
      prismaClient: this.prismaService.getTenantClient(cliente.dbName),
      dbName: cliente.dbName,
      clienteId: cliente.id,
    });

    const permisos: string[] = [...fila.permisos];
    if (permisos.includes(PERMISO_LECTURA)) permisos.push(PERMISO_VER_TODOS);
    request.user = {
      v: VERSION_PAYLOAD_JWT,
      sub: usuario.id,
      cliente_id: cliente.id,
      rol: ROL_ACTOR_API,
      permisos,
      is_global_admin: false,
      cliente_nombre: cliente.nombre,
      membresias: [],
      modulos: ['TICKETS'],
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      cliente_logo_v: null,
    };
    request.apiClave = { id: fila.id, prefijo: fila.prefijo };

    this.registrarUsoSinEsperar(fila.id);
    return true;
  }

  private leerClave(request: PedidoApi): string | null {
    const valor = request.headers[HEADER_API_KEY];
    if (typeof valor !== 'string') return null;
    if (!valor.startsWith(PREFIJO_CLAVE_API) || valor.length > LARGO_MAXIMO_CLAVE) return null;
    return valor;
  }

  /** Mismo 401 para todo motivo; el motivo real solo va al log (nunca la clave ni su hash). */
  private rechazar(motivo: string, claveId?: string): never {
    this.logger.log(`API KEY RECHAZADA | motivo=${motivo}${claveId ? ` | clave=${claveId}` : ''}`);
    throw new UnauthorizedException('No autorizado');
  }

  private registrarUsoSinEsperar(claveId: string): void {
    const ahora = Date.now();
    const previo = this.ultimoRegistro.get(claveId);
    if (previo !== undefined && ahora - previo < INTERVALO_USO_MS) return;
    this.ultimoRegistro.set(claveId, ahora);
    this.claves.registrarUso(claveId, new Date(ahora)).catch(() => {
      // Best-effort: el ultimo uso es informativo. Se reintenta en el proximo pedido.
      this.ultimoRegistro.delete(claveId);
    });
  }
}
