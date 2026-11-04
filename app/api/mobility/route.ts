import { after, NextRequest, NextResponse } from "next/server";
import { getMobilityAnchor } from "@/lib/mobility";
import { createGoogleMapsDirectionsUrl } from "@/lib/mobility/client";
import { computeMobilityMatrix } from "@/lib/mobility/google-routes";
import { computeOpenRouteServiceMatrix } from "@/lib/mobility/openrouteservice";
import {
  createMobilityPair,
  findPersistedMobility,
  persistMobility,
} from "@/lib/mobility/persistence";
import {
  mobilityModes,
  MobilityMode,
  MobilityOrigin,
  MobilityProvider,
} from "@/lib/mobility/types";

const MAX_ORIGINS = 6;

type RequestBody = {
  anchorSetId?: unknown;
  anchorId?: unknown;
  mode?: unknown;
  origins?: unknown;
};

const asText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

function parseOrigins(value: unknown): MobilityOrigin[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();

  return value.slice(0, MAX_ORIGINS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = asText(record.id, 80);
    const address = asText(record.address, 260);
    if (!id || !address || ids.has(id)) return [];
    const rawCoordinates = record.coordinates;
    const coordinates =
      rawCoordinates && typeof rawCoordinates === "object"
        ? {
            latitude: Number((rawCoordinates as Record<string, unknown>).latitude),
            longitude: Number((rawCoordinates as Record<string, unknown>).longitude),
          }
        : null;
    const hasValidCoordinates = Boolean(
      coordinates &&
        Number.isFinite(coordinates.latitude) &&
        Number.isFinite(coordinates.longitude) &&
        Math.abs(coordinates.latitude) <= 90 &&
        Math.abs(coordinates.longitude) <= 180,
    );
    ids.add(id);
    return [{ id, address, ...(hasValidCoordinates ? { coordinates: coordinates! } : {}) }];
  });
}

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const provider: MobilityProvider =
    process.env.MOBILITY_PROVIDER === "openrouteservice"
      ? "openrouteservice"
      : "google-routes";
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const anchorSetId = asText(body.anchorSetId, 100);
  const anchorId = asText(body.anchorId, 100);
  const mode = asText(body.mode, 20) as MobilityMode;
  const origins = parseOrigins(body.origins);
  const anchor = getMobilityAnchor(anchorSetId, anchorId);

  if (!anchor || !mobilityModes.includes(mode) || !origins.length) {
    return NextResponse.json(
      { error: "Âncora, modo ou endereços inválidos." },
      { status: 400 },
    );
  }

  try {
    const pairs = origins.map((origin) =>
      createMobilityPair(anchorSetId, origin, anchor, mode, provider),
    );
    let persisted: Awaited<ReturnType<typeof findPersistedMobility>> = new Map();
    try {
      persisted = await findPersistedMobility(pairs);
    } catch (error) {
      console.error("Falha ao consultar a tabela de mobilidade", error);
    }

    const missingOrigins = origins.filter((_, index) => !persisted.has(pairs[index].key));
    const computedResults = missingOrigins.length
      ? provider === "openrouteservice"
        ? await computeOpenRouteServiceMatrix(missingOrigins, anchor, mode)
        : await computeMobilityMatrix(missingOrigins, anchor, mode)
      : [];

    const missingIds = new Set(missingOrigins.map((origin) => origin.id));
    const missingPairs = pairs.filter((pair) => missingIds.has(pair.originId));

    // A resposta solicitada volta imediatamente. A persistência e o segundo
    // modo são preenchidos depois da resposta, sem aumentar a espera do usuário.
    const complementaryMode: MobilityMode | null =
      mode === "WALK" ? "DRIVE" : mode === "DRIVE" ? "WALK" : null;
    after(async () => {
      try {
        if (computedResults.length) {
          await persistMobility(missingPairs, computedResults, provider);
        }
        if (!complementaryMode) return;
        const complementaryPairs = origins.map((origin) =>
          createMobilityPair(
            anchorSetId,
            origin,
            anchor,
            complementaryMode,
            provider,
          ),
        );
        const complementaryPersisted = await findPersistedMobility(complementaryPairs);
        const complementaryMissingOrigins = origins.filter(
          (_, index) => !complementaryPersisted.has(complementaryPairs[index].key),
        );

        if (complementaryMissingOrigins.length) {
          const complementaryResults =
            provider === "openrouteservice"
              ? await computeOpenRouteServiceMatrix(
                  complementaryMissingOrigins,
                  anchor,
                  complementaryMode,
                )
              : await computeMobilityMatrix(
                  complementaryMissingOrigins,
                  anchor,
                  complementaryMode,
                );
          const missingIds = new Set(
            complementaryMissingOrigins.map((origin) => origin.id),
          );
          await persistMobility(
            complementaryPairs.filter((pair) => missingIds.has(pair.originId)),
            complementaryResults,
            provider,
          );
        }
      } catch (error) {
        console.error("Falha ao completar a tabela de mobilidade", error);
      }
    });

    const computedByOrigin = new Map(
      computedResults.map((result) => [result.originId, result]),
    );
    const results = pairs.flatMap((pair) => {
      const cached = persisted.get(pair.key);
      if (cached) {
        return [{
          ...cached,
          pairId: pair.pairId ?? cached.pairId ?? undefined,
          provider,
          googleMapsUrl: createGoogleMapsDirectionsUrl(
            { address: pair.originAddress },
            anchor,
            mode,
          ),
        }];
      }
      const computed = computedByOrigin.get(pair.originId);
      return computed ? [computed] : [];
    });

    return NextResponse.json({
      anchor,
      mode,
      configured:
        provider === "openrouteservice"
          ? Boolean(process.env.OPENROUTESERVICE_API_KEY)
          : Boolean(process.env.GOOGLE_MAPS_API_KEY),
      provider,
      cache: {
        hits: persisted.size,
        misses: computedResults.length,
        persistent: Boolean(
          process.env.GOOGLE_SHEETS_WEBHOOK_URL && process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN,
        ),
      },
      results,
    });
  } catch (error) {
    console.error("Falha no cálculo de mobilidade", error);
    return NextResponse.json(
      { error: "Não foi possível calcular as rotas agora." },
      { status: 502 },
    );
  }
}
