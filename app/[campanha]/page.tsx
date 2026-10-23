import type { Metadata } from "next";
import { CampaignLanding } from "@/components/campaign-landing";
import { getCampaign, listCampaigns } from "@/lib/campaigns";

type Params = { params: Promise<{ campanha: string }> };

/** Cada campanha vira uma rota estática em build. */
export function generateStaticParams() {
  return listCampaigns().map((campaign) => ({ campanha: campaign.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { campanha } = await params;
  const campaign = getCampaign(campanha);
  if (!campaign) return {};
  return { title: campaign.seo.title, description: campaign.seo.description };
}

export default async function CampaignPage({ params }: Params) {
  const { campanha } = await params;
  return <CampaignLanding slug={campanha} />;
}
