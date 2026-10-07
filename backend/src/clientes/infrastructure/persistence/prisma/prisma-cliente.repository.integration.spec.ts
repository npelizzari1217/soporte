/**
 * prisma-cliente.repository.integration.spec.ts — Integracion contra Postgres
 * REAL (`soporte_master_test`). sdd/formulario-publico-qr, WU-1: unicidad del
 * slug, CHECK de formato y los dos CAS de congelamiento (ADR-2).
 *
 * Trunca `clientes` en la base COMPARTIDA de test: exige el turno exclusivo.
 */
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';
import { PrismaClienteRepository } from './prisma-cliente.repository';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('PrismaClienteRepository — slug y congelamiento (WU-1, integracion)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let repo: PrismaClienteRepository;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    repo = new PrismaClienteRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE clientes RESTART IDENTITY CASCADE');
  });

  async function crearCliente(suffix: string): Promise<ClienteEntity> {
    const c = ClienteEntity.create({
      nombre: `Cliente ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_slug_${suffix}`,
      activo: true,
    });
    await repo.save(c);
    return c;
  }

  it('un cliente nuevo queda sin slug, deshabilitado y sin congelar', async () => {
    const c = await crearCliente('def');
    const leido = await repo.findById(c.id);
    expect(leido!.slug).toBeNull();
    expect(leido!.formularioPublicoHabilitado).toBe(false);
    expect(leido!.slugCongeladoAt).toBeNull();
  });

  it('cambiarSlugSiNoCongelado escribe el slug y findBySlug lo encuentra', async () => {
    const c = await crearCliente('a');
    expect(await repo.cambiarSlugSiNoCongelado(c.id, 'colegio-norte')).toBe('CAMBIADO');
    const porSlug = await repo.findBySlug('colegio-norte');
    expect(porSlug!.id).toBe(c.id);
    expect(await repo.findBySlug('no-existe')).toBeNull();
  });

  it('unicidad: el mismo slug en otro cliente da DUPLICADO y no cambia nada', async () => {
    const a = await crearCliente('u1');
    const b = await crearCliente('u2');
    await repo.cambiarSlugSiNoCongelado(a.id, 'colegio-norte');

    expect(await repo.cambiarSlugSiNoCongelado(b.id, 'colegio-norte')).toBe('DUPLICADO');
    expect((await repo.findById(b.id))!.slug).toBeNull();
  });

  it('varios clientes sin slug conviven (NULL no choca con NULL)', async () => {
    await crearCliente('n1');
    await crearCliente('n2');
    expect(await masterClient.cliente.count({ where: { slug: null } })).toBe(2);
  });

  it('el CHECK de formato rechaza un slug invalido que llegue por SQL directo', async () => {
    const c = await crearCliente('chk');
    await expect(
      masterClient.$executeRawUnsafe(
        `UPDATE clientes SET slug = 'Con Mayus' WHERE id = '${c.id}'::uuid`,
      ),
    ).rejects.toThrow(/clientes_slug_formato_check/);
  });

  describe('congelarSlug (CAS)', () => {
    it('congela cuando el slug coincide y es idempotente (no pisa la marca)', async () => {
      const c = await crearCliente('f1');
      await repo.cambiarSlugSiNoCongelado(c.id, 'colegio-norte');

      expect(await repo.congelarSlug(c.id, 'colegio-norte')).toBe(true);
      const primera = (await repo.findById(c.id))!.slugCongeladoAt;
      expect(primera).not.toBeNull();

      expect(await repo.congelarSlug(c.id, 'colegio-norte')).toBe(true);
      expect((await repo.findById(c.id))!.slugCongeladoAt).toEqual(primera);
    });

    it('con 0 filas (el slug cambio) devuelve false y no congela', async () => {
      const c = await crearCliente('f2');
      await repo.cambiarSlugSiNoCongelado(c.id, 'colegio-norte');

      expect(await repo.congelarSlug(c.id, 'otro-slug')).toBe(false);
      expect((await repo.findById(c.id))!.slugCongeladoAt).toBeNull();
    });

    it('sobre un cliente sin slug devuelve false', async () => {
      const c = await crearCliente('f3');
      expect(await repo.congelarSlug(c.id, 'colegio-norte')).toBe(false);
    });
  });

  describe('cambiarSlugSiNoCongelado tras congelar', () => {
    it('rechaza el cambio (CONGELADO) y el slug sigue siendo el anterior', async () => {
      const c = await crearCliente('g1');
      await repo.cambiarSlugSiNoCongelado(c.id, 'colegio-norte');
      await repo.congelarSlug(c.id, 'colegio-norte');

      expect(await repo.cambiarSlugSiNoCongelado(c.id, 'otro-slug')).toBe('CONGELADO');
      expect((await repo.findById(c.id))!.slug).toBe('colegio-norte');
    });
  });

  it('save() con una entidad vieja no descongela ni pisa el slug', async () => {
    const c = await crearCliente('s1');
    const vieja = (await repo.findById(c.id))!; // leida antes de cargar el slug
    await repo.cambiarSlugSiNoCongelado(c.id, 'colegio-norte');
    await repo.congelarSlug(c.id, 'colegio-norte');

    vieja.editar({ nombre: 'Renombrado' });
    await repo.save(vieja);

    const actual = (await repo.findById(c.id))!;
    expect(actual.nombre).toBe('Renombrado');
    expect(actual.slug).toBe('colegio-norte');
    expect(actual.slugCongeladoAt).not.toBeNull();
  });

  it('save() persiste la habilitacion del formulario', async () => {
    const c = await crearCliente('h1');
    await repo.cambiarSlugSiNoCongelado(c.id, 'colegio-norte');
    const leido = (await repo.findById(c.id))!;
    leido.habilitarFormulario(true);
    await repo.save(leido);
    expect((await repo.findById(c.id))!.formularioPublicoHabilitado).toBe(true);
  });

  it('politica de 2FA: default false, fijar/obtener tocan solo esa columna y save no la pisa (C1, C2)', async () => {
    const c = await crearCliente('p2fa');
    expect(await repo.obtenerRequiere2fa(c.id)).toBe(false);

    const lecturaVieja = (await repo.findById(c.id))!;
    expect(await repo.fijarRequiere2fa(c.id, true)).toBe(true);
    expect(await repo.obtenerRequiere2fa(c.id)).toBe(true);
    expect((await repo.findById(c.id))!.nombre).toBe(c.nombre);

    await repo.save(lecturaVieja);
    expect(await repo.obtenerRequiere2fa(c.id)).toBe(true);

    expect(await repo.fijarRequiere2fa(c.id, false)).toBe(true);
    expect(await repo.obtenerRequiere2fa(c.id)).toBe(false);
  });

  it('politica de 2FA: un cliente inexistente devuelve false / null', async () => {
    const inexistente = '018f0000-0000-7000-8000-000000000000';
    expect(await repo.fijarRequiere2fa(inexistente, true)).toBe(false);
    expect(await repo.obtenerRequiere2fa(inexistente)).toBeNull();
  });
});
