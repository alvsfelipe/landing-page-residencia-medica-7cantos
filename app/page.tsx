import properties from "@/data/properties.json";
import hospitals from "@/data/hospitals.json";
import { Hospital, Property, Z1Landing } from "@/components/z1-landing";
import { getMobilityAnchorSet } from "@/lib/mobility";

export default function Home() {
  const anchorSetId = "residencia-medica-vila-clementino";
  const anchorSet = getMobilityAnchorSet(anchorSetId);
  return <Z1Landing properties={properties as Property[]} hospitals={hospitals as Hospital[]} mobilityAnchorSetId={anchorSetId} mobilityAnchors={anchorSet?.anchors ?? []} />;
}
