/**
 * emitir-encuesta.use-case.spec.ts — TDD RED→GREEN (Tarea 6.1).
 *
 * `IEncuestaTokenRepository`/`IEmailSender` 100% fake (sin Nest, sin DB).
 * Cubre exactamente lo que la secuencia promete: revocar-antes-de-persistir,
 * el token crudo nunca guardado, el largo del token, y el contenido del mail.
 *
 * Ref spec: sdd/csat/spec, Requirement "Emisión de token al cierre del
 * ticket", "Revocación de tokens previos en reapertura". Ref design: flujo de
 * datos. Tarea: 6.1.
 */
import * as crypto from 'crypto';
import { EmitirEncuestaUseCase, EmitirEncuestaRequest } from './emitir-encuesta.use-case';
import { IEncuestaTokenRepository } from '../../domain/ports/i-encuesta-token.repository';
import { EncuestaTokenEntity } from '../../domain/entities/encuesta-token.entity';
import { IEmailSender, EmailMessage } from '../../../shared/domain/ports/i-email-sender';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const TICKET_ID = '01977a00-0000-7000-8000-0000000000t1';

function makeFakeTokenRepo(): IEncuestaTokenRepository {
  return {
    findByHash: vi.fn(),
    save: vi.fn(),
    revocarVigentesDeTicket: vi.fn().mockResolvedValue(1),
    marcarUsadoSiNoUsado: vi.fn(),
    liberarUso: vi.fn(),
  };
}

function makeFakeEmailSender(): Pick<IEmailSender, 'send'> {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function makeRequest(overrides: Partial<EmitirEncuestaRequest> = {}): EmitirEncuestaRequest {
  return {
    clienteId: CLIENTE_ID,
    ticketId: TICKET_ID,
    numeroTicket: 'SOP-2026-00042',
    tituloTicket: 'La impresora no imprime',
    destinatarioEmail: 'solicitante@ejemplo.com',
    appBaseUrl: 'https://soporte.miempresa.com',
    ...overrides,
  };
}

/** Extrae el token crudo del link embebido en el mail enviado (único punto donde viaja). */
function extraerTokenCrudoDelMail(emailSender: Pick<IEmailSender, 'send'>): string {
  const send = emailSender.send as ReturnType<typeof vi.fn>;
  const mensaje = send.mock.calls[0][0] as EmailMessage;
  const match = /\/encuesta\/([a-f0-9]+)/.exec(mensaje.text);
  if (!match) {
    throw new Error('El mail enviado no contiene un link de encuesta con token.');
  }
  return match[1];
}

describe('EmitirEncuestaUseCase', () => {
  it('revoca los tokens vigentes del ticket ANTES de persistir el nuevo', async () => {
    const tokenRepo = makeFakeTokenRepo();
    const emailSender = makeFakeEmailSender();
    const useCase = new EmitirEncuestaUseCase(tokenRepo, emailSender);

    await useCase.ejecutar(makeRequest());

    expect(tokenRepo.revocarVigentesDeTicket).toHaveBeenCalledWith(CLIENTE_ID, TICKET_ID);
    const revocarOrder = (tokenRepo.revocarVigentesDeTicket as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const saveOrder = (tokenRepo.save as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(revocarOrder).toBeLessThan(saveOrder);
  });

  it('genera un token opaco de 32 bytes (64 caracteres hex)', async () => {
    const tokenRepo = makeFakeTokenRepo();
    const emailSender = makeFakeEmailSender();
    const useCase = new EmitirEncuestaUseCase(tokenRepo, emailSender);

    await useCase.ejecutar(makeRequest());

    const tokenCrudo = extraerTokenCrudoDelMail(emailSender);
    expect(tokenCrudo).toHaveLength(64);
  });

  it('persiste ÚNICAMENTE el hash SHA-256 del token — el crudo nunca se guarda', async () => {
    const tokenRepo = makeFakeTokenRepo();
    const emailSender = makeFakeEmailSender();
    const useCase = new EmitirEncuestaUseCase(tokenRepo, emailSender);

    await useCase.ejecutar(makeRequest());

    const tokenCrudo = extraerTokenCrudoDelMail(emailSender);
    const hashEsperado = crypto.createHash('sha256').update(tokenCrudo).digest('hex');

    const save = tokenRepo.save as ReturnType<typeof vi.fn>;
    expect(save).toHaveBeenCalledTimes(1);
    const tokenGuardado = save.mock.calls[0][0] as EncuestaTokenEntity;
    expect(tokenGuardado.tokenHash).toBe(hashEsperado);
    expect(tokenGuardado.tokenHash).not.toBe(tokenCrudo);
    expect(tokenGuardado.clienteId).toBe(CLIENTE_ID);
    expect(tokenGuardado.ticketId).toBe(TICKET_ID);
  });

  it('envía el mail al destinatario con el link a la página pública de encuesta', async () => {
    const tokenRepo = makeFakeTokenRepo();
    const emailSender = makeFakeEmailSender();
    const useCase = new EmitirEncuestaUseCase(tokenRepo, emailSender);

    await useCase.ejecutar(makeRequest());

    const send = emailSender.send as ReturnType<typeof vi.fn>;
    expect(send).toHaveBeenCalledTimes(1);
    const mensaje = send.mock.calls[0][0] as EmailMessage;
    expect(mensaje.to).toBe('solicitante@ejemplo.com');
    expect(mensaje.text).toContain('SOP-2026-00042');
    expect(mensaje.text).toContain('https://soporte.miempresa.com/encuesta/');
  });
});
