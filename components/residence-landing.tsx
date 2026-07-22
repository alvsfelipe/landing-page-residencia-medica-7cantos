const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") || "5585999999999";
const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Olá! Quero conhecer a preparação para residência médica da 7Cantos.")}`;

const benefits = [
  { number: "01", title: "Direção", text: "Um plano possível, construído para a sua rotina e para o momento da sua formação." },
  { number: "02", title: "Constância", text: "Método para transformar semanas corridas em avanço real, sem depender de motivação." },
  { number: "03", title: "Confiança", text: "Acompanhamento próximo para você chegar às provas sabendo exatamente o que fazer." },
];

const steps = [
  ["Diagnóstico", "Entendemos seu momento, sua rotina e os programas que você quer alcançar."],
  ["Estratégia", "Organizamos prioridades, metas e um cronograma que cabe na vida real."],
  ["Acompanhamento", "Ajustamos a rota com você até a prova, com clareza e proximidade."],
];

export function ResidenceLanding() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="7Cantos Residência — início">
          <span className="brand-mark">7</span>
          <span>cantos<small>residência</small></span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#metodo">O método</a>
          <a href="#jornada">Sua jornada</a>
          <a href="#sobre">Sobre nós</a>
        </nav>
        <a className="button button-small" href={whatsappUrl} target="_blank" rel="noreferrer">Quero começar</a>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Preparação para residência médica</p>
          <h1>Sua residência começa <em>antes do hospital.</em></h1>
          <p className="hero-lead">Estratégia, constância e acompanhamento para transformar o caminho até a aprovação em uma jornada mais clara — e mais sua.</p>
          <div className="hero-actions">
            <a className="button" href={whatsappUrl} target="_blank" rel="noreferrer">Conversar com a 7Cantos <span>↗</span></a>
            <a className="text-link" href="#metodo">Conhecer o método <span>↓</span></a>
          </div>
          <div className="trust-row">
            <div className="avatars"><i>7</i><i>C</i><i>+</i></div>
            <p><strong>Uma preparação que enxerga você</strong><br />Não apenas a próxima prova.</p>
          </div>
        </div>

        <div className="hero-visual" aria-label="Representação da jornada até a residência">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="sun"><span>seu próximo<br /><strong>capítulo</strong></span></div>
          <div className="floating-card card-top"><small>HOJE</small><strong>Onde você está</strong><span>O começo também importa.</span></div>
          <div className="floating-card card-bottom"><small>DESTINO</small><strong>A residência que combina com você</strong></div>
          <span className="place-label place-one">clareza</span>
          <span className="place-label place-two">constância</span>
          <span className="place-label place-three">aprovação</span>
        </div>
      </section>

      <section className="manifesto" id="sobre">
        <p className="section-kicker">O que nos move</p>
        <blockquote>“A gente acredita que preparação de verdade não é sobre fazer mais. É sobre saber <em>por que, quando e como</em> fazer.”</blockquote>
        <p className="signature">7Cantos <span>— do seu lado, até lá.</span></p>
      </section>

      <section className="method" id="metodo">
        <div className="section-heading">
          <div><p className="section-kicker">Nosso jeito de preparar</p><h2>Menos ruído.<br />Mais caminho.</h2></div>
          <p>Não existe uma única rota para a residência. Existe a rota certa para você — e ela começa com três fundamentos.</p>
        </div>
        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article key={benefit.number}>
              <span>{benefit.number}</span>
              <div className="icon-shape" aria-hidden="true" />
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="journey" id="jornada">
        <div className="journey-intro"><p className="section-kicker">Da decisão à aprovação</p><h2>Você não precisa descobrir tudo sozinho.</h2><p>Organizamos a complexidade para que sua energia fique onde realmente importa: aprender e avançar.</p></div>
        <ol>
          {steps.map(([title, text], index) => <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}
        </ol>
      </section>

      <section className="final-cta">
        <p className="section-kicker">Seu próximo passo</p>
        <h2>Todo grande caminho começa com uma conversa.</h2>
        <p>Conte para a gente onde você quer chegar. Nós ajudamos a desenhar a rota.</p>
        <a className="button button-light" href={whatsappUrl} target="_blank" rel="noreferrer">Falar com a 7Cantos <span>↗</span></a>
      </section>

      <footer><a className="brand brand-footer" href="#inicio"><span className="brand-mark">7</span><span>cantos<small>residência</small></span></a><p>Preparação com direção, constância e cuidado.</p><p>© {new Date().getFullYear()} 7Cantos Residência</p></footer>
    </main>
  );
}
