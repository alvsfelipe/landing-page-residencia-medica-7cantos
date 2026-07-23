"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createWhatsAppUrl } from "@/lib/config";
import { getAttribution, track } from "@/lib/tracking";
import { formatMobilityDistance, formatMobilityDuration } from "@/lib/mobility/client";
import { createMobilityBatches, filterAndSortByProximity } from "@/lib/mobility/proximity";
import { readSessionMobilityForRoute, writeSessionMobility } from "@/lib/mobility/pair-id";
import type { MobilityAnchor, MobilityMode, MobilityResult } from "@/lib/mobility/types";

export type Property = {
  id?: string | number; bairro?: string; foto?: string; fotos?: string[]; aluguel?: number;
  condominio?: number; iptu?: number; area?: number; quartos?: number; banheiros?: number;
  vagas?: number; endereco?: string; url_imovel?: string;
  cidade?: string; uf?: string; cep?: string;
  coordinates?: { latitude: number; longitude: number };
};

export type Hospital = {
  id: string;
  name: string;
  area: string;
  relationship: "Programa próprio" | "Campo de prática UNIFESP";
  summary: string;
  sourceUrl: string;
};

const formatMoney = (value = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
const PROPERTY_PAGE_SIZE = 6;
type ProximitySelection = "none" | "nearest" | "10" | "20" | "30" | "45";

const propertyMobilityAddress = (property: Property) =>
  [property.endereco, property.bairro, property.cidade || "São Paulo", property.uf || "SP", property.cep]
    .filter(Boolean)
    .join(", ");

function PropertySearchLoading({ anchorName }: { anchorName: string }) {
  return <div className="z1-route-loading" role="status" aria-live="polite">
    <div className="z1-route-loading-visual" aria-hidden="true"><span className="z1-loading-home">⌂</span><i><b /></i><span className="z1-loading-hospital">+</span></div>
    <div><strong>Comparando imóveis perto de {anchorName}</strong><span>Calculando os melhores trajetos a pé e de carro.</span></div>
  </div>;
}

export function Z1Landing({ properties, hospitals, mobilityAnchorSetId, mobilityAnchors }: { properties: Property[]; hospitals: Hospital[]; mobilityAnchorSetId: string; mobilityAnchors: MobilityAnchor[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [simulatorStep, setSimulatorStep] = useState<"profile" | "contact" | "complete">("profile");
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [propertyPage, setPropertyPage] = useState(0);
  const [budget, setBudget] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [livingArrangement, setLivingArrangement] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [currentCity, setCurrentCity] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [captureSubmitting, setCaptureSubmitting] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [selectedAnchorId, setSelectedAnchorId] = useState("");
  const [mobilityMode, setMobilityMode] = useState<MobilityMode>("WALK");
  const [proximitySelection, setProximitySelection] = useState<ProximitySelection>("none");
  const [mobilityResults, setMobilityResults] = useState<Record<string, MobilityResult>>({});
  const [mobilityLoading, setMobilityLoading] = useState(false);
  const [mobilityScanComplete, setMobilityScanComplete] = useState(false);
  const [mobilityProgress, setMobilityProgress] = useState({ completed: 0, total: 0 });
  const [mobilityError, setMobilityError] = useState("");
  const modalCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { track("landing_view"); }, []);
  useEffect(() => {
    if (!modalOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setModalOpen(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalCloseRef.current?.focus();
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [modalOpen]);

  const compatible = useMemo(() => {
    const ceiling = Number(budget.replace(/\D/g, ""));
    return properties
      .filter((item) => item.bairro?.toLocaleLowerCase("pt-BR") === "vila clementino")
      .filter((item) => !ceiling || (item.aluguel || 0) + (item.condominio || 0) + (item.iptu || 0) <= ceiling)
      .sort((a, b) => (a.quartos || 0) - (b.quartos || 0) || (a.area || 0) - (b.area || 0));
  }, [budget, properties]);

  const selectedAnchor = useMemo(
    () => mobilityAnchors.find((anchor) => anchor.id === selectedAnchorId) ?? null,
    [mobilityAnchors, selectedAnchorId],
  );
  const proximityActive = proximitySelection !== "none";
  const proximityProperties = useMemo(() => {
    if (!proximityActive || !mobilityScanComplete || !selectedAnchor) return compatible;
    return filterAndSortByProximity(
      compatible,
      mobilityResults,
      (property) => property.id == null ? null : String(property.id),
      {
        anchorId: selectedAnchor.id,
        mode: mobilityMode,
        maxDurationMinutes:
          proximitySelection === "nearest" ? undefined : Number(proximitySelection),
      },
    );
  }, [compatible, mobilityMode, mobilityResults, mobilityScanComplete, proximityActive, proximitySelection, selectedAnchor]);
  const displayedProperties = useMemo(
    () => proximityProperties.slice(propertyPage * PROPERTY_PAGE_SIZE, (propertyPage + 1) * PROPERTY_PAGE_SIZE),
    [propertyPage, proximityProperties],
  );
  const propertyPageCount = Math.max(1, Math.ceil(proximityProperties.length / PROPERTY_PAGE_SIZE));
  const compatibleMobilityOrigins = useMemo(
    () => compatible.flatMap((property) => {
      if (property.id == null || !property.endereco) return [];
      return [{
        id: String(property.id),
        address: propertyMobilityAddress(property),
        ...(property.coordinates ? { coordinates: property.coordinates } : {}),
      }];
    }),
    [compatible],
  );
  const displayedMobilityOrigins = useMemo(
    () => displayedProperties.flatMap((property) => {
      if (property.id == null || !property.endereco) return [];
      return [{
        id: String(property.id),
        address: propertyMobilityAddress(property),
        ...(property.coordinates ? { coordinates: property.coordinates } : {}),
      }];
    }),
    [displayedProperties],
  );
  const mobilityOrigins = proximityActive
    ? compatibleMobilityOrigins
    : displayedMobilityOrigins;

  useEffect(() => {
    if (!leadCaptured || !selectedAnchor || !mobilityOrigins.length) return;

    const controller = new AbortController();
    const loadMobility = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setMobilityLoading(true);
      setMobilityScanComplete(false);
      setMobilityError("");
      const collected: Record<string, MobilityResult> = {};
      const missingOrigins = mobilityOrigins.filter((origin) => {
        const cached = readSessionMobilityForRoute(origin, selectedAnchor, mobilityMode);
        if (cached) collected[origin.id] = cached;
        return !cached;
      });
      if (Object.keys(collected).length) setMobilityResults({ ...collected });
      const batches = createMobilityBatches(missingOrigins, PROPERTY_PAGE_SIZE);
      setMobilityProgress({ completed: 0, total: batches.length });
      track("mobility_calculation_started", {
        anchor_id: selectedAnchor.id,
        mode: mobilityMode,
        proximity_filter: proximityActive,
      });

      try {
        for (const [index, origins] of batches.entries()) {
          const response = await fetch("/api/mobility", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              anchorSetId: mobilityAnchorSetId,
              anchorId: selectedAnchor.id,
              mode: mobilityMode,
              origins,
            }),
            signal: controller.signal,
          });
          const payload = (await response.json()) as { results?: MobilityResult[]; error?: string };
          if (!response.ok || !payload.results) throw new Error(payload.error || "Não foi possível calcular as rotas.");
          payload.results.forEach((result) => {
            collected[result.originId] = result;
            writeSessionMobility(result);
          });
          if (!controller.signal.aborted) {
            setMobilityResults({ ...collected });
            setMobilityProgress({ completed: index + 1, total: batches.length });
          }
        }
        if (!controller.signal.aborted) setMobilityScanComplete(true);
        track("mobility_calculation_completed", {
          anchor_id: selectedAnchor.id,
          results: Object.keys(collected).length,
          mode: mobilityMode,
          proximity_filter: proximityActive,
        });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMobilityError(error instanceof Error ? error.message : "Não foi possível calcular as rotas.");
      } finally {
        if (!controller.signal.aborted) setMobilityLoading(false);
      }
    };
    void loadMobility();

    return () => controller.abort();
  }, [leadCaptured, mobilityAnchorSetId, mobilityMode, mobilityOrigins, proximityActive, selectedAnchor]);

  function changeAnchor(anchorId: string) {
    setSelectedAnchorId(anchorId);
    setPropertyPage(0);
    setMobilityResults({});
    setMobilityScanComplete(false);
    setMobilityLoading(false);
  }

  function changeMobilityMode(mode: MobilityMode) {
    setMobilityMode(mode);
    setPropertyPage(0);
    setMobilityResults({});
    setMobilityScanComplete(false);
    setMobilityLoading(false);
  }

  function changeProximityFilter(value: ProximitySelection) {
    setProximitySelection(value);
    setPropertyPage(0);
    if (value !== "none") {
      track("mobility_proximity_filter_applied", {
        anchor_id: selectedAnchor?.id,
        mode: mobilityMode,
        filter: value,
      });
    }
  }

  const openPlan = () => { track("move_plan_started"); setModalOpen(true); };
  const startSimulation = () => {
    track("move_plan_started", { destination: "simulator" });
    setModalOpen(false);
    document.querySelector("#como-funciona")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      document.querySelector<HTMLSelectElement>('.z1-simulator select[name="local"]')?.focus();
    }, 500);
  };

  const selectedHospitalName = selectedAnchor?.name ??
    (selectedAnchorId === "outro" ? "Outro hospital da região" : "Ainda não sei");

  function registerPropertyInterest(property: Property) {
    if (!leadCaptured || property.id == null || !property.url_imovel) return;
    const attribution = getAttribution(new URLSearchParams(window.location.search));
    track("property_clicked", { property_id: property.id, anchor_id: selectedAnchorId });
    void fetch("/api/property-interests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: contactName,
        whatsapp: contactWhatsapp,
        currentCity,
        moveDate,
        budget,
        livingArrangement,
        propertyId: String(property.id),
        propertyAddress: propertyMobilityAddress(property),
        propertyUrl: property.url_imovel,
        hospitalId: selectedAnchorId,
        hospitalName: selectedHospitalName,
        attribution,
        pageUrl: window.location.href,
      }),
      keepalive: true,
    }).catch((error) => console.error("Falha ao registrar interesse no imóvel", error));
  }

  function runSimulator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSimulatorStep("contact");
    setCaptureError("");
    track("simulator_started", { anchor_id: selectedAnchorId });
  }

  async function submitSimulationLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCaptureSubmitting(true);
    setCaptureError("");
    const attribution = getAttribution(new URLSearchParams(window.location.search));

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          whatsapp: contactWhatsapp,
          currentCity,
          hospitalProgram: selectedHospitalName,
          moveDate,
          budget,
          livingArrangement,
          consent: contactConsent,
          attribution,
          pageUrl: window.location.href,
          matchingPropertyCount: compatible.length,
          matchingPropertyIds: compatible.flatMap((property) => property.id == null ? [] : [String(property.id)]),
          website: "",
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Não foi possível salvar seus dados.");
      setLeadCaptured(true);
      setSimulated(true);
      setSimulatorStep("complete");
      track("lead_submitted", { source: "simulator" });
      track("simulator_completed", { results: compatible.length, anchor_id: selectedAnchorId });
      requestAnimationFrame(() => document.querySelector("#resultado-imoveis")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Não foi possível salvar seus dados.");
    } finally {
      setCaptureSubmitting(false);
    }
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadSubmitting(true);
    setLeadError("");
    const data = new FormData(event.currentTarget);
    const attribution = getAttribution(new URLSearchParams(window.location.search));
    const message = [
      "Olá, 7Cantos! Quero montar meu plano de mudança.", "",
      `Nome: ${data.get("nome")}`, `WhatsApp: ${data.get("whatsapp")}`,
      `Cidade atual: ${data.get("cidade")}`, `Hospital/programa: ${data.get("hospital")}`,
      `Mudança prevista: ${data.get("mudanca")}`, `Orçamento: ${data.get("orcamento")}`,
      `Como vou morar: ${data.get("moradia")}`, "",
      ...Object.entries(attribution).map(([key, value]) => `${key}: ${value}`),
    ].join("\n");
    const url = createWhatsAppUrl(message);
    const whatsappWindow = url ? window.open("about:blank", "_blank") : null;

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("nome"),
          whatsapp: data.get("whatsapp"),
          currentCity: data.get("cidade"),
          hospitalProgram: data.get("hospital"),
          moveDate: data.get("mudanca"),
          budget: data.get("orcamento"),
          livingArrangement: data.get("moradia"),
          consent: data.get("consentimento") === "on",
          attribution,
          pageUrl: window.location.href,
          matchingPropertyCount: compatible.length,
          matchingPropertyIds: compatible.flatMap((property) => property.id == null ? [] : [String(property.id)]),
          website: data.get("website"),
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Não foi possível salvar seus dados.");
      track("lead_submitted");
    } catch (error) {
      setLeadError(error instanceof Error ? error.message : "Não foi possível salvar seus dados.");
    } finally {
      if (url) {
        track("whatsapp_clicked");
        if (whatsappWindow) whatsappWindow.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
      }
      setLeadSubmitting(false);
    }
  }

  return <main className="z1">
    <header className="z1-header">
      <a className="z1-logo" href="#inicio" aria-label="7Cantos Residência, início">
        <Image src="/logo-7cantos.png" alt="7Cantos.com" width={744} height={222} priority />
      </a>
      <nav aria-label="Navegação da landing"><a href="#como-funciona">Como funciona</a><a href="#imoveis">Imóveis</a><a href="#chegada">Sua chegada</a></nav>
      <button className="z1-btn z1-btn-sm" onClick={startSimulation}>Começar</button>
    </header>

    <section className="z1-hero" id="inicio">
      <div className="z1-hero-copy"><p className="z1-eyebrow">7Cantos Residência · Vila Clementino</p><h1>Sua residência já vai ser intensa. <em>Sua mudança não precisa ser.</em></h1><p>Encontre onde morar, visite apartamentos selecionados perto da sua rotina e chegue a São Paulo com tudo preparado.</p><div className="z1-actions"><button className="z1-btn" onClick={startSimulation}>Montar meu plano de mudança <span>↓</span></button><a href="#imoveis">Ver imóveis disponíveis ↓</a></div></div>
      <div className="z1-hero-home">
        <Image src="/hero-residencia-medica.png" alt="Apartamento compacto da 7Cantos com cozinha integrada" fill priority sizes="(min-width: 1000px) 46vw, 100vw" />
        <div className="z1-hero-home-shade" />
        <div className="z1-hero-distance-card"><small>EXEMPLO DE UMA NOVA ROTINA</small><strong><span aria-hidden="true">🚶</span> Você pode morar a 5 minutos a pé da sua residência médica.</strong><p>O tempo real aparece quando você escolhe o hospital e compara os imóveis.</p></div>
      </div>
      <ul className="z1-proof"><li>✓ Imóveis selecionados na Vila Clementino</li><li>✓ Visite 2 ou 3 opções na mesma rota</li><li>✓ Organize sua mudança com a 7Cantos</li></ul>
    </section>

    <section className="z1-simulator" id="como-funciona">
      <div className="z1-section-head"><p className="z1-eyebrow">Comece por você</p><h2>Onde começa sua nova rotina?</h2><p>Conte um pouco sobre seus planos. A gente organiza o primeiro recorte para você.</p></div>
      <div className="z1-simulator-steps" aria-label={`Etapa ${simulatorStep === "profile" ? 1 : 2} de 2`}><span className="active">1. Sua rotina</span><i /><span className={simulatorStep !== "profile" ? "active" : ""}>2. Seu contato</span></div>
      {simulatorStep === "profile" && <form onSubmit={runSimulator} onFocus={() => track("simulator_started")}>
        <label>Onde você fará residência ou trabalhará?<select name="local" required value={selectedAnchorId} onChange={(event) => changeAnchor(event.target.value)}><option value="" disabled>Selecione uma opção</option>{mobilityAnchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}<option value="outro">Outro hospital da região</option><option value="nao-sei">Ainda não sei</option></select></label>
        <label>Quando pretende se mudar?<input name="data" type="month" required value={moveDate} onChange={(event) => setMoveDate(event.target.value)} /></label>
        <label>Como pretende morar?<select name="moradia" required value={livingArrangement} onChange={(event) => setLivingArrangement(event.target.value)}><option value="" disabled>Selecione uma opção</option><option>Sozinho</option><option>Casal</option><option>Dividir apartamento</option><option>Família</option></select></label>
        <label>Orçamento mensal máximo<input name="orcamento" inputMode="numeric" placeholder="Ex.: 4500" value={budget} onChange={(e) => { setBudget(e.target.value); setPropertyPage(0); setMobilityScanComplete(false); setMobilityLoading(false); }} required /><small>Considere aluguel + condomínio + IPTU.</small></label>
        <button className="z1-btn" type="submit">Continuar para ver opções</button>
      </form>}
      {simulatorStep === "contact" && <form className="z1-contact-step" onSubmit={submitSimulationLead}>
        <div className="z1-contact-intro"><b>Seu recorte está pronto.</b><span>Deixe seu contato para ver as opções e calcular a proximidade com {selectedHospitalName}.</span></div>
        <label>Nome<input name="nome-simulacao" autoComplete="name" required value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
        <label>WhatsApp<input name="whatsapp-simulacao" type="tel" inputMode="tel" autoComplete="tel" required value={contactWhatsapp} onChange={(event) => setContactWhatsapp(event.target.value)} /></label>
        <label>Cidade atual<input name="cidade-simulacao" autoComplete="address-level2" required value={currentCity} onChange={(event) => setCurrentCity(event.target.value)} /></label>
        <label className="z1-consent"><input name="consentimento-simulacao" type="checkbox" required checked={contactConsent} onChange={(event) => setContactConsent(event.target.checked)} /> Autorizo a 7Cantos a entrar em contato comigo sobre este plano de mudança.</label>
        {captureError && <p className="z1-config-warning" role="alert">{captureError}</p>}
        <div className="z1-contact-actions"><button className="z1-outline-btn" type="button" onClick={() => setSimulatorStep("profile")}>← Voltar</button><button className="z1-btn" type="submit" disabled={captureSubmitting}>{captureSubmitting ? "Preparando suas opções…" : "Ver imóveis próximos"}</button></div>
      </form>}
      {simulated && <div className="z1-result" role="status"><b>Encontramos {compatible.length ? `${compatible.length} opções` : "um próximo passo"} compatível com seu perfil.</b><span>{compatible.length ? "Veja a seleção abaixo." : "Ainda não temos imóveis cadastrados nessa faixa. Fale com a gente para uma busca assistida."}</span></div>}
    </section>

    <section className="z1-properties" id="imoveis">
      <div className="z1-section-head"><p className="z1-eyebrow">Seleção local · {proximityProperties.length} opções</p><h2>Imóveis na Vila Clementino</h2><p>Unidades compactas aparecem primeiro. O custo estimado soma aluguel, condomínio e IPTU informados na base da 7Cantos.</p></div>
      <div className="z1-mobility-picker">
        <label>Calcular mobilidade até<select value={selectedAnchorId} onChange={(event) => changeAnchor(event.target.value)}><option value="">Selecione uma âncora</option>{mobilityAnchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}</select></label>
        <label>Modo de deslocamento<select value={mobilityMode} onChange={(event) => changeMobilityMode(event.target.value as MobilityMode)}><option value="WALK">A pé</option><option value="DRIVE">De carro</option></select></label>
        <label>Proximidade<select value={proximitySelection} disabled={!selectedAnchor} onChange={(event) => changeProximityFilter(event.target.value as ProximitySelection)}><option value="none">Sem filtro</option><option value="nearest">Mais próximos primeiro</option><option value="10">Até 10 min</option><option value="20">Até 20 min</option><option value="30">Até 30 min</option><option value="45">Até 45 min</option></select></label>
        <p>Compare cada imóvel pela distância e pelo tempo estimado até sua rotina. Se você já preencheu o simulador, a seleção escolhida aparece automaticamente aqui.</p>
      </div>
      {selectedAnchor && !leadCaptured && <div className="z1-mobility-gate"><strong>Veja a distância até sua residência médica.</strong><span>Complete o simulador acima para calcular e comparar os trajetos.</span><a href="#como-funciona">Completar meu perfil ↑</a></div>}
      {selectedAnchor && mobilityLoading && <PropertySearchLoading anchorName={selectedAnchor.name} />}
      {selectedAnchor && mobilityLoading && mobilityProgress.total > 1 && <div className="z1-loading-progress" aria-hidden="true"><i style={{ width: `${Math.max(12, (mobilityProgress.completed / mobilityProgress.total) * 100)}%` }} /></div>}
      {selectedAnchor && proximityActive && mobilityScanComplete && <p className="z1-mobility-progress" role="status">{proximityProperties.length} imóveis encontrados e ordenados por proximidade.</p>}
      {selectedAnchor && mobilityError && <p className="z1-mobility-error" role="alert">{mobilityError}</p>}
      <div className="z1-property-grid" id="resultado-imoveis">
        {displayedProperties.map((item, index) => {
          const image = item.fotos?.[0] || item.foto; const total = (item.aluguel || 0) + (item.condominio || 0) + (item.iptu || 0);
          const candidateMobility = item.id == null ? null : mobilityResults[String(item.id)] ?? null;
          const mobility =
            candidateMobility?.anchorId === selectedAnchor?.id &&
            candidateMobility?.mode === mobilityMode
              ? candidateMobility
              : null;
          const card = <article className="z1-property" onMouseEnter={() => track("property_viewed", { property_id: item.id })}>
            <div className="z1-property-image">{image ? <Image src={image} alt={`Imóvel na Vila Clementino${item.endereco ? ` — ${item.endereco}` : ""}`} fill sizes="(min-width: 1000px) 33vw, (min-width: 700px) 50vw, 100vw" /> : <span>Foto não disponível</span>}</div>
            <div className="z1-property-body"><p>{item.endereco || "Vila Clementino, São Paulo"}</p><h3>{formatMoney(item.aluguel)} <small>/ aluguel</small></h3><ul><li>{item.area || "—"} m²</li><li>{item.quartos ?? "—"} quarto(s)</li><li>{item.banheiros ?? "—"} banheiro(s)</li><li>{item.vagas ?? 0} vaga(s)</li></ul><div className="z1-cost"><span>Custo mensal estimado</span><strong>{formatMoney(total)}</strong><small>Aluguel + condomínio + IPTU</small></div>{selectedAnchor && leadCaptured && <div className="z1-mobility-result"><span>{mobilityMode === "WALK" ? "A pé" : "De carro"} até {selectedAnchor.name}</span>{mobilityLoading && !mobility ? <strong className="z1-route-skeleton" aria-label="Calculando rota" /> : mobility?.status === "ok" && mobility.distanceMeters != null && mobility.durationMinutes != null ? <strong>{mobilityMode === "WALK" ? "🚶" : "🚗"} {formatMobilityDuration(mobility.durationMinutes)} · {formatMobilityDistance(mobility.distanceMeters)}</strong> : <strong>Consulte a rota atual</strong>}{mobility?.status === "ok" && <small>{mobility.provider === "openrouteservice" ? "openrouteservice · © OpenStreetMap contributors" : `Powered by Google, ©${new Date().getFullYear()} Google`}</small>}</div>}{item.url_imovel && (leadCaptured ? <span className="z1-property-cta">Quero ver! <b aria-hidden="true">↗</b></span> : <button className="z1-property-locked" type="button" onClick={startSimulation}>Salvar meu perfil para ver</button>)}</div>
          </article>;
          return item.url_imovel && leadCaptured
            ? <a className="z1-property-card-link" key={item.id || index} href={item.url_imovel} target="_blank" rel="noopener noreferrer" aria-label={`Quero ver o imóvel ${item.endereco || item.id} na 7Cantos`} onClick={() => registerPropertyInterest(item)}>{card}</a>
            : <div className="z1-property-card-shell" key={item.id || index}>{card}</div>;
        })}
        {!proximityProperties.length && <div className="z1-empty"><b>{compatible.length ? "Nenhum imóvel nesse limite de proximidade" : "Seleção de imóveis em preparação"}</b><p>{compatible.length ? "Aumente o tempo máximo ou remova o filtro para visualizar outras opções." : "Não encontramos imóveis compatíveis com os filtros atuais."}</p>{compatible.length ? <button className="z1-outline-btn" onClick={() => changeProximityFilter("none")}>Remover filtro</button> : <button className="z1-btn" onClick={openPlan}>Quero receber opções</button>}</div>}
      </div>
      {proximityProperties.length > PROPERTY_PAGE_SIZE && <nav className="z1-property-pagination" aria-label="Paginação dos imóveis"><button className="z1-outline-btn" disabled={propertyPage === 0} onClick={() => setPropertyPage((page) => Math.max(0, page - 1))}>← Anteriores</button><span>Página {propertyPage + 1} de {propertyPageCount}</span><button className="z1-outline-btn" disabled={propertyPage + 1 >= propertyPageCount} onClick={() => setPropertyPage((page) => Math.min(propertyPageCount - 1, page + 1))}>Mais opções →</button></nav>}
    </section>

    <section className="z1-hospitals" aria-labelledby="hospitals-title">
      <div className="z1-section-head"><p className="z1-eyebrow">Ecossistema de saúde da região</p><h2 id="hospitals-title">Residência perto da sua próxima rotina.</h2><p>Mapeamos instituições com programa próprio de residência médica e campos de prática oficialmente documentados na Vila Clementino e no entorno imediato.</p></div>
      <div className="z1-hospital-grid">
        {hospitals.map((hospital) => <article key={hospital.id}>
          <div><span>{hospital.relationship}</span><small>{hospital.area}</small></div>
          <h3>{hospital.name}</h3>
          <p>{hospital.summary}</p>
          <a href={hospital.sourceUrl} target="_blank" rel="noreferrer">Ver fonte oficial ↗</a>
        </article>)}
      </div>
      <p className="z1-source-note">Lista inicial baseada em páginas institucionais. Programas e processos seletivos podem mudar a cada ciclo.</p>
    </section>

    <section className="z1-neighborhood">
      <div><p className="z1-eyebrow">Morar perto muda tudo</p><h2>Por que médicos escolhem morar na Vila Clementino?</h2><p>A proximidade do ecossistema hospitalar simplifica plantões, conecta você ao transporte e mantém serviços essenciais por perto. Menos deslocamento pode significar uma rotina mais prática.</p><h3>Menos tempo no trânsito.<br/><em>Mais tempo para você.</em></h3></div>
      <div className="z1-routine" aria-label="Hospital, casa e rotina conectados"><article><b>+</b><span>Hospital</span></article><i>↓</i><article><b>⌂</b><span>Casa</span></article><i>↓</i><article><b>○</b><span>Rotina</span></article></div>
    </section>

    <section className="z1-tour"><div><p className="z1-eyebrow">Guided Tour</p><h2>Você não precisa passar a semana visitando apartamentos.</h2><p>A 7Cantos seleciona imóveis compatíveis com seu perfil e organiza uma rota para conhecer 2 ou 3 opções próximas no mesmo dia.</p><button className="z1-btn" onClick={() => { track("guided_tour_clicked"); openPlan(); }}>Montar minha visita</button></div><ol><li><time>10h30</time><span>Apartamento 1</span></li><li><time>11h15</time><span>Apartamento 2</span></li><li><time>12h00</time><span>Apartamento 3</span></li><li><time>13h00</time><span>Escolha sua nova casa</span></li><small>Horários ilustrativos da experiência.</small></ol></section>

    <section className="z1-ready"><div className="z1-section-head"><p className="z1-eyebrow">7Cantos Ready</p><h2>Chegue pronto para escolher.</h2><p>Antes da visita, ajudamos a organizar os documentos necessários. Quando encontrar o imóvel certo, você reduz o caminho entre decisão e contrato.</p></div><div className="z1-flow">{["Documentos","Pré-análise","Visita","Proposta","Contrato"].map((step, i) => <span key={step}><b>{String(i+1).padStart(2,"0")}</b>{step}</span>)}</div><button className="z1-outline-btn" onClick={() => { track("documents_clicked"); openPlan(); }}>Preparar meus documentos</button></section>

    <section className="z1-move" id="chegada"><div><p className="z1-eyebrow">Mudança assistida</p><h2>Assinou o contrato? Agora preparamos sua chegada.</h2><p>A ideia é simples: quando você abrir a porta do seu novo apartamento, sua vida em São Paulo já começou.</p><small>Visão de serviço para as próximas etapas da 7Cantos Residência.</small></div><div className="z1-dashboard"><header><b>Move-in</b><span>2 de 7 etapas concluídas</span></header>{["Contrato","Vistoria","Energia","Água","Internet","Limpeza","Mudança e chaves"].map((item, i) => <p key={item} className={i<2 ? "done" : ""}><i>{i<2 ? "✓" : i+1}</i><span>{item}</span></p>)}</div></section>

    {/* Seção de embaixador preservada para ativação futura após aprovação de um caso real.
    <section className="z1-ambassador"><div className="z1-placeholder" aria-hidden="true">7C</div><div><p className="z1-eyebrow">Quem já passou por essa mudança</p><h2>Converse com quem já viveu a mesma experiência.</h2><p>Este espaço receberá histórias reais de residentes: cidade de origem, programa, bairro escolhido, vídeo e depoimento.</p><span>Embaixador 7Cantos — em breve</span></div></section>
    */}

    <section className="z1-final"><p className="z1-eyebrow">Comece sua chegada</p><h2>Sua residência já vai exigir muito de você. <em>Sua mudança não precisa.</em></h2><p>A 7Cantos ajuda você a escolher onde morar, encontrar seu apartamento e organizar sua chegada.</p><button className="z1-btn z1-btn-light" onClick={startSimulation}>Montar meu plano de mudança ↑</button></section>

    <footer className="z1-footer"><a className="z1-logo" href="#inicio" aria-label="7Cantos, voltar ao início"><Image src="/logo-7cantos.png" alt="7Cantos.com" width={744} height={222} /></a><p>Escolher · Alugar · Mudar · Viver</p><p>© {new Date().getFullYear()} 7Cantos</p></footer>

    {modalOpen && <div className="z1-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}><section className="z1-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button ref={modalCloseRef} className="z1-close" onClick={() => setModalOpen(false)} aria-label="Fechar formulário">×</button><p className="z1-eyebrow">Seu plano de mudança</p><h2 id="modal-title">Conte para a gente onde você quer chegar.</h2><form onSubmit={submitLead}><label>Nome<input name="nome" autoComplete="name" required defaultValue={contactName} /></label><label>WhatsApp<input name="whatsapp" type="tel" autoComplete="tel" required defaultValue={contactWhatsapp} /></label><label>Cidade atual<input name="cidade" autoComplete="address-level2" required defaultValue={currentCity} /></label><label>Hospital ou programa<input name="hospital" list="hospital-options" required defaultValue={selectedAnchorId ? selectedHospitalName : ""} /><datalist id="hospital-options">{hospitals.map((hospital) => <option key={hospital.id} value={hospital.name} />)}</datalist></label><label>Data prevista de mudança<input name="mudanca" type="month" required defaultValue={moveDate} /></label><label>Orçamento mensal<input name="orcamento" inputMode="numeric" required defaultValue={budget} /></label><label>Como vai morar?<select name="moradia" required defaultValue={livingArrangement}><option value="" disabled>Selecione</option><option>Sozinho</option><option>Casal</option><option>Dividir apartamento</option><option>Família</option></select></label><label className="z1-consent"><input name="consentimento" type="checkbox" required defaultChecked={contactConsent} /> Autorizo a 7Cantos a entrar em contato comigo sobre este plano de mudança.</label><input className="z1-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />{!createWhatsAppUrl("teste") && <p className="z1-config-warning">O WhatsApp ainda não foi configurado. Preencha NEXT_PUBLIC_WHATSAPP_NUMBER para ativar o envio.</p>}{leadError && <p className="z1-config-warning" role="alert">{leadError} O WhatsApp foi aberto normalmente.</p>}<button className="z1-btn" type="submit" disabled={!createWhatsAppUrl("teste") || leadSubmitting}>{leadSubmitting ? "Salvando e abrindo WhatsApp…" : "Enviar pelo WhatsApp"}</button></form></section></div>}
  </main>;
}
