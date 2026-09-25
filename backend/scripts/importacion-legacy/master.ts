/**
 * master.ts — lectura y escritura del lado MASTER del cargador: cliente
 * destino, usuarios globales, membresías, celdas de la matriz de permisos y
 * ciclos vigentes.
 *
 * Estas escrituras NO pueden compartir la transacción del tenant (son otra
 * base), así que cada una es idempotente: una segunda corrida encuentra lo
 * que creó la primera y no duplica nada. No pasa por ningún caso de uso: sin
 * eventos de dominio, sin correos.
 */
import type { MasterPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';
import { obtenerPresetDeRol } from '../../src/auth/domain/presets-rol';
import { DomainError, Result } from '../../src/shared/domain/result';
import { fechaDia } from './paquete';
import type { CicloExistente, PlanCiclo, PlanUsuario, UsuarioExistente } from './plan';
import type { UsuarioPaquete } from './paquete';

type Master = InstanceType<typeof MasterPrismaClient>;

/**
 * Hash imposible de verificar: no tiene formato argon2, así que
 * `Argon2HashProvider.verify()` devuelve false para cualquier contraseña. Es
 * la forma de "sin acceso" que conserva `activo = true`: un usuario inactivo
 * no puede recibir contraseña por el reset de administrador
 * (`UsuarioNoDisponibleError`), y no hay pantalla para reactivar la cuenta
 * global. Así, dar acceso más tarde es solo establecerle una contraseña.
 */
export const PASSWORD_HASH_SIN_ACCESO = '!sin-acceso:importacion-legacy';

/** Largo de `usuarios.nombre` (VarChar(100)). */
const LARGO_NOMBRE = 100;

export interface ClienteDestino {
  id: string;
  nombre: string;
  dbName: string;
}

export class ClienteNoResueltoError extends DomainError {
  readonly code = 'CLIENTE_NO_RESUELTO';
  constructor(nombre: string, encontrados: number) {
    super(
      `El nombre "${nombre}" coincide con ${encontrados} clientes vigentes; se exige exactamente 1.`,
    );
  }
}

/** El nombre tiene que coincidir EXACTO con un único cliente no borrado. */
export async function resolverCliente(
  master: Master,
  nombre: string,
): Promise<Result<ClienteDestino, ClienteNoResueltoError>> {
  const filas = await master.cliente.findMany({
    where: { nombre, deletedAt: null },
    select: { id: true, nombre: true, dbName: true },
  });
  if (filas.length !== 1) return Result.fail(new ClienteNoResueltoError(nombre, filas.length));
  return Result.ok(filas[0]);
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function leerUsuariosExistentes(
  master: Master,
  emails: string[],
  clienteId: string,
): Promise<UsuarioExistente[]> {
  if (emails.length === 0) return [];
  const filas = await master.usuario.findMany({
    where: {
      OR: emails.map((e) => ({ email: { equals: e.trim(), mode: 'insensitive' as const } })),
    },
    select: {
      id: true,
      email: true,
      // Las borradas cuentan como inactivas: el cargador nunca reactiva una baja.
      membresias: { where: { clienteId }, select: { activo: true, deletedAt: true, rol: true } },
    },
  });
  return filas.map((f) => ({
    id: f.id,
    email: f.email,
    membresiasEnCliente: f.membresias.map((m) => ({
      rolCodigo: m.rol.codigo,
      activo: m.activo && m.deletedAt === null,
    })),
  }));
}

export async function leerCiclosVigentes(master: Master): Promise<CicloExistente[]> {
  const filas = await master.cicloVigente.findMany({ where: { deletedAt: null } });
  return filas.map((f) => ({
    id: f.id,
    fechaInicio: dia(f.fechaInicio),
    fechaFin: dia(f.fechaFin),
    activo: f.activo,
  }));
}

/** Roles del paquete que no existen en el catálogo master: bloquean `--aplicar`. */
export async function leerRoles(master: Master): Promise<Map<string, string>> {
  const roles = await master.role.findMany({ where: { deletedAt: null } });
  return new Map(roles.map((r) => [r.codigo, r.id]));
}

export interface ResultadoMaster {
  usuarioIdPorLegacy: Map<string, string>;
  vigenteIdPorLegacy: Map<string, string>;
  usuariosCreados: number;
  membresiasAgregadas: number;
  vigentesCreados: number;
}

export async function aplicarMaster(
  master: Master,
  cliente: ClienteDestino,
  usuarios: UsuarioPaquete[],
  planUsuarios: PlanUsuario[],
  planCiclos: PlanCiclo[],
  roles: Map<string, string>,
): Promise<ResultadoMaster> {
  const r: ResultadoMaster = {
    usuarioIdPorLegacy: new Map(),
    vigenteIdPorLegacy: new Map(),
    usuariosCreados: 0,
    membresiasAgregadas: 0,
    vigentesCreados: 0,
  };
  const nombrePorLegacy = new Map(usuarios.map((u) => [String(u.legacyId), u.nombre]));
  const apellidoPorLegacy = new Map(usuarios.map((u) => [String(u.legacyId), u.apellido ?? '']));

  for (const p of planUsuarios) {
    let usuarioId = p.usuarioId;
    if (p.accion === 'crear') {
      // upsert con `update: {}`: si otra corrida ya lo creó, no se toca nada.
      const fila = await master.usuario.upsert({
        where: { email: p.email },
        update: {},
        create: {
          email: p.email,
          nombre: (nombrePorLegacy.get(p.legacyId) ?? p.email).slice(0, LARGO_NOMBRE),
          apellido: (apellidoPorLegacy.get(p.legacyId) ?? '').trim().slice(0, LARGO_NOMBRE),
          passwordHash: PASSWORD_HASH_SIN_ACCESO,
          activo: true,
          isGlobalAdmin: false,
        },
      });
      usuarioId = fila.id;
      r.usuariosCreados += 1;
    }
    if (usuarioId === null) throw new Error(`usuario legacy ${p.legacyId} sin id resuelto`);
    r.usuarioIdPorLegacy.set(p.legacyId, usuarioId);
    if (p.membresia === 'agregar') {
      await agregarMembresia(master, usuarioId, cliente.id, p.rol, roles);
      r.membresiasAgregadas += 1;
    }
  }

  for (const c of planCiclos) {
    if (c.vigente.accion === 'reusar') {
      r.vigenteIdPorLegacy.set(c.legacyId, c.vigente.id);
      continue;
    }
    const fila = await master.cicloVigente.create({
      data: {
        nombre: c.nombre,
        fechaInicio: fechaDia(c.fechaInicio),
        fechaFin: fechaDia(c.fechaFin),
        // Un ciclo histórico no es el vigente de nadie: no se activa.
        activo: false,
      },
    });
    r.vigenteIdPorLegacy.set(c.legacyId, fila.id);
    r.vigentesCreados += 1;
  }
  return r;
}

/**
 * Membresía activa con el rol del paquete y, si el usuario no tiene ninguna
 * celda en este cliente, el preset del rol — lo mismo que hace el alta normal
 * (`CrearUsuarioTenantUseCase` con `sobrescribir: false`). Sin el preset, el
 * día que se le dé acceso quedaría con 403 en todo.
 */
async function agregarMembresia(
  master: Master,
  usuarioId: string,
  clienteId: string,
  rolCodigo: string,
  roles: Map<string, string>,
): Promise<void> {
  const rolId = roles.get(rolCodigo);
  if (rolId === undefined) throw new Error(`rol ${rolCodigo} inexistente en master`);
  await master.membresia.upsert({
    where: { usuarioId_clienteId_rolId: { usuarioId, clienteId, rolId } },
    update: {},
    create: { usuarioId, clienteId, rolId, activo: true },
  });
  const celdas = await master.usuarioClientePermiso.count({ where: { usuarioId, clienteId } });
  if (celdas > 0) return;
  const preset = obtenerPresetDeRol(rolCodigo).getOrThrow();
  await master.usuarioClientePermiso.createMany({
    data: preset.map((codigo) => {
      const [modulo, accion] = codigo.split(':');
      return { usuarioId, clienteId, modulo, accion };
    }),
    skipDuplicates: true,
  });
}
