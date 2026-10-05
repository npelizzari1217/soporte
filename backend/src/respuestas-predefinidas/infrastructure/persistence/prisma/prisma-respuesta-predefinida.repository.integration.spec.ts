import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaRespuestaPredefinidaRepository } from './prisma-respuesta-predefinida.repository';
import { RespuestaPredefinidaEntity } from '../../../domain/entities/respuesta-predefinida.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const PREFIJO = 'RPTEST_';

describe('PrismaRespuestaPredefinidaRepository — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaRespuestaPredefinidaRepository;

  const limpiar = () =>
    tenantClient.respuestaPredefinida.deleteMany({ where: { titulo: { startsWith: PREFIJO } } });
  const nueva = (sufijo: string, texto = 'Texto') =>
    RespuestaPredefinidaEntity.create({ titulo: `${PREFIJO}${sufijo}`, texto, activo: true });

  beforeAll(() => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-respuestas',
    });
    repo = new PrismaRespuestaPredefinidaRepository(tenantContext);
  });

  afterAll(async () => {
    await limpiar();
    await prismaService.onModuleDestroy();
  });

  beforeEach(limpiar);

  it('save() + findById() hacen round-trip completo', async () => {
    const r = nueva('A', 'Hola, ¿cómo estás?');
    await repo.save(r);

    const found = await repo.findById(r.id);

    expect(found).not.toBeNull();
    expect(found!.titulo).toBe(`${PREFIJO}A`);
    expect(found!.texto).toBe('Hola, ¿cómo estás?');
    expect(found!.activo).toBe(true);
  });

  it('findById() retorna null para un id inexistente', async () => {
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('findByTitulo() ignora mayúsculas y encuentra también las desactivadas', async () => {
    const r = nueva('Baja');
    r.desactivar();
    await repo.save(r);

    const found = await repo.findByTitulo(`${PREFIJO.toLowerCase()}baja`);

    expect(found?.id).toBe(r.id);
  });

  it('findAll(true) devuelve solo activas y findAll(false) todas, ordenadas por título', async () => {
    const b = nueva('B');
    const a = nueva('A');
    const inactiva = nueva('C');
    inactiva.desactivar();
    await repo.save(b);
    await repo.save(a);
    await repo.save(inactiva);

    const mias = (lista: RespuestaPredefinidaEntity[]) =>
      lista.filter((r) => r.titulo.startsWith(PREFIJO)).map((r) => r.titulo);

    expect(mias(await repo.findAll(true))).toEqual([`${PREFIJO}A`, `${PREFIJO}B`]);
    expect(mias(await repo.findAll(false))).toEqual([`${PREFIJO}A`, `${PREFIJO}B`, `${PREFIJO}C`]);
  });

  it('save() sobre una existente actualiza sin pisar createdAt y persiste la reactivación', async () => {
    const r = nueva('UPD');
    await repo.save(r);

    r.actualizar({ texto: 'Editado' });
    r.desactivar();
    await repo.save(r);
    r.activar();
    await repo.save(r);

    const found = await repo.findById(r.id);
    expect(found!.texto).toBe('Editado');
    expect(found!.activo).toBe(true);
    expect(found!.createdAt).toEqual(r.createdAt);
  });

  describe('constraints de la migración (la autoridad es la DB)', () => {
    it('rechaza dos títulos que difieren solo en mayúsculas (UNIQUE sobre lower(titulo))', async () => {
      await repo.save(nueva('Dup'));

      await expect(repo.save(nueva('DUP'))).rejects.toThrow();
    });

    it('rechaza titulo/texto vacíos o excedidos y acepta los topes exactos (CHECK + VARCHAR)', async () => {
      const insertar = (titulo: string, texto: string) =>
        tenantClient.$executeRaw`INSERT INTO respuestas_predefinidas (titulo, texto, updated_at) VALUES (${titulo}, ${texto}, now())`;
      const tituloTope = PREFIJO + 'T'.repeat(100 - PREFIJO.length);

      await expect(insertar('', 'x')).rejects.toThrow();
      await expect(insertar(`${PREFIJO}vacio`, '')).rejects.toThrow();
      await expect(insertar(`${tituloTope}X`, 'x')).rejects.toThrow();
      await expect(insertar(`${PREFIJO}largo`, 'x'.repeat(4001))).rejects.toThrow();
      await expect(insertar(tituloTope, 'x'.repeat(4000))).resolves.toBe(1);
    });
  });
});
