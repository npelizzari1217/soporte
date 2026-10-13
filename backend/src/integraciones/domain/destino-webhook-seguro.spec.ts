import type { LookupAddress } from 'node:dns';
import {
  BuscarDirecciones,
  esIpPublica,
  LARGO_MAXIMO_URL_WEBHOOK,
  resolverDestinoSeguro,
  validarUrlDestino,
} from './destino-webhook-seguro';
import {
  DestinoWebhookIrresolubleError,
  DestinoWebhookNoPublicoError,
  UrlWebhookInvalidaError,
} from './integraciones.errors';

describe('esIpPublica', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.0',
    '100.63.255.255',
    '100.128.0.0',
    '11.0.0.1',
  ])('acepta la IPv4 pública %s', (ip) => {
    expect(esIpPublica(ip)).toBe(true);
  });

  it.each([
    ['0.0.0.0', 'esta red'],
    ['0.1.2.3', 'esta red'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['10.0.0.1', 'privada 10/8'],
    ['172.16.0.1', 'privada 172.16/12'],
    ['172.31.255.255', 'privada 172.16/12'],
    ['192.168.1.1', 'privada 192.168/16'],
    ['169.254.169.254', 'link-local (metadatos)'],
    ['100.64.0.1', 'CGNAT'],
    ['100.127.255.255', 'CGNAT'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.255', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['240.0.0.1', 'reservada'],
    ['192.0.2.10', 'documentación'],
    ['198.18.0.1', 'benchmarking'],
  ])('rechaza la IPv4 %s (%s)', (ip) => {
    expect(esIpPublica(ip)).toBe(false);
  });

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001:80b::200e'])(
    'acepta la IPv6 pública %s',
    (ip) => {
      expect(esIpPublica(ip)).toBe(true);
    },
  );

  it.each([
    ['::', 'no especificada'],
    ['::1', 'loopback'],
    ['fe80::1', 'link-local'],
    ['febf:ffff::1', 'link-local'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456::1', 'unique-local'],
    ['ff02::1', 'multicast'],
    ['2001:db8::1', 'documentación'],
    ['2001:0:4136:e378::1', 'Teredo'],
    ['2002:7f00:1::1', '6to4'],
    ['64:ff9b::7f00:1', 'NAT64'],
    ['::7f00:1', 'IPv4 compatible'],
  ])('rechaza la IPv6 %s (%s)', (ip) => {
    expect(esIpPublica(ip)).toBe(false);
  });

  it('juzga una IPv6 con IPv4 embebida por la IPv4', () => {
    expect(esIpPublica('::ffff:127.0.0.1')).toBe(false);
    expect(esIpPublica('::ffff:10.1.2.3')).toBe(false);
    expect(esIpPublica('::ffff:169.254.169.254')).toBe(false);
    expect(esIpPublica('::ffff:7f00:1')).toBe(false);
    expect(esIpPublica('0:0:0:0:0:ffff:c0a8:0101')).toBe(false);
    expect(esIpPublica('::ffff:8.8.8.8')).toBe(true);
    expect(esIpPublica('::ffff:808:808')).toBe(true);
  });

  it('rechaza lo que no es una IP', () => {
    expect(esIpPublica('')).toBe(false);
    expect(esIpPublica('example.com')).toBe(false);
    expect(esIpPublica('256.0.0.1')).toBe(false);
    expect(esIpPublica('fe80::1%eth0')).toBe(false);
  });
});

describe('validarUrlDestino', () => {
  const motivo = (url: string) => {
    const r = validarUrlDestino(url);
    expect(r.isFail()).toBe(true);
    const error = r.getError();
    expect(error).toBeInstanceOf(UrlWebhookInvalidaError);
    return error.message;
  };

  it('acepta una URL HTTPS con hostname y la devuelve parseada', () => {
    const r = validarUrlDestino('https://hooks.example.com:8443/soporte?x=1');
    expect(r.isOk()).toBe(true);
    expect(r.getValue().hostname).toBe('hooks.example.com');
  });

  it('acepta una IP literal pública, v4 o v6', () => {
    expect(validarUrlDestino('https://8.8.8.8/hook').isOk()).toBe(true);
    expect(validarUrlDestino('https://[2606:4700:4700::1111]/hook').isOk()).toBe(true);
  });

  it('rechaza lo que no es HTTPS', () => {
    expect(motivo('http://hooks.example.com/')).toMatch(/HTTPS/);
    expect(motivo('ftp://hooks.example.com/')).toMatch(/HTTPS/);
    expect(motivo('file:///etc/passwd')).toMatch(/HTTPS/);
  });

  it('rechaza lo que no es una URL', () => {
    expect(motivo('hooks.example.com')).toMatch(/no es una URL/);
    expect(motivo('')).toMatch(/no es una URL/);
  });

  it('rechaza credenciales en la URL', () => {
    expect(motivo('https://usuario:clave@hooks.example.com/')).toMatch(/credenciales/);
    expect(motivo('https://usuario@hooks.example.com/')).toMatch(/credenciales/);
  });

  it.each([
    'https://127.0.0.1/',
    'https://127.1/',
    'https://0x7f000001/',
    'https://2130706433/',
    'https://10.0.0.5/',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/',
    'https://[::]/',
    'https://[fe80::1]/',
    'https://[fd00::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:a00:1]/',
  ])('rechaza la IP literal no pública de %s', (url) => {
    expect(motivo(url)).toMatch(/IP que no es pública/);
  });

  it('rechaza localhost y sus subdominios', () => {
    expect(motivo('https://localhost/')).toMatch(/máquina local/);
    expect(motivo('https://LOCALHOST./')).toMatch(/máquina local/);
    expect(motivo('https://api.localhost/')).toMatch(/máquina local/);
  });

  it('acepta hasta el largo de la columna y rechaza uno más', () => {
    const base = 'https://hooks.example.com/';
    const justa = base + 'a'.repeat(LARGO_MAXIMO_URL_WEBHOOK - base.length);
    expect(validarUrlDestino(justa).isOk()).toBe(true);
    expect(motivo(`${justa}a`)).toMatch(/2048/);
  });

  it('rechaza una URL que crece por encima del máximo al normalizarse', () => {
    const base = 'https://hooks.example.com/';
    const url = base + 'á'.repeat(LARGO_MAXIMO_URL_WEBHOOK - base.length);
    expect(url.length).toBe(LARGO_MAXIMO_URL_WEBHOOK);
    expect(motivo(url)).toMatch(/2048/);
  });
});

describe('resolverDestinoSeguro', () => {
  const fake = (direcciones: LookupAddress[]) => {
    const llamadas: Array<{ hostname: string; opciones: { all: true } }> = [];
    const buscar: BuscarDirecciones = (hostname, opciones) => {
      llamadas.push({ hostname, opciones });
      return Promise.resolve(direcciones);
    };
    return { buscar, llamadas };
  };

  it('devuelve todas las direcciones si todas son públicas', async () => {
    const direcciones = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ];
    const { buscar, llamadas } = fake(direcciones);

    const r = await resolverDestinoSeguro('hooks.example.com', buscar);

    expect(r.isOk()).toBe(true);
    expect(r.getValue()).toEqual(direcciones);
    expect(llamadas).toEqual([{ hostname: 'hooks.example.com', opciones: { all: true } }]);
  });

  it('rechaza una respuesta mixta aunque la primera dirección sea pública', async () => {
    const { buscar } = fake([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.7', family: 4 },
    ]);

    const r = await resolverDestinoSeguro('mixto.example.com', buscar);

    expect(r.getError()).toBeInstanceOf(DestinoWebhookNoPublicoError);
  });

  it.each(['127.0.0.1', '169.254.169.254', '::1', '::ffff:192.168.0.1', 'fd00::1'])(
    'rechaza un host que resuelve a %s',
    async (address) => {
      const { buscar } = fake([{ address, family: address.includes(':') ? 6 : 4 }]);

      const r = await resolverDestinoSeguro('rebind.example.com', buscar);

      expect(r.getError()).toBeInstanceOf(DestinoWebhookNoPublicoError);
    },
  );

  it('un host sin respuestas o que no resuelve es irresoluble', async () => {
    expect(
      (await resolverDestinoSeguro('vacio.example.com', fake([]).buscar)).getError(),
    ).toBeInstanceOf(DestinoWebhookIrresolubleError);
    const falla: BuscarDirecciones = () => Promise.reject(new Error('ENOTFOUND'));
    expect((await resolverDestinoSeguro('nada.invalid', falla)).getError()).toBeInstanceOf(
      DestinoWebhookIrresolubleError,
    );
  });

  it('quita los corchetes de una IPv6 literal antes de resolver', async () => {
    const { buscar, llamadas } = fake([{ address: '2606:4700:4700::1111', family: 6 }]);

    await resolverDestinoSeguro('[2606:4700:4700::1111]', buscar);

    expect(llamadas[0].hostname).toBe('2606:4700:4700::1111');
  });
});
