import campaigns from "../data/campaigns.json";
import type { MobilityMode } from "./mobility/types";

/**
 * Uma campanha descreve para quem a landing fala, em que região, e o que serve
 * de âncora para o cálculo de distância. A estrutura da página é a mesma; o que
 * muda é este objeto.
 *
 * Residência médica: âncoras são hospitais, o público mora ao lado e o modo
 * padrão é a pé. Funcionários de empresas: âncoras são polos corporativos, a
 * região é bem mais espalhada e o padrão é carro.
 */
export type Campaign = {
  slug: string;
  /** Usado no <title> e na meta description. */
  seo: { title: string; description: string };
  /** Bairros considerados na campanha; casam com `bairro` em data/properties.json. */
  neighborhoods: string[];
  /** Chave em data/mobility-anchors.json. */
  anchorSetId: string;
  /** Modo de deslocamento pré-selecionado — a promessa muda com a distância típica. */
  defaultMobilityMode: MobilityMode;
  hero: {
    eyebrow: string;
    /** `emphasis` é renderizado em destaque logo após o título. */
    title: string;
    emphasis: string;
    subtitle: string;
    image: string;
    imageAlt: string;
    /** Cartão sobre a imagem do hero. */
    highlight: { label: string; icon: string; text: string; note: string };
    /** Três provas curtas abaixo do hero. */
    proof: [string, string, string];
  };
  /** Rótulos que mencionam o público ou a região ao longo da página. */
  copy: {
    /** Pergunta do seletor de âncora no simulador. */
    anchorQuestion: string;
    anchorOtherLabel: string;
    propertiesTitle: string;
    propertiesIntro: string;
    /** Aviso quando o lead ainda não foi capturado. */
    mobilityGateTitle: string;
    institutionsEyebrow: string;
    institutionsTitle: string;
    institutionsIntro: string;
    whyTitle: string;
    whyIntro: string;
    finalTitle: string;
    finalEmphasis: string;
    finalIntro: string;
  };
  /** Instituições/empresas de referência exibidas na seção de contexto. */
  institutionsKey: string;
};

const catalog = campaigns as unknown as Record<string, Campaign>;

export const DEFAULT_CAMPAIGN = "residencia-medica";

export function getCampaign(slug: string): Campaign | null {
  return catalog[slug] ?? null;
}

export function listCampaigns(): Campaign[] {
  return Object.values(catalog);
}

/** Compara bairros ignorando acentos e caixa, como a base da 7Cantos pode variar. */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Filtra os imóveis que pertencem à campanha. Lista vazia aceita todos. */
export function belongsToCampaign(bairro: string | undefined, campaign: Campaign): boolean {
  if (!campaign.neighborhoods.length) return true;
  const alvo = normalize(bairro ?? "");
  return campaign.neighborhoods.some((item) => normalize(item) === alvo);
}
