import { NextRequest, NextResponse } from "next/server";

type LeadPayload = {
  name?: unknown;
  whatsapp?: unknown;
  currentCity?: unknown;
  hospitalProgram?: unknown;
  moveDate?: unknown;
  budget?: unknown;
  livingArrangement?: unknown;
  consent?: unknown;
  attribution?: unknown;
  pageUrl?: unknown;
  matchingPropertyCount?: unknown;
  matchingPropertyIds?: unknown;
  website?: unknown;
};

const asText = (value: unknown, maxLength = 300) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const webhookToken = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;

  if (!webhookUrl || !webhookToken) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets ainda não foi configurado." },
      { status: 503 },
    );
  }

  let payload: LeadPayload;
  try {
    payload = (await request.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
  }

  // Campo invisível: bots costumam preenchê-lo; usuários reais não.
  if (asText(payload.website)) {
    return NextResponse.json({ ok: true });
  }

  const attribution =
    payload.attribution && typeof payload.attribution === "object"
      ? (payload.attribution as Record<string, unknown>)
      : {};

  const lead = {
    token: webhookToken,
    receivedAt: new Date().toISOString(),
    name: asText(payload.name, 120),
    whatsapp: asText(payload.whatsapp, 40),
    currentCity: asText(payload.currentCity, 120),
    hospitalProgram: asText(payload.hospitalProgram, 200),
    moveDate: asText(payload.moveDate, 20),
    budget: asText(payload.budget, 60),
    livingArrangement: asText(payload.livingArrangement, 80),
    consent: payload.consent === true,
    utmSource: asText(attribution.utm_source, 120),
    utmMedium: asText(attribution.utm_medium, 120),
    utmCampaign: asText(attribution.utm_campaign, 120),
    ref: asText(attribution.ref, 120),
    pageUrl: asText(payload.pageUrl, 500),
    matchingPropertyCount: Math.max(0, Number(payload.matchingPropertyCount) || 0),
    matchingPropertyIds: Array.isArray(payload.matchingPropertyIds)
      ? payload.matchingPropertyIds.map((id) => asText(id, 80)).filter(Boolean).slice(0, 40)
      : [],
  };

  if (
    !lead.name ||
    !lead.whatsapp ||
    !lead.currentCity ||
    !lead.hospitalProgram ||
    !lead.moveDate ||
    !lead.budget ||
    !lead.livingArrangement ||
    !lead.consent
  ) {
    return NextResponse.json(
      { ok: false, error: "Preencha todos os campos e autorize o contato." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || `Webhook respondeu ${response.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao registrar lead no Google Sheets", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível registrar o lead agora." },
      { status: 502 },
    );
  }
}
