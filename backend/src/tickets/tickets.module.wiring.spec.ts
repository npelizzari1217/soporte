/**
 * TicketsModule — bootstrap/wiring regression guard (Fase 4, PR2, R2).
 *
 * R2 (design-fase4.md, ALTA): el wiring de DI de `ResolverCicloActivoParaCreacion`
 * y `CICLO_CLIENTE_REPOSITORY` en los use cases de creación/listado NO lo atrapa
 * `tsc --noEmit` (es un fallo de runtime de Nest, no de tipos). Este test
 * bootstrapea el módulo REAL (sin mocks unitarios) vía `Test.createTestingModule`
 * y confirma que `CrearTicketUseCase` y `ListarTicketsUseCase` resuelven sus
 * dependencias de ciclo por el contenedor de DI, no por construcción manual.
 *
 * SharedModule se importa junto a TicketsModule porque es @Global pero sus
 * providers (PrismaService, TenantContext, TENANT_TRANSACTION_RUNNER,
 * FILE_STORAGE) solo quedan disponibles si algún módulo del árbol de test lo
 * importa explícitamente — TicketsModule/AuthModule no lo hacen (lo esperan
 * del árbol de AppModule en producción). compile()/init() no abren conexión
 * real a DB (mismo patrón que app.module.spec.ts — PrismaService es lazy).
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md R2
 * Tarea: 2.x (Fase 4, PR2) — pedido explícito de sdd-apply para cubrir R2 en PR2.
 */
import { Test } from '@nestjs/testing';
import { TicketsModule } from './tickets.module';
import { SharedModule } from '../shared/shared.module';
import { TicketsController } from './interface/controllers/tickets.controller';
import { CrearTicketUseCase } from './application/use-cases/crear-ticket.use-case';
import { ListarTicketsUseCase } from './application/use-cases/listar-tickets.use-case';
import { ResolverCicloActivoParaCreacion } from './application/services/resolver-ciclo-activo.service';
import { CICLO_CLIENTE_REPOSITORY } from './domain/ports/i-ciclo-cliente.repository';
import { EMAIL_SENDER } from './domain/ports/i-email-sender.port';
import { SOLICITANTE_EMAIL_RESOLVER } from './domain/ports/i-solicitante-email.resolver';
import { SolicitanteEmailResolver } from './infrastructure/persistence/prisma/solicitante-email.resolver';
import { NodemailerEmailSender } from './infrastructure/email/nodemailer-email-sender.adapter';
import { NotificarCambioEstadoHandler } from './application/event-handlers/notificar-cambio-estado.handler';
import { NotificarCambioEstadoListener } from './infrastructure/events/notificar-cambio-estado.listener';
import { CONFIG_RESOLVER } from '../configuracion/domain/ports/i-config-resolver';
import { TicketEstadoCambiado } from './domain/events/ticket-estado-cambiado.event';
import { Email } from './domain/value-objects/email.vo';
import { Result } from '../shared/domain/result';
import { SmtpConfig } from '../shared/domain/value-objects/smtp-config.vo';

describe('TicketsModule bootstrap (Fase 4, PR2 — R2 DI wiring regression guard)', () => {
  it('compila sin UnknownDependenciesException y resuelve el resolver de ciclo activo por DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, TicketsModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(TicketsController)).toBeInstanceOf(TicketsController);

    // CrearTicketUseCase resuelto por el contenedor real (no instanciado a mano
    // en un test unitario) — si el useFactory/inject de TicketsModule no
    // incluyera ResolverCicloActivoParaCreacion, compile() ya habría lanzado
    // UnknownDependenciesException antes de llegar acá.
    const crearTicketUseCase = moduleRef.get(CrearTicketUseCase);
    expect(crearTicketUseCase).toBeInstanceOf(CrearTicketUseCase);

    // El propio resolver debe ser resolvible como provider exportado (ADR-1) —
    // confirma que compras/reparaciones/equipos (PR3-5) van a poder importarlo.
    expect(moduleRef.get(ResolverCicloActivoParaCreacion)).toBeInstanceOf(
      ResolverCicloActivoParaCreacion,
    );

    // Verificación de wiring POSICIONAL (no solo "resuelve algo"): un useFactory
    // con `inject` desalineado respecto de sus parámetros NO lanza en compile()
    // — Nest simplemente pasa los valores en el orden dado, y un parámetro sin
    // entrada correspondiente en `inject` recibe el valor del siguiente token
    // (o `undefined`), silenciosamente. Confirmado empíricamente quitando
    // `ResolverCicloActivoParaCreacion` del array `inject` de CrearTicketUseCase:
    // compile()/init() siguieron pasando, pero el campo quedaba con la instancia
    // de OTRO provider (no `ResolverCicloActivoParaCreacion`). Por eso este test
    // inspecciona el campo real de la instancia, no solo su tipo declarado.
    const resolverInjectado = (crearTicketUseCase as unknown as { resolverCicloActivo: unknown })
      .resolverCicloActivo;
    expect(resolverInjectado).toBeInstanceOf(ResolverCicloActivoParaCreacion);

    // ListarTicketsUseCase resuelto con CICLO_CLIENTE_REPOSITORY wireado (ADR-5).
    const listarTicketsUseCase = moduleRef.get(ListarTicketsUseCase);
    expect(listarTicketsUseCase).toBeInstanceOf(ListarTicketsUseCase);
    expect(moduleRef.get(CICLO_CLIENTE_REPOSITORY)).toBeDefined();
    const cicloRepoInjectado = (listarTicketsUseCase as unknown as { cicloClienteRepo: unknown })
      .cicloClienteRepo;
    expect(cicloRepoInjectado).toBe(moduleRef.get(CICLO_CLIENTE_REPOSITORY));

    await moduleRef.close();
  });

  // PR3 (notif-email-estado-ticket, task 3.8) + PR6 (runtime-config-table,
  // task 6.13): EMAIL_SENDER/SOLICITANTE_EMAIL_RESOLVER/CONFIG_RESOLVER +
  // NotificarCambioEstadoHandler/Listener wireados. EMAIL_SENDER ya NO es
  // fail-fast (Dz11, PR6): `useFactory: () => new NodemailerEmailSender()`
  // (Judgment Day PR6 Ronda 1, item 4 — antes `useClass`, frágil ante un
  // futuro `@Injectable()` en la clase), sin `fromEnv()` — resuelve siempre,
  // sin depender de env SMTP.
  it('resuelve EMAIL_SENDER a un NodemailerEmailSender real y wirea SOLICITANTE_EMAIL_RESOLVER + CONFIG_RESOLVER + handler/listener', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, TicketsModule],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(EMAIL_SENDER)).toBeInstanceOf(NodemailerEmailSender);
    expect(moduleRef.get(SOLICITANTE_EMAIL_RESOLVER)).toBeInstanceOf(SolicitanteEmailResolver);
    const handler = moduleRef.get(NotificarCambioEstadoHandler);
    expect(handler).toBeInstanceOf(NotificarCambioEstadoHandler);
    expect(moduleRef.get(NotificarCambioEstadoListener)).toBeInstanceOf(
      NotificarCambioEstadoListener,
    );

    await moduleRef.close();
  });

  // Judgment Day PR6 Ronda 1, item 3: reemplaza la introspección previa
  // `(handler as unknown as { configResolver: unknown }).configResolver`
  // (prohibida, DoD §9 — `as unknown as`) por verificación de wiring
  // POSICIONAL vía COMPORTAMIENTO, mismo criterio que
  // `notificar-cambio-estado.listener.spec.ts` de este PR (cero casts,
  // stubs tipados de los 3 ports).
  //
  // Se overridean CONFIG_RESOLVER/SOLICITANTE_EMAIL_RESOLVER/EMAIL_SENDER con
  // stubs DISTINGUIBLES antes de compile() — Nest sigue resolviendo el
  // useFactory de NotificarCambioEstadoHandler con el MISMO array `inject` de
  // producción (`tickets.module.ts`), solo cambia lo que cada token
  // resuelve. Si `inject` estuviera desalineado respecto de los parámetros
  // del useFactory (el bug real que este test previene — ver comentario del
  // test anterior), `emailSenderStub.send()` recibiría un valor que NO es el
  // `SmtpConfig` devuelto por `configResolverStub`, porque el primer
  // parámetro habría quedado bindeado a otro provider. Se detecta por
  // identidad de referencia del objeto `SmtpConfig`, sin tocar ningún campo
  // privado de la instancia.
  it('CONFIG_RESOLVER es efectivamente el primer parámetro posicional del useFactory de NotificarCambioEstadoHandler (verificación vía comportamiento)', async () => {
    const smtpConfig = SmtpConfig.create({
      host: 'smtp.wiring-test.com',
      port: 587,
      secure: false,
      user: 'no-reply@wiring-test.com',
      pass: 'wiring-secret',
      from: 'Soporte <no-reply@wiring-test.com>',
    }).getValue();
    const email = Email.create('solicitante@wiring-test.com').getValue();

    const configResolverStub = { resolveSmtp: vi.fn().mockResolvedValue(Result.ok(smtpConfig)) };
    const solicitanteResolverStub = { resolver: vi.fn().mockResolvedValue(Result.ok(email)) };
    const emailSenderStub = { send: vi.fn().mockResolvedValue(Result.ok(undefined)) };

    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, TicketsModule],
    })
      .overrideProvider(CONFIG_RESOLVER)
      .useValue(configResolverStub)
      .overrideProvider(SOLICITANTE_EMAIL_RESOLVER)
      .useValue(solicitanteResolverStub)
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSenderStub)
      .compile();

    await moduleRef.init();

    const handler = moduleRef.get(NotificarCambioEstadoHandler);
    const event = new TicketEstadoCambiado(
      'ticket-wiring-1',
      'SOP-2026-99999',
      'Ticket de wiring test',
      'SOPORTE',
      'estado-anterior-id',
      'estado-nuevo-id',
      'EN_PROGRESO',
      'RESUELTO',
      'solicitante-wiring-1',
      'autor-wiring-1',
      'tenant-wiring-1',
      new Date('2026-07-30T12:00:00.000Z'),
    );

    const outcome = await handler.handle(event);

    expect(configResolverStub.resolveSmtp).toHaveBeenCalledWith('tenant-wiring-1');
    expect(emailSenderStub.send).toHaveBeenCalledWith(expect.anything(), smtpConfig);
    expect(outcome.status).toBe('sent');

    await moduleRef.close();
  });

  // R6 (runtime-config-table PR6, spec Requirement 6): el fail-fast de boot
  // por config SMTP SE ELIMINÓ — la app arranca SIEMPRE, con o sin fila de
  // `ConfiguracionRuntime` categoría `smtp` en DB (y sin ningún env `SMTP_*`,
  // que ya no se lee en ningún punto del wiring). Reemplaza el test previo
  // "rechaza el bootstrap si falta SMTP_HOST" (Judgment Day PR3 Ronda 2 de
  // notif-email-estado-ticket), obsoleto tras el swap: `SmtpConfigError`/
  // `email-config.ts` ya NO existen (task 6.6).
  it('arranca sin throw aunque no haya ninguna fila ConfiguracionRuntime de categoría smtp ni env SMTP_* (R6, fail-fast corrido a send-time)', async () => {
    await expect(
      Test.createTestingModule({
        imports: [SharedModule, TicketsModule],
      }).compile(),
    ).resolves.toBeDefined();
  });
});
