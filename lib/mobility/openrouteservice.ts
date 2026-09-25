import { createGoogleMapsDirectionsUrl } from "./client";
import { createCoordinatePairId } from "./pair-id";
import type { MobilityAnchor, MobilityMode, MobilityOrigin, MobilityResult } from "./types";

type Coordinate = [longitude: number, latitude: number];

type GeocodeResponse = {
  features?: Array<{ geometry?: { coordinates?: number[] } }>;
};

type MatrixResponse = {
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
};

const profiles: Partial<Record<MobilityMode, string>> = {
  WALK: "foot-walking",
  BICYCLE: "cycling-regular",
  DRIVE: "driving-car",
};

function emptyResult(
  origin: MobilityOrigin,
  anchor: MobilityAnchor,
  mode: MobilityMode,
  status: MobilityResult["status"],
): MobilityResult {
  return {
    pairId: createCoordinatePairId(origin, anchor) ?? undefined,
    originId: origin.id,
    anchorId: anchor.id,
    mode,
    distanceMeters: null,
    durationMinutes: null,
    googleMapsUrl: createGoogleMapsDirectionsUrl(origin, anchor, mode),
    status,
    provider: "openrouteservice",
  };
}

async function geocodeAddress(address: string, apiKey: string): Promise<Coordinate | null> {
  const query = new URLSearchParams({ text: address, size: "1", "boundary.country": "BR" });
  const response = await fetch(`https://api.openrouteservice.org/geocode/search?${query}`, {
    headers: { Authorization: apiKey },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Geocoding do openrouteservice respondeu ${response.status}: ${details.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as GeocodeResponse;
  const coordinates = payload.features?.[0]?.geometry?.coordinates;
  if (
    !coordinates ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }
  return [coordinates[0], coordinates[1]];
}

const coordinateTuple = (
  item: MobilityOrigin | MobilityAnchor,
): Coordinate | null =>
  item.coordinates
    ? [item.coordinates.longitude, item.coordinates.latitude]
    : null;

export async function computeOpenRouteServiceMatrix(
  origins: MobilityOrigin[],
  anchor: MobilityAnchor,
  mode: MobilityMode,
): Promise<MobilityResult[]> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    return origins.map((origin) => emptyResult(origin, anchor, mode, "configuration_required"));
  }

  const profile = profiles[mode];
  if (!profile) throw new Error(`Modo ${mode} não é suportado pelo openrouteservice.`);

  const [anchorCoordinates, ...originCoordinates] = await Promise.all([
    coordinateTuple(anchor) ?? geocodeAddress(anchor.address, apiKey),
    ...origins.map(
      (origin) => coordinateTuple(origin) ?? geocodeAddress(origin.address, apiKey),
    ),
  ]);
  if (!anchorCoordinates) throw new Error("A âncora não foi localizada pelo openrouteservice.");

  const validOrigins = origins.flatMap((origin, index) => {
    const coordinates = originCoordinates[index];
    return coordinates
      ? [{
          origin: {
            ...origin,
            coordinates: { longitude: coordinates[0], latitude: coordinates[1] },
          },
          coordinates,
        }]
      : [];
  });
  if (!validOrigins.length) {
    return origins.map((origin) => emptyResult(origin, anchor, mode, "route_not_found"));
  }

  const destinationIndex = validOrigins.length;
  const response = await fetch(`https://api.openrouteservice.org/v2/matrix/${profile}`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locations: [...validOrigins.map(({ coordinates }) => coordinates), anchorCoordinates],
      sources: validOrigins.map((_, index) => String(index)),
      destinations: [String(destinationIndex)],
      metrics: ["distance", "duration"],
      units: "m",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Matriz do openrouteservice respondeu ${response.status}: ${details.slice(0, 300)}`,
    );
  }

  const matrix = (await response.json()) as MatrixResponse;
  const resultByOrigin = new Map<string, MobilityResult>();
  const resolvedAnchor: MobilityAnchor = {
    ...anchor,
    coordinates: { longitude: anchorCoordinates[0], latitude: anchorCoordinates[1] },
  };
  validOrigins.forEach(({ origin }, index) => {
    const distance = matrix.distances?.[index]?.[0];
    const durationSeconds = matrix.durations?.[index]?.[0];
    const routeExists = Number.isFinite(distance) && Number.isFinite(durationSeconds);
    resultByOrigin.set(origin.id, {
      pairId: createCoordinatePairId(origin, resolvedAnchor) ?? undefined,
      originId: origin.id,
      anchorId: anchor.id,
      mode,
      distanceMeters: routeExists ? Math.round(distance as number) : null,
      durationMinutes: routeExists
        ? Math.max(1, Math.ceil((durationSeconds as number) / 60))
        : null,
      googleMapsUrl: createGoogleMapsDirectionsUrl(origin, anchor, mode),
      status: routeExists ? "ok" : "route_not_found",
      provider: "openrouteservice",
    });
  });

  return origins.map(
    (origin) => resultByOrigin.get(origin.id) ?? emptyResult(origin, anchor, mode, "route_not_found"),
  );
}
