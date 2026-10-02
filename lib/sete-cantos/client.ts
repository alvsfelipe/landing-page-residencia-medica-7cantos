import type { ImovelListResponse, ImovelResponse } from "./types.ts";

/** Host de produção declarado em `servers` no OpenAPI da API externa. */
export const DEFAULT_BASE_URL = "https://api-externa-70599b92ae69.herokuapp.com/api/v1";

/** Limite imposto pela API (`page_size` máximo 100). */
export const MAX_PAGE_SIZE = 100;

export type ClientOptions = {
  /** API key no formato `7c_live_...`, enviada como `Authorization: Bearer`. */
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injetável para teste; usa o `fetch` global por padrão. */
  fetchImpl?: typeof fetch;
};

/** Filtros suportados pelo endpoint `GET /api/v1/imoveis`. */
export type ImoveisFilter = {
  city?: string;
  uf?: string;
  neighborhood?: string;
  cep?: string;
  is_adm?: boolean;
  /** `true` = não apagado e não alugado (disponível para locação). */
  is_active?: boolean;
  created_at_from?: string;
  created_at_to?: string;
  updated_at_from?: string;
  updated_at_to?: string;
};

export class SeteCantosApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "SeteCantosApiError";
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 429 e 5xx são transitórios; 401/403/422 são definitivos e não devem ser repetidos. */
const isRetryable = (status: number) => status === 429 || status >= 500;

function describeError(status: number, url: string): string {
  if (status === 401) return "API key inválida, inativa ou expirada (401). Confira SETE_CANTOS_API_TOKEN.";
  if (status === 403) return "API key sem o escopo `imoveis:read` (403).";
  if (status === 404) return `Imóvel não encontrado (404) em ${url}.`;
  if (status === 422) return `Parâmetros de consulta rejeitados pela API (422) em ${url}.`;
  return `API respondeu ${status} em ${url}`;
}

/** Valida o envelope `{items,total,page,page_size}` documentado no OpenAPI. */
export function parseListResponse(payload: unknown): ImovelListResponse {
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as ImovelListResponse).items)) {
    throw new SeteCantosApiError(
      "Resposta fora do contrato: esperado objeto com `items`.",
      0,
      JSON.stringify(payload).slice(0, 500),
    );
  }

  const envelope = payload as ImovelListResponse;
  return {
    items: envelope.items.filter((item): item is ImovelResponse => typeof item === "object" && item !== null),
    total: typeof envelope.total === "number" ? envelope.total : envelope.items.length,
    page: typeof envelope.page === "number" ? envelope.page : 1,
    page_size: typeof envelope.page_size === "number" ? envelope.page_size : envelope.items.length,
  };
}

export type PageQuery = ImoveisFilter & { page?: number; pageSize?: number };

function buildQuery({ page = 1, pageSize = MAX_PAGE_SIZE, ...filter }: PageQuery): URLSearchParams {
  const search = new URLSearchParams({ page: String(page), page_size: String(Math.min(pageSize, MAX_PAGE_SIZE)) });
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search;
}

/** GET autenticado com retry em falhas transitórias. Lança `SeteCantosApiError` em falha definitiva. */
async function requestJson(options: ClientOptions, url: string): Promise<unknown> {
  const { token, timeoutMs = 30_000, maxRetries = 3, fetchImpl = fetch } = options;
  if (!token) throw new Error("Token da API da 7Cantos ausente (SETE_CANTOS_API_TOKEN).");

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) await sleep(2 ** attempt * 500);

    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new SeteCantosApiError(describeError(response.status, url), response.status, body.slice(0, 500));
        if (!isRetryable(response.status)) throw error;
        lastError = error;
        continue;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof SeteCantosApiError && !isRetryable(error.status)) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Falha ao buscar ${url} após ${maxRetries + 1} tentativas`);
}

const apiRoot = (baseUrl = DEFAULT_BASE_URL) => baseUrl.replace(/\/$/, "");

/** Busca uma página de imóveis. */
export async function fetchImoveisPage(options: ClientOptions, query: PageQuery = {}): Promise<ImovelListResponse> {
  return parseListResponse(await requestJson(options, `${apiRoot(options.baseUrl)}/imoveis?${buildQuery(query)}`));
}

/**
 * Busca o detalhe de um imóvel. Devolve `null` em 404 — a API responde 404 para
 * imóveis com `deleted_at` preenchido, o que pode acontecer entre a listagem e
 * esta chamada.
 */
export async function fetchImovel(options: ClientOptions, id: number): Promise<ImovelResponse | null> {
  try {
    const payload = await requestJson(options, `${apiRoot(options.baseUrl)}/imoveis/${id}`);
    return typeof payload === "object" && payload !== null ? (payload as ImovelResponse) : null;
  } catch (error) {
    if (error instanceof SeteCantosApiError && error.status === 404) return null;
    throw error;
  }
}

export type HydrateOptions = {
  /** Requisições simultâneas ao endpoint de detalhe. */
  concurrency?: number;
  onProgress?: (concluidos: number, total: number) => void;
};

/**
 * Preenche as fotos a partir do endpoint de detalhe.
 *
 * A listagem (`GET /imoveis`) não traz `photos` — só o detalhe
 * (`GET /imoveis/{id}`) inclui as URLs de `property_photos`. Sem esta etapa
 * todos os imóveis chegariam à landing sem imagem.
 */
export async function hydratePhotos(
  options: ClientOptions,
  imoveis: ImovelResponse[],
  { concurrency = 6, onProgress }: HydrateOptions = {},
): Promise<ImovelResponse[]> {
  const hydrated = [...imoveis];
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < hydrated.length) {
      const index = cursor;
      cursor += 1;
      const imovel = hydrated[index];

      // Já veio com fotos (ou a API passou a incluí-las na listagem): não gasta requisição.
      if (!imovel.photos?.length) {
        const detalhe = await fetchImovel(options, imovel.id);
        if (detalhe) hydrated[index] = { ...imovel, ...detalhe };
      }

      done += 1;
      onProgress?.(done, hydrated.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, hydrated.length) }, worker));
  return hydrated;
}

export type FetchAllOptions = PageQuery & {
  /** Trava de segurança contra paginação que nunca termina. */
  maxPages?: number;
  onPage?: (page: ImovelListResponse) => void;
};

/** Percorre a paginação até o fim e devolve todos os imóveis que casam com o filtro. */
export async function fetchAllImoveis(
  options: ClientOptions,
  query: FetchAllOptions = {},
): Promise<ImovelResponse[]> {
  const { maxPages = 200, onPage, ...pageQuery } = query;
  const pageSize = Math.min(pageQuery.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const first = pageQuery.page ?? 1;
  const all: ImovelResponse[] = [];
  const seen = new Set<number>();

  for (let page = first; page < first + maxPages; page += 1) {
    const result = await fetchImoveisPage(options, { ...pageQuery, page, pageSize });
    onPage?.(result);

    let added = 0;
    for (const item of result.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      all.push(item);
      added += 1;
    }

    // Página vazia/repetida encerra o laço mesmo que `total` sugira mais —
    // protege contra paginação ignorada pela API.
    if (added === 0 || all.length >= result.total || result.items.length < pageSize) break;
  }

  return all;
}
