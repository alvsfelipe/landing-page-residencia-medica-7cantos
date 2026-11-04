/**
 * Tipos da API externa da 7Cantos (`/api/v1/imoveis`), derivados do OpenAPI do
 * serviço. É um sistema de locação: todo imóvel listado é de aluguel, então não
 * existe campo de finalidade — disponibilidade vem de `is_active`/`is_rented`.
 *
 * Valores numéricos chegam como string (colunas decimais do MySQL serializadas),
 * inclusive `rent_value`, `area`, `latitude` e `longitude`.
 */

export type AddressResponse = {
  id: number;
  google_id?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  cep?: string | null;
  /** Logradouro. Note que o campo se chama `address` dentro do objeto `address`. */
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  floor?: string | null;
  city?: string | null;
  uf?: string | null;
  neighborhood?: string | null;
};

export type PropertyPhotoResponse = {
  id: number;
  url_l?: string | null;
  url_m?: string | null;
  url_s?: string | null;
  is_main?: boolean | null;
  order?: number | null;
  property_id?: number | null;
  generated_by_ai?: boolean | null;
  ai_action?: string | null;
};

/** Subconjunto de `ImovelResponse` efetivamente usado pela landing. */
export type ImovelResponse = {
  id: number;
  title?: string | null;
  area?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  suites?: number | null;
  garages?: number | null;
  rent_value?: string | null;
  condominium_value?: string | null;
  iptu_value?: string | null;
  /** `true` quando o imóvel já está alugado — não deve aparecer na landing. */
  is_rented?: boolean | null;
  status_id?: number | null;
  address?: AddressResponse | null;
  photos?: PropertyPhotoResponse[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ImovelListResponse = {
  items: ImovelResponse[];
  /** Total após os filtros da query. */
  total: number;
  page: number;
  page_size: number;
};

/**
 * Forma gravada em data/properties.json. Espelha o `Property` consumido por
 * components/z1-landing.tsx — mantida aqui para que os scripts de sincronização
 * não precisem importar um componente client.
 */
export type SyncedProperty = {
  id: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  endereco?: string;
  complemento?: string;
  aluguel: number;
  condominio: number;
  iptu: number;
  area: number;
  quartos: number;
  banheiros: number;
  suites: number;
  vagas: number;
  url_imovel: string;
  foto?: string;
  fotos: string[];
  coordinates?: { latitude: number; longitude: number };
};
