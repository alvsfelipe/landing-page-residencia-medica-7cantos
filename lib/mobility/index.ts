import anchorCatalog from "../../data/mobility-anchors.json";
import { MobilityAnchor } from "./types";

export {
  createGoogleMapsDirectionsUrl,
  formatMobilityDistance,
  formatMobilityDuration,
} from "./client";

type AnchorSet = { label: string; anchors: MobilityAnchor[] };
type AnchorCatalog = Record<string, AnchorSet>;

const catalog = anchorCatalog as AnchorCatalog;

export function getMobilityAnchorSet(id: string): AnchorSet | null {
  return catalog[id] ?? null;
}

export function getMobilityAnchor(setId: string, anchorId: string): MobilityAnchor | null {
  return getMobilityAnchorSet(setId)?.anchors.find((anchor) => anchor.id === anchorId) ?? null;
}
