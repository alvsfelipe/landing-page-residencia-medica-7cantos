import { describe, expect, it } from "vitest";
import {
  createGoogleMapsDirectionsUrl,
  formatMobilityDistance,
  formatMobilityDuration,
  getMobilityAnchor,
} from "./mobility/index";
import { createMobilityPair } from "./mobility/persistence";
import { createCoordinatePairId } from "./mobility/pair-id";
import { createMobilityBatches, filterAndSortByProximity } from "./mobility/proximity";

describe("mobility", () => {
  it("resolve uma âncora cadastrada sem aceitar destinos arbitrários", () => {
    expect(
      getMobilityAnchor("residencia-medica-vila-clementino", "hospital-do-rim")?.address,
    ).toContain("Rua Borges Lagoa, 960");
    expect(getMobilityAnchor("inexistente", "hospital-do-rim")).toBeNull();
  });

  it("cria uma rota universal do Google Maps no modo a pé", () => {
    const url = createGoogleMapsDirectionsUrl(
      { address: "Rua Doutor Bacelar, 780, São Paulo" },
      { address: "Rua Borges Lagoa, 960, São Paulo" },
      "WALK",
    );
    expect(url).toContain("api=1");
    expect(url).toContain("travelmode=walking");
    expect(url).toContain("Rua+Doutor+Bacelar");
  });

  it("formata distância e duração para a interface", () => {
    expect(formatMobilityDistance(760)).toBe("760 m");
    expect(formatMobilityDistance(1450)).toBe("1,5 km");
    expect(formatMobilityDuration(18)).toBe("18 min");
    expect(formatMobilityDuration(75)).toBe("1h 15min");
  });

  it("cria uma chave estável para o par imóvel e âncora", () => {
    const anchor = getMobilityAnchor(
      "residencia-medica-vila-clementino",
      "hospital-do-rim",
    );
    expect(anchor).not.toBeNull();
    const first = createMobilityPair(
      "residencia-medica-vila-clementino",
      { id: "56178", address: "Rua Doutor Bacelar, 780, Vila Clementino" },
      anchor!,
      "WALK",
      "openrouteservice",
    );
    const repeated = createMobilityPair(
      "residencia-medica-vila-clementino",
      { id: "56178", address: "  rua doutor bacelar, 780, vila clementino  " },
      anchor!,
      "WALK",
      "openrouteservice",
    );

    expect(first.key).toBe(repeated.key);
    expect(first.key).toContain("openrouteservice:residencia-medica-vila-clementino");
    expect(first.key).toContain("hospital-do-rim:56178:WALK");
  });

  it("identifica o mesmo par pelas coordenadas, independentemente do texto", () => {
    const first = createCoordinatePairId(
      { id: "imovel-a", address: "Endereço A", coordinates: { latitude: -23.598, longitude: -46.645 } },
      { id: "hospital-a", name: "Hospital A", type: "hospital", address: "Destino A", coordinates: { latitude: -23.596, longitude: -46.643 } },
    );
    const repeated = createCoordinatePairId(
      { id: "outro-id", address: "Outro texto", coordinates: { latitude: -23.598, longitude: -46.645 } },
      { id: "outro-hospital", name: "Outro nome", type: "hospital", address: "Outro destino", coordinates: { latitude: -23.596, longitude: -46.643 } },
    );

    expect(first).toBe("pair-v1:-23.598000:-46.645000:-23.596000:-46.643000");
    expect(repeated).toBe(first);
  });

  it("filtra e ordena itens pela proximidade da âncora e modo", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = filterAndSortByProximity(
      items,
      {
        a: { originId: "a", anchorId: "hospital", mode: "WALK", distanceMeters: 900, durationMinutes: 14, googleMapsUrl: "", status: "ok" },
        b: { originId: "b", anchorId: "hospital", mode: "WALK", distanceMeters: 500, durationMinutes: 8, googleMapsUrl: "", status: "ok" },
        c: { originId: "c", anchorId: "hospital", mode: "DRIVE", distanceMeters: 300, durationMinutes: 3, googleMapsUrl: "", status: "ok" },
      },
      (item) => item.id,
      { anchorId: "hospital", mode: "WALK", maxDurationMinutes: 10 },
    );
    expect(result).toEqual([{ id: "b" }]);
  });

  it("divide origens em lotes máximos reutilizáveis", () => {
    const origins = Array.from({ length: 14 }, (_, index) => ({
      id: String(index),
      address: `Endereço ${index}`,
    }));
    expect(createMobilityBatches(origins, 6).map((batch) => batch.length)).toEqual([6, 6, 2]);
  });
});
