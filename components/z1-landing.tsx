"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createWhatsAppUrl } from "@/lib/config";
import { getAttribution, track } from "@/lib/tracking";

export type Property = {
  id?: string | number; bairro?: string; foto?: string; fotos?: string[]; aluguel?: number;
  condominio?: number; iptu?: number; area?: number; quartos?: number; banheiros?: number;
  vagas?: number; endereco?: string; url_imovel?: string;
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

export function Z1Landing({ properties, hospitals }: { properties: Property[]; hospitals: Hospital[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [budget, setBudget] = useState("");

  useEffect(() => { track("landing_view"); }, []);
  useEffect(() => {
    if (!modalOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setModalOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [modalOpen]);

  const compatible = useMemo(() => {
    const ceiling = Number(budget.replace(/\D/g, ""));
    return properties
      .filter((item) => item.bairro?.toLocaleLowerCase("pt-BR") === "vila clementino")
      .filter((item) => !ceiling || (item.aluguel || 0) + (item.condominio || 0) + (item.iptu || 0) <= ceiling)
      .sort((a, b) => (a.quartos || 0) - (b.quartos || 0) || (a.area || 0) - (b.area || 0));
  }, [budget, properties]);

  const openPlan = () => { track("move_plan_started"); setModalOpen(true); };

  function runSimulator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSimulated(true); track("simulator_completed", { results: compatible.length });
    document.querySelector("#resultado-imoveis")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    track("lead_submitted");
    const url = createWhatsAppUrl(message);
    if (url) { track("whatsapp_clicked"); window.open(url, "_blank", "noopener,noreferrer"); }
  }

  return <main className="z1">
    <header className="z1-header">
      <a className="z1-logo" href="#inicio" aria-label="7Cantos Residência, início">
        <Image src="/logo-7cantos.png" alt="7Cantos.com" width={744} height={222} priority />
      </a>
      <nav aria-label="Navegação da landing"><a href="#como-funciona">Como funciona</a><a href="#imoveis">Imóveis</a><a href="#chegada">Sua chegada</a></nav>
      <button className="z1-btn z1-btn-sm" onClick={openPlan}>Montar meu plano</button>
    </header>

    <section className="z1-hero" id="inicio">
      <div className="z1-hero-copy"><p className="z1-eyebrow">7Cantos Residência · Vila Clementino</p><h1>Sua residência já vai ser intensa. <em>Sua mudança não precisa ser.</em></h1><p>Encontre onde morar, visite apartamentos selecionados perto da sua rotina e chegue a São Paulo com tudo preparado.</p><div className="z1-actions"><button className="z1-btn" onClick={openPlan}>Montar meu plano de mudança <span>↗</span></button><a href="#imoveis">Ver imóveis disponíveis ↓</a></div></div>
      <div className="z1-hero-art" aria-hidden="true"><div className="z1-map-line"/><div className="z1-pin z1-pin-hospital"><b>H</b><span>Hospital</span></div><div className="z1-pin z1-pin-home"><b>⌂</b><span>Sua nova casa</span></div><div className="z1-route-card"><small>SEU PLANO</small><strong>Escolher → Alugar → Mudar</strong><span>Uma rota mais simples para chegar.</span></div></div>
      <ul className="z1-proof"><li>✓ Imóveis selecionados na Vila Clementino</li><li>✓ Visite 2 ou 3 opções na mesma rota</li><li>✓ Organize sua mudança com a 7Cantos</li></ul>
    </section>

    <section className="z1-simulator" id="como-funciona">
      <div className="z1-section-head"><p className="z1-eyebrow">Comece por você</p><h2>Onde começa sua nova rotina?</h2><p>Conte um pouco sobre seus planos. A gente organiza o primeiro recorte para você.</p></div>
      <form onSubmit={runSimulator} onFocus={() => track("simulator_started")}>
        <label>Onde você fará residência ou trabalhará?<select name="local" required defaultValue=""><option value="" disabled>Selecione uma opção</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.name}>{hospital.name}</option>)}<option>Outro hospital da região</option><option>Ainda não sei</option></select></label>
        <label>Quando pretende se mudar?<input name="data" type="month" required /></label>
        <label>Como pretende morar?<select name="moradia" required defaultValue=""><option value="" disabled>Selecione uma opção</option><option>Sozinho</option><option>Casal</option><option>Dividir apartamento</option><option>Família</option></select></label>
        <label>Orçamento mensal máximo<input name="orcamento" inputMode="numeric" placeholder="Ex.: 4500" value={budget} onChange={(e) => setBudget(e.target.value)} required /><small>Considere aluguel + condomínio + IPTU.</small></label>
        <button className="z1-btn" type="submit">Encontrar opções</button>
      </form>
      {simulated && <div className="z1-result" role="status"><b>Encontramos {compatible.length ? `${compatible.length} opções` : "um próximo passo"} compatível com seu perfil.</b><span>{compatible.length ? "Veja a seleção abaixo." : "Ainda não temos imóveis cadastrados nessa faixa. Fale com a gente para uma busca assistida."}</span></div>}
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

    <section className="z1-properties" id="imoveis">
      <div className="z1-section-head"><p className="z1-eyebrow">Seleção local · {compatible.length} opções</p><h2>Imóveis na Vila Clementino</h2><p>Unidades compactas aparecem primeiro. O custo estimado soma aluguel, condomínio e IPTU informados na base da 7Cantos.</p></div>
      <div className="z1-property-grid" id="resultado-imoveis">
        {compatible.slice(0, showAll ? compatible.length : 6).map((item, index) => {
          const image = item.fotos?.[0] || item.foto; const total = (item.aluguel || 0) + (item.condominio || 0) + (item.iptu || 0);
          return <article className="z1-property" key={item.id || index} onMouseEnter={() => track("property_viewed", { property_id: item.id })}>
            <div className="z1-property-image">{image ? <Image src={image} alt={`Imóvel na Vila Clementino${item.endereco ? ` — ${item.endereco}` : ""}`} fill sizes="(min-width: 1000px) 33vw, (min-width: 700px) 50vw, 100vw" /> : <span>Foto não disponível</span>}</div>
            <div className="z1-property-body"><p>{item.endereco || "Vila Clementino, São Paulo"}</p><h3>{formatMoney(item.aluguel)} <small>/ aluguel</small></h3><ul><li>{item.area || "—"} m²</li><li>{item.quartos ?? "—"} quarto(s)</li><li>{item.banheiros ?? "—"} banheiro(s)</li><li>{item.vagas ?? 0} vaga(s)</li></ul><div className="z1-cost"><span>Custo mensal estimado</span><strong>{formatMoney(total)}</strong><small>Aluguel + condomínio + IPTU</small></div>{item.url_imovel && <a href={item.url_imovel} target="_blank" rel="noreferrer" onClick={() => track("property_clicked", { property_id: item.id })}>Ver detalhes ↗</a>}</div>
          </article>;
        })}
        {!compatible.length && <div className="z1-empty"><b>Seleção de imóveis em preparação</b><p>A base local ainda não contém imóveis da Vila Clementino. Não exibimos anúncios fictícios. Envie seu perfil e a equipe faz uma busca assistida.</p><button className="z1-btn" onClick={openPlan}>Quero receber opções</button></div>}
      </div>
      {compatible.length > 6 && !showAll && <button className="z1-outline-btn" onClick={() => setShowAll(true)}>Ver mais opções</button>}
    </section>

    <section className="z1-tour"><div><p className="z1-eyebrow">Guided Tour</p><h2>Você não precisa passar a semana visitando apartamentos.</h2><p>A 7Cantos seleciona imóveis compatíveis com seu perfil e organiza uma rota para conhecer 2 ou 3 opções próximas no mesmo dia.</p><button className="z1-btn" onClick={() => { track("guided_tour_clicked"); openPlan(); }}>Montar minha visita</button></div><ol><li><time>10h30</time><span>Apartamento 1</span></li><li><time>11h15</time><span>Apartamento 2</span></li><li><time>12h00</time><span>Apartamento 3</span></li><li><time>13h00</time><span>Escolha sua nova casa</span></li><small>Horários ilustrativos da experiência.</small></ol></section>

    <section className="z1-ready"><div className="z1-section-head"><p className="z1-eyebrow">7Cantos Ready</p><h2>Chegue pronto para escolher.</h2><p>Antes da visita, ajudamos a organizar os documentos necessários. Quando encontrar o imóvel certo, você reduz o caminho entre decisão e contrato.</p></div><div className="z1-flow">{["Documentos","Pré-análise","Visita","Proposta","Contrato"].map((step, i) => <span key={step}><b>{String(i+1).padStart(2,"0")}</b>{step}</span>)}</div><button className="z1-outline-btn" onClick={() => { track("documents_clicked"); openPlan(); }}>Preparar meus documentos</button></section>

    <section className="z1-move" id="chegada"><div><p className="z1-eyebrow">Mudança assistida</p><h2>Assinou o contrato? Agora preparamos sua chegada.</h2><p>A ideia é simples: quando você abrir a porta do seu novo apartamento, sua vida em São Paulo já começou.</p><small>Visão de serviço para as próximas etapas da 7Cantos Residência.</small></div><div className="z1-dashboard"><header><b>Move-in</b><span>2 de 7 etapas concluídas</span></header>{["Contrato","Vistoria","Energia","Água","Internet","Limpeza","Mudança e chaves"].map((item, i) => <p key={item} className={i<2 ? "done" : ""}><i>{i<2 ? "✓" : i+1}</i><span>{item}</span></p>)}</div></section>

    <section className="z1-ambassador"><div className="z1-placeholder" aria-hidden="true">7C</div><div><p className="z1-eyebrow">Quem já passou por essa mudança</p><h2>Converse com quem já viveu a mesma experiência.</h2><p>Este espaço receberá histórias reais de residentes: cidade de origem, programa, bairro escolhido, vídeo e depoimento.</p><span>Embaixador 7Cantos — em breve</span></div></section>

    <section className="z1-final"><p className="z1-eyebrow">Comece sua chegada</p><h2>Sua residência já vai exigir muito de você. <em>Sua mudança não precisa.</em></h2><p>A 7Cantos ajuda você a escolher onde morar, encontrar seu apartamento e organizar sua chegada.</p><button className="z1-btn z1-btn-light" onClick={openPlan}>Montar meu plano de mudança ↗</button></section>

    <footer className="z1-footer"><a className="z1-logo" href="#inicio" aria-label="7Cantos, voltar ao início"><Image src="/logo-7cantos.png" alt="7Cantos.com" width={744} height={222} /></a><p>Escolher · Alugar · Mudar · Viver</p><p>© {new Date().getFullYear()} 7Cantos</p></footer>

    {modalOpen && <div className="z1-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}><section className="z1-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="z1-close" onClick={() => setModalOpen(false)} aria-label="Fechar formulário">×</button><p className="z1-eyebrow">Seu plano de mudança</p><h2 id="modal-title">Conte para a gente onde você quer chegar.</h2><form onSubmit={submitLead}><label>Nome<input name="nome" autoComplete="name" required /></label><label>WhatsApp<input name="whatsapp" type="tel" autoComplete="tel" required /></label><label>Cidade atual<input name="cidade" autoComplete="address-level2" required /></label><label>Hospital ou programa<input name="hospital" list="hospital-options" required /><datalist id="hospital-options">{hospitals.map((hospital) => <option key={hospital.id} value={hospital.name} />)}</datalist></label><label>Data prevista de mudança<input name="mudanca" type="month" required /></label><label>Orçamento mensal<input name="orcamento" inputMode="numeric" required /></label><label>Como vai morar?<select name="moradia" required defaultValue=""><option value="" disabled>Selecione</option><option>Sozinho</option><option>Casal</option><option>Dividir apartamento</option><option>Família</option></select></label><label className="z1-consent"><input type="checkbox" required /> Autorizo a 7Cantos a entrar em contato comigo sobre este plano de mudança.</label>{!createWhatsAppUrl("teste") && <p className="z1-config-warning">O WhatsApp ainda não foi configurado. Preencha NEXT_PUBLIC_WHATSAPP_NUMBER para ativar o envio.</p>}<button className="z1-btn" type="submit" disabled={!createWhatsAppUrl("teste")}>Enviar pelo WhatsApp</button></form></section></div>}
  </main>;
}
