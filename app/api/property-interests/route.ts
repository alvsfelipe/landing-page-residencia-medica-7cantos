import { NextRequest, NextResponse } from "next/server";

type PropertyInterestPayload = {
  name?: unknown;
  whatsapp?: unknown;
  currentCity?: unknown;
  moveDate?: unknown;
  budget?: unknown;
  livingArrangement?: unknown;
  propertyId?: unknown;
  propertyAddress?: unknown;
  propertyUrl?: unknown;
  hospitalId?: unknown;
  hospitalName?: unknown;
  attribution?: unknown;
  pageUrl?: unknown;
};

const asText = (value: unknown, maxLength = 300) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: "Origem não autorizada." }, { status: 403 });
  }

  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const webhookToken = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;
  if (!webhookUrl || !webhookToken) {
    return NextResponse.json({ ok: false, error: "Google Sheets ainda não foi configurado." }, { status: 503 });
  }

  let payload: PropertyInterestPayload;
  try {
    payload = (await request.json()) as PropertyInterestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
  }

  const attribution =
    payload.attribution && typeof payload.attribution === "object"
      ? (payload.attribution as Record<string, unknown>)
      : {};
  const interest = {
    action: "property_interest",
    token: webhookToken,
    clickedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    name: asText(payload.name, 120),
    whatsapp: asText(payload.whatsapp, 40),
    currentCity: asText(payload.currentCity, 120),
    moveDate: asText(payload.moveDate, 20),
    budget: asText(payload.budget, 60),
    livingArrangement: asText(payload.livingArrangement, 80),
    consent: true,
    propertyId: asText(payload.propertyId, 80),
    propertyAddress: asText(payload.propertyAddress, 260),
    propertyUrl: asText(payload.propertyUrl, 500),
    hospitalId: asText(payload.hospitalId, 100),
    hospitalName: asText(payload.hospitalName, 200),
    hospitalProgram: asText(payload.hospitalName, 200),
    utmSource: asText(attribution.utm_source, 120),
    utmMedium: asText(attribution.utm_medium, 120),
    utmCampaign: asText(attribution.utm_campaign, 120),
    ref: asText(attribution.ref, 120),
    sourcePageUrl: asText(payload.pageUrl, 500),
    pageUrl: asText(payload.propertyUrl, 500),
  };

  if (!interest.name || !interest.propertyId || !interest.propertyUrl || !interest.hospitalName) {
    return NextResponse.json({ ok: false, error: "Interesse incompleto." }, { status: 400 });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(interest),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || `Webhook respondeu ${response.status}`);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao registrar interesse no imóvel", error);
    return NextResponse.json({ ok: false, error: "Não foi possível registrar o interesse agora." }, { status: 502 });
  }
}
