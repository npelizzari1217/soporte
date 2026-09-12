/**
 * [INTEGRATION] `PrismaInsumoRepository` contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Fixtures prefijados `INS_<hex>_` sobre el CÓDIGO del insumo y sobre el de
 * sus códigos alternativos (mismo patrón que
 * `prisma-modelo-equipo.repository.integration.spec.ts`): la DB de test es
 * COMPARTIDA, así que la limpieza va acotada por ese prefijo — nunca un
 * TRUNCATE global. El prefijo en los códigos alternativos no es cosmético: su
 * UNIQUE `(codigo, fabricante)` es GLOBAL al tenant, así que dos corridas
 * solapadas chocarían entre sí sin él.
 *
 * Este spec NO toca `soporte_master_test`, así que no necesita
 * `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../../domain/entities/insumo-codigo-alternativo.entity';
import {
  CompatibilidadModelo,
  crearCompatibilidadModelo,
} from '../../../domain/entities/compatibilidad-modelo';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaInsumoRepository — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaInsumoRepository;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `INS_${randomBytes(2).toString('hex')}_`;

  let familiaId: string;
  let unidadMedidaId: string;
  /** Dos modelos, porque casi todo caso de compatibilidad necesita el que NO tiene que aparecer. */
  let modeloAId: string;
  let modeloBId: string;

  /**
   * Borra los insumos de esta corrida; sus códigos alternativos y sus filas de
   * compatibilidad caen por `ON DELETE CASCADE`.
   */
  async function limpiarInsumos(): Promise<void> {
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
  }

  function construirInsumo(
    sufijo: string,
    codigosAlternativos: InsumoCodigoAlternativoEntity[] = [],
    stockMinimo: number | null = null,
    compatibilidad: CompatibilidadModelo[] = [],
  ): InsumoEntity {
    return InsumoEntity.create({
      codigo: `${PREFIJO}${sufijo}`,
      nombre: `Insumo ${sufijo}`,
      familiaId,
      unidadMedidaId,
      stockMinimo,
      activo: true,
      codigosAlternativos,
      compatibilidad,
    });
  }

  /**
   * Lee la fila cruda de `insumos_modelos_equipo`. El value object de dominio
   * NO tiene `createdAt` —su identidad es el par—, así que la única forma de
   * comprobar que la fecha de alta sobrevive al reguardado es mirar la tabla.
   */
  async function leerFilaCompatibilidad(
    insumoId: string,
    modeloEquipoId: string,
  ): Promise<{ rol: string | null; createdAt: Date } | null> {
    return tenantClient.insumoModeloEquipo.findUnique({
      where: { insumoId_modeloEquipoId: { insumoId, modeloEquipoId } },
      select: { rol: true, createdAt: true },
    });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-insumos',
    });
    repo = new PrismaInsumoRepository(tenantContext);

    // `familia_id` y `unidad_medida_id` son FK con ON DELETE RESTRICT: sin
    // estas dos filas ningún insumo entra.
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad de prueba' },
    });
    familiaId = familia.id;
    unidadMedidaId = unidad.id;

    // Dos modelos de equipo: el segundo existe para que los casos de "NO trae
    // los de otro modelo" tengan realmente un otro modelo con carga propia.
    const modeloA = await tenantClient.modeloEquipo.create({
      data: { marca: `${PREFIJO}HP`, modelo: 'LaserJet A' },
    });
    const modeloB = await tenantClient.modeloEquipo.create({
      data: { marca: `${PREFIJO}HP`, modelo: 'LaserJet B' },
    });
    modeloAId = modeloA.id;
    modeloBId = modeloB.id;
  });

  // Orden obligado: primero los insumos, después los catálogos a los que
  // referencian. Al revés, el RESTRICT de la FK rechaza el borrado.
  afterAll(async () => {
    await limpiarInsumos();
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.modeloEquipo.deleteMany({ where: { marca: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await limpiarInsumos();
  });

  it('save() + findById() hacen round-trip del agregado con sus códigos alternativos', async () => {
    const insumo = construirInsumo(
      'RT',
      [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}CE285A`, fabricante: 'HP' }),
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}GEN`, fabricante: null }),
      ],
      7.5,
    );

    await repo.save(insumo);
    const found = await repo.findById(insumo.id);

    expect(found).not.toBeNull();
    expect(found!.codigo).toBe(`${PREFIJO}RT`);
    expect(found!.nombre).toBe('Insumo RT');
    expect(found!.familiaId).toBe(familiaId);
    expect(found!.unidadMedidaId).toBe(unidadMedidaId);
    expect(found!.activo).toBe(true);

    const codigos = [...found!.codigosAlternativos].sort((a, b) =>
      a.codigo.localeCompare(b.codigo),
    );
    expect(codigos).toHaveLength(2);
    expect(codigos[0]!.codigo).toBe(`${PREFIJO}CE285A`);
    expect(codigos[0]!.fabricante).toBe('HP');
    expect(codigos[1]!.codigo).toBe(`${PREFIJO}GEN`);
    expect(codigos[1]!.fabricante).toBeNull();
  });

  it('findById() retorna null para un id inexistente', async () => {
    const found = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(found).toBeNull();
  });

  /**
   * `stock_minimo` es `DECIMAL(10,2)`: sale de la base como `Prisma.Decimal`,
   * un OBJETO. Se assertea el TIPO además del valor porque `toBe(12.34)`
   * contra un `Decimal` fallaría, pero un `toEqual` no distinguiría los dos.
   */
  it('save() + findById() preservan el stockMinimo con decimales, como number', async () => {
    const insumo = construirInsumo('DEC', [], 12.34);

    await repo.save(insumo);
    const found = await repo.findById(insumo.id);

    expect(typeof found!.stockMinimo).toBe('number');
    expect(found!.stockMinimo).toBe(12.34);
  });

  /**
   * Hermano invertido del caso de arriba: `null` es "sin punto de reposición",
   * no cero. Un `Number(null)` en el mapper lo convertiría en un insumo que
   * avisa recién al llegar a cero unidades.
   */
  it('save() + findById() preservan el stockMinimo nulo sin volverlo cero', async () => {
    const insumo = construirInsumo('NUL', [], null);

    await repo.save(insumo);
    const found = await repo.findById(insumo.id);

    expect(found!.stockMinimo).toBeNull();
  });

  /**
   * La capa de aplicación se toma el trabajo de REUTILIZAR la entidad
   * existente para conservar su id y su `createdAt`. Un `deleteMany` ciego
   * seguido de `create` en el repositorio tiraría ese trabajo a la basura sin
   * que ningún test de la capa de aplicación se enterara: el agregado volvería
   * con otros ids y otra fecha de alta en cada guardado.
   */
  it('save() reguardado conserva el id y el createdAt del código alternativo que no cambió', async () => {
    const conservado = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}CONSERVADO`,
      fabricante: 'HP',
    });
    const insumo = construirInsumo('REUSO', [conservado]);
    await repo.save(insumo);

    const primeraLectura = await repo.findById(insumo.id);
    const createdAtOriginal = primeraLectura!.codigosAlternativos[0]!.createdAt;

    insumo.actualizar({ nombre: 'Insumo REUSO renombrado' });
    insumo.reemplazarCodigosAlternativos([
      conservado,
      InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}NUEVO`, fabricante: 'HP' }),
    ]);
    await repo.save(insumo);

    const segundaLectura = await repo.findById(insumo.id);
    const fila = segundaLectura!.codigosAlternativos.find((c) => c.id === conservado.id);

    expect(segundaLectura!.nombre).toBe('Insumo REUSO renombrado');
    expect(segundaLectura!.codigosAlternativos).toHaveLength(2);
    expect(fila).toBeDefined();
    expect(fila!.codigo).toBe(`${PREFIJO}CONSERVADO`);
    expect(fila!.createdAt).toEqual(createdAtOriginal);
  });

  /**
   * La lista que llega REEMPLAZA a la guardada: un código que no viene es un
   * código que el usuario sacó, y tiene que desaparecer de la base. Sin el
   * `deleteMany`, el catálogo acumularía códigos que ya nadie reclama y que
   * seguirían bloqueando el UNIQUE global.
   */
  it('save() borra de la base el código alternativo que salió de la lista', async () => {
    const queSeQueda = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}QUEDA`,
      fabricante: 'HP',
    });
    const queSeVa = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}SEVA`,
      fabricante: 'HP',
    });
    const insumo = construirInsumo('BORRADO', [queSeQueda, queSeVa]);
    await repo.save(insumo);

    // Ancla del estado inicial: sin esto, un save() que nunca hubiera escrito
    // el segundo código dejaría el assert de abajo verde por construcción.
    const antes = await repo.findById(insumo.id);
    expect(antes!.codigosAlternativos.map((c) => c.id).sort()).toEqual(
      [queSeQueda.id, queSeVa.id].sort(),
    );

    insumo.reemplazarCodigosAlternativos([queSeQueda]);
    await repo.save(insumo);

    const despues = await repo.findById(insumo.id);
    expect(despues!.codigosAlternativos).toHaveLength(1);
    expect(despues!.codigosAlternativos[0]!.id).toBe(queSeQueda.id);

    const huerfano = await tenantClient.insumoCodigoAlternativo.findUnique({
      where: { id: queSeVa.id },
    });
    expect(huerfano).toBeNull();
  });

  /** Vaciar la lista entera es un caso propio: el `deleteMany` no tiene ids que preservar. */
  it('save() con la lista vacía borra todos los códigos alternativos del insumo', async () => {
    const codigo = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}VACIA`,
      fabricante: null,
    });
    const insumo = construirInsumo('VACIA', [codigo]);
    await repo.save(insumo);
    expect((await repo.findById(insumo.id))!.codigosAlternativos).toHaveLength(1);

    insumo.reemplazarCodigosAlternativos([]);
    await repo.save(insumo);

    expect((await repo.findById(insumo.id))!.codigosAlternativos).toHaveLength(0);
  });

  /**
   * El createdAt REAL lo pone la base (issue #172), no `insumo.createdAt` en
   * memoria: ese valor es el reloj del PROCESO al construir la entidad, y ya
   * no es el que queda en la fila desde que `InsumoMapper.toPersistence()`
   * lo omite del CREATE. Por eso el baseline se relee con `findById()` recién
   * después del primer `save()`, en vez de compararse contra la entidad.
   */
  it('save() en un insumo existente actualiza sin pisar createdAt', async () => {
    const insumo = construirInsumo('UPD');
    await repo.save(insumo);
    const creado = await repo.findById(insumo.id);

    insumo.actualizar({ nombre: 'Editado' });
    await repo.save(insumo);

    const found = await repo.findById(insumo.id);
    expect(found!.nombre).toBe('Editado');
    expect(found!.createdAt).toEqual(creado!.createdAt);
  });

  it('findByCodigo() encuentra el insumo por su código único', async () => {
    const insumo = construirInsumo('PORCODIGO');
    await repo.save(insumo);

    const found = await repo.findByCodigo(`${PREFIJO}PORCODIGO`);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(insumo.id);
  });

  /**
   * `insumos_codigo_key` NO es un índice parcial: el código sigue tomado
   * aunque el insumo tenga baja lógica. Si `findByCodigo()` filtrara por
   * `deletedAt`, la capa de aplicación daría el código por libre y el INSERT
   * volvería con un 23505 crudo.
   */
  it('findByCodigo() también encuentra un insumo con baja lógica', async () => {
    const insumo = construirInsumo('BAJA');
    insumo.softDelete();
    await repo.save(insumo);

    const found = await repo.findByCodigo(`${PREFIJO}BAJA`);

    expect(found).not.toBeNull();
    expect(found!.isDeleted()).toBe(true);
  });

  /**
   * Deshabilitar NO es eliminar: el insumo con `activo=false` tiene que seguir
   * llegando al listado, la única pantalla desde la que el administrador
   * consigue su id para reactivarlo.
   */
  it('findAllActive() SÍ incluye un insumo deshabilitado', async () => {
    const habilitado = construirInsumo('HAB');
    const deshabilitado = construirInsumo('DESHAB');
    deshabilitado.desactivar();
    await repo.save(habilitado);
    await repo.save(deshabilitado);

    const vigentes = await repo.findAllActive();

    const filaDeshabilitada = vigentes.find((i) => i.id === deshabilitado.id);
    expect(filaDeshabilitada).toBeDefined();
    expect(filaDeshabilitada!.activo).toBe(false);
    // Hermano invertido: el habilitado también está, así que el caso de arriba
    // no pasa por un listado que devuelve todo o por uno que devuelve nada.
    expect(vigentes.find((i) => i.id === habilitado.id)?.activo).toBe(true);
  });

  it('findAllActive() NO incluye un insumo con baja lógica', async () => {
    const vigente = construirInsumo('VIGENTE');
    const borrado = construirInsumo('BORRADO_LOGICO');
    borrado.softDelete();
    await repo.save(vigente);
    await repo.save(borrado);

    const vigentes = await repo.findAllActive();

    expect(vigentes.some((i) => i.id === borrado.id)).toBe(false);
    expect(vigentes.some((i) => i.id === vigente.id)).toBe(true);
  });

  /**
   * WU-2 (sdd/repuestos-seccion): `esRepuesto` filtra por la FAMILIA del
   * insumo (WU-1, `familia_insumo.es_repuesto`), no por una columna propia de
   * `insumos` — de ahí la familia de repuesto propia de este bloque, además
   * de la familia consumible que ya usa el resto del spec.
   */
  describe('findAllActive() — filtro esRepuesto', () => {
    let familiaRepuestoId: string;

    // Sin `afterAll` propio: esta familia también arranca con `PREFIJO`, así
    // que el `afterAll` EXTERNO ya la barre en su `familiaInsumo.deleteMany`
    // (línea de arriba) — DESPUÉS de `limpiarInsumos()`, que es el orden que
    // el RESTRICT de la FK exige. Un `afterAll` anidado correría ANTES que
    // ese `limpiarInsumos()` externo (los hooks internos corren primero) y el
    // RESTRICT lo rechazaría con los insumos de este bloque todavía en pie.
    beforeAll(async () => {
      const familiaRepuesto = await tenantClient.familiaInsumo.create({
        data: { codigo: `${PREFIJO}FR`, nombre: 'Familia de repuesto de prueba', esRepuesto: true },
      });
      familiaRepuestoId = familiaRepuesto.id;
    });

    function construirInsumoEnFamilia(sufijo: string, familia: string): InsumoEntity {
      return InsumoEntity.create({
        codigo: `${PREFIJO}${sufijo}`,
        nombre: `Insumo ${sufijo}`,
        familiaId: familia,
        unidadMedidaId,
        stockMinimo: null,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
      });
    }

    it('findAllActive(true) trae el insumo de familia repuesto', async () => {
      const repuesto = construirInsumoEnFamilia('FILT_REP_A', familiaRepuestoId);
      const consumible = construirInsumoEnFamilia('FILT_REP_B', familiaId);
      await repo.save(repuesto);
      await repo.save(consumible);

      const repuestos = await repo.findAllActive(true);

      expect(repuestos.some((i) => i.id === repuesto.id)).toBe(true);
      // Gemelo invertido: el consumible NO tiene que aparecer en el listado
      // de repuestos — sin este assert, un filtro que no filtrara nada
      // pasaría igual por el `some()` de arriba.
      expect(repuestos.some((i) => i.id === consumible.id)).toBe(false);
    });

    it('findAllActive(false) trae el insumo de familia consumible', async () => {
      const repuesto = construirInsumoEnFamilia('FILT_CONS_A', familiaRepuestoId);
      const consumible = construirInsumoEnFamilia('FILT_CONS_B', familiaId);
      await repo.save(repuesto);
      await repo.save(consumible);

      const consumibles = await repo.findAllActive(false);

      expect(consumibles.some((i) => i.id === consumible.id)).toBe(true);
      // Gemelo invertido del caso anterior: el repuesto NO tiene que aparecer
      // en el listado de consumibles.
      expect(consumibles.some((i) => i.id === repuesto.id)).toBe(false);
    });

    it('findAllActive() sin argumento NO filtra: trae repuesto y consumible por igual', async () => {
      const repuesto = construirInsumoEnFamilia('FILT_TODOS_A', familiaRepuestoId);
      const consumible = construirInsumoEnFamilia('FILT_TODOS_B', familiaId);
      await repo.save(repuesto);
      await repo.save(consumible);

      const todos = await repo.findAllActive();

      expect(todos.some((i) => i.id === repuesto.id)).toBe(true);
      expect(todos.some((i) => i.id === consumible.id)).toBe(true);
    });
  });

  /**
   * WU-3 (sdd/repuestos-vinculo-componente): `soloVinculables` restringe a
   * los insumos que `AgregarComponenteUseCase` aceptaría vincular —
   * `activo: true` Y `familia.activo: true`, las DOS condiciones que ese use
   * case exige por separado. De ahí la familia DESHABILITADA propia de este
   * bloque, que ninguna otra `describe` de este spec necesita.
   */
  describe('findAllActive() — filtro soloVinculables', () => {
    let familiaDeshabilitadaId: string;

    // Sin `afterAll` propio, mismo motivo que `familiaRepuestoId` arriba: el
    // `afterAll` EXTERNO ya la barre, DESPUÉS de `limpiarInsumos()`.
    beforeAll(async () => {
      const familiaDeshabilitada = await tenantClient.familiaInsumo.create({
        data: {
          codigo: `${PREFIJO}FD`,
          nombre: 'Familia deshabilitada de prueba',
          activo: false,
        },
      });
      familiaDeshabilitadaId = familiaDeshabilitada.id;
    });

    function construirInsumoEnFamilia(
      sufijo: string,
      familia: string,
      activo: boolean,
    ): InsumoEntity {
      const insumo = InsumoEntity.create({
        codigo: `${PREFIJO}${sufijo}`,
        nombre: `Insumo ${sufijo}`,
        familiaId: familia,
        unidadMedidaId,
        stockMinimo: null,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
      });
      if (!activo) insumo.desactivar();
      return insumo;
    }

    it('findAllActive(undefined, true) NO incluye un insumo habilitado de familia deshabilitada', async () => {
      // Insumo HABILITADO, familia DESHABILITADA: es el hallazgo que originó
      // este work unit — el select lo ofrecía y el alta terminaba en un 422
      // `FAMILIA_INSUMO_DESHABILITADA` por algo que el usuario acababa de ver
      // en la lista.
      const deFamiliaDeshabilitada = construirInsumoEnFamilia(
        'VINC_FAM_A',
        familiaDeshabilitadaId,
        true,
      );
      const vinculable = construirInsumoEnFamilia('VINC_FAM_B', familiaId, true);
      await repo.save(deFamiliaDeshabilitada);
      await repo.save(vinculable);

      const vinculables = await repo.findAllActive(undefined, true);

      expect(vinculables.some((i) => i.id === deFamiliaDeshabilitada.id)).toBe(false);
      // Gemelo invertido: el vinculable de familia habilitada SÍ tiene que
      // aparecer — sin este assert, un filtro que no filtrara nada (o que
      // filtrara de más y dejara la lista vacía) pasaría igual.
      expect(vinculables.some((i) => i.id === vinculable.id)).toBe(true);
    });

    it('findAllActive(undefined, true) NO incluye un insumo deshabilitado, aunque su familia esté habilitada', async () => {
      const deshabilitado = construirInsumoEnFamilia('VINC_ACT_A', familiaId, false);
      const vinculable = construirInsumoEnFamilia('VINC_ACT_B', familiaId, true);
      await repo.save(deshabilitado);
      await repo.save(vinculable);

      const vinculables = await repo.findAllActive(undefined, true);

      expect(vinculables.some((i) => i.id === deshabilitado.id)).toBe(false);
      expect(vinculables.some((i) => i.id === vinculable.id)).toBe(true);
    });

    it('findAllActive() SIN soloVinculables SÍ incluye el insumo de familia deshabilitada — el ABM lo necesita', async () => {
      // Gemelo invertido de todo el bloque: sin el parámetro, el catálogo
      // completo (el que usa el ABM) tiene que seguir trayendo TODO, mismo
      // criterio que `findAllActive() SÍ incluye un insumo deshabilitado` más
      // arriba. Sin este caso, un `findAllActive` que SIEMPRE aplicara el
      // filtro de familia pasaría los dos tests de arriba igual.
      const deFamiliaDeshabilitada = construirInsumoEnFamilia(
        'VINC_ABM_A',
        familiaDeshabilitadaId,
        true,
      );
      const deshabilitado = construirInsumoEnFamilia('VINC_ABM_B', familiaId, false);
      await repo.save(deFamiliaDeshabilitada);
      await repo.save(deshabilitado);

      const todos = await repo.findAllActive();

      expect(todos.some((i) => i.id === deFamiliaDeshabilitada.id)).toBe(true);
      expect(todos.some((i) => i.id === deshabilitado.id)).toBe(true);
    });
  });

  it('findAllActive() trae los códigos alternativos de cada insumo', async () => {
    const insumo = construirInsumo('CONCODIGOS', [
      InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}LISTADO`, fabricante: 'CANON' }),
    ]);
    await repo.save(insumo);

    const vigentes = await repo.findAllActive();

    const fila = vigentes.find((i) => i.id === insumo.id);
    expect(fila!.codigosAlternativos).toHaveLength(1);
    expect(fila!.codigosAlternativos[0]!.codigo).toBe(`${PREFIJO}LISTADO`);
    expect(fila!.codigosAlternativos[0]!.fabricante).toBe('CANON');
  });

  describe('compatibilidad con modelos de equipo', () => {
    /**
     * Las dos formas del rol viajan juntas porque son ramas distintas del
     * mapeo y de la escritura: `null` es "no cumple ningún rol distinguible"
     * —una lámpara no es de ningún color—, y colapsarlo a `''` o perderlo
     * haría convivir dos formas de decir lo mismo.
     */
    it('save() + findById() hacen round-trip de la compatibilidad, con rol y sin rol', async () => {
      const insumo = construirInsumo('COMPAT_RT', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'negro' }),
        crearCompatibilidadModelo({ modeloEquipoId: modeloBId, rol: null }),
      ]);

      await repo.save(insumo);
      const found = await repo.findById(insumo.id);

      expect(found!.compatibilidad).toHaveLength(2);
      const porModelo = new Map(found!.compatibilidad.map((c) => [c.modeloEquipoId, c.rol]));
      expect(porModelo.get(modeloAId)).toBe('NEGRO');
      expect(porModelo.has(modeloBId)).toBe(true);
      expect(porModelo.get(modeloBId)).toBeNull();
    });

    /**
     * ESTE es el caso que prueba que el agujero de pérdida silenciosa está
     * cerrado. Con el agregado leyéndose sin su compatibilidad, este `save()`
     * —que no toca la lista— la borraba entera de la base sin un solo error ni
     * log: la lectura traía `[]` y la escritura persistía ese `[]`.
     */
    it('save() de un agregado leído, sin tocar la compatibilidad, NO la borra', async () => {
      const insumo = construirInsumo('COMPAT_SOBREVIVE', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      await repo.save(insumo);

      const leido = await repo.findById(insumo.id);
      expect(leido!.compatibilidad).toHaveLength(1);

      // Se reguarda EL AGREGADO LEÍDO, editando solo un campo de la raíz.
      leido!.actualizar({ nombre: 'Insumo COMPAT_SOBREVIVE renombrado' });
      await repo.save(leido!);

      const despues = await repo.findById(insumo.id);
      expect(despues!.nombre).toBe('Insumo COMPAT_SOBREVIVE renombrado');
      expect(despues!.compatibilidad).toHaveLength(1);
      expect(despues!.compatibilidad[0]!.modeloEquipoId).toBe(modeloAId);
      expect(despues!.compatibilidad[0]!.rol).toBe('NEGRO');
    });

    /**
     * La fila no tiene `id` ni `updatedAt`: su `createdAt` es el único rastro
     * de cuándo se declaró la compatibilidad. Si el `upsert` lo emitiera en la
     * rama de UPDATE, cada reguardado del insumo le movería la fecha de alta a
     * un par que nadie tocó.
     */
    it('save() reguardado conserva el createdAt del par que no cambió', async () => {
      const insumo = construirInsumo('COMPAT_CREATEDAT', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      await repo.save(insumo);

      const filaOriginal = await leerFilaCompatibilidad(insumo.id, modeloAId);
      expect(filaOriginal).not.toBeNull();

      insumo.reemplazarCompatibilidad([
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'CIAN' }),
        crearCompatibilidadModelo({ modeloEquipoId: modeloBId, rol: null }),
      ]);
      await repo.save(insumo);

      const filaDespues = await leerFilaCompatibilidad(insumo.id, modeloAId);
      // El rol SÍ se actualiza: el hermano invertido del createdAt, que prueba
      // que el UPDATE corrió de verdad y no que la fila quedó intacta entera.
      expect(filaDespues!.rol).toBe('CIAN');
      expect(filaDespues!.createdAt).toEqual(filaOriginal!.createdAt);
    });

    /**
     * La lista que llega REEMPLAZA a la guardada: un modelo que no viene es un
     * modelo que el usuario sacó. Sin el `deleteMany`, quitar una
     * compatibilidad sería imposible desde la API.
     */
    it('save() borra de la base el par que salió de la lista', async () => {
      const insumo = construirInsumo('COMPAT_BORRADO', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
        crearCompatibilidadModelo({ modeloEquipoId: modeloBId, rol: 'CIAN' }),
      ]);
      await repo.save(insumo);

      // Ancla del estado inicial: sin esto, un save() que nunca hubiera
      // escrito el segundo par dejaría el assert de abajo verde por
      // construcción.
      expect(await leerFilaCompatibilidad(insumo.id, modeloBId)).not.toBeNull();

      insumo.reemplazarCompatibilidad([
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      await repo.save(insumo);

      const despues = await repo.findById(insumo.id);
      expect(despues!.compatibilidad).toHaveLength(1);
      expect(despues!.compatibilidad[0]!.modeloEquipoId).toBe(modeloAId);
      expect(await leerFilaCompatibilidad(insumo.id, modeloBId)).toBeNull();
    });

    /**
     * Vaciar la lista entera es un caso propio: el filtro del `deleteMany` se
     * queda sin pares que preservar, y un `notIn: []` depende de cómo Prisma
     * traduzca el conjunto vacío.
     */
    it('save() con la lista vacía borra todos los pares del insumo', async () => {
      const insumo = construirInsumo('COMPAT_VACIA', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
        crearCompatibilidadModelo({ modeloEquipoId: modeloBId, rol: null }),
      ]);
      await repo.save(insumo);
      expect((await repo.findById(insumo.id))!.compatibilidad).toHaveLength(2);

      insumo.reemplazarCompatibilidad([]);
      await repo.save(insumo);

      expect((await repo.findById(insumo.id))!.compatibilidad).toHaveLength(0);
      expect(await leerFilaCompatibilidad(insumo.id, modeloAId)).toBeNull();
      expect(await leerFilaCompatibilidad(insumo.id, modeloBId)).toBeNull();
    });

    /**
     * El agregado tiene que llegar IGUAL en cada lectura. El UPDATE del rol
     * previo no es decorativo: mueve la fila de lugar físico en la tabla, que
     * es justo el orden que Postgres devuelve cuando la consulta no pide
     * ninguno.
     */
    it('findById() devuelve la compatibilidad ordenada por modelo, aun después de un UPDATE', async () => {
      const insumo = construirInsumo('COMPAT_ORDEN', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
        crearCompatibilidadModelo({ modeloEquipoId: modeloBId, rol: 'CIAN' }),
      ]);
      await repo.save(insumo);

      const primeroPorModelo = [modeloAId, modeloBId].sort()[0]!;
      await tenantClient.insumoModeloEquipo.update({
        where: {
          insumoId_modeloEquipoId: { insumoId: insumo.id, modeloEquipoId: primeroPorModelo },
        },
        data: { rol: 'MAGENTA' },
      });

      const found = await repo.findById(insumo.id);

      expect(found!.compatibilidad.map((c) => c.modeloEquipoId)).toEqual(
        [modeloAId, modeloBId].sort(),
      );
    });

    it('findAllActive() trae la compatibilidad de cada insumo', async () => {
      const insumo = construirInsumo('COMPAT_LISTADO', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      await repo.save(insumo);

      const vigentes = await repo.findAllActive();

      const fila = vigentes.find((i) => i.id === insumo.id);
      expect(fila!.compatibilidad).toHaveLength(1);
      expect(fila!.compatibilidad[0]!.modeloEquipoId).toBe(modeloAId);
      expect(fila!.compatibilidad[0]!.rol).toBe('NEGRO');
    });

    it('findByCodigo() trae la compatibilidad del insumo', async () => {
      const insumo = construirInsumo('COMPAT_PORCODIGO', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      await repo.save(insumo);

      const found = await repo.findByCodigo(`${PREFIJO}COMPAT_PORCODIGO`);

      expect(found!.compatibilidad).toHaveLength(1);
      expect(found!.compatibilidad[0]!.modeloEquipoId).toBe(modeloAId);
    });
  });

  describe('findAllByModeloEquipo()', () => {
    /**
     * El insumo del OTRO modelo está realmente cargado en el fixture: un
     * assert de ausencia sobre una base sin ese insumo pasaría en verde
     * aunque la consulta no filtrara nada.
     */
    it('trae los compatibles y NO trae el insumo compatible con otro modelo', async () => {
      const delA = construirInsumo('PARA_A', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      const delB = construirInsumo('PARA_B', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloBId, rol: 'NEGRO' }),
      ]);
      await repo.save(delA);
      await repo.save(delB);

      const compatibles = await repo.findAllByModeloEquipo(modeloAId);

      expect(compatibles.map((i) => i.id)).toContain(delA.id);
      expect(compatibles.map((i) => i.id)).not.toContain(delB.id);
    });

    /** Hermano invertido del caso de arriba: por el otro modelo vuelve el otro insumo. */
    it('por el otro modelo trae el otro insumo', async () => {
      const delA = construirInsumo('INV_A', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      const delB = construirInsumo('INV_B', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloBId, rol: 'NEGRO' }),
      ]);
      await repo.save(delA);
      await repo.save(delB);

      const compatibles = await repo.findAllByModeloEquipo(modeloBId);

      expect(compatibles.map((i) => i.id)).toContain(delB.id);
      expect(compatibles.map((i) => i.id)).not.toContain(delA.id);
    });

    /**
     * Mismo criterio que `findAllActive`: deshabilitar NO es eliminar. Un
     * insumo con `activo=false` sigue siendo el repuesto de ese modelo, y
     * esconderlo dejaría al administrador sin saber que existe.
     */
    it('SÍ incluye un insumo deshabilitado compatible', async () => {
      const habilitado = construirInsumo('MOD_HAB', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      const deshabilitado = construirInsumo('MOD_DESHAB', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'CIAN' }),
      ]);
      deshabilitado.desactivar();
      await repo.save(habilitado);
      await repo.save(deshabilitado);

      const compatibles = await repo.findAllByModeloEquipo(modeloAId);

      const fila = compatibles.find((i) => i.id === deshabilitado.id);
      expect(fila).toBeDefined();
      expect(fila!.activo).toBe(false);
      // Hermano invertido: el habilitado también está, así que el caso de
      // arriba no pasa por una consulta que devuelve todo ni por una que
      // devuelve nada.
      expect(compatibles.find((i) => i.id === habilitado.id)?.activo).toBe(true);
    });

    it('NO incluye un insumo compatible con baja lógica', async () => {
      const vigente = construirInsumo('MOD_VIGENTE', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      const borrado = construirInsumo('MOD_BAJA', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'CIAN' }),
      ]);
      borrado.softDelete();
      await repo.save(vigente);
      await repo.save(borrado);

      const compatibles = await repo.findAllByModeloEquipo(modeloAId);

      expect(compatibles.map((i) => i.id)).not.toContain(borrado.id);
      expect(compatibles.map((i) => i.id)).toContain(vigente.id);
    });

    it('trae cada insumo con su agregado completo', async () => {
      const insumo = construirInsumo(
        'MOD_AGREGADO',
        [InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}MODCOD`, fabricante: 'HP' })],
        null,
        [crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' })],
      );
      await repo.save(insumo);

      const compatibles = await repo.findAllByModeloEquipo(modeloAId);

      const fila = compatibles.find((i) => i.id === insumo.id);
      expect(fila!.codigosAlternativos).toHaveLength(1);
      expect(fila!.codigosAlternativos[0]!.codigo).toBe(`${PREFIJO}MODCOD`);
      expect(fila!.compatibilidad).toHaveLength(1);
      expect(fila!.compatibilidad[0]!.rol).toBe('NEGRO');
    });

    it('devuelve vacío para un modelo sin insumos compatibles', async () => {
      // El fixture NO está vacío: hay un insumo cargado contra el otro modelo,
      // así que el vacío que se assertea es del filtro, no de la base.
      const delA = construirInsumo('SOLO_A', [], null, [
        crearCompatibilidadModelo({ modeloEquipoId: modeloAId, rol: 'NEGRO' }),
      ]);
      await repo.save(delA);

      const compatibles = await repo.findAllByModeloEquipo(modeloBId);

      expect(compatibles).toEqual([]);
    });
  });

  describe('findConflictosDeCodigoAlternativo()', () => {
    it('devuelve el par tomado, con el insumo que lo tiene', async () => {
      const ocupante = construirInsumo('OCUPANTE', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}TOMADO`, fabricante: 'HP' }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}TOMADO`, fabricante: 'HP' },
      ]);

      expect(conflictos).toHaveLength(1);
      expect(conflictos[0]!.codigo).toBe(`${PREFIJO}TOMADO`);
      expect(conflictos[0]!.fabricante).toBe('HP');
      expect(conflictos[0]!.insumoId).toBe(ocupante.id);
    });

    /**
     * El UNIQUE es sobre el PAR: el mismo código de dos fabricantes distintos
     * convive sin problema. Comparando solo por `codigo`, el alta rechazaría
     * un par legítimo.
     */
    it('NO reporta el mismo código con otro fabricante', async () => {
      const ocupante = construirInsumo('MISMOCODIGO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}PAR`, fabricante: 'HP' }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}PAR`, fabricante: 'CANON' },
      ]);

      expect(conflictos).toEqual([]);
    });

    /**
     * El código GENÉRICO viaja con `fabricante: null`, que en SQL se compara
     * con `IS NULL` y no con `=`. Este caso corre contra el índice real, que
     * es `NULLS NOT DISTINCT`: si la consulta armara `fabricante = NULL`, no
     * devolvería nada y el alta duplicaría el genérico.
     */
    it('detecta el conflicto del código genérico, con fabricante nulo', async () => {
      const ocupante = construirInsumo('GENERICO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}SINFAB`, fabricante: null }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}SINFAB`, fabricante: null },
      ]);

      expect(conflictos).toHaveLength(1);
      expect(conflictos[0]!.fabricante).toBeNull();
      expect(conflictos[0]!.insumoId).toBe(ocupante.id);
    });

    it('resuelve varios pares en una sola consulta y devuelve solo los tomados', async () => {
      const ocupante = construirInsumo('VARIOS', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}A`, fabricante: 'HP' }),
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}B`, fabricante: null }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}A`, fabricante: 'HP' },
        { codigo: `${PREFIJO}LIBRE`, fabricante: 'HP' },
        { codigo: `${PREFIJO}B`, fabricante: null },
      ]);

      expect(conflictos.map((c) => c.codigo).sort()).toEqual([`${PREFIJO}A`, `${PREFIJO}B`].sort());
    });

    /**
     * Sin `excluyendoInsumoId`, reenviar la lista sin cambios en una edición se
     * rechazaría a sí misma. Con él, los códigos propios dejan de contar como
     * choque — pero los ajenos SIGUEN contando, que es el hermano invertido de
     * abajo.
     */
    it('excluyendoInsumoId saca de la comparación los códigos del insumo que se edita', async () => {
      const propio = construirInsumo('PROPIO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}MIO`, fabricante: 'HP' }),
      ]);
      await repo.save(propio);

      const conflictos = await repo.findConflictosDeCodigoAlternativo(
        [{ codigo: `${PREFIJO}MIO`, fabricante: 'HP' }],
        propio.id,
      );

      expect(conflictos).toEqual([]);
    });

    it('excluyendoInsumoId NO tapa el choque contra OTRO insumo', async () => {
      const ajeno = construirInsumo('AJENO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}AJENO`, fabricante: 'HP' }),
      ]);
      const propio = construirInsumo('PROPIO2');
      await repo.save(ajeno);
      await repo.save(propio);

      const conflictos = await repo.findConflictosDeCodigoAlternativo(
        [{ codigo: `${PREFIJO}AJENO`, fabricante: 'HP' }],
        propio.id,
      );

      expect(conflictos).toHaveLength(1);
      expect(conflictos[0]!.insumoId).toBe(ajeno.id);
    });

    /** Con la lista vacía no hay nada que consultar: el UNIQUE no puede violarse sin pares. */
    it('con la lista de pares vacía devuelve vacío', async () => {
      const conflictos = await repo.findConflictosDeCodigoAlternativo([]);
      expect(conflictos).toEqual([]);
    });
  });

  /**
   * `findFamiliasDeInsumos()` (sdd/repuestos-autoridad-catalogo, ADR-3): la
   * lectura por lote que usa `ObtenerEquipoUseCase` para mostrar el tipo de un
   * componente vinculado desde el catálogo del tenant, sin consultar MASTER.
   */
  describe('findFamiliasDeInsumos()', () => {
    let familiaDeshabilitadaId: string;
    let familiaBorradaId: string;

    // Sin `afterAll` propio, mismo motivo que en `soloVinculables` de arriba:
    // el `afterAll` EXTERNO ya barre por prefijo, DESPUÉS de `limpiarInsumos()`.
    beforeAll(async () => {
      const familiaDeshabilitada = await tenantClient.familiaInsumo.create({
        data: {
          codigo: `${PREFIJO}FAMFD`,
          nombre: 'Familia deshabilitada (findFamiliasDeInsumos)',
          activo: false,
        },
      });
      familiaDeshabilitadaId = familiaDeshabilitada.id;

      const familiaBorrada = await tenantClient.familiaInsumo.create({
        data: {
          codigo: `${PREFIJO}FAMBJ`,
          nombre: 'Familia borrada (findFamiliasDeInsumos)',
          activo: true,
        },
      });
      await tenantClient.familiaInsumo.update({
        where: { id: familiaBorrada.id },
        data: { deletedAt: new Date() },
      });
      familiaBorradaId = familiaBorrada.id;
    });

    it('resuelve varios ids en UNA llamada, cada uno con su familia', async () => {
      const uno = construirInsumo('FAM_UNO');
      const dos = construirInsumo('FAM_DOS');
      await repo.save(uno);
      await repo.save(dos);

      const mapa = await repo.findFamiliasDeInsumos([uno.id, dos.id]);

      expect(mapa.size).toBe(2);
      expect(mapa.get(uno.id)).toEqual({
        insumoId: uno.id,
        codigo: `${PREFIJO}F`,
        nombre: 'Familia de prueba',
        activo: true,
        deletedAt: null,
      });
      expect(mapa.get(dos.id)?.insumoId).toBe(dos.id);
    });

    /**
     * EL INSUMO BORRADO SIGUE RESOLVIENDO, Y ES A PROPÓSITO.
     *
     * La consulta filtra por `id`, nunca por `deletedAt` del insumo. Un
     * componente vinculado sobrevive a la baja lógica de su insumo —el FK es
     * RESTRICT, la fila no se va— y su tipo tiene que seguir mostrándose.
     *
     * Sin este test, "agregar `deletedAt: null` al where" parece una mejora
     * obvia, y reintroduce EXACTAMENTE el bug que este ciclo vino a cerrar: el
     * componente cae a tipo sin resolver y se muestra "Dado de baja".
     */
    it('un insumo con baja lógica SIGUE resolviendo su familia, no desaparece del mapa', async () => {
      const borrado = construirInsumo('FAM_INSUMO_BORRADO');
      await repo.save(borrado);
      borrado.softDelete();
      await repo.save(borrado);

      const mapa = await repo.findFamiliasDeInsumos([borrado.id]);

      expect(mapa.size).toBe(1);
      expect(mapa.get(borrado.id)?.insumoId).toBe(borrado.id);
      expect(mapa.get(borrado.id)?.codigo).toBe(`${PREFIJO}F`);
    });

    it('un id inexistente simplemente no aparece en el mapa', async () => {
      const mapa = await repo.findFamiliasDeInsumos(['00000000-0000-4000-8000-000000000000']);
      expect(mapa.size).toBe(0);
    });

    it('lista vacía devuelve mapa vacío sin consultar la base', async () => {
      const mapa = await repo.findFamiliasDeInsumos([]);
      expect(mapa).toEqual(new Map());
    });

    it('familia deshabilitada viaja con activo:false CRUDO, sin colapsarlo', async () => {
      const insumo = construirInsumoEnFamiliaGenerica('FAM_DESHAB', familiaDeshabilitadaId);
      await repo.save(insumo);

      const mapa = await repo.findFamiliasDeInsumos([insumo.id]);

      expect(mapa.get(insumo.id)?.activo).toBe(false);
      expect(mapa.get(insumo.id)?.deletedAt).toBeNull();
    });

    it('familia soft-deleted viaja con deletedAt CRUDO, sin colapsarlo', async () => {
      const insumo = construirInsumoEnFamiliaGenerica('FAM_BORRADA', familiaBorradaId);
      await repo.save(insumo);

      const mapa = await repo.findFamiliasDeInsumos([insumo.id]);

      expect(mapa.get(insumo.id)?.activo).toBe(true);
      expect(mapa.get(insumo.id)?.deletedAt).not.toBeNull();
    });

    function construirInsumoEnFamiliaGenerica(sufijo: string, familia: string): InsumoEntity {
      return InsumoEntity.create({
        codigo: `${PREFIJO}${sufijo}`,
        nombre: `Insumo ${sufijo}`,
        familiaId: familia,
        unidadMedidaId,
        stockMinimo: null,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
      });
    }
  });

  /**
   * `findLastSecuenciaCodigo()` — comportamiento SECUENCIAL, sin concurrencia
   * (issue #162; ver `prisma-insumo.repository.concurrencia.integration.spec.ts`
   * para la carrera real).
   *
   * A diferencia de `PrismaCompraRepository`/`PrismaTicketRepository`, la
   * serie de `codigo` NO tiene una dimensión propia para reservar un valor
   * "fuera de rango real" (compras usa un año como 2098; acá el prefijo es
   * SIEMPRE `INS` o `REP`, sin variante). Por eso estos tests miden la
   * secuencia YA EXISTENTE en la serie ANTES de sembrar (`baseline`) y
   * afirman sobre el DELTA que ellos mismos introducen, nunca sobre un valor
   * absoluto — así el resultado no depende de qué haya quedado de otra
   * corrida en la base de test compartida. La limpieza es por id exacto
   * (`insumosIdsCreados`), nunca por rango de código.
   */
  describe('findLastSecuenciaCodigo() — comportamiento secuencial (sin concurrencia, ver spec dedicado)', () => {
    const insumosIdsCreados: string[] = [];

    afterEach(async () => {
      if (insumosIdsCreados.length > 0) {
        await tenantClient.insumo.deleteMany({ where: { id: { in: insumosIdsCreados } } });
        insumosIdsCreados.length = 0;
      }
    });

    function construirConCodigo(codigo: string): InsumoEntity {
      return InsumoEntity.create({
        codigo,
        nombre: `Insumo serie ${codigo}`,
        familiaId,
        unidadMedidaId,
        stockMinimo: null,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
      });
    }

    /** Siembra un insumo con `codigo` y lo agenda para limpieza por id. */
    async function sembrar(codigo: string): Promise<void> {
      const insumo = construirConCodigo(codigo);
      await repo.save(insumo);
      insumosIdsCreados.push(insumo.id);
    }

    /** `INS-{n}` / `REP-{n}` con el padding de 4 dígitos del numerador real. */
    function codigoDeLaSerie(prefijo: 'INS' | 'REP', n: number): string {
      return `${prefijo}-${String(n).padStart(4, '0')}`;
    }

    it('retorna el MÁXIMO de la serie, no el último insertado', async () => {
      const baseline = await repo.findLastSecuenciaCodigo('INS');

      // Insertados fuera de orden a propósito: si el repo confiara en el
      // orden de inserción en vez de un MAX real, este test lo detecta.
      await sembrar(codigoDeLaSerie('INS', baseline + 1));
      await sembrar(codigoDeLaSerie('INS', baseline + 3));
      await sembrar(codigoDeLaSerie('INS', baseline + 2));

      const last = await repo.findLastSecuenciaCodigo('INS');
      expect(last).toBe(baseline + 3);
    });

    /**
     * Las dos series son independientes: crear en `REP` no puede mover el
     * contador de `INS`, ni viceversa (issue #162, "las dos series son
     * independientes y correlativas dentro del inquilino").
     */
    it('la serie REP es independiente de la serie INS', async () => {
      const baselineIns = await repo.findLastSecuenciaCodigo('INS');
      const baselineRep = await repo.findLastSecuenciaCodigo('REP');

      await sembrar(codigoDeLaSerie('REP', baselineRep + 1));

      expect(await repo.findLastSecuenciaCodigo('REP')).toBe(baselineRep + 1);
      expect(await repo.findLastSecuenciaCodigo('INS')).toBe(baselineIns);
    });

    /**
     * LEFT-ANCHORED (mismo criterio que `PrismaCompraRepository`, "MEJORA
     * sobre tickets"): un código que contiene el prefijo como SUBSTRING, pero
     * no lo tiene al INICIO, no puede confundirse con la serie.
     */
    it('un código que contiene el prefijo pero no empieza con él NO se cuenta', async () => {
      const baseline = await repo.findLastSecuenciaCodigo('INS');
      // Contiene "INS-0001" como substring, pero empieza con "X".
      await sembrar(`X${codigoDeLaSerie('INS', baseline + 1)}`);

      expect(await repo.findLastSecuenciaCodigo('INS')).toBe(baseline);
    });

    /**
     * El código escrito a mano con el MISMO prefijo pero otra forma —sin los
     * 4 dígitos exactos— no participa de la serie: sin este filtro, un
     * `ORDER BY codigo DESC` alfabético podría hacer que `INS-ABCD` o
     * `INS-12345` le ganaran a la secuencia numérica real.
     */
    it('un código a mano con el mismo prefijo pero sin la forma de la serie NO se cuenta', async () => {
      const baseline = await repo.findLastSecuenciaCodigo('INS');

      await sembrar('INS-ABCD');
      await sembrar('INS-12345');
      await sembrar('INS-12');

      expect(await repo.findLastSecuenciaCodigo('INS')).toBe(baseline);
    });

    it('SÍ retoma la secuencia de un código a mano que casualmente respeta el formato', async () => {
      const baseline = await repo.findLastSecuenciaCodigo('INS');

      // El usuario tipeó esto a mano, pero tiene la forma exacta de la serie:
      // el numerador lo respeta como si lo hubiera generado él mismo.
      await sembrar(codigoDeLaSerie('INS', baseline + 1));

      expect(await repo.findLastSecuenciaCodigo('INS')).toBe(baseline + 1);
    });
  });

  /**
   * Issue #172 — gemelo del #159 (`prisma-movimiento-insumo.repository.integration.spec.ts`,
   * `describe('insert() — issue #159...')`), aplicado a la rama CREATE del
   * `upsert()` de `save()`.
   *
   * En producción un insumo dado de alta a las 19:44 ART (UTC-3) quedó en
   * `insumos.created_at` como `01:44:22` UTC, cuando el UTC real era `22:44`:
   * un desvío de +3h. En el MISMO request, `movimientos_insumo` quedó
   * correcto —esa tabla la arregló el #159—, que es justo la pista de que acá
   * el problema es otro: `InsumoMapper.toPersistence()` (línea 176) incluye
   * `createdAt: entity.createdAt` en el shape que `save()` manda al `create`
   * del upsert, y ese valor sale de `BaseEntity` (`new Date()`, resolución de
   * milisegundo) en vez de dejar que la columna use su propio
   * `@default(now())`.
   *
   * Se reproduce el mismo mecanismo que el #159: reloj del PROCESO desviado
   * con `vi.useFakeTimers({ toFake: ['Date'] })` ANTES de construir la
   * entidad —`InsumoEntity.create()` hereda de `BaseEntity`, que fija
   * `createdAt = new Date()` en el constructor—, y lectura de la fila CRUDA
   * ya con el reloj real restaurado.
   */
  describe('save() — issue #172: la fecha de alta la pone la base, no el proceso', () => {
    /** Mismo desvío EXACTO reportado en el issue: +3 horas. */
    const DESVIO_MS = 3 * 60 * 60 * 1000;

    /**
     * **EL TEST QUE DECIDE EL ISSUE #172.** Sin desviar el reloj, este caso
     * pasaría por construcción y no probaría nada. Hoy tiene que FALLAR: el
     * mapper manda `createdAt` del proceso en el INSERT, así que la fila
     * hereda el desvío de 3h en vez de la hora real de la base.
     */
    it('crea un insumo con el reloj del proceso desviado 3 horas: created_at en la base NO hereda el desvío', async () => {
      const antesDeLaEscritura = new Date();
      let insumo: InsumoEntity;

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date(antesDeLaEscritura.getTime() + DESVIO_MS));
        insumo = construirInsumo('ISS172_DESVIO');
        // Guarda de que el fixture realmente reproduce la deriva: si esto
        // fallara, el resto del caso no probaría lo que dice probar.
        expect(insumo.createdAt.getTime()).toBe(antesDeLaEscritura.getTime() + DESVIO_MS);

        await repo.save(insumo);
      } finally {
        vi.useRealTimers();
      }

      const fila = await tenantClient.insumo.findUniqueOrThrow({ where: { id: insumo.id } });

      // La ventana desviada arranca en antesDeLaEscritura + 3h; se exige que
      // la fila quede a más de un minuto ANTES de ese arranque — así se
      // distingue "cayó donde cae el reloj real" de "cayó donde cae el reloj
      // desviado" sin depender de que los dos rangos no se toquen por
      // casualidad (mismo criterio que el #159).
      expect(fila.createdAt.getTime()).toBeLessThan(
        antesDeLaEscritura.getTime() + DESVIO_MS - 60_000,
      );
    });

    /**
     * Segundo criterio: la fila tiene que caer dentro de la ventana del reloj
     * REAL de este test, no en cualquier punto fuera del rango desviado. Con
     * el bug presente, el valor persistido cae ~3h por delante de esta
     * ventana, así que también se espera que este caso FALLE hoy.
     */
    it('created_at cae en la ventana del reloj real, entre el antes y el después de la escritura', async () => {
      const antesDeLaEscritura = new Date();
      let insumo: InsumoEntity;

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date(antesDeLaEscritura.getTime() + DESVIO_MS));
        insumo = construirInsumo('ISS172_VENTANA');
        await repo.save(insumo);
      } finally {
        vi.useRealTimers();
      }
      const despuesDeLaEscritura = new Date();

      const fila = await tenantClient.insumo.findUniqueOrThrow({ where: { id: insumo.id } });

      const MARGEN_RED_MS = 5000;
      expect(fila.createdAt.getTime()).toBeGreaterThanOrEqual(
        antesDeLaEscritura.getTime() - MARGEN_RED_MS,
      );
      expect(fila.createdAt.getTime()).toBeLessThanOrEqual(
        despuesDeLaEscritura.getTime() + MARGEN_RED_MS,
      );
    });

    /**
     * Detector de "quién puso la fecha": `clock_timestamp()` de Postgres
     * resuelve en microsegundos; un `Date` de JavaScript resuelve en
     * milisegundos y siempre trae los tres dígitos de microsegundos en cero.
     * Si `created_at` quedó puesto por el proceso, ese resto da SIEMPRE 0.
     *
     * Antes de afirmar nada con este criterio se verifica que la INSTANCIA
     * LOCAL de Postgres realmente resuelva por debajo del milisegundo: se
     * toman 10 muestras de `clock_timestamp()` y, si las 10 caen justo en el
     * milisegundo, el criterio no sirve en este entorno y el caso se
     * saltea con `ctx.skip()` en vez de dar un veredicto falso.
     *
     * La afirmación NO se hace sobre una sola fila. Un `clock_timestamp()`
     * perfectamente sano cae en resto 0 aproximadamente una vez cada mil, y
     * afirmar sobre una única extracción convertiría esa coincidencia en un
     * rojo espurio en CI. Esa casualidad ya ocurrió al verificar el issue
     * #159 en produccion. Por eso se dan de alta CANTIDAD_MUESTRAS insumos y
     * se exige que AL MENOS UNO traiga resto distinto de cero: si la fecha la
     * pusiera el proceso, los restos darían 0 los CANTIDAD_MUESTRAS. Con 5
     * filas, la probabilidad de un rojo espurio baja del orden de 1e-3 al de
     * 1e-15, y el poder del test para detectar el defecto real no cambia.
     */
    it('created_at tiene resolución sub-milisegundo: la puso la base, no un Date de JS', async (ctx) => {
      const muestras: bigint[] = [];
      for (let i = 0; i < 10; i += 1) {
        const [{ resto }] = await tenantClient.$queryRaw<{ resto: bigint }[]>`
          SELECT (EXTRACT(MICROSECONDS FROM clock_timestamp())::bigint % 1000) AS resto
        `;
        muestras.push(resto);
      }
      const resolucionSubMilisegundoLocal = muestras.some((resto) => resto !== 0n);

      ctx.skip(
        !resolucionSubMilisegundoLocal,
        'clock_timestamp() de esta instancia local de Postgres resuelve solo en ' +
          'milisegundos (10/10 muestras con resto 0): el criterio de microsegundos ' +
          'no aplica en este entorno, así que no se puede afirmar nada con él acá.',
      );

      const CANTIDAD_MUESTRAS = 5;
      const restos: bigint[] = [];
      for (let i = 0; i < CANTIDAD_MUESTRAS; i += 1) {
        const insumo = construirInsumo(`ISS172_MICRO_${i}`);
        await repo.save(insumo);

        const [{ resto }] = await tenantClient.$queryRaw<{ resto: bigint }[]>`
          SELECT (EXTRACT(MICROSECONDS FROM created_at)::bigint % 1000) AS resto
          FROM insumos WHERE id = ${insumo.id}::uuid
        `;
        restos.push(resto);
      }

      expect(restos).toHaveLength(CANTIDAD_MUESTRAS);
      expect(restos.some((resto) => resto !== 0n)).toBe(true);
    });
  });
});
