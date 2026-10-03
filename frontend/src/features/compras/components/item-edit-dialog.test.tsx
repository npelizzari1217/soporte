import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ItemEditDialog } from "./item-edit-dialog";
import type { ItemCompra } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "compra-1";

function buildItem(overrides: Partial<ItemCompra> = {}): ItemCompra {
  return {
    id: "item-1",
    compraId: COMPRA_ID,
    descripcion: "Insumo original",
    insumoId: null,
    insumoSeguimiento: null,
    cantidad: 2,
    proveedor: "ACME",
    monto: 100,
    moneda: "ARS",
    // Formato REAL del backend (`compras.dto.ts` serializa con `.toISOString()`),
    // no la forma ya normalizada: un fixture cómodo esconde el bug de precarga
    // del `<input type="date">`.
    fechaCotizacion: "2026-01-01T00:00:00.000Z",
    observaciones: null,
    estadoAprobacion: "PENDIENTE",
    decididoPorId: null,
    decididoEn: null,
    cantidadOrdenada: 0,
    cantidadRecibida: 0,
    cantidadEntregada: 0,
    fechaOrden: null,
    fechaRecepcion: null,
    fechaEntrega: null,
    totalItem: 0,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    comprado: false,
    entregado: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function abrirDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /editar ítem/i }));
  return user;
}

describe("ItemEditDialog", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("precarga los valores actuales del ítem", async () => {
    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/descripción/i)).toHaveValue("Insumo original");
    expect(screen.getByLabelText(/cantidad/i)).toHaveValue(2);
    expect(screen.getByLabelText(/proveedor/i)).toHaveValue("ACME");
    // El monto se precarga FORMATEADO (el campo arranca sin foco); vuelve a
    // crudo al enfocarlo, y lo que viaja en el PATCH sigue siendo el número.
    expect(screen.getByLabelText(/monto/i)).toHaveValue("100,00");
  });

  it("regresión: precarga la fecha de cotización aunque el backend la mande como datetime ISO — sin normalizar, el input queda VACÍO", async () => {
    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();

    expect(await screen.findByLabelText(/fecha de cotización/i)).toHaveValue("2026-01-01");
  });

  it("envía el PATCH con TODOS los campos cuando el ítem sigue PENDIENTE (sin congelamiento)", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ descripcion: "Insumo editado" }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const descripcionInput = await screen.findByLabelText(/descripción/i);
    await user.clear(descripcionInput);
    await user.type(descripcionInput, "Insumo editado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Insumo editado"));
    expect(capturedBody.cantidad).toBe(2);
    expect(capturedBody.monto).toBe(100);
    expect(capturedBody.moneda).toBe("ARS");
  });

  it("congelamiento (S13): con el ítem APROBADO, deshabilita cantidad/monto/moneda y NO los envía en el PATCH", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ estadoAprobacion: "APROBADO" }));
      }),
    );

    renderWithProviders(
      <ItemEditDialog compraId={COMPRA_ID} item={buildItem({ estadoAprobacion: "APROBADO" })} />,
      { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
    );

    const user = await abrirDialog();
    expect(await screen.findByLabelText(/cantidad/i)).toBeDisabled();
    // Congelado no se puede editar, así que se muestra siempre formateado.
    expect(screen.getByLabelText(/monto/i)).toBeDisabled();
    expect(screen.getByLabelText(/monto/i)).toHaveValue("100,00");
    expect(screen.getByLabelText(/moneda/i)).toBeDisabled();
    // S14: los campos libres siguen editables en APROBADO.
    expect(screen.getByLabelText(/proveedor/i)).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    // Regresión cero fantasma (R4): `monto` pasó a requerido en el schema,
    // pero el ítem DECIDIDO sigue guardando sin error — `disabled={decidido}`
    // es una prop JSX, no `register(...,{disabled:true})`, así que RHF
    // conserva el valor precargado y el resolver lo ve presente.
    await waitFor(() => expect(capturedBody.descripcion).toBe("Insumo original"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(capturedBody).not.toHaveProperty("cantidad");
    expect(capturedBody).not.toHaveProperty("monto");
    expect(capturedBody).not.toHaveProperty("moneda");
  });

  it("cero fantasma (R2/R3): limpiar monto de un ítem NO decidido y guardar NO pega a la API y muestra el error de requerido", async () => {
    let pegoALaApi = false;
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, () => {
        pegoALaApi = true;
        return HttpResponse.json(buildItem({ monto: 0 }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.clear(monto);
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/el monto es requerido/i)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(pegoALaApi).toBe(false);
  });

  it("hermano invertido: reemplazar el monto por 2000 en un ítem NO decidido sí envía el request con monto: 2000", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildItem({ monto: 2000 }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.clear(monto);
    await user.type(monto, "2000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.monto).toBe(2000));
  });

  /**
   * `MontoInput` deja el texto crudo en el form hasta el blur, y `Enter`
   * dentro de un `<form>` dispara el submit sin pasar por ahí: el resolver
   * tiene que aceptar el formato es-AR (`"1.000,50"`) igual que tras el blur.
   * `toHaveFocus()` es la guarda: si algún día se introduce un blur antes del
   * submit, este test dejaría de probar lo que dice.
   *
   * El PATCH se difiere con una promesa manual: si se resolviera de entrada,
   * el cierre del diálogo en `onSuccess` movería el foco dentro del mismo
   * `await user.keyboard("{Enter}")`, antes de poder comprobarlo.
   */
  it("Enter sin blur con monto en formato es-AR envía el número correcto", async () => {
    let resolverRespuesta: () => void = () => {};
    const respuestaPendiente = new Promise<void>((resolve) => {
      resolverRespuesta = resolve;
    });
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        await respuestaPendiente;
        return HttpResponse.json(buildItem({ monto: 1234567.89 }));
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.click(monto);
    await user.clear(monto);
    await user.paste("1.234.567,89");
    await user.keyboard("{Enter}");

    expect(monto).toHaveFocus();
    resolverRespuesta();
    await waitFor(() => expect(capturedBody.monto).toBe(1234567.89));
  });

  /** Hermano invertido: un valor inválido sigue bloqueando el envío por Enter sin blur. */
  it("Enter sin blur con monto inválido sigue bloqueando el envío", async () => {
    let pegoALaApi = false;
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, () => {
        pegoALaApi = true;
        return HttpResponse.json(buildItem());
      }),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    const user = await abrirDialog();
    const monto = await screen.findByLabelText(/monto/i);
    await user.click(monto);
    await user.clear(monto);
    await user.paste("abc");
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/ingresá un monto válido/i)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(pegoALaApi).toBe(false);
  });

  it("muestra el error de dominio del backend (422) al usuario", async () => {
    const MENSAJE_BACKEND = "El ítem está congelado.";
    server.use(
      http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem()} />, {
      user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
    });

    await abrirDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });

  /**
   * El insumo del ítem (insumos-entrega-3). Dos clases de defecto medidas en
   * este repo se cruzan acá: el `<select>` con un valor fuera de catálogo y la
   * sincronización de un diálogo que vive en una fila de tabla.
   */
  describe("insumo del ítem", () => {
    const CATALOGO = [
      {
        id: "ins-1",
        codigo: "TON-001",
        nombre: "Tóner negro",
        familiaId: "fam-1",
        unidadMedidaId: "um-1",
        stockMinimo: null,
        activo: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "ins-2",
        codigo: "PAP-002",
        nombre: "Papel A4",
        familiaId: "fam-1",
        unidadMedidaId: "um-1",
        stockMinimo: null,
        activo: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const SELECT_INSUMO = /insumo \(opcional\)/i;

    function mockCatalogo() {
      server.use(http.get("/api/insumos", () => HttpResponse.json(CATALOGO)));
    }

    function capturarPatch(): { body: Record<string, unknown> } {
      const capturado: { body: Record<string, unknown> } = { body: {} };
      server.use(
        http.patch(`/api/compras/${COMPRA_ID}/items/item-1`, async ({ request }) => {
          capturado.body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(buildItem());
        }),
      );
      return capturado;
    }

    it("precarga el insumo que el ítem declara", async () => {
      mockCatalogo();
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-1" })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      await abrirDialog();

      await waitFor(() => expect(screen.getByLabelText(SELECT_INSUMO)).toHaveValue("ins-1"));
    });

    it("el ítem sin insumo precarga «Sin insumo»", async () => {
      mockCatalogo();
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: null })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      await abrirDialog();

      await screen.findByRole("option", { name: /TON-001 — Tóner negro/ });
      expect(screen.getByLabelText(SELECT_INSUMO)).toHaveValue("");
    });

    it("cambiar el insumo lo manda en el PATCH", async () => {
      mockCatalogo();
      const capturado = capturarPatch();
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: null })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      const user = await abrirDialog();
      await screen.findByRole("option", { name: /TON-001 — Tóner negro/ });
      await user.selectOptions(screen.getByLabelText(SELECT_INSUMO), "ins-1");
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(capturado.body.insumoId).toBe("ins-1"));
    });

    /**
     * El `null` EXPLÍCITO es el que borra el vínculo: el PATCH es semántico y
     * una clave ausente no toca el campo, así que mandar `undefined` dejaría al
     * ítem con el insumo que el usuario acaba de sacar de la pantalla.
     */
    it("volver a «Sin insumo» manda insumoId en null explícito, no la clave ausente", async () => {
      mockCatalogo();
      const capturado = capturarPatch();
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-1" })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      const user = await abrirDialog();
      await waitFor(() => expect(screen.getByLabelText(SELECT_INSUMO)).toHaveValue("ins-1"));
      await user.selectOptions(screen.getByLabelText(SELECT_INSUMO), "");
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(Object.keys(capturado.body)).toContain("insumoId"));
      expect(capturado.body.insumoId).toBeNull();
    });

    /**
     * El insumo DESHABILITADO sí viene en `GET /insumos` y el backend lo acepta
     * (`validarInsumoElegible` sin `exigirHabilitado`). El fixture lo trae para
     * que el assert de que sigue elegible pueda fallar de verdad.
     */
    it("el insumo deshabilitado se precarga marcado y sigue viajando en el PATCH", async () => {
      mockCatalogo();
      const capturado = capturarPatch();
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-2" })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      const user = await abrirDialog();
      await waitFor(() => expect(screen.getByLabelText(SELECT_INSUMO)).toHaveValue("ins-2"));
      expect(screen.getByRole("option", { name: /PAP-002 — Papel A4 \(deshabilitado\)/ })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(capturado.body.insumoId).toBe("ins-2"));
    });

    /**
     * Clase de defecto "select con valor fuera de catálogo": el insumo con baja
     * lógica NO viene en `GET /insumos`. Sin la opción sintética, el `<select>`
     * nativo cae en otra opción y el PATCH guarda algo distinto de lo que se ve.
     * El catálogo del fixture está CARGADO y contiene otros dos insumos, así que
     * el assert de que el valor no cambió puede fallar.
     */
    it("el insumo dado de baja del catálogo se sigue mostrando y no cae en otra opción", async () => {
      mockCatalogo();
      const capturado = capturarPatch();
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-borrado" })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      const user = await abrirDialog();
      await waitFor(() => expect(screen.getByLabelText(SELECT_INSUMO)).toHaveValue("ins-borrado"));
      expect(screen.getByRole("option", { name: "Insumo eliminado del catálogo" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(capturado.body.insumoId).toBe("ins-borrado"));
    });

    /**
     * Hermano invertido del anterior: con el catálogo TODAVÍA sin resolver, la
     * ausencia no prueba ninguna baja. Etiquetar ahí le mentiría al usuario
     * sobre un insumo que puede seguir vigente.
     */
    it("con el catálogo sin resolver NO etiqueta el insumo como eliminado", async () => {
      server.use(http.get("/api/insumos", () => new Promise(() => {})));
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-borrado" })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      await abrirDialog();

      await screen.findByLabelText(SELECT_INSUMO);
      expect(screen.queryByRole("option", { name: "Insumo eliminado del catálogo" })).not.toBeInTheDocument();
    });

    /**
     * Segundo camino de la misma clase de defecto: la opción existe, pero llega
     * DESPUÉS de que el `<select>` montó. El `<select>` no controlado fija su
     * valor una sola vez, así que sin reaplicar queda mostrando «Sin insumo»
     * mientras el formulario guarda el insumo real.
     */
    it("el catálogo que resuelve después de abrir deja seleccionado el insumo del ítem", async () => {
      let liberar: () => void = () => {};
      const pendiente = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      server.use(
        http.get("/api/insumos", async () => {
          await pendiente;
          return HttpResponse.json(CATALOGO);
        }),
      );
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-1" })} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      await abrirDialog();
      await screen.findByLabelText(SELECT_INSUMO);
      liberar();

      await waitFor(() => expect(screen.getByLabelText(SELECT_INSUMO)).toHaveValue("ins-1"));
    });

    /**
     * `asegurarInsumoReasignable` bloquea el cambio con `cantidadRecibida > 0`
     * y responde 422 `INSUMO_DE_ITEM_NO_REASIGNABLE`. El control se deshabilita
     * y el campo se OMITE del PATCH: una clave ausente no puede disparar el
     * guard ni siquiera reenviando el mismo valor.
     */
    it("el ítem que ya recibió mercadería deshabilita el insumo y lo omite del PATCH", async () => {
      mockCatalogo();
      const capturado = capturarPatch();
      const item = buildItem({
        insumoId: "ins-1",
        estadoAprobacion: "APROBADO",
        cantidadOrdenada: 2,
        cantidadRecibida: 2,
      });
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={item} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      const user = await abrirDialog();
      await waitFor(() => expect(screen.getByLabelText(SELECT_INSUMO)).toBeDisabled());
      expect(screen.getByText(/el ítem ya recibió mercadería/i)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(capturado.body.descripcion).toBe("Insumo original"));
      expect(Object.keys(capturado.body)).not.toContain("insumoId");
    });

    /**
     * Hermano invertido, y la precondición que se olvida: el congelamiento de
     * `cantidad`/`monto`/`moneda` NO alcanza al insumo. Declararlo con el ítem
     * ya APROBADO y todavía sin recibir es justo cuando hace falta, y el dominio
     * lo permite — deshabilitar por `decidido` sería un control más estricto que
     * la regla que espeja.
     */
    it("el ítem APROBADO pero sin recepción sí puede cambiar de insumo", async () => {
      mockCatalogo();
      const capturado = capturarPatch();
      const item = buildItem({
        insumoId: null,
        estadoAprobacion: "APROBADO",
        cantidadOrdenada: 2,
        cantidadRecibida: 0,
      });
      renderWithProviders(<ItemEditDialog compraId={COMPRA_ID} item={item} />, {
        user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }),
      });

      const user = await abrirDialog();
      await screen.findByRole("option", { name: /TON-001 — Tóner negro/ });
      expect(screen.getByLabelText(SELECT_INSUMO)).not.toBeDisabled();
      await user.selectOptions(screen.getByLabelText(SELECT_INSUMO), "ins-1");
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(capturado.body.insumoId).toBe("ins-1"));
    });

    /**
     * El diálogo vive en una fila de tabla y NO se desmonta al cerrarse: sin
     * resincronizar al abrir, su snapshot inicial sobrevive toda la sesión.
     */
    it("abrir, cerrar, cambiar el ítem y reabrir muestra el insumo VIGENTE, no el del primer render", async () => {
      mockCatalogo();
      const { rerender } = renderWithProviders(
        <ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-1" })} />,
        { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
      );

      const user = await abrirDialog();
      await waitFor(() => expect(screen.getByLabelText(SELECT_INSUMO)).toHaveValue("ins-1"));

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByLabelText(SELECT_INSUMO)).not.toBeInTheDocument());

      rerender(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-2" })} />);
      await user.click(screen.getByRole("button", { name: /editar ítem/i }));

      expect(await screen.findByLabelText(SELECT_INSUMO)).toHaveValue("ins-2");
    });

    /**
     * El mismo síntoma que el test anterior, pero aislando al `reset(defaults)`
     * de la apertura: con el catálogo CAÍDO, `useReaplicarAlResolver` nunca
     * corre —solo reaplica cuando la lista resolvió—, así que lo único que
     * resincroniza el formulario es el `reset`. Sin él, el diálogo manda el
     * insumo del PRIMER render, que ya no es el del ítem, y lo hace sin ningún
     * error visible.
     */
    it("con el catálogo caído, reabrir manda el insumo VIGENTE en el PATCH y no el del primer render", async () => {
      server.use(
        http.get("/api/insumos", () => HttpResponse.json({ statusCode: 500, message: "Falló" }, { status: 500 })),
      );
      const capturado = capturarPatch();
      const { rerender } = renderWithProviders(
        <ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-1" })} />,
        { user: buildUser({ permisos: ["COMPRAS:MODIFICACION"] }) },
      );

      const user = await abrirDialog();
      await screen.findByLabelText(SELECT_INSUMO);

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByLabelText(SELECT_INSUMO)).not.toBeInTheDocument());

      rerender(<ItemEditDialog compraId={COMPRA_ID} item={buildItem({ insumoId: "ins-2" })} />);
      await user.click(screen.getByRole("button", { name: /editar ítem/i }));
      await screen.findByLabelText(SELECT_INSUMO);
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      await waitFor(() => expect(capturado.body.insumoId).toBe("ins-2"));
    });
  });
});
