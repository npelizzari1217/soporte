import { templateVerificarPedido } from './verificar-pedido-email.template';

const LINK = 'https://soporte.example/c/colegio-a/pedido/confirmar#token=abc123';

describe('templateVerificarPedido', () => {
  it('lleva el link en el texto y en el href, y la vigencia', () => {
    const r = templateVerificarPedido({
      nombre: 'Ana',
      clienteNombre: 'Colegio A',
      link: LINK,
      vigenciaHoras: 24,
    });

    expect(r.subject).toContain('Colegio A');
    expect(r.text).toContain(LINK);
    expect(r.text).toContain('24 horas');
    expect(r.html).toContain(`href="${LINK}"`);
  });

  it('escapa el nombre y el cliente en el html pero no en el texto', () => {
    const r = templateVerificarPedido({
      nombre: '<script>alert(1)</script>',
      clienteNombre: 'A & "B"',
      link: LINK,
      vigenciaHoras: 24,
    });

    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.html).toContain('A &amp; &quot;B&quot;');
    expect(r.text).toContain('<script>alert(1)</script>');
  });

  it('escapa el link dentro del atributo href', () => {
    const r = templateVerificarPedido({
      nombre: 'Ana',
      clienteNombre: 'Colegio A',
      link: 'https://x.example/a"><script>1</script>#token=t',
      vigenciaHoras: 24,
    });

    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&quot;&gt;&lt;script&gt;');
  });
});
