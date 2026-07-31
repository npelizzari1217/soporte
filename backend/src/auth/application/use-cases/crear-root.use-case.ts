import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RootRequeridoError, UsuarioConflictError } from '../../domain/errors/auth.errors';

/** DTO de entrada para CrearRootUseCase. */
export interface CrearRootDto {
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  /** Tenant de origen — resuelto server-side desde TenantContext (D7), NUNCA del body. */
  clienteId: string;
  /** Identidad del actor — authz de aplicación independiente del guard (defensa en profundidad, R7). */
  actor: { id: string; isRoot: boolean };
}

/**
 * CrearRootUseCase — crea un usuario con isGlobalAdmin=true.
 *
 * Único camino de aplicación que eleva el flag isGlobalAdmin (POST /usuarios,
 * vía CrearUsuarioUseCase, lo fuerza SIEMPRE a false — R2 escenario CRÍTICO).
 *
 * AuthZ en DOS lugares (R7/Dz2):
 * 1. GlobalAdminGuard en la capa de presentación (UsuariosController).
 * 2. actor.isRoot revalidado ACÁ, en aplicación — independiente del guard.
 *    Si el guard se removiera por error, este use case igual rechaza.
 *
 * El root se crea SIN rol RBAC (roles: []) — refuerza la ortogonalidad
 * (Dz1: ser root no implica ser ADMINISTRADOR).
 *
 * Auditoría (spec R2 "MUST ... auditarse (actor, objetivo, timestamp)"): tras
 * persistir exitosamente, se registra un evento de auditoría vía el puerto
 * `ILogger.log()` — mecanismo reusado (mismo puerto que
 * `crear-observacion.use-case.ts`/`transicionar-estado.use-case.ts`, mismo
 * formato estructurado que `TenantGuard.resolveCrossTenant`
 * `"EVENTO | campo=valor | ... | at=ISO"`). Solo en el camino de ÉXITO, DESPUÉS
 * de `usuarioRepo.create` (el timestamp debe reflejar la creación real, no un
 * intento) — NUNCA en el camino de rechazo (RootRequeridoError/
 * UsuarioConflictError): no hay precedente en el repo de auditar intentos
 * fallidos para esta acción, y la auditoría nunca debe ser lo que decide el
 * resultado de la operación. El email del objetivo es dato auditable legítimo
 * (no se enmascara); el password NUNCA se incluye en el mensaje.
 *
 * El `logger.log` de auditoría corre POST-COMMIT (el root ya está persistido
 * vía `usuarioRepo.create`, paso 5) — un throw ahí nunca puede "revertir"
 * nada, solo tumbaría una respuesta que ya debería ser 200/201. Por eso se
 * envuelve en try/catch log-and-swallow (mismo patrón que el guard post-commit
 * de `crear-observacion.use-case.ts`/`transicionar-estado.use-case.ts`,
 * Judgment Day PR4 Ronda 1): si el logger falla, se traga el error y
 * `execute()` retorna igual el `Result.ok` ya obtenido. A diferencia de esos
 * use cases, acá la operación que puede fallar ES el logger mismo, así que
 * no hay un segundo canal (`logger.error`) al que reportar sin arriesgar otro
 * throw — el catch queda deliberadamente vacío.
 *
 * Spec ref: root-tenant-admin R2, R7 (Dz2)
 * Tarea: B.4; Judgment Day root-tenant-admin PR-B Ronda 1 (FIX 1), Ronda 2 (FIX 2)
 */
export class CrearRootUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly hashProvider: IHashProvider,
    private readonly logger: ILogger,
  ) {}

  async execute(dto: CrearRootDto): Promise<Result<UsuarioEntity, DomainError>> {
    // 1. AuthZ de aplicación — independiente del guard (R7).
    if (!dto.actor.isRoot) {
      return Result.fail(new RootRequeridoError());
    }

    // 2. Unicidad del email
    const existing = await this.usuarioRepo.findByEmail(dto.email);
    if (existing) {
      return Result.fail(new UsuarioConflictError(dto.email));
    }

    // 3. Entidad root: isGlobalAdmin=true, SIN rol RBAC (ortogonalidad, R1)
    const entity = UsuarioEntity.create({
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      passwordHash: '', // placeholder — sobreescrito por hashPassword()
      clienteId: dto.clienteId,
      activo: true,
      isGlobalAdmin: true,
      roles: [],
    });

    // 4. Hash argon2id
    await entity.hashPassword(dto.password, this.hashProvider);

    // 5. Persistir
    await this.usuarioRepo.create(entity);

    // 6. Auditar (actor, objetivo, timestamp) — SOLO camino de éxito, R2.
    //    Guard post-commit (Judgment Day PR-B Ronda 2): el root YA está
    //    persistido acá — si el logger lanza, se traga (log-and-swallow, sin
    //    relanzar) para que la respuesta siga siendo el Result.ok ya obtenido.
    try {
      this.logger.log(
        `ROOT CREADO | actor=${dto.actor.id} | objetivo=${entity.email} | at=${new Date().toISOString()}`,
      );
    } catch {
      // Deliberadamente vacío: la auditoría nunca debe decidir el resultado
      // de la operación (docblock de la clase). No hay segundo canal seguro
      // al que reportar (el propio logger es el que falló).
    }

    return Result.ok(entity);
  }
}
