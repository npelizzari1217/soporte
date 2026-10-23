/**
 * tenant.integration.spec.ts — lado TENANT del cargador legacy contra una
 * base tenant EFÍMERA (migrada y sembrada como un cliente real). Los ids de
 * usuarios y ciclos vigentes son soft refs a master: acá alcanzan ids fijos.
 */
import { randomBytes } from 'crypto';
import { PostgresAdminService } from '../../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../../src/clientes/infrastructure/tenant-seeder.adapter';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import type { TenantPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';
import { URL_MASTER_TEST_POR_DEFECTO } from '../../src/testing/lock-master-test';
import { PLANTILLAS_POR_TIPO_ROL } from '../../src/auth/domain/presets-rol';
import type { PlantillaSembrada } from './master';
import { fechaDia } from './paquete';
import { paqueteSintetico } from './paquete-sintetico.fixture';
import { planificarCiclos } from './plan';
import { aplicarTenant, conflictosDeCatalogo, leerTenant, type EntradaTenant } from './tenant';

const MASTER_URL = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const DB = `soporte_prov_legacy_${randomBytes(4).toString('hex')}_test`;
const USUARIOS = new Map([
  ['10', '00000000-0000-7000-8000-000000000010'],
  ['11', '00000000-0000-7000-8000-000000000011'],
  ['12', '00000000-0000-7000-8000-000000000012'],
]);
const VIGENTES = new Map([
  ['1', '00000000-0000-7000-8000-000000002024'],
  ['2', '00000000-0000-7000-8000-000000002026'],
]);

describe('importacion legacy — lado tenant (integración, base efímera)', () => {
  const admin = new PostgresAdminService(MASTER_URL);
  let prismaService: PrismaService;
  let tenant: InstanceType<typeof TenantPrismaClient>;
  let activo2026: string;

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB);
    await new TenantSeederAdapter(MASTER_URL).seed(DB);
    prismaService = new PrismaService(MASTER_URL);
    tenant = prismaService.getTenantClient(DB);
  }, 90_000);

  afterAll(async () => {
    // Orden de higiene: filas → desconectar → DROP (al revés el DROP falla en silencio).
    await tenant?.permisoTipoTicket.deleteMany();
    await tenant?.operacionTicket.deleteMany();
    await tenant?.ticketSoporte.deleteMany();
    await tenant?.ticket.deleteMany();
    await tenant?.cicloCliente.deleteMany();
    await prismaService?.onModuleDestroy();
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    await tenant.permisoTipoTicket.deleteMany();
    await tenant.operacionTicket.deleteMany();
    await tenant.ticketSoporte.deleteMany();
    await tenant.ticket.deleteMany();
    await tenant.cicloCliente.deleteMany();
    const fila = await tenant.cicloCliente.create({
      data: {
        cicloVigenteId: VIGENTES.get('2')!,
        nombre: 'Vigente del cliente',
        fechaInicio: fechaDia('2026-01-01'),
        fechaFin: fechaDia('2026-12-31'),
        activo: true,
      },
    });
    activo2026 = fila.id;
  });

  async function correr(usuarios = USUARIOS, plantillasSembradas: PlantillaSembrada[] = []) {
    const paquete = paqueteSintetico();
    const estado = await leerTenant(tenant, paquete);
    const entrada: EntradaTenant = {
      paquete,
      planCiclos: planificarCiclos(paquete.ciclos, [], estado.ciclosCliente).plan,
      vigenteIdPorLegacy: VIGENTES,
      usuarioIdPorLegacy: usuarios,
      catalogos: estado.catalogos,
      plantillasSembradas,
    };
    return { estado, resultado: await aplicarTenant(tenant, entrada) };
  }

  it('el catálogo sembrado de un tenant cubre el paquete sintético (sin conflictos)', async () => {
    const { catalogos } = await leerTenant(tenant, paqueteSintetico());
    expect(conflictosDeCatalogo(paqueteSintetico(), catalogos)).toEqual([]);
  });

  it('[CRITICAL] ciclo con las mismas fechas se reusa y sigue activo; el faltante nace inactivo', async () => {
    const { resultado } = await correr();

    const ciclos = await tenant.cicloCliente.findMany({ orderBy: { fechaInicio: 'asc' } });
    expect(ciclos.map((c) => [c.nombre, c.activo, c.cicloVigenteId])).toEqual([
      ['Ciclo 2024', false, VIGENTES.get('1')],
      ['Vigente del cliente', true, VIGENTES.get('2')],
    ]);
    expect(ciclos[1].id).toBe(activo2026);
    expect(resultado.ciclosCreados).toBe(1);
  });

  it('[CRITICAL] ticket con numero ANT-n, fechas legacy, sin SLA, satélite y comentarios en orden', async () => {
    await correr();

    const t = await tenant.ticket.findUniqueOrThrow({
      where: { numero: 'ANT-1' },
      include: {
        estado: true,
        ciclo: true,
        ticketSoporte: true,
        operaciones: { include: { tipoOperacion: true } },
      },
    });
    expect(t).toMatchObject({
      solicitanteId: USUARIOS.get('10'),
      asignadoId: USUARIOS.get('11'),
      slaVenceAt: null,
      vencido: false,
      slaRegla: 'CORRIDO',
    });
    expect([t.estado.codigo, t.ciclo?.nombre, t.ticketSoporte?.equipoId]).toEqual([
      'CERRADO',
      'Ciclo 2024',
      null,
    ]);
    expect(t.createdAt.toISOString()).toBe('2024-03-01T12:00:00.000Z');
    expect(t.fechaCierre?.toISOString()).toBe('2024-03-02T21:00:00.000Z');
    const timeline = [...t.operaciones].sort(
      (a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id),
    );
    expect(
      timeline.map((o) => [o.tipoOperacion.codigo, o.autorId, o.descripcion, o.esInterno]),
    ).toEqual([
      ['COMENTARIO', USUARIOS.get('11'), 'Voy en camino', false],
      ['COMENTARIO', USUARIOS.get('10'), 'Gracias', false],
      ['COMENTARIO', USUARIOS.get('11'), 'Se cambio el toner', false],
    ]);
    expect(
      (await tenant.ticket.findUniqueOrThrow({ where: { numero: 'ANT-2' } })).cicloId,
    ).toBeNull();
  });

  it('[CRITICAL] segunda corrida es idempotente: no inserta tickets, comentarios ni ciclos', async () => {
    await correr();
    const { resultado } = await correr();

    expect(resultado).toEqual({
      ciclosCreados: 0,
      ticketsInsertados: 0,
      comentariosInsertados: 0,
      yaExistian: ['ANT-1', 'ANT-2'],
      permisosPorTipoInsertados: 0,
    });
    expect([
      await tenant.ticket.count(),
      await tenant.operacionTicket.count(),
      await tenant.cicloCliente.count(),
    ]).toEqual([2, 3, 2]);
  });

  it('[CRITICAL] un fallo a mitad de camino revierte TODO el paquete (ni ciclos ni tickets)', async () => {
    const incompleto = new Map([...USUARIOS].filter(([id]) => id !== '12'));
    const plantillas = [
      { usuarioId: USUARIOS.get('11')!, plantilla: PLANTILLAS_POR_TIPO_ROL['TECNICO'] },
    ];

    await expect(correr(incompleto, plantillas)).rejects.toThrow(/usuario legacy 12/);

    expect([
      await tenant.ticket.count(),
      await tenant.cicloCliente.count(),
      await tenant.permisoTipoTicket.count(),
    ]).toEqual([0, 1, 0]);
  });

  describe('permisos por tipo de ticket de las plantillas sembradas (T4c)', () => {
    const TECNICO = USUARIOS.get('11')!;
    const SIN_PLANTILLA = USUARIOS.get('10')!;

    async function filasDe(usuarioId: string): Promise<string[]> {
      const filas = await tenant.permisoTipoTicket.findMany({ where: { usuarioId } });
      return filas.map((f) => `${f.tipoId}:${f.accion}`).sort();
    }

    it('cada plantilla sembrada en master da sus filas en todos los tipos, dados de baja incluidos', async () => {
      const soporte = await tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } });
      const baja = await tenant.tipoTicket.create({
        data: {
          codigo: `BAJA_${randomBytes(3).toString('hex')}`,
          nombre: 'Dado de baja',
          modulo: 'TICKETS',
          activo: false,
          deletedAt: new Date(),
        },
      });

      try {
        const { resultado } = await correr(USUARIOS, [
          { usuarioId: TECNICO, plantilla: PLANTILLAS_POR_TIPO_ROL['TECNICO'] },
        ]);

        const filas = await filasDe(TECNICO);
        expect(filas).toContain(`${soporte.id}:ASIGNAR`);
        expect(filas).toContain(`${baja.id}:LECTURA`);
        expect(filas.some((f) => f.endsWith(':BORRADO'))).toBe(false);
        expect(resultado.permisosPorTipoInsertados).toBe(filas.length);
        expect(await filasDe(SIN_PLANTILLA)).toEqual([]);
      } finally {
        await tenant.tipoTicket.delete({ where: { id: baja.id } });
      }
    });

    it('un usuario que ya tiene filas por tipo no se toca (no fusiona)', async () => {
      const soporte = await tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } });
      await tenant.permisoTipoTicket.create({
        data: { usuarioId: TECNICO, tipoId: soporte.id, accion: 'LECTURA' },
      });

      const { resultado } = await correr(USUARIOS, [
        { usuarioId: TECNICO, plantilla: PLANTILLAS_POR_TIPO_ROL['TECNICO'] },
      ]);

      expect(await filasDe(TECNICO)).toEqual([`${soporte.id}:LECTURA`]);
      expect(resultado.permisosPorTipoInsertados).toBe(0);
    });

    it('W3: no abre un tipo cerrado (nadie tiene Ver); sí escribe en los que alguien abrió', async () => {
      const OTRO = '00000000-0000-7000-8000-000000000099';
      const soporte = await tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } });
      const sufijo = randomBytes(3).toString('hex');
      const cerrado = await tenant.tipoTicket.create({
        data: { codigo: `CERRADO_${sufijo}`, nombre: 'Cerrado', modulo: 'TICKETS' },
      });
      const abierto = await tenant.tipoTicket.create({
        data: { codigo: `ABIERTO_${sufijo}`, nombre: 'Abierto', modulo: 'TICKETS' },
      });
      await tenant.permisoTipoTicket.createMany({
        data: [
          { usuarioId: OTRO, tipoId: soporte.id, accion: 'LECTURA' },
          { usuarioId: OTRO, tipoId: abierto.id, accion: 'LECTURA' },
          // Una fila sin Ver no abre el tipo (S3).
          { usuarioId: OTRO, tipoId: cerrado.id, accion: 'COMENTAR' },
        ],
      });

      try {
        await correr(USUARIOS, [
          { usuarioId: TECNICO, plantilla: PLANTILLAS_POR_TIPO_ROL['TECNICO'] },
        ]);

        const filas = await filasDe(TECNICO);
        expect(filas).toContain(`${soporte.id}:ASIGNAR`);
        expect(filas).toContain(`${abierto.id}:LECTURA`);
        expect(filas.filter((f) => f.startsWith(`${cerrado.id}:`))).toEqual([]);
      } finally {
        await tenant.permisoTipoTicket.deleteMany();
        await tenant.tipoTicket.deleteMany({ where: { id: { in: [cerrado.id, abierto.id] } } });
      }
    });
  });
});
