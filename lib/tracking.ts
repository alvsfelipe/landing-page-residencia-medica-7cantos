export const landingEvents = [
  "landing_view", "simulator_started", "simulator_completed", "property_viewed",
  "property_clicked", "guided_tour_clicked", "documents_clicked", "move_plan_started",
  "lead_submitted", "whatsapp_clicked",
  "mobility_calculation_started", "mobility_calculation_completed", "mobility_route_clicked",
  "mobility_proximity_filter_applied",
] as const;

export type LandingEvent = (typeof landingEvents)[number];
export type Attribution = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "ref", string>>;

export function getAttribution(search: URLSearchParams): Attribution {
  return Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "ref"]
    .map((key) => [key, search.get(key)])
    .filter((entry): entry is [string, string] => Boolean(entry[1])));
}

export function track(event: LandingEvent, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const attribution = getAttribution(new URLSearchParams(window.location.search));
  window.dispatchEvent(new CustomEvent("7cantos:track", { detail: { event, ...attribution, ...properties } }));
  if (process.env.NODE_ENV === "development") console.info("[7Cantos track]", event, { ...attribution, ...properties });
}
