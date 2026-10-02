import { MobilityAnchor, MobilityMode, MobilityOrigin, MobilityResult } from "./types";
import { createGoogleMapsDirectionsUrl } from "./client";
import { createCoordinatePairId } from "./pair-id";

type GoogleRouteElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: "ROUTE_EXISTS" | "ROUTE_NOT_FOUND";
  status?: { code?: number; message?: string };
};

function fallbackResult(
  origin: MobilityOrigin,
  anchor: MobilityAnchor,
  mode: MobilityMode,
): MobilityResult {
  return {
    pairId: createCoordinatePairId(origin, anchor) ?? undefined,
    originId: origin.id,
    anchorId: anchor.id,
    mode,
    distanceMeters: null,
    durationMinutes: null,
    googleMapsUrl: createGoogleMapsDirectionsUrl(origin, anchor, mode),
    status: "configuration_required",
    provider: "google-routes",
  };
}

export async function computeMobilityMatrix(
  origins: MobilityOrigin[],
  anchor: MobilityAnchor,
  mode: MobilityMode,
) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return origins.map((origin) => fallbackResult(origin, anchor, mode));

  const response = await fetch(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,distanceMeters,duration,status,condition",
      },
      body: JSON.stringify({
        origins: origins.map((origin) => ({
          waypoint: origin.coordinates
            ? { location: { latLng: origin.coordinates } }
            : { address: origin.address },
        })),
        destinations: [{
          waypoint: anchor.coordinates
            ? { location: { latLng: anchor.coordinates } }
            : { address: anchor.address },
        }],
        travelMode: mode,
        languageCode: "pt-BR",
        regionCode: "BR",
        units: "METRIC",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Routes respondeu ${response.status}: ${details.slice(0, 300)}`);
  }

  const matrix = (await response.json()) as GoogleRouteElement[];
  const byOriginIndex = new Map(matrix.map((element) => [element.originIndex, element]));

  return origins.map((origin, index): MobilityResult => {
    const route = byOriginIndex.get(index);
    const routeExists = route?.condition === "ROUTE_EXISTS" && route.distanceMeters != null;
    const durationSeconds = Number(route?.duration?.replace(/s$/, ""));

    return {
      pairId: createCoordinatePairId(origin, anchor) ?? undefined,
      originId: origin.id,
      anchorId: anchor.id,
      mode,
      distanceMeters: routeExists ? route.distanceMeters ?? null : null,
      durationMinutes:
        routeExists && Number.isFinite(durationSeconds)
          ? Math.max(1, Math.ceil(durationSeconds / 60))
          : null,
      googleMapsUrl: createGoogleMapsDirectionsUrl(origin, anchor, mode),
      status: routeExists ? "ok" : "route_not_found",
      provider: "google-routes",
    };
  });
}
