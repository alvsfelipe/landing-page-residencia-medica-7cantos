import { createHash } from "node:crypto";
import type {
  MobilityAnchor,
  MobilityMode,
  MobilityOrigin,
  MobilityProvider,
  MobilityResult,
} from "./types";
import { createCoordinatePairId } from "./pair-id";

export type MobilityPair = {
  pairId: string | null;
  key: string;
  anchorSetId: string;
  anchorId: string;
  anchorAddress: string;
  originId: string;
  originAddress: string;
  mode: MobilityMode;
};

type CachedMobilityRecord = Pick<
  MobilityResult,
  | "pairId"
  | "originId"
  | "anchorId"
  | "mode"
  | "distanceMeters"
  | "durationMinutes"
  | "status"
  | "provider"
>;

const normalizeAddress = (address: string) =>
  address.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function createMobilityPair(
  anchorSetId: string,
  origin: MobilityOrigin,
  anchor: MobilityAnchor,
  mode: MobilityMode,
  provider: MobilityProvider = "google-routes",
): MobilityPair {
  const addressVersion = createHash("sha256")
    .update(`${normalizeAddress(origin.address)}|${normalizeAddress(anchor.address)}`)
    .digest("hex")
    .slice(0, 16);
  return {
    pairId: createCoordinatePairId(origin, anchor),
    key: `${provider}:${anchorSetId}:${anchor.id}:${origin.id}:${mode}:${addressVersion}`,
    anchorSetId,
    anchorId: anchor.id,
    anchorAddress: anchor.address,
    originId: origin.id,
    originAddress: origin.address,
    mode,
  };
}

function sheetsConfiguration() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const token = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;
  return url && token ? { url, token } : null;
}

async function callSheets<T>(action: string, payload: object): Promise<T | null> {
  const configuration = sheetsConfiguration();
  if (!configuration) return null;

  const response = await fetch(configuration.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: configuration.token, ...payload }),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & T)
    | null;

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Webhook respondeu ${response.status}`);
  }
  return result;
}

export async function findPersistedMobility(
  pairs: MobilityPair[],
): Promise<Map<string, CachedMobilityRecord>> {
  const result = await callSheets<{ records?: Array<CachedMobilityRecord & { key: string }> }>(
    "mobility_lookup",
    { pairs: pairs.map(({ key, pairId, originId, mode }) => ({ key, pairId, originId, mode })) },
  );

  return new Map((result?.records ?? []).map((record) => [record.key, record]));
}

export async function persistMobility(
  pairs: MobilityPair[],
  results: MobilityResult[],
  provider: MobilityProvider,
) {
  const pairByOrigin = new Map(pairs.map((pair) => [pair.originId, pair]));
  const records = results.flatMap((result) => {
    const pair = pairByOrigin.get(result.originId);
    if (!pair || result.status === "configuration_required") return [];
    return [{ ...pair, ...result, provider }];
  });
  if (!records.length) return;

  const defaultTtl = provider === "google-routes" ? 30 : 365;
  const maximumTtl = provider === "google-routes" ? 30 : 3650;
  const requestedTtl = Number(process.env.MOBILITY_RESULT_TTL_DAYS || defaultTtl);
  const ttlDays = Math.min(
    maximumTtl,
    Math.max(1, Number.isFinite(requestedTtl) ? requestedTtl : defaultTtl),
  );
  await callSheets("mobility_store", { records, ttlDays });
}
