import type { MobilityMode, MobilityOrigin, MobilityResult } from "./types";

export type ProximityFilter = {
  anchorId: string;
  mode: MobilityMode;
  maxDurationMinutes?: number;
  maxDistanceMeters?: number;
  sortBy?: "duration" | "distance";
};

export function filterAndSortByProximity<T>(
  items: T[],
  results: Record<string, MobilityResult>,
  getId: (item: T) => string | null,
  filter: ProximityFilter,
) {
  return items
    .flatMap((item) => {
      const id = getId(item);
      const result = id ? results[id] : undefined;
      if (
        !result ||
        result.status !== "ok" ||
        result.anchorId !== filter.anchorId ||
        result.mode !== filter.mode ||
        result.distanceMeters == null ||
        result.durationMinutes == null
      ) {
        return [];
      }
      if (
        filter.maxDurationMinutes != null &&
        result.durationMinutes > filter.maxDurationMinutes
      ) {
        return [];
      }
      if (
        filter.maxDistanceMeters != null &&
        result.distanceMeters > filter.maxDistanceMeters
      ) {
        return [];
      }
      return [{ item, result }];
    })
    .sort((a, b) =>
      filter.sortBy === "distance"
        ? (a.result.distanceMeters ?? Infinity) - (b.result.distanceMeters ?? Infinity)
        : (a.result.durationMinutes ?? Infinity) - (b.result.durationMinutes ?? Infinity),
    )
    .map(({ item }) => item);
}

export function createMobilityBatches(origins: MobilityOrigin[], batchSize = 6) {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  return Array.from(
    { length: Math.ceil(origins.length / safeBatchSize) },
    (_, index) => origins.slice(index * safeBatchSize, (index + 1) * safeBatchSize),
  );
}
