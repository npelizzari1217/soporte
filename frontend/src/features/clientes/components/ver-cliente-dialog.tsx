"use client";

/**
 * VerClienteDialog — PRESENTATIONAL. Detalle read-only de un cliente (tenant):
 * nombre, razón social, CUIT, base de datos (dbName) y estado. Exclusivo ROOT
 * (el caller ya gatea por `isGlobalAdmin`). No muta nada — solo lectura.
 */
import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Cliente } from "../types";

export interface VerClienteDialogProps {
  cliente: Cliente;
}

/** Campos de texto a listar (dbName y estado se renderizan aparte). */
const CAMPOS: { label: string; value: (c: Cliente) => string }[] = [
  { label: "Nombre", value: (c) => c.nombre },
  { label: "Razón social", value: (c) => c.razonSocial ?? "—" },
  { label: "CUIT", value: (c) => c.cuit ?? "—" },
  { label: "Base de datos", value: (c) => c.dbName },
];

export function VerClienteDialog({ cliente }: VerClienteDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Ver ${cliente.nombre}`}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          Ver
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalle del cliente</DialogTitle>
        </DialogHeader>
        <dl className="flex flex-col gap-3">
          {CAMPOS.map((campo) => (
            <div key={campo.label} className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-muted-foreground">{campo.label}</dt>
              <dd className="text-sm text-foreground">{campo.value(cliente)}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">Estado</dt>
            <dd>
              {cliente.activo ? (
                <Badge variant="success">Activo</Badge>
              ) : (
                <Badge variant="outline">Inactivo</Badge>
              )}
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
