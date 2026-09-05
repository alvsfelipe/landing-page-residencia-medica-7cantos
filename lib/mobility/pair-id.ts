import type {
  MobilityAnchor,
  MobilityCoordinates,
  MobilityMode,
  MobilityOrigin,
  MobilityResult,
} from "./types";

const precision = (value: number) => value.toFixed(6);

const validCoordinates = (
  coordinates?: MobilityCoordinates,
): coordinates is MobilityCoordinates =>
  Boolean(
    coordinates &&
      Number.isFinite(coordinates.latitude) &&
      Number.isFinite(coordinates.longitude),
  );

export function createCoordinatePairId(
  origin: MobilityOrigin,
  anchor: MobilityAnchor,
) {
  if (!validCoordinates(origin.coordinates) || !validCoordinates(anchor.coordinates)) {
    return null;
  }

  return [
    "pair-v1",
    precision(origin.coordinates.latitude),
    precision(origin.coordinates.longitude),
    precision(anchor.coordinates.latitude),
    precision(anchor.coordinates.longitude),
  ].join(":");
}

export function mobilitySessionKey(pairId: string, mode: MobilityMode) {
  return `7cantos:mobility:${pairId}:${mode}`;
}

const mobilityPairAliasKey = (originId: string, anchorId: string) =>
  `7cantos:mobility-pair:${anchorId}:${originId}`;

export function readSessionMobility(pairId: string, mode: MobilityMode) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(mobilitySessionKey(pairId, mode));
    if (!raw) return null;
    const result = JSON.parse(raw) as MobilityResult;
    return result.pairId === pairId && result.mode === mode ? result : null;
  } catch {
    return null;
  }
}

export function readSessionMobilityForRoute(
  origin: MobilityOrigin,
  anchor: MobilityAnchor,
  mode: MobilityMode,
) {
  if (typeof window === "undefined") return null;
  const pairId =
    createCoordinatePairId(origin, anchor) ??
    window.sessionStorage.getItem(mobilityPairAliasKey(origin.id, anchor.id));
  return pairId ? readSessionMobility(pairId, mode) : null;
}

export function writeSessionMobility(result: MobilityResult) {
  if (typeof window === "undefined" || !result.pairId) return;
  try {
    window.sessionStorage.setItem(
      mobilitySessionKey(result.pairId, result.mode),
      JSON.stringify(result),
    );
    window.sessionStorage.setItem(
      mobilityPairAliasKey(result.originId, result.anchorId),
      result.pairId,
    );
  } catch {
    // O cache persistente no servidor continua sendo a fonte de verdade.
  }
}
