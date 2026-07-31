/**
 * PrismaConfigResolver — integración REAL (Judgment Day PR6 Ronda 1, item 5).
 *
 * A diferencia de `config-resolver.adapter.spec.ts` (unit — PrismaService/
 * ISecretCipher mockeados), este test instancia el resolver REAL contra el
 * test DB (Postgres real, sin mocks de Prisma) + el `AesGcmSecretCipher`
 * REAL (con `CONFIG_ENCRYPTION_KEY` de test — dummy fijo de
 * `test/setup-env.ts`, base64 válido de 32 bytes) — confirma end-to-end que
 * una fila `esSecreto=true` CIFRADA de verdad en
 * `master.configuracion_runtime` se DESCIFRA correctamente al armar el
 * `SmtpConfig` final (spec Requirement 2: "el secreto en claro nunca aparece
 * fuera de memoria" — acá se verifica el otro lado del contrato: SÍ vuelve a
 * aparecer, correctamente, dentro del `SmtpConfig` en memoria).
 *
 * Usa SOLO config GLOBAL (categoria 'smtp', sin fila de tenant): el
 * `clienteId` pasado es un UUID que NO existe en `master.clientes`, así que
 * `findTenantRows()` degrada a `[]` (mismo camino que design §3.1 "Scenario
 * 3" — cliente inactivo/inexistente) y el merge tenant→global cae 100% a
 * global. El flujo de descifrado que este test cubre es idéntico sea cual
 * sea el origen de la fila `esSecreto=true` (tenant o global) — no hace
 * falta levantar una DB de tenant completa solo para ejercitar `decrypt()`.
 *
 * NO gateado por env (a diferencia de
 * `nodemailer-email-sender.integration.spec.ts`, que requiere un servidor
 * SMTP externo no disponible en toda máquina/CI): este archivo sigue el
 * MISMO patrón que el resto de los `*.integration.spec.ts` de este proyecto
 * (ver `configuracion-repository.adapter.integration.spec.ts`, mismo
 * directorio) — requieren Postgres de test real (`TEST_DB_URL` /
 * `DATABASE_URL_MASTER`), que ya es una precondición asumida de `pnpm test`
 * en este repo (`vitest.config.ts` fija `fileParallelism: false`
 * precisamente porque las suites de integración comparten esa DB).
 *
 * Aislamiento: `beforeEach`/`afterEach` limpian SOLO las filas
 * `categoria: 'smtp'` con las `clave` que este test usa — no toca ninguna
 * otra fila de config que pudiera existir en la DB de test.
 *
 * Ref spec: Requirement 2. Ref design: §5 (PrismaConfigResolver), §3.1.
 * Tarea: Judgment Day PR6 Ronda 1, item 5 (runtime-config-table).
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { AesGcmSecretCipher } from '../../../../shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter';
import { PrismaConfigResolver } from './config-resolver.adapter';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const CAMPOS_NO_SECRETOS: Array<{ clave: string; valor: string; tipo: string }> = [
  { clave: 'host', valor: 'smtp.integ-test.com', tipo: 'string' },
  { clave: 'port', valor: '587', tipo: 'number' },
  { clave: 'secure', valor: 'false', tipo: 'boolean' },
  { clave: 'user', valor: 'no-reply@integ-test.com', tipo: 'string' },
  { clave: 'from', valor: 'Soporte <no-reply@integ-test.com>', tipo: 'string' },
];
const CLAVES = [...CAMPOS_NO_SECRETOS.map((c) => c.clave), 'pass'];
const PASS_PLAINTEXT = 'integ-test-secreto-real-Ñ&ç';

describe('PrismaConfigResolver — integración REAL (descifrado end-to-end, Judgment Day PR6 Ronda 1, item 5)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let resolver: PrismaConfigResolver;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    // Cipher REAL — toma CONFIG_ENCRYPTION_KEY del entorno de test (dummy
    // fijo cargado por `test/setup-env.ts`).
    resolver = new PrismaConfigResolver(prismaService, new AesGcmSecretCipher());
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.configuracionRuntime.deleteMany({
      where: { categoria: 'smtp', clave: { in: CLAVES } },
    });
  });

  afterEach(async () => {
    await masterClient.configuracionRuntime.deleteMany({
      where: { categoria: 'smtp', clave: { in: CLAVES } },
    });
  });

  it('resuelve SmtpConfig desde config GLOBAL con el pass cifrado DE VERDAD — decrypt() vía AesGcmSecretCipher real', async () => {
    const cipher = new AesGcmSecretCipher();
    const encrypted = cipher.encrypt(PASS_PLAINTEXT).getValue();

    await masterClient.configuracionRuntime.createMany({
      data: [
        ...CAMPOS_NO_SECRETOS.map((c) => ({
          categoria: 'smtp',
          clave: c.clave,
          valor: c.valor,
          tipo: c.tipo,
          esSecreto: false,
        })),
        {
          categoria: 'smtp',
          clave: 'pass',
          valor: encrypted.valor,
          tipo: 'string',
          esSecreto: true,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
        },
      ],
    });

    // UUID que NO existe en master.clientes ⇒ findTenantRows() resuelve `[]`
    // (sin PrismaClientValidationError — es un UUID válido, solo inexistente)
    // y el merge cae 100% a global.
    const clienteIdInexistente = randomUUID();

    const result = await resolver.resolveSmtp(clienteIdInexistente);

    expect(result.isOk()).toBe(true);
    const config = result.getValue();
    expect(config.host).toBe('smtp.integ-test.com');
    expect(config.port).toBe(587);
    expect(config.secure).toBe(false);
    expect(config.user).toBe('no-reply@integ-test.com');
    expect(config.from).toBe('Soporte <no-reply@integ-test.com>');
    // Aserción central: el secreto CIFRADO en DB (AES-256-GCM real) se
    // descifra correctamente al plaintext original dentro del SmtpConfig.
    expect(config.pass).toBe(PASS_PLAINTEXT);
  });
});
