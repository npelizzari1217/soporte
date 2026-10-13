/**
 * HTTP saliente de los webhooks (odd/webhooks, T5) contra un servidor HTTPS local con un
 * certificado autofirmado que se genera con `openssl` al arrancar el spec. El host de las URLs es
 * `webhook.prueba.invalid`: `.invalid` nunca resuelve (RFC 6761), así que un envío que llega solo
 * pudo conectarse a la dirección fijada (127.0.0.1), con el SNI y el certificado del nombre real.
 * Prueba además que un 302 no se sigue, que el timeout corta y que una respuesta enorme no se lee.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TLSSocket } from 'node:tls';
import { SolicitudWebhook } from '../domain/cliente-http-webhook.port';
import { HttpsClienteWebhook } from './https-cliente-webhook.adapter';

const HOST = 'webhook.prueba.invalid';
const LOOPBACK = [{ address: '127.0.0.1', family: 4 }];

interface PedidoRecibido {
  metodo?: string;
  ruta?: string;
  host?: string;
  sni?: string;
  firma?: string;
  cuerpo: string;
}

describe('HttpsClienteWebhook (odd/webhooks T5)', () => {
  let carpeta: string;
  let servidor: Server;
  let puerto: number;
  let cliente: HttpsClienteWebhook;
  const recibidos: PedidoRecibido[] = [];
  let respuestaEnormeCerrada: Promise<void>;
  let avisarCierre: () => void = () => undefined;

  function atender(req: IncomingMessage, res: ServerResponse): void {
    const partes: Buffer[] = [];
    req.on('data', (parte: Buffer) => partes.push(parte));
    req.on('end', () => {
      recibidos.push({
        metodo: req.method,
        ruta: req.url,
        host: req.headers.host,
        sni: req.socket instanceof TLSSocket ? String(req.socket.servername) : undefined,
        firma:
          typeof req.headers['x-soporte-firma'] === 'string'
            ? req.headers['x-soporte-firma']
            : undefined,
        cuerpo: Buffer.concat(partes).toString('utf8'),
      });
      if (req.url === '/redirige') {
        res.writeHead(302, { Location: '/destino-de-la-redireccion' }).end();
      } else if (req.url === '/colgado') {
        // No responde nunca: lo corta el timeout del adaptador.
      } else if (req.url === '/enorme') {
        res.on('close', () => avisarCierre());
        res.writeHead(200);
        const trozo = Buffer.alloc(64 * 1024, 'x');
        const escribir = (): void => {
          while (!res.destroyed && res.write(trozo)) {
            /* llena el buffer hasta que el socket pida esperar */
          }
          if (!res.destroyed) res.once('drain', escribir);
        };
        escribir();
      } else {
        res.writeHead(200).end('ok');
      }
    });
  }

  beforeAll(async () => {
    carpeta = mkdtempSync(join(tmpdir(), 'webhook-tls-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-keyout',
        join(carpeta, 'key.pem'),
        '-out',
        join(carpeta, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        `/CN=${HOST}`,
        '-addext',
        `subjectAltName=DNS:${HOST}`,
      ],
      { stdio: 'ignore' },
    );
    const cert = readFileSync(join(carpeta, 'cert.pem'));
    servidor = createServer({ key: readFileSync(join(carpeta, 'key.pem')), cert }, atender);
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    const direccion = servidor.address();
    puerto =
      typeof direccion === 'object' && direccion ? (direccion satisfies AddressInfo).port : 0;
    cliente = new HttpsClienteWebhook({ ca: cert });
  });

  afterAll(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    rmSync(carpeta, { recursive: true, force: true });
  });

  beforeEach(() => {
    recibidos.length = 0;
    respuestaEnormeCerrada = new Promise<void>((resolve) => {
      avisarCierre = resolve;
    });
  });

  const solicitud = (ruta: string, cambios: Partial<SolicitudWebhook> = {}): SolicitudWebhook => ({
    url: new URL(`https://${HOST}:${puerto}${ruta}`),
    direcciones: LOOPBACK,
    headers: { 'Content-Type': 'application/json', 'X-Soporte-Firma': 'abc123' },
    body: '{"evento":"ticket.creado"}',
    timeoutMs: 5_000,
    ...cambios,
  });

  it('se conecta a la dirección fijada sin resolver el host, con el Host y el SNI del nombre real', async () => {
    const respuesta = await cliente.enviar(solicitud('/hook?origen=soporte'));

    expect(respuesta).toEqual({ status: 200 });
    expect(recibidos).toEqual([
      {
        metodo: 'POST',
        ruta: '/hook?origen=soporte',
        host: `${HOST}:${puerto}`,
        sni: HOST,
        firma: 'abc123',
        cuerpo: '{"evento":"ticket.creado"}',
      },
    ]);
  });

  it('verifica el certificado contra el nombre real: otro host fijado a la misma IP falla', async () => {
    const respuesta = await cliente.enviar(
      solicitud('/hook', { url: new URL(`https://otro.prueba.invalid:${puerto}/hook`) }),
    );

    expect(respuesta).toEqual({ error: 'error de conexión (ERR_TLS_CERT_ALTNAME_INVALID)' });
    expect(recibidos).toEqual([]);
  });

  it('no sigue una redirección: un 302 vuelve como código', async () => {
    const respuesta = await cliente.enviar(solicitud('/redirige'));

    expect(respuesta).toEqual({ status: 302 });
    expect(recibidos.map((r) => r.ruta)).toEqual(['/redirige']);
  });

  it('corta por timeout si el destino no responde', async () => {
    const inicio = Date.now();

    const respuesta = await cliente.enviar(solicitud('/colgado', { timeoutMs: 300 }));

    expect(respuesta).toEqual({ error: 'timeout' });
    expect(Date.now() - inicio).toBeLessThan(3_000);
  });

  it('lee solo el principio de una respuesta enorme y corta la conexión', async () => {
    const respuesta = await cliente.enviar(solicitud('/enorme', { timeoutMs: 3_000 }));

    // Sin el tope, la respuesta infinita terminaría en timeout.
    expect(respuesta).toEqual({ status: 200 });
    await respuestaEnormeCerrada;
  });

  it('una conexión rechazada vuelve como error corto, sin lanzar', async () => {
    const respuesta = await cliente.enviar(
      solicitud('/hook', { url: new URL(`https://${HOST}:1/hook`) }),
    );

    expect(respuesta).toEqual({ error: 'error de conexión (ECONNREFUSED)' });
  });
});
