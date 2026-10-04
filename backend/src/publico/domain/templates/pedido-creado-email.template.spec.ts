import { templatePedidoCreado } from './pedido-creado-email.template';

describe('templatePedidoCreado', () => {
  it('lleva el número y el cliente en asunto, texto y html', () => {
    const r = templatePedidoCreado({
      nombre: 'Ana',
      clienteNombre: 'Colegio A',
      numero: 'T-2026-0007',
    });

    expect(r.subject).toContain('T-2026-0007');
    expect(r.subject).toContain('Colegio A');
    expect(r.text).toContain('T-2026-0007');
    expect(r.html).toContain('<strong>T-2026-0007</strong>');
  });

  it('escapa nombre y cliente en el html pero no en el texto', () => {
    const r = templatePedidoCreado({
      nombre: '<script>alert(1)</script>',
      clienteNombre: 'A & "B"',
      numero: '1',
    });

    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.html).toContain('A &amp; &quot;B&quot;');
    expect(r.text).toContain('<script>alert(1)</script>');
  });
});
