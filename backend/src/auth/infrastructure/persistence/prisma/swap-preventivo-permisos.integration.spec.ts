/**
 * swap-preventivo-permisos.integration.spec.ts — WU-1 (preventivo-edicion-y-permisos).
 *
 * Corre el backfill histórico `20260825120100_backfill_preventivo_permisos`
 * (deja al TECNICO con las cuatro celdas `PREVENTIVO:*`, como en producción)
 * y después el swap `20260831120000_swap_preventivo_permisos_colaborador`
 * sobre un fixture propio de `soporte_master_test`, y verifica el resultado
 * celda por celda:
 *
 * - TECNICO pierde las cuatro celdas `PREVENTIVO:*` — el DELETE NO filtra
 *   `activo` (design ADR-3: revocar es total) — y conserva las celdas de
 *   otros módulos. Cubierto con un TECNICO de membresía activa Y uno de
 *   membresía inactiva: los dos pierden las cuatro celdas por igual.
 * - COLABORADOR con membresía ACTIVA gana las cuatro.
 * - COLABORADOR con membresía INACTIVA no gana nada — el INSERT filtra
 *   `activo = true AND deleted_at IS NULL`.
 * - ADMINISTRADOR y USUARIO quedan intactos (matriz vacía).
 * - Un mismo usuario, TECNICO en un tenant y COLABORADOR en otro, se
 *   resuelve correctamente en cada uno — el JOIN es por
 *   `(usuario_id, cliente_id)`, no por `usuario_id` solo (design ADR-3).
 * - Correr el swap dos veces deja el mismo resultado (idempotencia: PK
 *   compuesta + `ON CONFLICT DO NOTHING` en el INSERT).
 *
 * Patrón: `backfill-preventivo-permisos.integration.spec.ts`.
 *
 * Ref tasks: preventivo-edicion-y-permisos/tasks WU-1.2, WU-1.3. Ref design: ADR-3.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const BACKFILL_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260825120100_backfill_preventivo_permisos/migration.sql',
);
const SWAP_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260831120000_swap_preventivo_permisos_colaborador/migration.sql',
);

const CELDAS_PREVENTIVO = [
  'PREVENTIVO:LECTURA',
  'PREVENTIVO:ALTAS',
  'PREVENTIVO:MODIFICACION',
  'PREVENTIVO:BORRADO',
].sort();

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Swap de permisos PREVENTIVO:* a COLABORADOR (WU-1)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let clienteAId: string;
  let clienteBId: string;
  const usuarioIds: Record<string, string> = {};
  const rolIds: Record<string, string> = {};

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE usuario_cliente_permisos, membresias, refresh_tokens, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );

    const clienteA = ClienteEntity.create({
      nombre: 'Cliente swap PREVENTIVO A',
      razonSocial: null,
      cuit: null,
      dbName: 'test_swap_preventivo_a',
      activo: true,
    });
    await clienteRepo.save(clienteA);
    clienteAId = clienteA.id;

    const clienteB = ClienteEntity.create({
      nombre: 'Cliente swap PREVENTIVO B',
      razonSocial: null,
      cuit: null,
      dbName: 'test_swap_preventivo_b',
      activo: true,
    });
    await clienteRepo.save(clienteB);
    clienteBId = clienteB.id;

    for (const codigo of ['ADMINISTRADOR', 'TECNICO', 'COLABORADOR', 'USUARIO']) {
      const rol = await masterClient.role.create({ data: { codigo, nombre: codigo } });
      rolIds[codigo] = rol.id;
    }

    async function crearUsuario(suffix: string): Promise<string> {
      const usuario = UsuarioEntity.create({
        email: `swap-preventivo-${suffix}@integration.test`,
        nombre: 'Test',
        apellido: 'Swap',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
        activo: true,
        isGlobalAdmin: false,
      });
      await usuarioRepo.save(usuario);
      usuarioIds[suffix] = usuario.id;
      return usuario.id;
    }

    async function crearMembresia(
      usuarioId: string,
      clienteId: string,
      rolCodigo: string,
      activo: boolean,
    ): Promise<void> {
      await masterClient.membresia.create({
        data: { usuarioId, clienteId, rolId: rolIds[rolCodigo], activo },
      });
    }

    // TECNICO simple, un solo tenant. Se le agrega una celda de otro módulo
    // para probar que el DELETE no la toca (filtra modulo = 'PREVENTIVO').
    const tecnicoId = await crearUsuario('tecnico');
    await crearMembresia(tecnicoId, clienteAId, 'TECNICO', true);
    await masterClient.usuarioClientePermiso.create({
      data: { usuarioId: tecnicoId, clienteId: clienteAId, modulo: 'TICKETS', accion: 'LECTURA' },
    });

    // TECNICO con membresía INACTIVA que YA tiene las cuatro celdas
    // PREVENTIVO:* — otorgadas cuando la membresía todavía estaba activa
    // (el backfill de esta corrida NO se las va a dar de nuevo: filtra
    // `activo = true`, así que se insertan directo para simular ese estado
    // previo real). Es el hermano que falta del lado del DELETE (W1 del
    // verify): revocar es total (ADR-3), así que este usuario tiene que
    // perder las cuatro igual que el TECNICO activo.
    const tecnicoInactivoId = await crearUsuario('tecnico-inactivo');
    await crearMembresia(tecnicoInactivoId, clienteAId, 'TECNICO', false);
    for (const celda of CELDAS_PREVENTIVO) {
      const [modulo, accion] = celda.split(':');
      await masterClient.usuarioClientePermiso.create({
        data: { usuarioId: tecnicoInactivoId, clienteId: clienteAId, modulo, accion },
      });
    }

    // COLABORADOR con membresía activa.
    const colaboradorActivoId = await crearUsuario('colaborador-activo');
    await crearMembresia(colaboradorActivoId, clienteAId, 'COLABORADOR', true);

    // COLABORADOR con membresía INACTIVA — el INSERT no debe alcanzarlo.
    const colaboradorInactivoId = await crearUsuario('colaborador-inactivo');
    await crearMembresia(colaboradorInactivoId, clienteAId, 'COLABORADOR', false);

    // ADMINISTRADOR — matriz vacía por diseño, nunca debe sumar celdas.
    const administradorId = await crearUsuario('administrador');
    await crearMembresia(administradorId, clienteAId, 'ADMINISTRADOR', true);

    // USUARIO — sin celdas antes ni después.
    const usuarioId = await crearUsuario('usuario');
    await crearMembresia(usuarioId, clienteAId, 'USUARIO', true);

    // Mismo usuario, TECNICO en A y COLABORADOR (activo) en B: prueba que el
    // JOIN resuelve por (usuario_id, cliente_id) y no por usuario_id solo.
    const mixtoId = await crearUsuario('mixto');
    await crearMembresia(mixtoId, clienteAId, 'TECNICO', true);
    await crearMembresia(mixtoId, clienteBId, 'COLABORADOR', true);
  });

  async function celdasDe(suffix: string, clienteId: string): Promise<string[]> {
    const rows = await masterClient.usuarioClientePermiso.findMany({
      where: { usuarioId: usuarioIds[suffix], clienteId },
      select: { modulo: true, accion: true },
    });
    return rows.map((r) => `${r.modulo}:${r.accion}`).sort();
  }

  async function correr(archivo: string): Promise<void> {
    const sql = fs.readFileSync(archivo, 'utf8');
    await masterClient.$executeRawUnsafe(sql);
  }

  async function correrBackfillYSwap(): Promise<void> {
    await correr(BACKFILL_FILE);
    await correr(SWAP_FILE);
  }

  it('TECNICO pierde las cuatro celdas PREVENTIVO:* y conserva las de otros módulos', async () => {
    await correrBackfillYSwap();
    expect(await celdasDe('tecnico', clienteAId)).toEqual(['TICKETS:LECTURA']);
  });

  it('[hermano invertido, W1] TECNICO con membresía INACTIVA también pierde las cuatro celdas — el DELETE no filtra activo (design ADR-3)', async () => {
    await correrBackfillYSwap();
    expect(await celdasDe('tecnico-inactivo', clienteAId)).toEqual([]);
  });

  it('[hermano invertido] COLABORADOR con membresía activa gana las cuatro celdas', async () => {
    await correrBackfillYSwap();
    expect(await celdasDe('colaborador-activo', clienteAId)).toEqual(CELDAS_PREVENTIVO);
  });

  it('COLABORADOR con membresía inactiva no recibe nada — el INSERT filtra activo = true', async () => {
    await correrBackfillYSwap();
    expect(await celdasDe('colaborador-inactivo', clienteAId)).toEqual([]);
  });

  it('[CRITICAL] ADMINISTRADOR sigue con matriz vacía tras el swap', async () => {
    await correrBackfillYSwap();
    expect(await celdasDe('administrador', clienteAId)).toEqual([]);
  });

  it('USUARIO sigue sin celdas tras el swap', async () => {
    await correrBackfillYSwap();
    expect(await celdasDe('usuario', clienteAId)).toEqual([]);
  });

  it('un mismo usuario resuelve TECNICO en un tenant y COLABORADOR en otro (JOIN por usuario+cliente)', async () => {
    await correrBackfillYSwap();
    expect(await celdasDe('mixto', clienteAId)).toEqual([]);
    expect(await celdasDe('mixto', clienteBId)).toEqual(CELDAS_PREVENTIVO);
  });

  it('[CRITICAL] correr el swap dos veces no cambia el estado final ni duplica filas', async () => {
    await correrBackfillYSwap();
    await correr(SWAP_FILE);

    expect(await celdasDe('tecnico', clienteAId)).toEqual(['TICKETS:LECTURA']);
    expect(await celdasDe('tecnico-inactivo', clienteAId)).toEqual([]);
    expect(await celdasDe('colaborador-activo', clienteAId)).toEqual(CELDAS_PREVENTIVO);
    expect(await celdasDe('colaborador-inactivo', clienteAId)).toEqual([]);
    expect(await celdasDe('mixto', clienteAId)).toEqual([]);
    expect(await celdasDe('mixto', clienteBId)).toEqual(CELDAS_PREVENTIVO);
  });
});
