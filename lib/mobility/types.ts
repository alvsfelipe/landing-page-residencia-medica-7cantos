export const mobilityModes = ["WALK", "BICYCLE", "DRIVE", "TRANSIT", "TWO_WHEELER"] as const;

export type MobilityMode = (typeof mobilityModes)[number];

export type MobilityCoordinates = {
  latitude: number;
  longitude: number;
};

export type MobilityAnchorType =
  | "hospital"
  | "transit"
  | "education"
  | "work"
  | "services"
  | "custom";

export type MobilityAnchor = {
  id: string;
  name: string;
  type: MobilityAnchorType;
  address: string;
  coordinates?: MobilityCoordinates;
};

export type MobilityOrigin = {
  id: string;
  address: string;
  coordinates?: MobilityCoordinates;
};

export type MobilityProvider = "google-routes" | "openrouteservice";

export type MobilityResult = {
  pairId?: string;
  originId: string;
  anchorId: string;
  mode: MobilityMode;
  distanceMeters: number | null;
  durationMinutes: number | null;
  googleMapsUrl: string;
  status: "ok" | "route_not_found" | "configuration_required";
  provider?: MobilityProvider;
};
