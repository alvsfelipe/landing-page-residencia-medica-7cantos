import { notFound } from "next/navigation";
import institutions from "@/data/institutions.json";
import properties from "@/data/properties.json";
import { Hospital, Property, Z1Landing } from "@/components/z1-landing";
import { getCampaign } from "@/lib/campaigns";
import { getMobilityAnchorSet } from "@/lib/mobility";

/**
 * Monta a landing a partir de uma campanha. O properties.json é único e cobre
 * todas as campanhas; o recorte por bairro acontece dentro do componente.
 */
export function CampaignLanding({ slug }: { slug: string }) {
  const campaign = getCampaign(slug);
  if (!campaign) notFound();

  const anchorSet = getMobilityAnchorSet(campaign.anchorSetId);
  const catalog = institutions as Record<string, Hospital[]>;

  return (
    <Z1Landing
      campaign={campaign}
      properties={properties as Property[]}
      hospitals={catalog[campaign.institutionsKey] ?? []}
      mobilityAnchorSetId={campaign.anchorSetId}
      mobilityAnchors={anchorSet?.anchors ?? []}
    />
  );
}
