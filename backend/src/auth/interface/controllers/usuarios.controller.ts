/**
 * UsuariosController — entry point HTTP de la gestión mínima de usuarios del
 * tenant (sdd/beta-frontend/spec §5, desbloquea Fase 5 Beta frontend).
 *
 * Rutas (WU-7.3/7.4/7.6, sdd/matriz-permisos-por-usuario — R4/R4-excepción/R6/R10):
 *   GET    /usuarios                          → ListarUsuariosTenantUseCase   (TICKETS:ASIGNAR | TICKETS:VER_TODOS | ADMINISTRADOR-o-ROOT, regla OR — R4-excepción)
 *   POST   /usuarios                          → CrearUsuarioTenantUseCase     [AdminClienteGuard]
 *   PATCH  /usuarios/:id/rol                  → CambiarRolUsuarioTenantUseCase [AdminClienteGuard] (R6: `reaplicarPreset` opcional)
 *   PATCH  /usuarios/:id                      → EditarUsuarioTenantUseCase      [AdminClienteGuard]
 *   DELETE /usuarios/:id/membresia            → DesactivarMembresiaUsuarioTenantUseCase [AdminClienteGuard]
 *   GET    /usuarios/:id/permisos             → ObtenerPermisosUsuarioTenantUseCase [AdminClienteGuard] (ADR-P10)
 *   PATCH  /usuarios/:id/permisos             → AsignarPermisosUsuarioTenantUseCase [AdminClienteGuard] (ADR-P10, reemplazo total)
 *   POST   /usuarios/:id/permisos/aplicar-preset → AplicarPresetPermisosUseCase [AdminClienteGuard] (ADR-P9)
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` a nivel de controller (requieren JWT
 * válido y `cliente_id` resuelto). `AdminClienteGuard` POR MÉTODO (ADR-P5) en
 * los endpoints de gestión — reemplaza `PermissionsGuard`+`@RequirePermissions`.
 *
 * `GET /usuarios` NO usa `AdminClienteGuard` a nivel de clase porque su regla
 * es OR, no un simple admin-o-root (R4-excepción, S25): `TICKETS:ASIGNAR` O
 * `TICKETS:VER_TODOS` O ser ADMINISTRADOR/ROOT habilitan la lista básica
 * (selector de asignación / vista admin) — evaluado con `puedeEjecutarAlguna`,
 * que YA embebe el bypass de ROOT/ADMINISTRADOR (ADR-P11: `puedeEjecutar`
 * bypassea antes de mirar `permisos`). El `email` es el dato sensible (R10)
 * — se omite salvo que el actor sea ADMINISTRADOR o ROOT, INDEPENDIENTE de la
 * regla OR de acceso (`esAdminDeCliente`, no `puedeEjecutarAlguna`).
 *
 * ABM viejo RETIRADO (WU-7.6, cierre de la deviation declarada en la tanda
 * anterior): `GET/PATCH /usuarios/:id/modulos`, `ObtenerModulosUsuarioTenantUseCase`,
 * `AsignarModulosUsuarioTenantUseCase`, `IUsuarioClienteModuloRepository` y su
 * impl Prisma se eliminaron en el MISMO commit que la grilla nueva del
 * frontend (`asignar-permisos-control.tsx`) — mismo criterio atómico que
 * ADR-P8 aplicó al rename SOPORTE→TICKETS: dos ABMs escribiendo dos tablas,
 * una de ellas ya sin lectores de runtime, es una trampa activa, no una red
 * de rollback útil.
 *
 * Aislamiento estricto (spec §5): `clienteId` SIEMPRE es `actor.cliente_id`
 * (JWT, resuelto por `TenantGuard`) — NUNCA un valor de la request. Los DTOs
 * de entrada (`usuario-tenant.dto.ts`) ni siquiera declaran un campo
 * `clienteId` (el `ValidationPipe` global con `whitelist: true` lo
 * descartaría si llegara).
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException`.
 *
 * Ref spec: sdd/beta-frontend/spec §3 G2/G3 (GET), §5 (POST/PATCH/DELETE).
 * Ref: sdd/matriz-permisos-por-usuario/spec R6, R10. Ref design: ADR-P9, ADR-P10.
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ListarUsuariosTenantUseCase } from '../../application/use-cases/listar-usuarios-tenant.use-case';
import { CrearUsuarioTenantUseCase } from '../../application/use-cases/crear-usuario-tenant.use-case';
import { CambiarRolUsuarioTenantUseCase } from '../../application/use-cases/cambiar-rol-usuario-tenant.use-case';
import { EditarUsuarioTenantUseCase } from '../../application/use-cases/editar-usuario-tenant.use-case';
import { DesactivarMembresiaUsuarioTenantUseCase } from '../../application/use-cases/desactivar-membresia-usuario-tenant.use-case';
import { ObtenerPermisosUsuarioTenantUseCase } from '../../application/use-cases/obtener-permisos-usuario-tenant.use-case';
import { AsignarPermisosUsuarioTenantUseCase } from '../../application/use-cases/asignar-permisos-usuario-tenant.use-case';
import { AplicarPresetPermisosUseCase } from '../../application/use-cases/aplicar-preset-permisos.use-case';
import {
  AplicarPresetPermisosDto,
  AsignarPermisosDto,
  CambiarRolUsuarioDto,
  CreateUsuarioTenantDto,
  EditarUsuarioDto,
  PermisosUsuarioTenantResponseDto,
  UsuarioTenantMembresiaResponseDto,
  UsuarioTenantResponseDto,
} from '../dtos/usuario-tenant.dto';
import { MembresiaConUsuario } from '../../domain/ports/i-membresia.repository';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import {
  MembresiaNoEncontradaError,
  MembresiaYaActivaError,
} from '../../domain/errors/auth.errors';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../infrastructure/guards/admin-cliente.guard';
import { CurrentUser } from '../../infrastructure/guards/decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { puedeEjecutarAlguna, esAdminDeCliente } from '../../domain/permisos.util';
import { CATALOGO_MODULOS, CodigoAccion } from '../../../shared/domain/acciones';
import { DomainError } from '../../../shared/domain/result';

/**
 * Acciones que habilitan la lista BÁSICA de `GET /usuarios` (OR, no AND —
 * R4-excepción, S25). `puedeEjecutarAlguna` ya bypassea ROOT/ADMINISTRADOR
 * por construcción (ADR-P11): no hace falta un chequeo admin separado acá.
 */
const ACCIONES_LISTA_BASICA = ['TICKETS:ASIGNAR', 'TICKETS:VER_TODOS'];

function toListaResponseDto(
  item: MembresiaConUsuario,
  incluirEmail: boolean,
): UsuarioTenantResponseDto {
  return {
    id: item.usuarioId,
    nombre: item.nombre,
    apellido: item.apellido,
    rol: item.rolCodigo,
    ...(incluirEmail ? { email: item.email } : {}),
  };
}

function toMembresiaResponseDto(
  usuario: UsuarioEntity,
  membresia: MembresiaEntity,
  rolCodigo: string,
): UsuarioTenantMembresiaResponseDto {
  return {
    usuarioId: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    rol: rolCodigo,
    membresiaId: membresia.id,
    activo: membresia.activo,
  };
}

/** Mapea un `DomainError` de gestión de usuarios a la `HttpException` correspondiente. */
function toHttpException(
  error: DomainError,
): NotFoundException | ConflictException | UnprocessableEntityException {
  if (error instanceof MembresiaNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof MembresiaYaActivaError) {
    return new ConflictException(error.message);
  }
  // RolNoEncontradoError, CeldaPermisoInvalidaError, PresetRolNoDefinidoError:
  // input inválido del actor o gap de configuración del código → 422.
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly listarUsuariosTenantUseCase: ListarUsuariosTenantUseCase,
    private readonly crearUsuarioTenantUseCase: CrearUsuarioTenantUseCase,
    private readonly cambiarRolUsuarioTenantUseCase: CambiarRolUsuarioTenantUseCase,
    private readonly desactivarMembresiaUsuarioTenantUseCase: DesactivarMembresiaUsuarioTenantUseCase,
    private readonly editarUsuarioTenantUseCase: EditarUsuarioTenantUseCase,
    private readonly obtenerPermisosUsuarioTenantUseCase: ObtenerPermisosUsuarioTenantUseCase,
    private readonly asignarPermisosUsuarioTenantUseCase: AsignarPermisosUsuarioTenantUseCase,
    private readonly aplicarPresetPermisosUseCase: AplicarPresetPermisosUseCase,
  ) {}

  /**
   * GET /usuarios
   * Lista los usuarios con membresía ACTIVA en el cliente del token.
   * @throws 403 si el actor no tiene `TICKETS:ASIGNAR`, `TICKETS:VER_TODOS`
   *             NI es ADMINISTRADOR/ROOT (R4-excepción, S25)
   */
  @Get()
  async listar(@CurrentUser() actor: JwtPayload): Promise<UsuarioTenantResponseDto[]> {
    const tieneAccesoBasico = puedeEjecutarAlguna(actor, ACCIONES_LISTA_BASICA);
    if (!tieneAccesoBasico) {
      throw new ForbiddenException(
        `Acceso denegado: se requiere alguno de [${ACCIONES_LISTA_BASICA.join(', ')}]`,
      );
    }
    // R10: el email es INDEPENDIENTE de la regla OR de arriba. Un TECNICO con
    // TICKETS:ASIGNAR entra a la lista pero NUNCA recibe email — solo
    // ADMINISTRADOR/ROOT lo ven.
    const incluirEmail = esAdminDeCliente(actor);

    const result = await this.listarUsuariosTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
    });
    return result.getValue().map((item) => toListaResponseDto(item, incluirEmail));
  }

  /**
   * POST /usuarios
   * Crea un usuario global (si el email no existe) + su membresía en el
   * cliente del token. `clienteId` SIEMPRE es `actor.cliente_id`.
   * @throws 422 si `rolCodigo` no existe en el catálogo
   * @throws 409 si el usuario ya tiene una membresía activa en este cliente
   */
  @Post()
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateUsuarioTenantDto,
  ): Promise<UsuarioTenantMembresiaResponseDto> {
    const result = await this.crearUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      password: dto.password,
      rolCodigo: dto.rolCodigo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { usuario, membresia, rolCodigo } = result.getValue();
    return toMembresiaResponseDto(usuario, membresia, rolCodigo);
  }

  /**
   * PATCH /usuarios/:id/rol
   * Cambia el rol de la membresía del usuario `:id` EN EL CLIENTE DEL TOKEN.
   * `reaplicarPreset` (R6, opcional): con `true`, SOBRESCRIBE la matriz del
   * usuario con el preset del rol destino — SIN el flag (default), la matriz
   * queda intacta (S13/S14).
   * @throws 404 si no existe membresía de ese usuario en este cliente
   * @throws 422 si `rolCodigo` no existe en el catálogo, o (con
   *             `reaplicarPreset: true`) si el rol destino no tiene preset
   *             definido en `PRESETS_ROL`
   */
  @Patch(':id/rol')
  @UseGuards(AdminClienteGuard)
  async cambiarRol(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
    @Body() dto: CambiarRolUsuarioDto,
  ): Promise<{ usuarioId: string; rol: string; membresiaId: string; activo: boolean }> {
    const result = await this.cambiarRolUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
      rolCodigo: dto.rolCodigo,
      reaplicarPreset: dto.reaplicarPreset,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const membresia = result.getValue();
    return {
      usuarioId: membresia.usuarioId,
      rol: dto.rolCodigo,
      membresiaId: membresia.id,
      activo: membresia.activo,
    };
  }

  /**
   * PATCH /usuarios/:id
   * Edita nombre y/o apellido del usuario `:id` (identidad GLOBAL: afecta al
   * usuario en TODOS sus tenants). El `email` NO es editable. Solo se permite
   * si el usuario tiene membresía ACTIVA en el cliente del token (aislamiento).
   * Permiso `usuario:gestionar` (ADMINISTRADOR lo tiene; ROOT bypassa el guard).
   * @throws 404 si no existe membresía activa de ese usuario en este cliente
   */
  @Patch(':id')
  @UseGuards(AdminClienteGuard)
  async editar(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
    @Body() dto: EditarUsuarioDto,
  ): Promise<{ usuarioId: string; nombre: string; apellido: string }> {
    const result = await this.editarUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
      nombre: dto.nombre,
      apellido: dto.apellido,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const usuario = result.getValue();
    return { usuarioId: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido };
  }

  /**
   * DELETE /usuarios/:id/membresia
   * Desactiva la membresía del usuario `:id` EN EL CLIENTE DEL TOKEN (no
   * borra el usuario global).
   * @throws 404 si no existe membresía de ese usuario en este cliente
   */
  @Delete(':id/membresia')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async desactivarMembresia(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
  ): Promise<void> {
    const result = await this.desactivarMembresiaUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  // ─── ABM de la matriz de permisos (WU-7.4, ADR-P9/ADR-P10) ────────────────

  /**
   * GET /usuarios/:id/permisos
   * Celdas de la matriz del usuario `:id` EN EL CLIENTE DEL TOKEN, más
   * `esAdministrador` (grilla toda tildada y deshabilitada, R2) y el
   * `catalogo` completo para que el frontend arme la grilla sin otra llamada.
   * @throws 404 si no existe membresía ACTIVA de ese usuario en este cliente
   */
  @Get(':id/permisos')
  @UseGuards(AdminClienteGuard)
  async obtenerPermisos(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
  ): Promise<PermisosUsuarioTenantResponseDto> {
    const result = await this.obtenerPermisosUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { celdas, esAdministrador } = result.getValue();
    // El puerto tipa `string[]` a propósito (ADR-P10: el dominio de auth no
    // importa el catálogo para tipar persistencia) — las celdas ya vienen
    // validadas contra PARES_VALIDOS (DTO + CHECK), el cast es seguro acá,
    // en la capa de presentación (mismo criterio que `derivarModulos` en
    // resolver-scope.ts).
    return {
      celdas: celdas as CodigoAccion[],
      esAdministrador,
      catalogo: CATALOGO_MODULOS,
    };
  }

  /**
   * PATCH /usuarios/:id/permisos
   * Reemplaza el set COMPLETO de celdas del usuario `:id` EN EL CLIENTE DEL
   * TOKEN (ADR-P10, semántica de reemplazo total — no fusiona).
   * @throws 404 si no existe membresía ACTIVA de ese usuario en este cliente
   * @throws 422 si algún código de `celdas` no pertenece al catálogo
   *             (defensa en profundidad, detrás del `@IsIn` del DTO)
   */
  @Patch(':id/permisos')
  @UseGuards(AdminClienteGuard)
  async asignarPermisos(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
    @Body() dto: AsignarPermisosDto,
  ): Promise<{ usuarioId: string; celdas: string[] }> {
    const result = await this.asignarPermisosUsuarioTenantUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
      celdas: dto.celdas,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return { usuarioId, celdas: result.getValue() };
  }

  /**
   * POST /usuarios/:id/permisos/aplicar-preset
   * Copia la plantilla de permisos del rol `rolCodigo` sobre la matriz del
   * usuario `:id` EN EL CLIENTE DEL TOKEN (ADR-P9) — acción explícita de UI
   * ("copiar plantilla"), independiente de `PATCH /usuarios/:id/rol`.
   * SOBRESCRIBE, no fusiona.
   * @throws 422 si `rolCodigo` no tiene preset definido en `PRESETS_ROL`
   *             (gap de configuración del código, nunca aplica un set vacío
   *             en silencio)
   */
  @Post(':id/permisos/aplicar-preset')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.OK)
  async aplicarPresetPermisos(
    @CurrentUser() actor: JwtPayload,
    @Param('id') usuarioId: string,
    @Body() dto: AplicarPresetPermisosDto,
  ): Promise<{ usuarioId: string; rolCodigo: string }> {
    // `sobrescribir: true` (W11): este endpoint EXISTE para aplicar el preset,
    // así que pedirlo ya es la intención explícita. Es una de las dos puertas
    // por las que una matriz ajustada a mano se reemplaza; la otra es
    // `PATCH /usuarios/:id/rol` con `reaplicarPreset`.
    const result = await this.aplicarPresetPermisosUseCase.execute({
      clienteId: actor.cliente_id as string,
      usuarioId,
      rolCodigo: dto.rolCodigo,
      sobrescribir: true,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return { usuarioId, rolCodigo: dto.rolCodigo };
  }
}
