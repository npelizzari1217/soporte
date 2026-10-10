import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearCookieAttrs, cookieName, COOKIE_SSO_PASO } from "@/shared/auth/cookies";

/** Forma de `sso_paso`: clase del paso y su identificador opaco (desafío o ticket), nunca un JWT. */
const pasoSchema = z.object({
  k: z.enum(["2fa", "enrol", "ticket"]),
  t: z.string().min(1),
});

function sinCache(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * POST /api/auth/sso/paso — entrega UNA vez el resultado que dejó el callback.
 *
 * Lee `sso_paso`, la borra siempre y valida su forma. Devuelve `{needs2fa,desafio}`,
 * `{needsEnrolamiento2fa,desafio}` o `{ticket}`; cookie ausente o inválida → 404. Es POST para que
 * una navegación cross-site no pueda consumir la cookie Lax.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const crudo = request.cookies.get(cookieName(COOKIE_SSO_PASO))?.value;
  if (crudo === undefined) return sinCache(new NextResponse(null, { status: 404 }));

  let paso: z.infer<typeof pasoSchema> | undefined;
  try {
    const parsed = pasoSchema.safeParse(JSON.parse(crudo));
    if (parsed.success) paso = parsed.data;
  } catch {
    paso = undefined;
  }

  const response =
    paso === undefined
      ? new NextResponse(null, { status: 404 })
      : NextResponse.json(
          paso.k === "ticket"
            ? { ticket: paso.t }
            : paso.k === "2fa"
              ? { needs2fa: true, desafio: paso.t }
              : { needsEnrolamiento2fa: true, desafio: paso.t },
        );
  response.cookies.set(clearCookieAttrs(COOKIE_SSO_PASO));
  return sinCache(response);
}
