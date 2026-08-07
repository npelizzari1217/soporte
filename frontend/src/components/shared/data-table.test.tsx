import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type Column } from "./data-table";

interface Row {
  id: string;
  titulo: string;
  prioridad: string;
}

const columns: Column<Row>[] = [
  { key: "titulo", header: "Título", sortable: true },
  { key: "prioridad", header: "Prioridad" },
];

const rows: Row[] = [
  { id: "1", titulo: "Impresora rota", prioridad: "ALTA" },
  { id: "2", titulo: "VPN caída", prioridad: "CRITICA" },
];

describe("DataTable", () => {
  it("isLoading=true → renders the table skeleton, NOT the rows", () => {
    render(<DataTable columns={columns} data={[]} isLoading getRowKey={(r) => r.id} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Impresora rota")).not.toBeInTheDocument();
  });

  it("data=[] (not loading, no error) → renders EmptyState with the given copy", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        getRowKey={(r) => r.id}
        emptyTitle="Sin resultados"
        emptyDescription="No hay tickets que coincidan."
      />,
    );
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });

  it("error set → renders ErrorState with the message, not the table", () => {
    render(<DataTable columns={columns} data={[]} error="Error de red" getRowKey={(r) => r.id} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Error de red");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("data with 2 rows → renders exactly 2 data rows with the right cell content", () => {
    render(<DataTable columns={columns} data={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Impresora rota")).toBeInTheDocument();
    expect(screen.getByText("VPN caída")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // 1 header + 2 data rows
  });

  it("column with sortable=true → clicking its header calls onSort with the column key", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<DataTable columns={columns} data={rows} getRowKey={(r) => r.id} onSort={onSort} />);
    await user.click(screen.getByRole("button", { name: "Título" }));
    expect(onSort).toHaveBeenCalledWith("titulo");
  });

  it("column with custom render() → uses it instead of the raw field value", () => {
    const customColumns: Column<Row>[] = [
      { key: "prioridad", header: "Prioridad", render: (row) => `P: ${row.prioridad}` },
    ];
    render(<DataTable columns={customColumns} data={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("P: ALTA")).toBeInTheDocument();
    expect(screen.getByText("P: CRITICA")).toBeInTheDocument();
  });

  it("onRowClick provided (B1: navegar al detalle) → clicking a row calls it with that row, not adjacent rows", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} getRowKey={(r) => r.id} onRowClick={onRowClick} />);
    await user.click(screen.getByText("VPN caída"));
    expect(onRowClick).toHaveBeenCalledExactlyOnceWith(rows[1]);
  });
});
