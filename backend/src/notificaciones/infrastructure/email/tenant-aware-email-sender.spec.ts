/**
 * WU5 5.5 [UNIT] — TenantAwareEmailSender: resolución de la identidad SMTP
 * por cliente en cada `send()`, con caché de transporter keyeada por
 * `configRevision` (D3) y las tres degradaciones explícitas de D2/D3.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D2, D3.
 * Ref tasks: WU5 5.5.
 */
import { TenantAwareEmailSender } from './tenant-aware-email-sender';
import { ClienteEmailConfigForSend } from '../../../clientes/domain/ports/i-cliente-email-config.repository';

function makeConfig(overrides: Partial<ClienteEmailConfigForSend> = {}): ClienteEmailConfigForSend {
  return {
    host: 'smtp.cliente.com',
    port: 587,
    user: 'usuario',
    password: 'contraseña-en-claro',
    secure: false,
    from: 'no-responder@cliente.com',
    configRevision: 1_000,
    ...overrides,
  };
}

function makeHarness(clienteId: string | null = 'cliente-uuid') {
  const tenantContext = {
    get: vi.fn().mockReturnValue(clienteId !== null ? { clienteId } : undefined),
  };
  const emailConfigRepo = { findForSend: vi.fn() };
  const logger = { log: vi.fn() };
  const fakeSend = vi.fn().mockResolvedValue(undefined);
  const createSender = vi.fn().mockImplementation(() => ({ send: fakeSend }));

  const sender = new TenantAwareEmailSender(
    tenantContext as never,
    emailConfigRepo as never,
    logger,
    createSender,
  );

  return { sender, tenantContext, emailConfigRepo, logger, createSender, fakeSend };
}

const MENSAJE = { to: 'destinatario@dominio.com', subject: 'Asunto', text: 'cuerpo' };

describe('TenantAwareEmailSender', () => {
  it('sin TenantContext activo: no envía, no lanza, y loguea razón distinguible', async () => {
    const { sender, emailConfigRepo, logger } = makeHarness(null);

    await expect(sender.send(MENSAJE)).resolves.toBeUndefined();

    expect(emailConfigRepo.findForSend).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('EMAIL_SIN_TENANT_CONTEXT'));
  });

  it('cliente sin configuración: no envía, no lanza, y loguea razón distinta a "sin tenant context"', async () => {
    const { sender, emailConfigRepo, logger, createSender } = makeHarness('cliente-uuid');
    emailConfigRepo.findForSend.mockResolvedValue(null);

    await expect(sender.send(MENSAJE)).resolves.toBeUndefined();

    expect(createSender).not.toHaveBeenCalled();
    const logged = logger.log.mock.calls[0][0] as string;
    expect(logged).toContain('EMAIL_CLIENTE_SIN_CONFIG');
    expect(logged).toContain('cliente-uuid');
    expect(logged).not.toContain('EMAIL_SIN_TENANT_CONTEXT');
  });

  it('[CRITICAL] "sin config" y "sin tenant context" nunca comparten el mismo literal de razón', async () => {
    const sinContexto = makeHarness(null);
    await sinContexto.sender.send(MENSAJE);
    const razonSinContexto = sinContexto.logger.log.mock.calls[0][0] as string;

    const sinConfig = makeHarness('cliente-uuid');
    sinConfig.emailConfigRepo.findForSend.mockResolvedValue(null);
    await sinConfig.sender.send(MENSAJE);
    const razonSinConfig = sinConfig.logger.log.mock.calls[0][0] as string;

    expect(razonSinContexto).not.toEqual(razonSinConfig);
    expect(razonSinContexto.split(' | ')[0]).not.toBe(razonSinConfig.split(' | ')[0]);
  });

  it('descifrado fallido (típicamente EMAIL_CRYPTO_KEY ausente): no envía, no lanza, razón propia', async () => {
    const { sender, emailConfigRepo, logger, createSender } = makeHarness('cliente-uuid');
    emailConfigRepo.findForSend.mockRejectedValue(
      new Error('EMAIL_CRYPTO_KEY ausente o inválida — no se puede descifrar el secreto'),
    );

    await expect(sender.send(MENSAJE)).resolves.toBeUndefined();

    expect(createSender).not.toHaveBeenCalled();
    const logged = logger.log.mock.calls[0][0] as string;
    expect(logged).toContain('EMAIL_CRYPTO_KEY_AUSENTE');
    expect(logged).toContain('cliente-uuid');
  });

  it('cliente configurado: delega el envío al sender construido con su propia config', async () => {
    const { sender, emailConfigRepo, createSender, fakeSend } = makeHarness('cliente-uuid');
    emailConfigRepo.findForSend.mockResolvedValue(makeConfig());

    await sender.send(MENSAJE);

    expect(createSender).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.cliente.com',
        user: 'usuario',
        pass: 'contraseña-en-claro',
        from: 'no-responder@cliente.com',
      }),
      expect.anything(),
    );
    expect(fakeSend).toHaveBeenCalledWith(MENSAJE);
  });

  it('[CRITICAL] cliente con config completa: ninguna línea logueada contiene la contraseña en texto plano', async () => {
    // Regresión del spec "Password absent from logs" (#2362): probar que las
    // razones de degradación SON distinguibles (arriba) no prueba que la
    // contraseña NO esté en algún log — son afirmaciones distintas. Este
    // test captura TODO lo que pasó por `logger.log` durante un envío feliz
    // y muerde si algún día alguien mete la contraseña en una línea de log
    // (p.ej. un log de diagnóstico agregado al happy path).
    const { sender, emailConfigRepo, logger, createSender } = makeHarness('cliente-uuid');
    const PASSWORD = 'contraseña-super-secreta-M4gic!';
    emailConfigRepo.findForSend.mockResolvedValue(makeConfig({ password: PASSWORD }));

    await sender.send(MENSAJE);

    expect(createSender).toHaveBeenCalledTimes(1); // confirma que se ejecutó el happy path
    const lineasLogueadas = logger.log.mock.calls.flat().map((arg) => String(arg));
    expect(lineasLogueadas.some((linea) => linea.includes(PASSWORD))).toBe(false);
  });

  it('dos clientes distintos nunca comparten transporter cacheado', async () => {
    const { emailConfigRepo, createSender } = makeHarness();
    const tenantContext = {
      get: vi
        .fn()
        .mockReturnValueOnce({ clienteId: 'cliente-a' })
        .mockReturnValueOnce({ clienteId: 'cliente-b' }),
    };
    const senderMultiTenant = new TenantAwareEmailSender(
      tenantContext as never,
      emailConfigRepo as never,
      { log: vi.fn() },
      createSender,
    );
    emailConfigRepo.findForSend.mockResolvedValue(makeConfig({ configRevision: 500 }));

    await senderMultiTenant.send(MENSAJE);
    await senderMultiTenant.send(MENSAJE);

    expect(createSender).toHaveBeenCalledTimes(2);
  });

  it('misma revisión: reusa el transporter cacheado en el segundo envío (cache HIT)', async () => {
    const { sender, emailConfigRepo, createSender } = makeHarness('cliente-uuid');
    emailConfigRepo.findForSend.mockResolvedValue(makeConfig({ configRevision: 1_000 }));

    await sender.send(MENSAJE);
    await sender.send(MENSAJE);

    expect(createSender).toHaveBeenCalledTimes(1);
  });

  it('[CRITICAL] cambiar la config del cliente invalida el transporter cacheado (cache MISS tras bump de revisión)', async () => {
    // Esta es la garantía central del diseño D3: si esto no muerde, un
    // cambio de contraseña de un cliente sigue mandando con las
    // credenciales VIEJAS hasta que el proceso reinicia, sin ningún error
    // visible — los mails "siguen saliendo bien".
    const { sender, emailConfigRepo, createSender, fakeSend } = makeHarness('cliente-uuid');
    emailConfigRepo.findForSend.mockResolvedValueOnce(
      makeConfig({ configRevision: 1_000, password: 'clave-vieja' }),
    );

    await sender.send(MENSAJE);
    expect(createSender).toHaveBeenCalledTimes(1);

    // El cliente cambió su config SMTP — revisión bumpeada (nueva
    // `smtp_config_updated_at`).
    emailConfigRepo.findForSend.mockResolvedValueOnce(
      makeConfig({ configRevision: 2_000, password: 'clave-nueva' }),
    );

    await sender.send(MENSAJE);

    expect(createSender).toHaveBeenCalledTimes(2);
    expect(createSender).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pass: 'clave-nueva' }),
      expect.anything(),
    );
    expect(fakeSend).toHaveBeenCalledTimes(2);
  });
});
