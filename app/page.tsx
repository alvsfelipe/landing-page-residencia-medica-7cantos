import { CampaignLanding } from "@/components/campaign-landing";
import { DEFAULT_CAMPAIGN } from "@/lib/campaigns";

export default function Home() {
  return <CampaignLanding slug={DEFAULT_CAMPAIGN} />;
}
