import { useState, useEffect } from "react";

const C = {
  bg: "#FAFBFD", white: "#FFFFFF", dark: "#0C0F1D", dark2: "#141833",
  text: "#1A1A2E", text2: "#64748B", text3: "#94A3B8",
  accent: "#2563EB", accentH: "#1D4ED8", accentL: "rgba(37,99,235,0.05)",
  teal: "#0EA5E9", green: "#10B981", red: "#EF4444",
  border: "#E2E8F0", borderL: "#F1F5F9",
};

function go(id) { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }

function Share({ text, small }) {
  const u = encodeURIComponent("https://artwalllabs.com");
  const m = encodeURIComponent(text || "Discover ArtWall - India's Art Operating System");
  const [ok, setOk] = useState(false);
  const cp = () => { navigator.clipboard?.writeText(decodeURIComponent(m) + " https://artwalllabs.com"); setOk(true); setTimeout(() => setOk(false), 1500); };
  const s = small ? 24 : 28;
  const dot = { width: s, height: s, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: small ? 9 : 10, fontWeight: 700 };
  return (
    <div style={{ display: "flex", gap: small ? 4 : 5, alignItems: "center" }}>
      <a href={"https://wa.me/?text=" + m + " " + u} target="_blank" rel="noopener noreferrer" style={{ ...dot, background: "#25D36612", border: "1px solid #25D36620", color: "#25D366" }}>WA</a>
      <a href={"https://twitter.com/intent/tweet?text=" + m + "&url=" + u} target="_blank" rel="noopener noreferrer" style={{ ...dot, background: "#1DA1F212", border: "1px solid #1DA1F220", color: "#1DA1F2" }}>X</a>
      <a href={"https://linkedin.com/sharing/share-offsite/?url=" + u} target="_blank" rel="noopener noreferrer" style={{ ...dot, background: "#0A66C212", border: "1px solid #0A66C220", color: "#0A66C2" }}>in</a>
      <button onClick={cp} style={{ ...dot, background: ok ? C.green + "12" : "#64748B12", border: "1px solid " + (ok ? C.green : "#64748B") + "20", color: ok ? C.green : "#64748B", cursor: "pointer" }}>{ok ? "OK" : "Cp"}</button>
    </div>
  );
}

function Sec({ id, children, dark, style: s }) {
  return <section id={id} style={{ background: dark ? C.dark : "transparent", color: dark ? "#fff" : C.text, padding: "96px 24px", ...s }}><div style={{ maxWidth: 1120, margin: "0 auto" }}>{children}</div></section>;
}
function Tag({ children, light }) { return <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: light ? C.teal : C.accent, marginBottom: 14 }}>{children}</p>; }
function H1({ children, s }) { return <h1 style={{ fontSize: "clamp(32px,5vw,54px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.025em", marginBottom: 20, ...s }}>{children}</h1>; }
function H2({ children, s }) { return <h2 style={{ fontSize: "clamp(24px,3.5vw,38px)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 14, ...s }}>{children}</h2>; }
function H3({ children, s }) { return <h3 style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, ...s }}>{children}</h3>; }
function P1({ children, s }) { return <p style={{ fontSize: 16, lineHeight: 1.7, color: C.text2, ...s }}>{children}</p>; }
function Cd({ children, style: s, onClick }) {
  const [h, setH] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ background: C.white, border: "1px solid " + (h ? C.accent + "40" : C.border), borderRadius: 12, padding: "28px 24px", transition: "all 0.25s", boxShadow: h ? "0 8px 24px rgba(37,99,235,0.06)" : "0 1px 3px rgba(0,0,0,0.04)", cursor: onClick ? "pointer" : "default", ...s }}>{children}</div>;
}
function Bt({ children, onClick, primary, s }) {
  return <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: primary ? "13px 28px" : "12px 24px", background: primary ? C.accent : "transparent", color: primary ? "#fff" : C.accent, border: primary ? "none" : "1.5px solid " + C.accent, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.01em", ...s }}>{children}</button>;
}
function Ck() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>; }
function Ds() { return <span style={{ color: C.text3, fontSize: 13 }}>--</span>; }

/* ========== NAV ========== */
function Nav() {
  const [op, setOp] = useState(false);
  const [sc, setSc] = useState(false);
  useEffect(() => { const h = () => setSc(window.scrollY > 50); window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h); }, []);
  const lk = [{ l: "Services", id: "services" }, { l: "How It Works", id: "how" }, { l: "The Wall", id: "wall" }, { l: "Archetype", id: "quiz" }, { l: "About", id: "about" }, { l: "Contact", id: "contact" }];
  const g = id => { setOp(false); go(id); };
  return (
    <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: sc ? "rgba(250,251,253,0.97)" : "rgba(250,251,253,0.6)", backdropFilter: "blur(16px)", borderBottom: sc ? "1px solid " + C.border : "none", transition: "all 0.3s" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <button onClick={() => go("hero")} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.03em" }}>artwall</span>
          <span style={{ fontSize: 20, fontWeight: 300, color: C.accent }}>labs</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lk.map(l => <button key={l.id} onClick={() => g(l.id)} className="dk" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.text2, fontWeight: 500, padding: "6px 10px" }}>{l.l}</button>)}
          <button onClick={() => g("wall")} style={{ marginLeft: 8, padding: "9px 20px", background: C.accent, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>Join the Wall</button>
          <button className="mb" onClick={() => setOp(!op)} style={{ display: "none", background: "none", border: "none", cursor: "pointer", fontSize: 22, color: C.text, marginLeft: 8 }}>{op ? "X" : "="}</button>
        </div>
      </div>
      {op && <div style={{ background: C.white, borderTop: "1px solid " + C.border, padding: "8px 24px" }}>{lk.map(l => <button key={l.id} onClick={() => g(l.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "14px 0", fontSize: 15, color: C.text, borderBottom: "1px solid " + C.borderL }}>{l.l}</button>)}</div>}
      <style dangerouslySetInnerHTML={{ __html: "@media(max-width:840px){.dk{display:none!important}.mb{display:block!important}}" }} />
    </nav>
  );
}

/* ========== HERO ========== */
function Hero() {
  return (
    <Sec id="hero" style={{ paddingTop: 140, background: "linear-gradient(180deg," + C.bg + " 0%,#EDF2FC 100%)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }} className="rg">
        <div>
          <Tag>Every Wall . An Exhibition</Tag>
          <H1>{"India\u2019s Art Operating System."}</H1>
          <P1 s={{ maxWidth: 500, marginBottom: 28 }}>Six integrated systems - Artist Registry, Exhibition Engine, Provenance and COA, Art Marketplace, 9-Layer Anti-Fraud, and Patented Demand-Triggered Sale - built for 7 million Indian artisans.</P1>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Bt onClick={() => go("services")} primary>Explore the Platform</Bt>
            <Bt onClick={() => go("wall")}>Join the Wall</Bt>
          </div>
          <Share text="Art lives on the wall. Discover ArtWall - India's Art Operating System." />
          <div style={{ marginTop: 28, padding: "18px 20px", background: C.accentL, border: "1px solid " + C.accent + "20", borderRadius: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 3 }}>First 10,000 artists = Founding Members.</p>
            <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>We are building ArtWall with our founding community. Shape the platform and carry the badge forever.</p>
          </div>
        </div>
        <div style={{ background: C.dark, borderRadius: 16, aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#0C0F1D,#1a2040,#0C0F1D)" }} />
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <div style={{ width: 0, height: 0, borderTop: "11px solid transparent", borderBottom: "11px solid transparent", borderLeft: "18px solid #fff", marginLeft: 5 }} />
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>The Artwall at Ric Platter, Jaipur</p>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@media(max-width:768px){.rg{grid-template-columns:1fr!important}}" }} />
    </Sec>
  );
}

/* ========== STATS BAR ========== */
function Stats() {
  const st = [{ n: "7M+", l: "Indian Artisans" }, { n: "Rs 30,000 Cr", l: "Market Opportunity" }, { n: "24", l: "Pain Points Solved" }, { n: "6", l: "Patent Clusters" }, { n: "7", l: "Domain Moat" }];
  return (
    <div style={{ background: C.dark, padding: "32px 24px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
        {st.map((s, i) => <div key={i} style={{ textAlign: "center" }}><p style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{s.n}</p><p style={{ fontSize: 11, color: C.text3, letterSpacing: "0.04em" }}>{s.l}</p></div>)}
      </div>
    </div>
  );
}

/* ========== SERVICES ========== */
function Services() {
  const sv = [
    { n: "01", t: "Artist Registry and Profile", d: "4-tier verification: DigiLocker KYC, AI doc scan, curator review, peer endorsement. Your profile is your business hub - portfolio, exhibitions, sales, provenance, earnings, GST invoicing. Vernacular CMS, 300+ artforms, multi-language UI.", link: "Find Out More" },
    { n: "02", t: "Exhibition Engine", d: "AI-powered matching connecting artworks with galleries, hotels, co-working spaces. CLIP embeddings, foot-traffic, demographics, demand signals. Zero cost for artists.", link: "Find Out More" },
    { n: "03", t: "Provenance and COA", d: "NTAG424 NFC DNA (AES-128), QR verification, Polygon Ethereum blockchain certificates, CNN AI image binding. Certificate of Authenticity for every artwork. Rs 500-2,500 per cert.", link: "Find Out More" },
    { n: "04", t: "Art Marketplace", d: "10% commission vs 40-60% industry. Escrow via Razorpay x smart-contract. 72-hr inspection. EMI, Art-on-Rent Rs 500/mo, student 15% discount. Secondary market 5% fee.", link: "Find Out More" },
    { n: "05", t: "9-Layer Anti-Fraud Engine", d: "Identity, CNN image, NFC binding, blockchain, escrow, behavioural ML, payment screening, community reporting, human review. 99%+ fraud block. Under 2% disputes.", link: "Find Out More" },
    { n: "06", t: "Demand-Triggered Sale", d: "Patented. Zero prior art worldwide. Five weighted demand signals unlock artwork at artist threshold. Plus 4% perpetual royalty on every resale via ERC-2981 on Polygon Ethereum.", link: "Find Out More" },
  ];
  const [exp, setExp] = useState(-1);
  return (
    <Sec id="services" style={{ background: C.white }}>
      <Tag>Our Services</Tag>
      <H2>Six integrated systems. One platform.</H2>
      <P1 s={{ maxWidth: 560, marginBottom: 40 }}>Every stage of the art lifecycle - from creation to legacy. Each system reinforces the others to form India's Art Operating System.</P1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }} className="g3">
        {sv.map((s, i) => (
          <Cd key={i} onClick={() => setExp(exp === i ? -1 : i)}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>{s.n}</span>
            </div>
            <H3>{s.t}</H3>
            <P1 s={{ fontSize: 14, marginBottom: 12 }}>{exp === i ? s.d : s.d.slice(0, 110) + "..."}</P1>
            <span style={{ fontSize: 13, color: C.accent, fontWeight: 600, cursor: "pointer" }}>{exp === i ? "Show less" : s.link + " \u2192"}</span>
          </Cd>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@media(max-width:900px){.g3{grid-template-columns:repeat(2,1fr)!important}}@media(max-width:600px){.g3{grid-template-columns:1fr!important}}" }} />
    </Sec>
  );
}

/* ========== HOW IT WORKS ========== */
function How() {
  const steps = [
    { n: "01", t: "Register and Verify", d: "Create your Artist Registry profile. Complete 4-tier verification - DigiLocker Aadhaar KYC, AI document scan, curator review, and peer endorsement. Your verified profile becomes your portable business hub." },
    { n: "02", t: "Upload and Certify", d: "Upload artworks to your vernacular-first catalogue (300+ artforms). Each artwork receives a Polygon Ethereum blockchain provenance certificate and COA. NFC tags physically bind artwork to its on-chain record." },
    { n: "03", t: "Exhibit and Discover", d: "The Exhibition Engine algorithmically matches your work with the right spaces and audiences - galleries, hotels, co-working, public lobbies. Zero cost for artists. NFC-tagged walls enable always-on discovery." },
    { n: "04", t: "Sell with Trust", d: "Demand-Triggered Sale accumulates verified buyer interest. When it crosses your threshold, the artwork unlocks. 10% commission. Escrow via Razorpay. 72-hour inspection. EMI and Art-on-Rent for buyers." },
    { n: "05", t: "Earn Royalties Forever", d: "ERC-2981 smart contracts on Polygon Ethereum enforce 4% perpetual royalty on every resale. Technically impossible to evade. Track every secondary sale in real time via your dashboard." },
  ];
  return (
    <Sec id="how">
      <Tag>How It Works</Tag>
      <H2>From registration to royalties in five steps.</H2>
      <P1 s={{ maxWidth: 560, marginBottom: 48 }}>The Art Lifecycle - Genesis to Endurance. Every product maps to one stage. The platform is the infrastructure.</P1>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: i % 2 === 0 ? "1fr 1.2fr" : "1.2fr 1fr", gap: 48, marginBottom: 48, alignItems: "center" }} className="rg">
          {i % 2 === 1 && <div style={{ background: C.accentL, borderRadius: 16, aspectRatio: "16/10", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 64, fontWeight: 700, color: C.accent + "20" }}>{s.n}</span></div>}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.n}</span></div>
              <H3 s={{ marginBottom: 0 }}>{s.t}</H3>
            </div>
            <P1 s={{ fontSize: 15 }}>{s.d}</P1>
          </div>
          {i % 2 === 0 && <div style={{ background: C.accentL, borderRadius: 16, aspectRatio: "16/10", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 64, fontWeight: 700, color: C.accent + "20" }}>{s.n}</span></div>}
        </div>
      ))}
    </Sec>
  );
}

/* ========== TABS - WHO WE SERVE ========== */
function Tabs() {
  const [tab, setTab] = useState(0);
  const data = [
    { l: "Artists", t: "Your profile powers everything.", pts: ["Free 4-tier identity verification: DigiLocker KYC, AI scan, curator review, peer endorsement", "Artist Registry = business hub - portfolio, exhibitions, sales, provenance, earnings, analytics, GST invoicing", "Keep 90% of every sale with 10% platform commission", "Perpetual 4% royalty on every resale via ERC-2981 on Polygon Ethereum", "Vernacular-first CMS, 300+ artforms, multi-language UI across 29 states", "SaaS: Free (5 artworks), Rs 499, Rs 1,499, Rs 4,999/mo"], cta: "Join as an Artist" },
    { l: "Galleries", t: "Exhibition and gallery management software.", pts: ["Exhibition management: event wizard, artist curation, scheduling, ticketing, analytics dashboard", "Gallery operations: inventory, artist roster, sales tracking, GST-automated invoicing", "Blockchain provenance and COA for every artwork - Polygon Ethereum + NFC binding", "CuratorConnect: discover verified artists from the Indiagrapher community", "Secondary market tracking: resales, royalties, complete price history", "DPDP-compliant data handling, consent management, reporting from Day 1"], cta: "Partner as a Gallery" },
    { l: "Collectors", t: "Buy with certainty. Own with confidence.", pts: ["Every artwork verified: 4-tier identity + CNN image + NFC + blockchain provenance", "72-hour inspection window with AI image comparison on delivery", "Complete price history through demand signals and provenance records", "EMI (3/6/12 months), Art-on-Rent from Rs 500/mo, student 15% discount", "Escrow via Razorpay (RBI PA) x smart-contract - zero fraud risk"], cta: "Start Collecting" },
  ];
  const d = data[tab];
  return (
    <Sec id="tabs" style={{ background: C.white }}>
      <Tag>Artwall For</Tag>
      <div style={{ display: "flex", gap: 0, marginBottom: 40, borderBottom: "2px solid " + C.border }}>
        {data.map((t, i) => <button key={i} onClick={() => setTab(i)} style={{ padding: "14px 28px", background: "none", border: "none", borderBottom: tab === i ? "2px solid " + C.accent : "2px solid transparent", marginBottom: -2, cursor: "pointer", fontSize: 15, fontWeight: tab === i ? 700 : 500, color: tab === i ? C.accent : C.text2, transition: "all 0.2s" }}>{t.l}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }} className="rg">
        <div>
          <H2 s={{ fontSize: 28 }}>{d.t}</H2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {d.pts.map((p, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><Ck /><span style={{ fontSize: 15, color: C.text2, lineHeight: 1.6 }}>{p}</span></div>)}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <Bt onClick={() => go("wall")} primary>{d.cta}</Bt>
            <Share text={"ArtWall for " + d.l + " - " + d.t} small />
          </div>
        </div>
        <div style={{ background: "linear-gradient(135deg," + C.accentL + "," + C.teal + "08)", borderRadius: 16, aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid " + C.border }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <span style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>{d.l[0]}</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{d.l}</p>
          </div>
        </div>
      </div>
    </Sec>
  );
}

/* ========== WHY ARTWALL (PAIN POINTS) ========== */
function Why() {
  const [o, setO] = useState(0);
  const pain = [
    { s: "CREATE", p: "No Identity, No Income, No Tools", f: ["50% forgery - solved by 4-tier verification", "57% artists vulnerable - 10% commission vs 40-60%", "Zero vernacular tools - CMS with 300+ artforms", "Unenforceable copyright - blockchain provenance = legal cert"] },
    { s: "EXHIBIT", p: "Rs 1L+ Cost, Metro-Only, Seasonal", f: ["95% excluded - Exhibition Engine at zero cost", "75% infra in 3 metros - Pan-India Tier 1-3", "Seasonal haats - year-round NFC-tagged discovery"] },
    { s: "VERIFY", p: "50% Forgery, No Standard", f: ["9-layer anti-fraud engine (99%+ block rate)", "Polygon Ethereum immutable certificates + NFC binding", "Rs 500-2,500 per cert vs Rs 5K-50K"] },
    { s: "SELL", p: "40-60% Commission, No Escrow", f: ["Artists keep 90% (10% commission)", "Razorpay smart-contract escrow, 72-hr inspection", "SEO pages, QR traffic, portable reputation"] },
    { s: "ROYALTY", p: "Zero Secondary Income", f: ["4% perpetual via ERC-2981 on Polygon Ethereum", "Section 53A automated on-chain, PMLA-compliant", "Real-time resale dashboard"] },
    { s: "BUY", p: "Trust Deficit, No Access", f: ["4-tier + CNN + NFC + blockchain verification", "72-hr AI image comparison on delivery", "EMI 3/6/12-mo, Art-on-Rent, student 15%"] },
  ];
  return (
    <Sec id="why">
      <Tag>Why Artwall Labs</Tag>
      <H2>24 failures across 6 stages. All solved.</H2>
      <P1 s={{ maxWidth: 560, marginBottom: 32 }}>India has 4.2 crore artists and a Rs 30,000 Cr market with zero integrated infrastructure. Artwall addresses every compounding failure.</P1>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pain.map((p, i) => (
          <div key={i} style={{ border: "1px solid " + (o === i ? C.accent + "40" : C.border), borderRadius: 10, overflow: "hidden", background: C.white, transition: "border-color 0.2s" }}>
            <button onClick={() => setO(o === i ? -1 : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: C.accent, borderRadius: 4, padding: "3px 10px", letterSpacing: "0.04em" }}>{p.s}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{p.p}</span>
              </div>
              <span style={{ fontSize: 18, color: C.text3, transform: o === i ? "rotate(45deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>+</span>
            </button>
            {o === i && <div style={{ padding: "0 20px 18px", borderTop: "1px solid " + C.borderL }}>
              {p.f.map((f, j) => <div key={j} style={{ display: "flex", gap: 10, padding: "7px 0" }}><Ck /><span style={{ fontSize: 14, color: C.text2, lineHeight: 1.5 }}>{f}</span></div>)}
            </div>}
          </div>
        ))}
      </div>
    </Sec>
  );
}

/* ========== COMPETITIVE TABLE ========== */
function Comp() {
  const cl = ["Exhib", "Demand", "Prov.", "NFC", "Fraud", "Escrow", "Royalty"];
  const cp = [{ n: "Saatchi Art", s: [0,0,0,0,0,0,0] }, { n: "Fairchain", s: [0,0,1,0,0,0,0] }, { n: "Arcual", s: [0,0,0,0,0,0,1] }, { n: "Artclear", s: [0,0,1,1,0,0,0] }, { n: "Indiewalls", s: [1,0,0,0,0,0,0] }, { n: "AstaGuru", s: [0,0,0,0,0,0,0] }];
  return (
    <Sec id="comp" style={{ background: C.white }}>
      <Tag>Competitive Landscape</Tag>
      <H2>No competitor covers more than 2 of 7 domains.</H2>
      <P1 s={{ marginBottom: 32 }}>Artwall Labs is the only platform globally integrating all seven critical infrastructure layers.</P1>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 600 }}>
          <thead><tr style={{ borderBottom: "2px solid " + C.border }}>
            <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: C.text2, fontSize: 13 }}>Platform</th>
            {cl.map(c => <th key={c} style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: C.text2, fontSize: 12 }}>{c}</th>)}
            <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 700, fontSize: 13 }}>Total</th>
          </tr></thead>
          <tbody>
            {cp.map((c, i) => <tr key={i} style={{ borderBottom: "1px solid " + C.borderL }}>
              <td style={{ padding: "10px 12px", fontWeight: 500 }}>{c.n}</td>
              {c.s.map((v, j) => <td key={j} style={{ textAlign: "center", padding: "10px" }}>{v ? <Ck /> : <Ds />}</td>)}
              <td style={{ textAlign: "center", padding: "10px", fontWeight: 600 }}>{c.s.reduce((a, b) => a + b, 0)}</td>
            </tr>)}
            <tr style={{ background: C.accentL }}>
              <td style={{ padding: "12px", fontWeight: 700, color: C.accent }}>Artwall Labs</td>
              {cl.map((_, j) => <td key={j} style={{ textAlign: "center", padding: "10px" }}><Ck /></td>)}
              <td style={{ textAlign: "center", fontWeight: 800, color: C.accent, fontSize: 20 }}>7</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Sec>
  );
}

/* ========== THE WALL ========== */
function Wall() {
  const ar = [{ n: "Sarita D.", c: "Sikar", cl: C.accent }, { n: "Deepali K.", c: "Patna", cl: C.teal }, { n: "Alok S.", c: "Sikar", cl: C.green }, { n: "Antima", c: "Jaipur", cl: "#8B5CF6" }, { n: "KC", c: "Jaipur", cl: C.red }];
  const ft = ["Daily slot booking", "Exhibition scheduling", "Artist queue", "Payment and invoicing", "Visitor analytics", "NFC tags", "QR discovery", "Photo docs", "Rotation management", "Revenue tracking"];
  return (
    <Sec id="wall" dark>
      <Tag light>The Wall</Tag>
      <H2 s={{ color: "#fff" }}>Every artist deserves a place to be seen.</H2>
      <div style={{ maxWidth: 640, marginBottom: 36 }}>
        <P1 s={{ color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>The Wall began as a physical wall at Ric Platter restaurant in Jaipur - artists hang their work, get discovered by real foot traffic.</P1>
        <P1 s={{ color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>Now it is two things: a <strong style={{ color: "#fff" }}>physical wall</strong> with daily-rental slots and complete management system, and a <strong style={{ color: "#fff" }}>virtual wall</strong> where any artist can tag artwork, share their photo, and join the community.</P1>
        <P1 s={{ color: "rgba(255,255,255,0.7)" }}>The first <strong style={{ color: C.teal }}>10,000 artists</strong> become <strong style={{ color: C.teal }}>Founding Members</strong>.</P1>
        <div style={{ marginTop: 14 }}><Share text="Join the ArtWall. First 10,000 get Founding Member status." /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 6, marginBottom: 28 }}>
        {ar.map((a, i) => <div key={i} style={{ aspectRatio: "1", background: a.cl + "18", borderRadius: 10, border: "1px solid " + a.cl + "30", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: a.cl, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{a.n[0]}</div>
          <p style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{a.n}</p><p style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>{a.c}</p>
        </div>)}
        {[1,2,3,4,5].map(i => <div key={"e"+i} style={{ aspectRatio: "1", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 18, color: "rgba(255,255,255,0.08)" }}>+</span></div>)}
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 32 }}>
        {[{ n: "5+", l: "Artists" }, { n: "5", l: "Artworks" }, { n: "3", l: "Cities" }, { n: "5/10K", l: "Founding spots" }].map((s, i) => <div key={i}><p style={{ fontSize: 22, fontWeight: 700, color: C.teal }}>{s.n}</p><p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.l}</p></div>)}
      </div>
      <Cd style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ background: C.teal, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4, marginRight: 8 }}>PHYSICAL WALL</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Ric Platter Restaurant, Jaipur</span>
        <P1 s={{ color: "rgba(255,255,255,0.6)", marginTop: 10, marginBottom: 12 }}>Daily-rental slots. Book, hang, get discovered. Complete wall management system.</P1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{ft.map((f, i) => <span key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 10 }}>{f}</span>)}</div>
      </Cd>
      <div style={{ marginTop: 28, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
        <H3 s={{ color: "#fff" }}>Add your work to the wall.</H3>
        <P1 s={{ color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>Tag your artwork, share your photo, write a message. You keep every right.</P1>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }} className="rg">
          {["Your name", "Email", "City", "Practice", "Title of the work", "Instagram or website"].map((f, i) => <input key={i} placeholder={f} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none" }} />)}
        </div>
        <textarea placeholder="Your message about your work..." style={{ width: "100%", marginTop: 8, padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", minHeight: 56, resize: "vertical", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <label style={{ padding: "9px 14px", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer" }}>Upload artwork<input type="file" style={{ display: "none" }} accept="image/*" /></label>
          <label style={{ padding: "9px 14px", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer" }}>Photo with work<input type="file" style={{ display: "none" }} accept="image/*" /></label>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
          <button style={{ padding: "12px 24px", background: C.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Join the Wall - Founding Member</button>
          <Share text="I joined the ArtWall as a Founding Member!" small />
        </div>
      </div>
    </Sec>
  );
}

/* ========== ARCHETYPE QUIZ ========== */
function Quiz() {
  const qs = [
    { q: "When you create, what drives you most?", o: ["Preserving tradition", "Experimenting with new forms", "Telling stories", "Connecting community"] },
    { q: "How do you prefer to show your work?", o: ["Gallery exhibitions", "Community spaces", "Digital platforms", "Craft fairs and melas"] },
    { q: "What matters most?", o: ["Material mastery", "Emotional expression", "Sustainability", "Cultural documentation"] },
    { q: "Technology in art?", o: ["Threat to craft", "Powerful tool", "Depends on use", "Essential for next gen"] },
    { q: "What would change your career most?", o: ["Fair pricing", "Exhibition access", "IP protection", "Global collector access"] },
  ];
  const ar = [
    { n: "The Heritage Keeper", d: "You carry tradition forward. Madhubani, Warli, Pichwai, Pattachitra - art forms passed through generations. ArtWall protects your legacy with blockchain provenance.", c: "#8B5CF6" },
    { n: "The Boundary Breaker", d: "You push form, mix mediums, refuse categories. Contemporary, digital, cross-disciplinary. The Exhibition Engine finds your audience.", c: C.accent },
    { n: "The Story Weaver", d: "Your art speaks truth. Every piece is a narrative. ArtWall gives your stories provenance that outlasts galleries.", c: C.green },
    { n: "The Community Builder", d: "You make art better by making it collective. Workshops, mentorship, craft clusters. Indiagrapher was built for you.", c: C.red },
  ];
  const [step, setStep] = useState(-1);
  const [ans, setAns] = useState([]);
  const [res, setRes] = useState(null);
  const answer = oi => { const nx = [...ans, oi]; setAns(nx); if (nx.length >= qs.length) { const ct = [0,0,0,0]; nx.forEach(a => ct[a]++); setRes(ar[ct.indexOf(Math.max(...ct))]); setStep(qs.length); } else setStep(nx.length); };
  const reset = () => { setStep(-1); setAns([]); setRes(null); };
  return (
    <Sec id="quiz">
      <Tag>Find Your Archetype</Tag>
      <H2>What kind of artist are you?</H2>
      <P1 s={{ maxWidth: 520, marginBottom: 32 }}>Five questions. Discover your artist archetype and see how ArtWall fits the way you create.</P1>
      {step === -1 && <Cd style={{ maxWidth: 460, textAlign: "center", padding: "44px 32px", margin: "0 auto" }} onClick={() => setStep(0)}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: C.accentL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><span style={{ fontSize: 24, color: C.accent }}>?</span></div>
        <H3>Discover Your Artist Archetype</H3>
        <P1 s={{ marginBottom: 20 }}>5 questions, 2 minutes, shareable result</P1>
        <Bt primary>Start the Quiz</Bt>
      </Cd>}
      {step >= 0 && step < qs.length && <Cd style={{ maxWidth: 520, margin: "0 auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>Question {step + 1} / {qs.length}</span>
          <div style={{ display: "flex", gap: 4 }}>{qs.map((_, i) => <div key={i} style={{ width: 20, height: 4, borderRadius: 2, background: i <= step ? C.accent : C.borderL }} />)}</div>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, lineHeight: 1.4 }}>{qs[step].q}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{qs[step].o.map((op, i) => <button key={i} onClick={() => answer(i)} style={{ textAlign: "left", padding: "14px 18px", border: "1px solid " + C.border, borderRadius: 8, background: C.white, cursor: "pointer", fontSize: 15, color: C.text, transition: "all 0.15s" }}>{op}</button>)}</div>
      </Cd>}
      {res && <Cd style={{ maxWidth: 520, margin: "0 auto", padding: 28, borderColor: res.c + "44" }}>
        <p style={{ fontSize: 11, color: res.c, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Your Archetype</p>
        <H2 s={{ color: res.c, fontSize: 26 }}>{res.n}</H2>
        <P1 s={{ marginBottom: 20 }}>{res.d}</P1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><Bt onClick={reset}>Retake</Bt><Share text={"I am " + res.n + " on ArtWall! Take the quiz."} small /></div>
      </Cd>}
    </Sec>
  );
}

/* ========== LIVING MAP ========== */
function Map() {
  const [sel, setSel] = useState(null);
  const ct = [{ n: "Jaipur", p: "Miniature, blue pottery", la: 26.9, lo: 75.8, lit: 1 }, { n: "Delhi", p: "Contemporary", la: 28.6, lo: 77.2, lit: 1 }, { n: "Mumbai", p: "Contemporary", la: 19.1, lo: 72.9, lit: 0 }, { n: "Udaipur", p: "Pichwai", la: 24.6, lo: 73.7, lit: 1 }, { n: "Varanasi", p: "Banarasi weave", la: 25.3, lo: 83, lit: 0 }, { n: "Kolkata", p: "Kalighat", la: 22.6, lo: 88.4, lit: 0 }, { n: "Chennai", p: "Tanjore", la: 13.1, lo: 80.3, lit: 0 }, { n: "Bengaluru", p: "Digital", la: 13, lo: 77.6, lit: 0 }, { n: "Hyderabad", p: "Kalamkari", la: 17.4, lo: 78.5, lit: 0 }, { n: "Lucknow", p: "Chikankari", la: 26.8, lo: 81, lit: 0 }];
  return (
    <Sec id="map" style={{ background: C.white }}>
      <Tag>Living Map</Tag>
      <H2>A country that lights up one artist at a time.</H2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }} className="rg">
        <div>
          <P1 s={{ marginBottom: 16 }}>Cities with traditions worth the world's attention. Each stays dark until an artist joins.</P1>
          <div style={{ border: "1px solid " + C.border, borderRadius: 8, overflow: "hidden" }}>
            {ct.map((c, i) => <button key={i} onClick={() => setSel(i)} style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 14px", background: sel === i ? C.accentL : "transparent", border: "none", borderBottom: "1px solid " + C.borderL, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: sel === i ? 700 : 400 }}>{c.n} <span style={{ color: C.text3 }}>{c.p}</span></span>
              {c.lit ? <span style={{ fontSize: 8, color: C.accent }}>*</span> : null}
            </button>)}
          </div>
        </div>
        <div style={{ background: C.bg, borderRadius: 14, padding: 16, border: "1px solid " + C.border, position: "relative", minHeight: 340 }}>
          <svg viewBox="65 5 35 38" style={{ width: "100%", height: "100%" }}>
            <path d="M82,8 Q90,12 92,20 Q93,28 88,34 Q84,38 80,40 Q76,38 74,34 Q72,30 72,26 Q70,22 72,16 Q74,10 80,8 Z" fill="none" stroke={C.border} strokeWidth="0.4" opacity="0.5" />
            {ct.map((c, i) => { const x = 65 + ((c.lo - 68) / 28) * 35, y = 5 + ((38 - c.la + 8) / 35) * 38; return <g key={i} onClick={() => setSel(i)} style={{ cursor: "pointer" }}><circle cx={x} cy={y} r={sel === i ? 1.2 : 0.6} fill={c.lit ? C.accent : C.text3 + "44"} stroke={sel === i ? C.accent : "none"} strokeWidth="0.3" />{sel === i && <text x={x + 1.5} y={y + 0.4} fontSize="1.3" fill={C.text} fontWeight="600">{c.n}</text>}</g>; })}
          </svg>
          {sel !== null && <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, background: C.white, border: "1px solid " + C.border, borderRadius: 8, padding: "8px 12px" }}>
            <p style={{ fontSize: 14, fontWeight: 700 }}>{ct[sel].n}</p><p style={{ fontSize: 12, color: C.text2 }}>{ct[sel].p}</p>
          </div>}
        </div>
      </div>
    </Sec>
  );
}

/* ========== COMMUNITY ========== */
function Community() {
  return (
    <Sec id="community">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }} className="rg">
        <div>
          <Tag>Community</Tag>
          <H2>Help keep culture alive.</H2>
          <P1 s={{ marginBottom: 20 }}>Democratising opportunity for India's creative economy - so every artisan has digital access, every artwork carries verified provenance, and every transaction supports a sustainable creative life.</P1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Bt onClick={() => go("wall")} primary>Join the Community</Bt>
            <Share text="Know an artist? Share ArtWall." small />
          </div>
        </div>
        <Cd>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: C.accentL, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><span style={{ fontSize: 20, color: C.accent }}>I</span></div>
          <H3>Indiagrapher</H3>
          <P1 s={{ marginBottom: 10 }}>National fine-art community. Active chapters across Indian cities. Weekly Artisan Spotlight. Monthly Deep Dive. Heritage Retreat. Every artform, every tradition.</P1>
          <p style={{ fontSize: 13, color: C.accent, fontWeight: 600 }}>Pipeline: 100 onboardings in 3-6 months</p>
        </Cd>
      </div>
    </Sec>
  );
}

/* ========== TESTIMONIALS ========== */
function Testimonials() {
  const [idx, setIdx] = useState(0);
  const ts = [
    { q: "ArtWall gave me my first exhibition without spending a single rupee on gallery rental. My paintings were seen by people who actually cared - and I got paid fairly.", a: "Practising Artist", r: "Indiagrapher Member, Jaipur" },
    { q: "The gallery management software transformed how we handle exhibitions - scheduling, artist curation, ticketing, and provenance all in one place.", a: "Gallery Partner", r: "Delhi" },
    { q: "For the first time, I could verify authenticity before buying - NFC tag, blockchain certificate, and a 72-hour inspection window. This is how art should be sold.", a: "Early-Access Collector", r: "Delhi" },
  ];
  const t = ts[idx];
  return (
    <Sec id="test" style={{ background: C.white }}>
      <Tag>What Our Community Says</Tag>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontSize: 40, color: C.accent, lineHeight: 1, marginBottom: 16 }}>"</div>
        <p style={{ fontSize: 20, lineHeight: 1.6, color: C.text, fontWeight: 500, marginBottom: 20 }}>{t.q}</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{t.a}</p>
        <p style={{ fontSize: 13, color: C.text2 }}>{t.r}</p>
        <div style={{ display: "flex", gap: 6, marginTop: 24 }}>
          {ts.map((_, i) => <button key={i} onClick={() => setIdx(i)} style={{ width: 10, height: 10, borderRadius: "50%", background: idx === i ? C.accent : C.border, border: "none", cursor: "pointer" }} />)}
        </div>
      </div>
    </Sec>
  );
}

/* ========== FAQ ========== */
function FAQ() {
  const [o, setO] = useState(-1);
  const fs = [
    { q: "What is Artwall Labs?", a: "A DPIIT-recognised AI/tech SaaS company building India's Art Operating System - artist registry, AI exhibitions, blockchain provenance, demand-triggered sales, and fair marketplace for 7 million artisans." },
    { q: "What commission does Artwall charge?", a: "10% on first-hand sales vs 40-60% industry standard. Artists also earn perpetual 4% royalty on every resale via ERC-2981 smart contracts on Polygon Ethereum." },
    { q: "How does blockchain provenance work?", a: "Every artwork receives a provenance certificate minted on Polygon Ethereum. An NTAG424 NFC DNA tag is physically bound to the artwork. Every transfer and resale is permanently recorded." },
    { q: "What is a Demand-Triggered Sale?", a: "Patented mechanism with zero prior art worldwide. Five weighted demand signals produce a composite score. Artwork unlocks only when it crosses the artist's threshold." },
    { q: "Is Artwall DPDP compliant?", a: "Yes. Framework designed from Day 1. Self-assessment complete. Third-party audit planned Year 1. All data on AWS Mumbai (ap-south-1) with India data residency." },
    { q: "How do I join as an artist?", a: "Sign up free. Complete 4-tier verification (DigiLocker KYC, document upload, curator review, peer endorsement). Upload artworks. Free plan includes 5 artworks; paid plans from Rs 499/mo." },
  ];
  return (
    <Sec id="faq">
      <Tag>FAQs</Tag>
      <H2>Frequently asked questions.</H2>
      <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8, marginTop: 32 }}>
        {fs.map((f, i) => <div key={i} style={{ border: "1px solid " + (o === i ? C.accent + "40" : C.border), borderRadius: 10, background: C.white, transition: "border-color 0.2s" }}>
          <button onClick={() => setO(o === i ? -1 : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{f.q}</span>
            <span style={{ fontSize: 16, color: C.text3, transform: o === i ? "rotate(45deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>+</span>
          </button>
          {o === i && <div style={{ padding: "0 20px 18px", borderTop: "1px solid " + C.borderL }}><P1 s={{ fontSize: 14, paddingTop: 10 }}>{f.a}</P1></div>}
        </div>)}
      </div>
    </Sec>
  );
}

/* ========== TEAM ========== */
function Team() {
  const tm = [
    { i: "KC", n: "Kailashpati Choudhary", r: "Founder and CEO", b: "LLB, Rajasthan University. Corporate law, IP, regulatory compliance. Founder of Indiagrapher. DPIIT/NSWS/SISFS signatory." },
    { i: "SS", n: "Shishir Singhal", r: "CTO and Technical Lead", b: "M.S. CS Georgia Tech (4.0). B.S. Aerospace UCLA. 4 yrs founding engineer, Detroit Flying Cars. AI, blockchain, NFC." },
    { i: "VD", n: "Vishnudev Choudhary", r: "AI / ML Advisor", b: "IIT Tirupati. JEE Adv AIR 6499. 3+ yrs production ML. Guides CLIP, CNN anti-fraud, demand-signal modelling." },
    { i: "SA", n: "Sparsh Agarwal", r: "HR and Ops Advisor", b: "PGP-HRM MDI Gurgaon. CAT 98.47%. UGC-NET. SECI, Tata Steel. Hiring frameworks and org design." },
  ];
  return (
    <Sec id="about" style={{ background: C.white }}>
      <Tag>The Team</Tag>
      <H2>Built by people who understand the problem.</H2>
      <P1 s={{ maxWidth: 520, marginBottom: 32 }}>Experts in Indian law, AI/ML engineering, art community building, and startup operations.</P1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="g4">
        {tm.map((m, i) => <Cd key={i}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.dark, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{m.i}</div>
          <p style={{ fontSize: 11, color: C.accent, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{m.r}</p>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{m.n}</p>
          <P1 s={{ fontSize: 13 }}>{m.b}</P1>
        </Cd>)}
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@media(max-width:900px){.g4{grid-template-columns:repeat(2,1fr)!important}}@media(max-width:600px){.g4{grid-template-columns:1fr!important}}" }} />
    </Sec>
  );
}

/* ========== CONTACT ========== */
function Contact() {
  return (
    <Sec id="contact">
      <Tag>Get in Touch</Tag>
      <H2>Let us build this together.</H2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 20 }} className="rg">
        <div>
          <P1 s={{ marginBottom: 20 }}>Artist, gallery, collector, investor, or just curious - we want to hear from you.</P1>
          <div style={{ fontSize: 14, color: C.text2, lineHeight: 2.4 }}>
            <p><strong style={{ color: C.text }}>Email:</strong> <a href="mailto:hello@artwalllabs.com" style={{ color: C.accent, textDecoration: "none" }}>hello@artwalllabs.com</a></p>
            <p><strong style={{ color: C.text }}>Phone:</strong> <a href="tel:+918209395894" style={{ color: C.accent, textDecoration: "none" }}>+91 8209 395 894</a></p>
            <p><strong style={{ color: C.text }}>WhatsApp:</strong> <a href="https://wa.me/918209395894" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "none" }}>Chat with us</a></p>
            <p><strong style={{ color: C.text }}>Location:</strong> Jaipur, Rajasthan</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="Name" style={{ padding: "12px 14px", border: "1px solid " + C.border, borderRadius: 8, fontSize: 14, outline: "none" }} />
          <input placeholder="Email" style={{ padding: "12px 14px", border: "1px solid " + C.border, borderRadius: 8, fontSize: 14, outline: "none" }} />
          <select style={{ padding: "12px 14px", border: "1px solid " + C.border, borderRadius: 8, fontSize: 14, outline: "none", color: C.text2 }}>
            <option>I am a...</option><option>Artist</option><option>Gallery</option><option>Collector</option><option>Investor</option><option>Other</option>
          </select>
          <textarea placeholder="Message" rows={3} style={{ padding: "12px 14px", border: "1px solid " + C.border, borderRadius: 8, fontSize: 14, outline: "none", resize: "vertical" }} />
          <button style={{ padding: "13px", background: C.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Send Message</button>
        </div>
      </div>
    </Sec>
  );
}

/* ========== FOOTER ========== */
function Footer() {
  const cols = [
    { t: "Services", ls: [{ l: "Artist Registry", id: "services" }, { l: "Provenance and COA", id: "services" }, { l: "Marketplace", id: "services" }, { l: "Anti-Fraud Engine", id: "services" }, { l: "Exhibition Engine", id: "services" }] },
    { t: "Artwall For", ls: [{ l: "Artists", id: "tabs" }, { l: "Galleries", id: "tabs" }, { l: "Collectors", id: "tabs" }] },
    { t: "Explore", ls: [{ l: "The Wall", id: "wall" }, { l: "Living Map", id: "map" }, { l: "Archetype Quiz", id: "quiz" }, { l: "Indiagrapher", id: "community" }] },
    { t: "Company", ls: [{ l: "About", id: "about" }, { l: "Contact", id: "contact" }] },
  ];
  return (
    <footer style={{ background: C.dark, color: "#fff", padding: "56px 24px 28px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(4,1fr)", gap: 24, marginBottom: 40 }} className="g5">
          <div>
            <button onClick={() => go("hero")} style={{ background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>artwall</span><span style={{ fontSize: 18, fontWeight: 300, color: C.teal }}>labs</span>
            </button>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, maxWidth: 220, fontStyle: "italic" }}>Art lives on the wall. Every wall is an exhibition.</p>
            <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
              {[{ l: "IG", u: "https://instagram.com/artwalllabs" }, { l: "X", u: "https://x.com/artwalllabs" }, { l: "in", u: "https://linkedin.com/company/artwalllabs" }, { l: "YT", u: "https://youtube.com/@artwalllabs" }].map(s => <a key={s.l} href={s.u} target="_blank" rel="noopener noreferrer" style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{s.l}</a>)}
            </div>
          </div>
          {cols.map((c, ci) => <div key={ci}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>{c.t}</p>
            {c.ls.map((l, li) => <button key={li} onClick={() => go(l.id)} style={{ display: "block", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 10, padding: 0, textAlign: "left" }}>{l.l}</button>)}
          </div>)}
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>2026 Artwall Labs Pvt Ltd. All rights reserved.</p>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>DPIIT Recognised. Built in Rajasthan with <a href="https://stackfox.in" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>StackFox</a></span>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: "@media(max-width:768px){.g5{grid-template-columns:1fr 1fr!important}}" }} />
    </footer>
  );
}

/* ========== APP ========== */
export default function App() {
  return (
    <div style={{ fontFamily: "Inter,-apple-system,system-ui,sans-serif", color: C.text, background: C.bg, margin: 0 }}>
      <Nav />
      <Hero />
      <Stats />
      <Services />
      <How />
      <Tabs />
      <Why />
      <Comp />
      <Testimonials />
      <Wall />
      <Quiz />
      <Map />
      <Community />
      <FAQ />
      <Team />
      <Contact />
      <Footer />
    </div>
  );
}
