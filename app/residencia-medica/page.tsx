import type { Metadata } from "next";
import properties from "@/data/properties.json";
import hospitals from "@/data/hospitals.json";
import { Hospital, Property, Z1Landing } from "@/components/z1-landing";
import { getMobilityAnchorSet } from "@/lib/mobility";

export const metadata: Metadata = {
  title: "7Cantos Residência | Moradia e mudança na Vila Clementino",
  description: "Escolha onde morar, encontre seu apartamento e organize sua chegada a São Paulo com a 7Cantos.",
};

export default function MedicalResidence() {
  const anchorSetId = "residencia-medica-vila-clementino";
  const anchorSet = getMobilityAnchorSet(anchorSetId);
  return <Z1Landing properties={properties as Property[]} hospitals={hospitals as Hospital[]} mobilityAnchorSetId={anchorSetId} mobilityAnchors={anchorSet?.anchors ?? []} />;
}
