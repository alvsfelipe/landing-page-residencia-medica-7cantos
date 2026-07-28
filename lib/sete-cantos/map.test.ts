import { describe, expect, it, vi } from "vitest";
import { fetchAllImoveis, fetchImoveisPage, parseListResponse, SeteCantosApiError } from "./client.ts";
import { findQualityIssues, isAvailable, mapImovel, photoUrls, toNumber } from "./map.ts";
import type { ImovelResponse } from "./types.ts";

/** Imóvel no formato documentado no OpenAPI da API externa. */
const imovel: ImovelResponse = {
  id: 56155,
  title: "Apartamento na Vila Clementino",
  area: "114.00",
  rooms: 3,
  bathrooms: 2,
  suites: 0,
  garages: 1,
  rent_value: "5600.00",
  condominium_value: "980.50",
  iptu_value: "265.00",
  is_rented: false,
  address: {
    id: 1,
    latitude: "-23.6021",
    longitude: "-46.6412",
    cep: "04021-051",
    address: "Rua Sena Madureira",
    number: "767",
    complement: "Apto 42",
    city: "São Paulo",
    uf: "SP",
    neighborhood: "Vila Clementino",
  },
  photos: [
    { id: 2, url_l: "https://cdn/2-l.jpg", url_m: "https://cdn/2-m.jpg", is_main: false, order: 2 },
    { id: 1, url_l: "https://cdn/1-l.jpg", is_main: true, order: 5 },
  ],
};

describe("mapImovel", () => {
  it("converte o imóvel da API para a forma consumida pela landing", () => {
    expect(mapImovel(imovel)).toEqual({
      id: "56155",
      bairro: "Vila Clementino",
      cidade: "São Paulo",
      uf: "SP",
      cep: "04021-051",
      endereco: "Rua Sena Madureira, 767",
      complemento: "Apto 42",
      aluguel: 5600,
      condominio: 980.5,
      iptu: 265,
      area: 114,
      quartos: 3,
      banheiros: 2,
      suites: 0,
      vagas: 1,
      url_imovel: "https://www.7cantos.com/imovel/56155",
      foto: "https://cdn/1-l.jpg",
      fotos: ["https://cdn/1-l.jpg", "https://cdn/2-l.jpg"],
      coordinates: { latitude: -23.6021, longitude: -46.6412 },
    });
  });

  it("lê o logradouro de address.address, não do objeto address", () => {
    expect(mapImovel(imovel).endereco).toBe("Rua Sena Madureira, 767");
  });

  it("sobrevive a imóvel sem endereço, fotos ou valores", () => {
    expect(mapImovel({ id: 7 })).toEqual({
      id: "7",
      bairro: undefined,
      cidade: undefined,
      uf: undefined,
      cep: undefined,
      endereco: undefined,
      complemento: undefined,
      aluguel: 0,
      condominio: 0,
      iptu: 0,
      area: 0,
      quartos: 0,
      banheiros: 0,
      suites: 0,
      vagas: 0,
      url_imovel: "https://www.7cantos.com/imovel/7",
      foto: undefined,
      fotos: [],
    });
  });

  it("descarta coordenadas ausentes, zeradas ou fora de faixa", () => {
    const semCoordenadas = { ...imovel, address: { ...imovel.address!, latitude: "0", longitude: "0" } };
    expect(mapImovel(semCoordenadas).coordinates).toBeUndefined();

    const foraDeFaixa = { ...imovel, address: { ...imovel.address!, latitude: "999", longitude: "-46.6" } };
    expect(mapImovel(foraDeFaixa).coordinates).toBeUndefined();

    expect(mapImovel({ id: 7 }).coordinates).toBeUndefined();
  });
});

describe("photoUrls", () => {
  it("coloca a foto principal primeiro e usa a maior resolução disponível", () => {
    expect(photoUrls(imovel.photos)).toEqual(["https://cdn/1-l.jpg", "https://cdn/2-l.jpg"]);
    expect(photoUrls([{ id: 1, url_s: "https://cdn/s.jpg" }])).toEqual(["https://cdn/s.jpg"]);
  });

  it("ordena por `order` quando não há principal, e ignora fotos sem URL", () => {
    expect(
      photoUrls([
        { id: 9, url_l: "https://cdn/b.jpg", order: 2 },
        { id: 3, url_l: "https://cdn/a.jpg", order: 1 },
        { id: 4 },
      ]),
    ).toEqual(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
  });

  it("aceita ausência de fotos", () => {
    expect(photoUrls(undefined)).toEqual([]);
    expect(photoUrls(null)).toEqual([]);
  });
});

describe("isAvailable", () => {
  it("exclui imóveis alugados e mantém os demais", () => {
    expect(isAvailable({ id: 1, is_rented: true })).toBe(false);
    expect(isAvailable({ id: 1, is_rented: false })).toBe(true);
    expect(isAvailable({ id: 1 })).toBe(true);
  });
});

describe("toNumber", () => {
  it("interpreta os decimais em string da API", () => {
    expect(toNumber("5600.00")).toBe(5600);
    expect(toNumber("114.50")).toBe(114.5);
    expect(toNumber(3)).toBe(3);
  });

  it("tolera moeda formatada em pt-BR", () => {
    expect(toNumber("R$ 5.600,00")).toBe(5600);
    expect(toNumber("1.200.000")).toBe(1200000);
  });

  it("devolve null para vazio ou texto", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("sob consulta")).toBeNull();
  });
});

describe("findQualityIssues", () => {
  it("aponta imóveis que ficariam vazios na landing", () => {
    const issues = findQualityIssues([mapImovel({ id: 7 })]);
    expect(issues.map((issue) => issue.problema)).toEqual([
      "sem bairro (endereço não associado)",
      "sem valor de aluguel",
      "sem logradouro",
      "sem fotos",
    ]);
  });

  it("não reclama de um imóvel completo", () => {
    expect(findQualityIssues([mapImovel(imovel)])).toEqual([]);
  });
});

describe("parseListResponse", () => {
  it("aceita o envelope documentado", () => {
    expect(parseListResponse({ items: [imovel], total: 1, page: 1, page_size: 20 })).toEqual({
      items: [imovel],
      total: 1,
      page: 1,
      page_size: 20,
    });
  });

  it("rejeita resposta fora do contrato", () => {
    expect(() => parseListResponse({ data: [] })).toThrow(/fora do contrato/);
    expect(() => parseListResponse([imovel])).toThrow(/fora do contrato/);
  });
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("fetchImoveisPage", () => {
  it("envia Bearer token e os filtros como query string", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, page_size: 100 }));

    await fetchImoveisPage(
      { token: "7c_live_x", fetchImpl: fetchImpl as unknown as typeof fetch },
      { neighborhood: "Vila Clementino", city: "São Paulo", uf: "SP", is_active: true },
    );

    const [url, init] = fetchImpl.mock.calls[0];
    const query = new URL(url).searchParams;
    expect(query.get("neighborhood")).toBe("Vila Clementino");
    expect(query.get("city")).toBe("São Paulo");
    expect(query.get("is_active")).toBe("true");
    expect(query.get("page_size")).toBe("100");
    expect(init.headers.Authorization).toBe("Bearer 7c_live_x");
  });

  it("limita page_size ao máximo aceito pela API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, page_size: 100 }));
    await fetchImoveisPage({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }, { pageSize: 500 });
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get("page_size")).toBe("100");
  });

  it("não repete erro de credencial e explica o status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ detail: "invalid" }, 401));

    await expect(
      fetchImoveisPage({ token: "ruim", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/API key inválida/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const semEscopo = vi.fn().mockResolvedValue(jsonResponse({ detail: "forbidden" }, 403));
    await expect(
      fetchImoveisPage({ token: "t", fetchImpl: semEscopo as unknown as typeof fetch }),
    ).rejects.toThrow(/imoveis:read/);
  });

  it("repete em erro transitório e devolve o resultado", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 503))
      .mockResolvedValueOnce(jsonResponse({ items: [imovel], total: 1, page: 1, page_size: 100 }));

    const page = await fetchImoveisPage({
      token: "t",
      maxRetries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(page.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("expõe o status no erro para diagnóstico", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ detail: "unprocessable" }, 422));
    await expect(
      fetchImoveisPage({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(SeteCantosApiError);
  });
});

describe("fetchAllImoveis", () => {
  it("percorre todas as páginas e deduplica por id", async () => {
    const pagina = (page: number, ids: number[]) =>
      jsonResponse({ items: ids.map((id) => ({ id })), total: 5, page, page_size: 2 });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(pagina(1, [1, 2]))
      .mockResolvedValueOnce(pagina(2, [3, 4]))
      .mockResolvedValueOnce(pagina(3, [5]));

    const todos = await fetchAllImoveis(
      { token: "t", fetchImpl: fetchImpl as unknown as typeof fetch },
      { pageSize: 2 },
    );

    expect(todos.map((item) => item.id)).toEqual([1, 2, 3, 4, 5]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("para quando a API ignora a paginação e repete a mesma página", async () => {
    // Cada chamada precisa de um Response novo: o corpo só pode ser lido uma vez.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ items: [{ id: 1 }, { id: 2 }], total: 999, page: 1, page_size: 2 }));

    const todos = await fetchAllImoveis(
      { token: "t", fetchImpl: fetchImpl as unknown as typeof fetch },
      { pageSize: 2 },
    );

    expect(todos.map((item) => item.id)).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
