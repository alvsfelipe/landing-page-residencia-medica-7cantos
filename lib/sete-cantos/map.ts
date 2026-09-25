import type { ImovelResponse, PropertyPhotoResponse, SyncedProperty } from "./types.ts";

/**
 * Converte valores decimais da API (strings como "5600.00") em número.
 * Também tolera formatação pt-BR ("R$ 5.600,00") caso algum campo venha do CRM
 * já formatado.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(",")) {
    // pt-BR: ponto é separador de milhar, vírgula é decimal.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(cleaned)) {
    // Só trata ponto como milhar com dois ou mais grupos ("1.200.000"); um único
    // grupo ("5600.00", "114.50") é decimal, que é o formato da API.
    normalized = cleaned.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Maior resolução disponível para uma foto. */
const photoUrl = (photo: PropertyPhotoResponse): string =>
  text(photo.url_l) || text(photo.url_m) || text(photo.url_s);

/**
 * URLs das fotos, com a principal (`is_main`) primeiro e o restante na ordem
 * declarada em `order` — a mesma ordenação usada pela API no detalhe.
 */
export function photoUrls(photos: PropertyPhotoResponse[] | null | undefined): string[] {
  if (!Array.isArray(photos)) return [];

  const ordered = [...photos].sort((a, b) => {
    if (Boolean(b.is_main) !== Boolean(a.is_main)) return Number(Boolean(b.is_main)) - Number(Boolean(a.is_main));
    return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;
  });

  return [...new Set(ordered.map(photoUrl).filter(Boolean))];
}

/**
 * Disponível para locação. O filtro `is_active=true` da API já exclui alugados e
 * apagados; esta checagem é a rede de segurança para quando a sincronização
 * roda sem o filtro (ex.: `--incluir-alugados`).
 */
export const isAvailable = (imovel: ImovelResponse): boolean => imovel.is_rented !== true;

/** Coordenadas só quando ambas são numéricas e plausíveis (descarta 0,0). */
function coordinatesOf(imovel: ImovelResponse): SyncedProperty["coordinates"] {
  const latitude = toNumber(imovel.address?.latitude);
  const longitude = toNumber(imovel.address?.longitude);

  if (latitude === null || longitude === null) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  if (latitude === 0 && longitude === 0) return undefined;

  return { latitude, longitude };
}

/** Converte um imóvel da API para a forma gravada em data/properties.json. */
export function mapImovel(imovel: ImovelResponse): SyncedProperty {
  const address = imovel.address ?? null;
  // Dentro de `address`, o logradouro é a propriedade `address`.
  const logradouro = text(address?.address);
  const numero = text(address?.number);
  const fotos = photoUrls(imovel.photos);
  const coordinates = coordinatesOf(imovel);

  return {
    id: String(imovel.id),
    bairro: text(address?.neighborhood) || undefined,
    cidade: text(address?.city) || undefined,
    uf: text(address?.uf).toUpperCase() || undefined,
    cep: text(address?.cep) || undefined,
    endereco: [logradouro, numero].filter(Boolean).join(", ") || undefined,
    complemento: text(address?.complement) || undefined,
    aluguel: toNumber(imovel.rent_value) ?? 0,
    condominio: toNumber(imovel.condominium_value) ?? 0,
    iptu: toNumber(imovel.iptu_value) ?? 0,
    area: toNumber(imovel.area) ?? 0,
    quartos: toNumber(imovel.rooms) ?? 0,
    banheiros: toNumber(imovel.bathrooms) ?? 0,
    suites: toNumber(imovel.suites) ?? 0,
    vagas: toNumber(imovel.garages) ?? 0,
    url_imovel: `https://www.7cantos.com/imovel/${imovel.id}`,
    foto: fotos[0],
    fotos,
    ...(coordinates ? { coordinates } : {}),
  };
}

export type QualityIssue = { id: string; problema: string };

/**
 * Problemas que fazem o card do imóvel ficar vazio ou enganoso na landing.
 * Reportados pelo script para que uma mudança de contrato apareça na hora.
 */
export function findQualityIssues(properties: SyncedProperty[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const property of properties) {
    if (!property.bairro) issues.push({ id: property.id, problema: "sem bairro (endereço não associado)" });
    if (property.aluguel <= 0) issues.push({ id: property.id, problema: "sem valor de aluguel" });
    if (!property.endereco) issues.push({ id: property.id, problema: "sem logradouro" });
    if (property.fotos.length === 0) issues.push({ id: property.id, problema: "sem fotos" });
  }

  return issues;
}
