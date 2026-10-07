import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { ipDelNavegador } from "./sesion-bff";

// I4: la IP que el BFF reenvía al backend es la entrada MÁS A LA DERECHA de x-forwarded-for
// (la agrega IIS/ARR), sin puerto, y solo si es una IP válida.

function conXff(valor?: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: valor === undefined ? {} : { "x-forwarded-for": valor },
  });
}

describe("ipDelNavegador (BFF)", () => {
  it.each([
    ["IPv4 sin puerto", "1.2.3.4", "1.2.3.4"],
    ["IPv4 con puerto", "1.2.3.4:56789", "1.2.3.4"],
    ["IPv6 sin puerto", "2001:db8::1", "2001:db8::1"],
    ["IPv6 con puerto", "[2001:db8::1]:56789", "2001:db8::1"],
    ["IPv6 entre corchetes sin puerto", "[2001:db8::1]", "2001:db8::1"],
  ])("%s → %s", (_caso, entrada, esperada) => {
    expect(ipDelNavegador(conXff(entrada))).toBe(esperada);
  });

  it("toma la entrada más a la derecha y descarta lo que mandó el navegador", () => {
    expect(ipDelNavegador(conXff("6.6.6.6, 7.7.7.7:1111, 1.2.3.4:56789"))).toBe("1.2.3.4");
  });

  it.each(["", "unknown", "999.1.1.1", "1.2.3.4:abc", "1.2.3.4:", "[nope]:80", "6.6.6.6, basura"])(
    "valor inválido %j → no se reenvía",
    (entrada) => {
      expect(ipDelNavegador(conXff(entrada))).toBeUndefined();
    },
  );

  it("sin cabecera → undefined", () => {
    expect(ipDelNavegador(conXff())).toBeUndefined();
  });
});
