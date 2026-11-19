import { MobilityAnchor, MobilityMode, MobilityOrigin } from "./types";

const mapsTravelMode: Record<MobilityMode, string> = {
  WALK: "walking",
  BICYCLE: "bicycling",
  DRIVE: "driving",
  TRANSIT: "transit",
  TWO_WHEELER: "two-wheeler",
};

export function createGoogleMapsDirectionsUrl(
  origin: Pick<MobilityOrigin, "address">,
  destination: Pick<MobilityAnchor, "address">,
  mode: MobilityMode,
) {
  const params = new URLSearchParams({
    api: "1",
    origin: origin.address,
    destination: destination.address,
    travelmode: mapsTravelMode[mode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function formatMobilityDistance(distanceMeters: number) {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters / 10) * 10} m`;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(distanceMeters / 1000)} km`;
}

export function formatMobilityDuration(durationMinutes: number) {
  if (durationMinutes < 60) return `${durationMinutes} min`;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}
