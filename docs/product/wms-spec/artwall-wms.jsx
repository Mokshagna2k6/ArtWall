import { useReducer, useState, useMemo, useEffect, useRef, useCallback, createContext, useContext } from "react";
import {
  LayoutGrid, Calendar, Wallet, Users, Image as ImageIcon, Search, Bell, Menu,
  Plus, X, Check, ChevronRight, ChevronLeft, Grip, QrCode, Share2, Heart, Flame,
  Sparkles, Gem, Zap, Upload, MapPin, Clock, ShieldCheck, TrendingUp, AlertTriangle,
  ArrowRight, Star, Filter, LogOut, Camera, FileText, PenLine, CheckCircle2, Circle,
  UserPlus, ClipboardCheck, ScanLine, Lock, Eye, Trash2, MessageSquare
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════
   ARTWALL LABS — WALL MANAGEMENT SYSTEM (prototype)
   Ref: AWL/PRODUCT/2026/WMS-001
   Single-file reference implementation. In-memory store (no persistence
   layer in the prototype — the real system is Postgres + Node/Express,
   see the audit pack). Demonstrates RBAC, the slot state machine, the
   pricing engine, and the full Admin / Artist / Visitor surface.
════════════════════════════════════════════════════════════════════ */

/* ── Design tokens ───────────────────────────────────────────────── */
const T = {
  void: "#0A0A0F", ink: "#16171F", ink2: "#5B6070", ink3: "#9AA0B0",
  blue: "#2563EB", blueH: "#1D4ED8", blueL: "#EEF3FE",
  amber: "#D97706", amberL: "#FEF6EC",
  ivory: "#FAF9F5", surface: "#FFFFFF", bg: "#F6F7FA",
  border: "#E7E9F0", borderH: "#D6DAE6",
  green: "#0E9F6E", greenL: "#E9F8F1", red: "#E02424", redL: "#FDECEC",
  purple: "#7C3AED",
};
const FONT = "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif";
const SERIF = "'Georgia','Times New Roman',serif";

/* ── Domain constants ────────────────────────────────────────────── */
const ROLES = { VISITOR: "visitor", ARTIST: "artist", STAFF: "staff", ADMIN: "admin" };

// Slot lifecycle state machine — allowed transitions only.
const SLOT_STATES = ["available", "reserved", "booked", "received", "installed", "live", "ended", "maintenance", "blocked"];
const SLOT_TRANSITIONS = {
  available: ["reserved", "booked", "maintenance", "blocked"],
  reserved:  ["booked", "available"],
  booked:    ["received", "available"],          // available = force-release
  received:  ["installed", "booked"],
  installed: ["live", "received"],
  live:      ["ended"],
  ended:     ["available"],
  maintenance: ["available", "blocked"],
  blocked:   ["available"],
};
const SLOT_STATE_META = {
  available:   { label: "Available",   c: T.green,  bg: T.greenL },
  reserved:    { label: "Reserved",    c: T.amber,  bg: T.amberL },
  booked:      { label: "Booked",      c: T.blue,   bg: T.blueL },
  received:    { label: "Received",    c: T.purple, bg: "#F3EEFE" },
  installed:   { label: "Installed",   c: T.amber,  bg: T.amberL },
  live:        { label: "Live",        c: T.blue,   bg: T.blueL },
  ended:       { label: "Ended",       c: T.ink3,   bg: "#F1F2F6" },
  maintenance: { label: "Maintenance", c: T.red,    bg: T.redL },
  blocked:     { label: "Blocked",     c: T.ink2,   bg: "#EEEFF3" },
};
const SIZE_META = { S: { label: "Small", base: 600 }, M: { label: "Medium", base: 1000 }, L: { label: "Large", base: 1500 }, XL: { label: "X-Large", base: 2200 } };
const SLOT_TYPES = {
  standard:  { label: "Standard",  mult: 1.0,  c: T.ink2 },
  premium:   { label: "Premium",   mult: 1.4,  c: T.blue },
  featured:  { label: "Featured",  mult: 1.8,  c: T.amber },
  workshop:  { label: "Workshop",  mult: 1.5,  c: T.purple },
  walkin:    { label: "Walk-in",   mult: 1.3,  c: T.green },
  sponsored: { label: "Sponsored", mult: 0.0,  c: T.green },
};
const ADD_ONS = [
  { id: "nfc", label: "NFC tag installation", price: 150 },
  { id: "photo", label: "Professional photography", price: 800 },
  { id: "featured", label: "Homepage featured listing", price: 500 },
  { id: "content", label: "Content package (reel + photoshoot)", price: 2500 },
  { id: "spotlight", label: "Spotlight lighting", price: 400 },
];
const DURATIONS = [
  { id: 1, label: "1 day", days: 1, disc: 1 },
  { id: 3, label: "3 days", days: 3, disc: 0.95 },
  { id: 7, label: "1 week", days: 7, disc: 0.88 },
  { id: 14, label: "2 weeks", days: 14, disc: 0.82 },
  { id: 30, label: "1 month", days: 30, disc: 0.72 },
];
const REACTIONS = [
  { id: "fire", icon: Flame, c: T.amber },
  { id: "love", icon: Heart, c: T.red },
  { id: "art", icon: Sparkles, c: T.blue },
  { id: "gem", icon: Gem, c: T.purple },
  { id: "wow", icon: Zap, c: T.green },
];

/* ── Pricing engine (pure) ───────────────────────────────────────── */
function priceSlot(slot, durationId, addOnIds, occupancyPct) {
  const size = SIZE_META[slot.size].base;
  const type = SLOT_TYPES[slot.type].mult;
  const dur = DURATIONS.find(d => d.id === durationId) || DURATIONS[0];
  const surge = occupancyPct > 80 ? 1.15 : 1; // demand surge
  const base = size * type * dur.days * dur.disc * surge;
  const addOns = ADD_ONS.filter(a => addOnIds.includes(a.id)).reduce((s, a) => s + a.price, 0);
  return { base: Math.round(base), addOns, total: Math.round(base) + addOns, surge: surge > 1 };
}

/* ── Validation helpers ──────────────────────────────────────────── */
const validators = {
  required: (v) => (v && String(v).trim() ? null : "Required"),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "") ? null : "Enter a valid email"),
  phone: (v) => (/^[6-9]\d{9}$/.test((v || "").replace(/\D/g, "").slice(-10)) ? null : "Enter a valid 10-digit number"),
};
function validate(fields, rules) {
  const errs = {};
  for (const key in rules) {
    for (const rule of rules[key]) {
      const msg = validators[rule](fields[key]);
      if (msg) { errs[key] = msg; break; }
    }
  }
  return errs;
}

/* ── Seed data ───────────────────────────────────────────────────── */
const uid = (() => { let n = 1000; return () => `id_${++n}`; })();
const MEDIUMS = ["Painting", "Photography", "Sculpture", "Textile", "Digital", "Mixed media"];
const CITIES = ["Jaipur", "Sikar", "Patna", "Udaipur", "Jodhpur", "Delhi"];
const NAMES = ["Sarita Devi", "Deepali Kumari", "Alok Sharma", "Antima R.", "Rehan Q.", "Meera Joshi", "Vikram S.", "Nisha P."];

function seedSlots() {
  const slots = [];
  const rows = 3, cols = 8;
  const sizes = ["M", "M", "L", "M", "S", "M", "XL", "M"];
  const types = ["standard", "premium", "featured", "standard", "walkin", "standard", "featured", "sponsored"];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const size = sizes[(r + c) % sizes.length];
      const type = types[c % types.length];
      const roll = (r * cols + c);
      let state = "available";
      if (roll % 5 === 0) state = "live";
      else if (roll % 7 === 0) state = "booked";
      else if (roll % 11 === 0) state = "maintenance";
      slots.push({
        id: `S${String(++i).padStart(2, "0")}`, row: r, col: c, size, type, state,
        artistId: null, artworkId: null, note: "",
      });
    }
  }
  return slots;
}
function seedArtists() {
  return NAMES.slice(0, 5).map((n, idx) => ({
    id: uid(), name: n, city: CITIES[idx % CITIES.length], medium: MEDIUMS[idx % MEDIUMS.length],
    email: n.toLowerCase().replace(/[^a-z]/g, "") + "@mail.com", phone: "98" + (10000000 + idx * 137).toString(),
    verified: idx < 2, founding: true, bio: "Emerging artist exploring form, colour and the everyday.",
  }));
}
function seedArtworks(artists, slots) {
  const swatches = ["#C87A2A", "#2563EB", "#0E9F6E", "#7C3AED", "#E02424", "#D97706", "#0EA5E9", "#DB2777"];
  const titles = ["Monsoon Field", "City at Dusk", "Ritual", "Threadwork No.4", "Static Bloom", "Havelis", "Origin", "Quiet Noise"];
  const live = slots.filter(s => s.state === "live");
  return live.map((s, idx) => {
    const artist = artists[idx % artists.length];
    const aw = {
      id: uid(), slotId: s.id, artistId: artist.id, title: titles[idx % titles.length],
      medium: artist.medium, color: swatches[idx % swatches.length], price: 4000 + idx * 2500,
      forSale: idx % 2 === 0, dims: `${40 + idx * 4} × ${50 + idx * 3} cm`, year: 2026,
      statement: "A study of light and memory in the ordinary corners of the city.",
      scans: 40 + idx * 23, reactions: { fire: 8 + idx, love: 5 + idx, art: 3, gem: 1, wow: 2 },
    };
    s.artistId = artist.id; s.artworkId = aw.id;
    return aw;
  });
}

function initStore() {
  const slots = seedSlots();
  const artists = seedArtists();
  const artworks = seedArtworks(artists, slots);
  return {
    grid: { rows: 3, cols: 8, name: "Ric Platter · Main Wall" },
    slots, artists, artworks,
    bookings: [
      { id: uid(), slotId: "S04", artistId: artists[0].id, status: "confirmed", amount: 1000, days: 7, created: "2026-08-09" },
      { id: uid(), slotId: "S15", artistId: artists[1].id, status: "confirmed", amount: 1800, days: 3, created: "2026-08-10" },
    ],
    waitlist: [{ id: uid(), name: "Priya M.", city: "Jaipur", medium: "Painting", pref: "Large / eye-level", pos: 1 }],
    ugc: [
      { id: uid(), by: "Ananya", note: "Came for dinner, left with a new favourite artist ✨", color: "#2563EB" },
      { id: uid(), by: "Karan", note: "The NFC scan thing is wild", color: "#D97706" },
    ],
    checkins: [], feedback: [], visitors: [],
    revenueByDay: [
      { d: "Mon", v: 3200 }, { d: "Tue", v: 5400 }, { d: "Wed", v: 2800 },
      { d: "Thu", v: 6100 }, { d: "Fri", v: 8300 }, { d: "Sat", v: 9600 }, { d: "Sun", v: 7200 },
    ],
    toast: null,
  };
}

/* ── Reducer (single source of truth) ────────────────────────────── */
function reducer(state, action) {
  switch (action.type) {
    case "TOAST": return { ...state, toast: action.msg };
    case "CLEAR_TOAST": return { ...state, toast: null };

    case "GRID_RESIZE": {
      const { rows, cols } = action;
      const existing = new Map(state.slots.map(s => [`${s.row}-${s.col}`, s]));
      const slots = [];
      let i = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const key = `${r}-${c}`;
        if (existing.has(key)) { slots.push(existing.get(key)); i++; }
        else slots.push({ id: `S${String(rows * cols + (++i)).padStart(2, "0")}`, row: r, col: c, size: "M", type: "standard", state: "available", artistId: null, artworkId: null, note: "" });
      }
      return { ...state, grid: { ...state.grid, rows, cols }, slots };
    }
    case "SLOT_UPDATE":
      return { ...state, slots: state.slots.map(s => s.id === action.id ? { ...s, ...action.patch } : s) };
    case "SLOT_MOVE": {
      // swap two slots' grid positions (drag-and-drop reorder)
      const a = state.slots.find(s => s.id === action.from);
      const b = state.slots.find(s => s.id === action.to);
      if (!a || !b) return state;
      return { ...state, slots: state.slots.map(s => {
        if (s.id === a.id) return { ...s, row: b.row, col: b.col };
        if (s.id === b.id) return { ...s, row: a.row, col: a.col };
        return s;
      }) };
    }
    case "SLOT_TRANSITION": {
      const slot = state.slots.find(s => s.id === action.id);
      if (!slot || !SLOT_TRANSITIONS[slot.state].includes(action.to)) return state;
      const patch = { state: action.to };
      if (action.to === "available") { patch.artistId = null; patch.artworkId = null; }
      return { ...state, slots: state.slots.map(s => s.id === action.id ? { ...s, ...patch } : s) };
    }
    case "BOOK": {
      const b = { id: uid(), status: "confirmed", created: "2026-08-13", ...action.booking };
      const slots = state.slots.map(s => action.slotIds.includes(s.id) ? { ...s, state: "booked", artistId: action.booking.artistId } : s);
      return { ...state, bookings: [b, ...state.bookings], slots };
    }
    case "ADD_ARTIST":
      return { ...state, artists: [action.artist, ...state.artists] };
    case "ADD_WAITLIST":
      return { ...state, waitlist: [...state.waitlist, { id: uid(), pos: state.waitlist.length + 1, ...action.entry }] };
    case "CHECKIN":
      return { ...state, checkins: [{ id: uid(), ...action.entry, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...state.checkins] };
    case "REACT": {
      return { ...state, artworks: state.artworks.map(a => a.id === action.id
        ? { ...a, reactions: { ...a.reactions, [action.r]: (a.reactions[action.r] || 0) + 1 } } : a) };
    }
    case "SCAN":
      return { ...state, artworks: state.artworks.map(a => a.id === action.id ? { ...a, scans: a.scans + 1 } : a) };
    case "ADD_UGC":
      return { ...state, ugc: [{ id: uid(), ...action.entry }, ...state.ugc] };
    case "ADD_VISITOR":
      return { ...state, visitors: [{ id: uid(), ...action.entry }, ...state.visitors] };
    case "ADD_FEEDBACK":
      return { ...state, feedback: [{ id: uid(), ...action.entry }, ...state.feedback] };
    default: return state;
  }
}

/* ── App context ─────────────────────────────────────────────────── */
const Ctx = createContext(null);
const useStore = () => useContext(Ctx);

/* ── UI primitives ───────────────────────────────────────────────── */
function Btn({ children, variant = "primary", size = "md", onClick, disabled, icon: Icon, full, type = "button", ...rest }) {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: FONT, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", borderRadius: 10, border: "1px solid transparent", transition: "all .15s", width: full ? "100%" : "auto", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap" };
  const sizes = { sm: { fontSize: 12.5, padding: "7px 12px" }, md: { fontSize: 13.5, padding: "10px 16px" }, lg: { fontSize: 15, padding: "13px 22px" } };
  const variants = {
    primary: { background: T.blue, color: "#fff" },
    dark: { background: T.void, color: "#fff" },
    outline: { background: "#fff", color: T.ink, border: `1px solid ${T.border}` },
    ghost: { background: "transparent", color: T.ink2 },
    danger: { background: T.redL, color: T.red, border: `1px solid ${T.red}22` },
    amber: { background: T.amber, color: "#fff" },
  };
  return <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...sizes[size], ...variants[variant] }} {...rest}>{Icon && <Icon size={size === "sm" ? 14 : 16} />}{children}</button>;
}
function Card({ children, style, pad = 18, hover, onClick }) {
  const [h, setH] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ background: "#fff", border: `1px solid ${h && hover ? T.borderH : T.border}`, borderRadius: 14, padding: pad, transition: "all .15s", boxShadow: h && hover ? "0 6px 20px rgba(15,20,40,.06)" : "none", cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>;
}
function Badge({ children, c = T.ink2, bg = "#F1F2F6" }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: c, background: bg, padding: "3px 9px", borderRadius: 999, letterSpacing: .2, display: "inline-flex", alignItems: "center", gap: 4 }}>{children}</span>;
}
function Label({ children }) { return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: T.blue, textTransform: "uppercase", marginBottom: 8 }}>{children}</div>; }
function Field({ label, error, children }) {
  return <label style={{ display: "block", marginBottom: 14 }}>
    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{label}</div>
    {children}
    {error && <div style={{ fontSize: 11.5, color: T.red, marginTop: 4, fontWeight: 600 }}>{error}</div>}
  </label>;
}
const inputStyle = { width: "100%", fontFamily: FONT, fontSize: 13.5, padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: 10, outline: "none", color: T.ink, background: "#fff", boxSizing: "border-box" };
function Input(props) { const [f, setF] = useState(false); return <input {...props} style={{ ...inputStyle, borderColor: f ? T.blue : T.border, ...(props.style || {}) }} onFocus={() => setF(true)} onBlur={() => setF(false)} />; }
function Select({ children, ...p }) { const [f, setF] = useState(false); return <select {...p} style={{ ...inputStyle, borderColor: f ? T.blue : T.border, appearance: "none", background: "#fff url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235B6070' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>\") no-repeat right 10px center", paddingRight: 30 }} onFocus={() => setF(true)} onBlur={() => setF(false)}>{children}</select>; }
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return <div onClick={onClose} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: wide ? 720 : 460, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 60px rgba(10,10,20,.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.void }}>{title}</div>
        <button onClick={onClose} aria-label="Close" style={{ border: "none", background: T.bg, borderRadius: 8, width: 30, height: 30, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={16} color={T.ink2} /></button>
      </div>
      <div style={{ padding: 22 }}>{children}</div>
    </div>
  </div>;
}
function Stat({ label, value, sub, icon: Icon, c = T.blue }) {
  return <Card pad={16}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.ink2, letterSpacing: .3, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: T.void, marginTop: 4, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 5 }}>{sub}</div>}
      </div>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: c + "14", display: "grid", placeItems: "center" }}><Icon size={17} color={c} /></div>
    </div>
  </Card>;
}
const inr = (n) => "₹" + n.toLocaleString("en-IN");

/* ══════════════════════════════════════════════════════════════════
   VISITOR SURFACE
════════════════════════════════════════════════════════════════════ */
function VisitorApp({ nav }) {
  const [page, setPage] = useState("home");
  const [activeAw, setActiveAw] = useState(null);
  const tabs = [["home", "The Wall", LayoutGrid], ["search", "Search", Search], ["community", "Community", ImageIcon], ["visit", "Register", UserPlus]];
  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 16px" }}>
      <div style={{ display: "flex", gap: 6, padding: "14px 0", flexWrap: "wrap" }}>
        {tabs.map(([id, lbl, Icon]) =>
          <button key={id} onClick={() => { setPage(id); setActiveAw(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${page === id ? T.void : T.border}`, background: page === id ? T.void : "#fff", color: page === id ? "#fff" : T.ink2 }}><Icon size={15} />{lbl}</button>)}
      </div>
      {activeAw ? <ArtworkPage aw={activeAw} back={() => setActiveAw(null)} />
        : page === "home" ? <LiveCarousel open={setActiveAw} />
        : page === "search" ? <SearchPage open={setActiveAw} />
        : page === "community" ? <CommunityGallery />
        : <WalkInRegister />}
    </div>
  );
}

function LiveCarousel({ open }) {
  const { state } = useStore();
  const [i, setI] = useState(0);
  const aws = state.artworks;
  const artist = (id) => state.artists.find(a => a.id === id);
  const live = state.slots.filter(s => s.state === "live").length;
  return <div>
    <div style={{ background: T.void, borderRadius: 18, padding: "28px 26px", color: "#fff", marginBottom: 20, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -30, top: -30, width: 160, height: 160, borderRadius: "50%", background: T.blue + "22" }} />
      <Badge c="#fff" bg="rgba(255,255,255,.12)"><span style={{ width: 6, height: 6, borderRadius: 99, background: T.green, display: "inline-block" }} />LIVE NOW</Badge>
      <h1 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, margin: "12px 0 6px", lineHeight: 1.1 }}>Currently on The Wall</h1>
      <p style={{ color: "rgba(255,255,255,.7)", fontSize: 14, maxWidth: 480 }}>{live} artworks live at Ric Platter, Jaipur — tap any piece to see the artist, provenance and price. Every wall is an exhibition.</p>
    </div>

    {aws.length > 0 && <div style={{ position: "relative", marginBottom: 22 }}>
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, scrollSnapType: "x mandatory" }}>
        {aws.map((aw, idx) => {
          const ar = artist(aw.artistId);
          return <Card key={aw.id} pad={0} hover onClick={() => open(aw)} style={{ minWidth: 240, scrollSnapAlign: "start", overflow: "hidden", cursor: "pointer" }}>
            <div style={{ height: 180, background: `linear-gradient(135deg, ${aw.color}, ${aw.color}bb)`, position: "relative" }}>
              <div style={{ position: "absolute", top: 10, left: 10 }}><Badge c={aw.color} bg="#fff">Slot {aw.slotId}</Badge></div>
              {aw.forSale && <div style={{ position: "absolute", top: 10, right: 10 }}><Badge c="#fff" bg="rgba(0,0,0,.35)">{inr(aw.price)}</Badge></div>}
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: T.void }}>{aw.title}</div>
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>{ar?.name} · {aw.medium}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 11.5, color: T.ink3, display: "inline-flex", alignItems: "center", gap: 4 }}><ScanLine size={13} />{aw.scans}</span>
                <ChevronRight size={16} color={T.blue} />
              </div>
            </div>
          </Card>;
        })}
      </div>
    </div>}
  </div>;
}

function ArtworkPage({ aw, back }) {
  const { state, dispatch } = useStore();
  const artist = state.artists.find(a => a.id === aw.artistId);
  const [scanned, setScanned] = useState(false);
  const [share, setShare] = useState(false);
  const [selfie, setSelfie] = useState(false);
  useEffect(() => { if (!scanned) { dispatch({ type: "SCAN", id: aw.id }); setScanned(true); } }, []);
  const cur = state.artworks.find(a => a.id === aw.id) || aw;

  return <div>
    <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={back}>Back to The Wall</Btn>
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20, marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 20, alignItems: "start" }} className="aw-grid">
        <div style={{ borderRadius: 16, height: 360, background: `linear-gradient(135deg, ${cur.color}, ${cur.color}aa)`, position: "relative", display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 8 }}>
            <Badge c={cur.color} bg="#fff"><QrCode size={12} /> NFC + QR verified</Badge>
          </div>
        </div>
        <div>
          <Badge c={cur.color} bg={cur.color + "14"}>Slot {cur.slotId} · Live</Badge>
          <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: T.void, margin: "10px 0 4px" }}>{cur.title}</h1>
          <div style={{ fontSize: 14, color: T.ink2 }}>{artist?.name} · {artist?.city}</div>
          <div style={{ display: "flex", gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
            {[["Medium", cur.medium], ["Dimensions", cur.dims], ["Year", cur.year], ["Status", cur.forSale ? "For sale" : "Not for sale"]].map(([k, v]) =>
              <div key={k}><div style={{ fontSize: 10.5, fontWeight: 700, color: T.ink3, textTransform: "uppercase" }}>{k}</div><div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600, marginTop: 2 }}>{v}</div></div>)}
          </div>
          {cur.forSale && <Card pad={14} style={{ background: T.blueL, border: "none", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 11, color: T.ink2, fontWeight: 600 }}>Price</div><div style={{ fontSize: 22, fontWeight: 800, color: T.void }}>{inr(cur.price)}</div></div>
              <Btn onClick={() => dispatch({ type: "TOAST", msg: "Interest recorded — the demand-triggered sale mechanism is now tracking this piece." })}>I'm interested</Btn>
            </div>
          </Card>}
          <p style={{ fontSize: 13.5, color: T.ink2, lineHeight: 1.6 }}>{cur.statement}</p>
        </div>
      </div>

      {/* Reactions */}
      <Card>
        <Label>React</Label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {REACTIONS.map(({ id, icon: Icon, c }) =>
            <button key={id} onClick={() => dispatch({ type: "REACT", id: cur.id, r: id })} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: `1px solid ${T.border}`, borderRadius: 999, background: "#fff", cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: T.ink }}>
              <Icon size={16} color={c} />{cur.reactions[id] || 0}
            </button>)}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Btn variant="outline" icon={Share2} onClick={() => setShare(true)}>Share</Btn>
        <Btn variant="outline" icon={Camera} onClick={() => setSelfie(true)}>Selfie with artwork</Btn>
        <Btn variant="ghost" icon={ScanLine} onClick={() => dispatch({ type: "SCAN", id: cur.id })}>Simulate NFC tap · {cur.scans} scans</Btn>
      </div>
    </div>

    <ShareModal open={share} onClose={() => setShare(false)} aw={cur} artist={artist} />
    <SelfieModal open={selfie} onClose={() => setSelfie(false)} aw={cur} />
  </div>;
}

function ShareModal({ open, onClose, aw, artist }) {
  const { dispatch } = useStore();
  const text = `${aw.title} by ${artist?.name} — live now at The Wall, Ric Platter Jaipur. artwalllabs.com`;
  const targets = [["WhatsApp", T.green], ["Instagram", T.purple], ["X", T.void], ["Copy link", T.blue]];
  return <Modal open={open} onClose={onClose} title="Share this artwork">
    <div style={{ borderRadius: 12, height: 150, background: `linear-gradient(135deg, ${aw.color}, ${aw.color}aa)`, position: "relative", marginBottom: 14, display: "grid", placeItems: "end start", padding: 12 }}>
      <div style={{ background: "rgba(0,0,0,.4)", color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>Spotted at The Wall · @artwalllabs</div>
    </div>
    <p style={{ fontSize: 13, color: T.ink2, marginBottom: 14 }}>{text}</p>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {targets.map(([lbl, c]) => <Btn key={lbl} variant="outline" onClick={() => { dispatch({ type: "TOAST", msg: `Shared to ${lbl}` }); onClose(); }} full><span style={{ width: 8, height: 8, borderRadius: 99, background: c }} />{lbl}</Btn>)}
    </div>
  </Modal>;
}
function SelfieModal({ open, onClose, aw }) {
  const { dispatch } = useStore();
  const [note, setNote] = useState("");
  return <Modal open={open} onClose={onClose} title="Selfie with artwork">
    <div style={{ borderRadius: 12, height: 170, border: `2px dashed ${T.borderH}`, display: "grid", placeItems: "center", marginBottom: 12, background: T.bg }}>
      <div style={{ textAlign: "center", color: T.ink2 }}><Camera size={26} /><div style={{ fontSize: 12.5, marginTop: 6 }}>Tap to add a photo — we'll frame it with the branded overlay</div></div>
    </div>
    <Field label="Caption (optional)"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="Say something about this piece" /></Field>
    <Btn full onClick={() => { dispatch({ type: "ADD_UGC", entry: { by: "You", note: note || "Spotted at The Wall ✨", color: aw.color } }); dispatch({ type: "TOAST", msg: "Added to the community gallery with your branded frame." }); onClose(); }}>Post to community gallery</Btn>
  </Modal>;
}

function SearchPage({ open }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const [medium, setMedium] = useState("");
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return state.artworks.filter(aw => {
      const ar = state.artists.find(a => a.id === aw.artistId);
      const hay = `${aw.title} ${aw.medium} ${ar?.name} ${ar?.city} ${aw.statement}`.toLowerCase();
      return (!term || hay.includes(term)) && (!medium || aw.medium === medium);
    });
  }, [q, medium, state]);
  return <div>
    <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
        <Search size={16} color={T.ink3} style={{ position: "absolute", left: 12, top: 12 }} />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search artists, titles, mediums, cities…" style={{ paddingLeft: 36 }} />
      </div>
      <Select value={medium} onChange={e => setMedium(e.target.value)} style={{ maxWidth: 200 }}><option value="">All mediums</option>{MEDIUMS.map(m => <option key={m}>{m}</option>)}</Select>
    </div>
    <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 12 }}>{results.length} result{results.length !== 1 ? "s" : ""}</div>
    {results.length === 0 ? <Card pad={40} style={{ textAlign: "center" }}><Search size={26} color={T.ink3} /><div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginTop: 10 }}>Nothing matches yet</div><div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>Try a different medium or clear the search.</div></Card>
      : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
        {results.map(aw => { const ar = state.artists.find(a => a.id === aw.artistId); return <Card key={aw.id} pad={0} hover onClick={() => open(aw)} style={{ overflow: "hidden", cursor: "pointer" }}>
          <div style={{ height: 120, background: `linear-gradient(135deg,${aw.color},${aw.color}aa)` }} />
          <div style={{ padding: 12 }}><div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700 }}>{aw.title}</div><div style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>{ar?.name} · {aw.medium}</div></div>
        </Card>; })}
      </div>}
  </div>;
}

function CommunityGallery() {
  const { state } = useStore();
  return <div>
    <Label>Community</Label>
    <h2 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, margin: "0 0 14px" }}>Spotted at The Wall</h2>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
      {state.ugc.map(u => <Card key={u.id} pad={0} style={{ overflow: "hidden" }}>
        <div style={{ height: 130, background: `linear-gradient(135deg,${u.color},${u.color}aa)`, position: "relative" }}>
          <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,.4)", color: "#fff", padding: "4px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 700 }}>@artwalllabs</div>
        </div>
        <div style={{ padding: 12 }}><div style={{ fontSize: 12.5, color: T.ink }}>{u.note}</div><div style={{ fontSize: 11, color: T.ink3, marginTop: 6 }}>— {u.by}</div></div>
      </Card>)}
    </div>
  </div>;
}

function WalkInRegister() {
  const { dispatch } = useStore();
  const [f, setF] = useState({ name: "", contact: "", interest: "" });
  const [errs, setErrs] = useState({});
  const [done, setDone] = useState(false);
  const submit = () => {
    const e = validate(f, { name: ["required"], contact: ["required"] });
    setErrs(e); if (Object.keys(e).length) return;
    dispatch({ type: "ADD_VISITOR", entry: f });
    dispatch({ type: "TOAST", msg: "Registered — you'll get a summary email of everything you scanned." });
    setDone(true);
  };
  if (done) return <Card pad={36} style={{ textAlign: "center", maxWidth: 440, margin: "20px auto" }}><CheckCircle2 size={34} color={T.green} /><div style={{ fontSize: 17, fontWeight: 800, marginTop: 12 }}>You're in</div><div style={{ fontSize: 13, color: T.ink2, marginTop: 6 }}>Scan any artwork to start building your visit summary.</div></Card>;
  return <Card style={{ maxWidth: 440, margin: "10px auto" }}>
    <Label>Walk-in visitor</Label>
    <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 4px" }}>Register your visit</h2>
    <p style={{ fontSize: 12.5, color: T.ink2, marginBottom: 16 }}>Get a summary of every artwork you scan, and invitations to future exhibitions.</p>
    <Field label="Your name" error={errs.name}><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Phone or email" error={errs.contact}><Input value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} /></Field>
    <Field label="What draws you to art? (optional)"><Input value={f.interest} onChange={e => setF({ ...f, interest: e.target.value })} placeholder="Colour, portraits, textiles…" /></Field>
    <Btn full onClick={submit}>Register visit</Btn>
  </Card>;
}

/* ══════════════════════════════════════════════════════════════════
   ARTIST SURFACE
════════════════════════════════════════════════════════════════════ */
function ArtistApp() {
  const [page, setPage] = useState("book");
  const tabs = [["book", "Book a slot", Calendar], ["register", "Register", UserPlus], ["waitlist", "Waitlist", Clock], ["feedback", "Feedback", MessageSquare]];
  return <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 16px" }}>
    <div style={{ display: "flex", gap: 6, padding: "14px 0", flexWrap: "wrap" }}>
      {tabs.map(([id, lbl, Icon]) => <button key={id} onClick={() => setPage(id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${page === id ? T.void : T.border}`, background: page === id ? T.void : "#fff", color: page === id ? "#fff" : T.ink2 }}><Icon size={15} />{lbl}</button>)}
    </div>
    {page === "book" ? <BookingFlow /> : page === "register" ? <ArtistRegister /> : page === "waitlist" ? <WaitlistView /> : <FeedbackSurvey />}
  </div>;
}

function ArtistRegister() {
  const { dispatch } = useStore();
  const [f, setF] = useState({ name: "", email: "", phone: "", city: "Jaipur", medium: "Painting", bio: "" });
  const [errs, setErrs] = useState({});
  const [done, setDone] = useState(false);
  const submit = () => {
    const e = validate(f, { name: ["required"], email: ["required", "email"], phone: ["required", "phone"] });
    setErrs(e); if (Object.keys(e).length) return;
    dispatch({ type: "ADD_ARTIST", artist: { id: uid(), verified: false, founding: true, ...f } });
    dispatch({ type: "TOAST", msg: "Profile created — you're a Founding Member. Verify with DigiLocker before your first sale." });
    setDone(true);
  };
  if (done) return <Card pad={36} style={{ textAlign: "center", maxWidth: 460, margin: "20px auto" }}><Star size={32} color={T.amber} /><div style={{ fontSize: 18, fontWeight: 800, marginTop: 12 }}>Welcome to The Wall</div><div style={{ fontSize: 13, color: T.ink2, marginTop: 6 }}>Your Founding Member profile is live at artwalllabs.com/artist. Book your first slot anytime.</div></Card>;
  return <Card style={{ maxWidth: 520, margin: "0 auto" }}>
    <Label>Artist registration</Label>
    <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Create your profile</h2>
    <p style={{ fontSize: 12.5, color: T.ink2, marginBottom: 16 }}>First 10,000 artists are Founding Members — a permanent badge and discounted slot pricing.</p>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Field label="Full name" error={errs.name}><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="City" ><Select value={f.city} onChange={e => setF({ ...f, city: e.target.value })}>{CITIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Email" error={errs.email}><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Phone" error={errs.phone}><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="10-digit" /></Field>
    </div>
    <Field label="Primary medium"><Select value={f.medium} onChange={e => setF({ ...f, medium: e.target.value })}>{MEDIUMS.map(m => <option key={m}>{m}</option>)}</Select></Field>
    <Field label="Short bio"><textarea value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Tell people about your practice" /></Field>
    <Btn full onClick={submit}>Create profile</Btn>
  </Card>;
}

function BookingFlow() {
  const { state, dispatch } = useStore();
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState([]);
  const [duration, setDuration] = useState(7);
  const [addOns, setAddOns] = useState([]);
  const [artwork, setArtwork] = useState({ title: "", price: "", forSale: false });
  const [agreed, setAgreed] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  const available = state.slots.filter(s => s.state === "available");
  const occupancy = Math.round((1 - available.length / state.slots.length) * 100);
  const pricing = useMemo(() => picked.reduce((acc, id) => {
    const slot = state.slots.find(s => s.id === id);
    const p = priceSlot(slot, duration, addOns, occupancy);
    return { base: acc.base + p.base, addOns: acc.addOns + p.addOns, total: acc.total + p.total, surge: p.surge };
  }, { base: 0, addOns: 0, total: 0, surge: false }), [picked, duration, addOns, state, occupancy]);

  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const confirmBooking = () => {
    const artist = state.artists[0];
    dispatch({ type: "BOOK", slotIds: picked, booking: { slotId: picked[0], artistId: artist.id, amount: pricing.total, days: duration, addOns } });
    dispatch({ type: "TOAST", msg: "Booked. Confirmation and your shareable graphic are ready." });
    setConfirmed({ slots: picked, total: pricing.total, days: duration });
  };

  if (confirmed) return <ConfirmationGraphic booking={confirmed} reset={() => { setConfirmed(null); setStep(1); setPicked([]); setAddOns([]); setAgreed(false); }} />;

  const steps = ["Pick slots", "Duration", "Artwork", "Add-ons", "Agreement"];
  return <div>
    {/* stepper */}
    <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
      {steps.map((s, i) => <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, background: step > i + 1 ? T.green : step === i + 1 ? T.blue : T.bg, color: step >= i + 1 ? "#fff" : T.ink3 }}>{step > i + 1 ? <Check size={12} /> : i + 1}</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: step === i + 1 ? T.void : T.ink3 }}>{s}</span>
        {i < steps.length - 1 && <ChevronRight size={13} color={T.ink3} />}
      </div>)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 260px", gap: 18, alignItems: "start" }} className="book-grid">
      <Card>
        {step === 1 && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div><Label>Availability</Label><div style={{ fontSize: 13, color: T.ink2 }}>{available.length} of {state.slots.length} slots open{occupancy > 80 && <span style={{ color: T.amber, fontWeight: 700 }}> · surge pricing active</span>}</div></div>
          </div>
          <WallGrid slots={state.slots} selectable picked={picked} onPick={toggle} />
        </>}
        {step === 2 && <>
          <Label>Duration</Label>
          <div style={{ display: "grid", gap: 8 }}>{DURATIONS.map(d => <button key={d.id} onClick={() => setDuration(d.id)} style={{ textAlign: "left", padding: "12px 14px", border: `1px solid ${duration === d.id ? T.blue : T.border}`, background: duration === d.id ? T.blueL : "#fff", borderRadius: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: FONT }}>
            <span style={{ fontWeight: 700, color: T.ink }}>{d.label}</span>
            <span style={{ fontSize: 12, color: T.ink2 }}>{d.disc < 1 ? `${Math.round((1 - d.disc) * 100)}% off/day` : "standard rate"}</span>
          </button>)}</div>
        </>}
        {step === 3 && <>
          <Label>Your artwork</Label>
          <div style={{ borderRadius: 12, height: 140, border: `2px dashed ${T.borderH}`, display: "grid", placeItems: "center", marginBottom: 14, background: T.bg }}><div style={{ textAlign: "center", color: T.ink2 }}><Upload size={22} /><div style={{ fontSize: 12.5, marginTop: 6 }}>Upload high-res image (JPG/PNG, max 20MB)</div></div></div>
          <Field label="Title"><Input value={artwork.title} onChange={e => setArtwork({ ...artwork, title: e.target.value })} placeholder="Untitled" /></Field>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.ink, cursor: "pointer", marginBottom: 10 }}>
            <input type="checkbox" checked={artwork.forSale} onChange={e => setArtwork({ ...artwork, forSale: e.target.checked })} /> List this piece for sale
          </label>
          {artwork.forSale && <Field label="Asking price (₹)"><Input value={artwork.price} onChange={e => setArtwork({ ...artwork, price: e.target.value.replace(/\D/g, "") })} placeholder="4000" /></Field>}
        </>}
        {step === 4 && <>
          <Label>Add-ons</Label>
          <div style={{ display: "grid", gap: 8 }}>{ADD_ONS.map(a => { const on = addOns.includes(a.id); return <button key={a.id} onClick={() => setAddOns(p => on ? p.filter(x => x !== a.id) : [...p, a.id])} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: `1px solid ${on ? T.blue : T.border}`, background: on ? T.blueL : "#fff", borderRadius: 10, cursor: "pointer", fontFamily: FONT }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{on ? <CheckCircle2 size={16} color={T.blue} /> : <Circle size={16} color={T.ink3} />}<span style={{ fontWeight: 600, color: T.ink, fontSize: 13 }}>{a.label}</span></span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink2 }}>{inr(a.price)}</span>
          </button>; })}</div>
        </>}
        {step === 5 && <>
          <Label>Exhibition agreement</Label>
          <Card pad={14} style={{ background: T.bg, border: "none", maxHeight: 220, overflow: "auto", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.7 }}>
              <b style={{ color: T.ink }}>ARTWALL LABS — DIGITAL EXHIBITION AGREEMENT</b><br />
              Ref: AWL/AGR/2026/{picked[0]} · Auto-generated {`13 Aug 2026`}<br /><br />
              1. <b>Slots:</b> {picked.join(", ")} for {duration} day(s) at Ric Platter, Jaipur.<br />
              2. <b>Fee:</b> {inr(pricing.total)} inclusive of add-ons. GST applies (GSTIN 08ABFCA1595D1ZR).<br />
              3. <b>IP:</b> Artist retains all copyright. Platform holds a limited licence to display and market the work.<br />
              4. <b>Sales & royalty:</b> On sale, platform commission is 15%. On any future resale, a 4% royalty flows to the artist + 1% to the platform (ERC-2981).<br />
              5. <b>Liability & insurance:</b> Artist responsible for insuring the physical work; platform documents condition on install and removal.<br />
              6. <b>Cancellation:</b> Full refund 7+ days prior, 50% within 3–6 days, none under 3 days.
            </div>
          </Card>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: T.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
            <span>I have read and agree to the exhibition agreement, and I e-sign it electronically.</span>
          </label>
        </>}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
          <Btn variant="ghost" disabled={step === 1} icon={ChevronLeft} onClick={() => setStep(s => s - 1)}>Back</Btn>
          {step < 5 ? <Btn disabled={step === 1 && picked.length === 0} onClick={() => setStep(s => s + 1)}>Continue<ArrowRight size={15} /></Btn>
            : <Btn variant="amber" disabled={!agreed} icon={PenLine} onClick={confirmBooking}>Sign & book · {inr(pricing.total)}</Btn>}
        </div>
      </Card>

      {/* Sticky summary */}
      <Card style={{ position: "sticky", top: 12 }}>
        <Label>Summary</Label>
        <Row k="Slots" v={picked.length ? picked.join(", ") : "—"} />
        <Row k="Duration" v={`${duration} day(s)`} />
        <Row k="Base" v={inr(pricing.base)} />
        <Row k="Add-ons" v={inr(pricing.addOns)} />
        {pricing.surge && <Row k="Surge (>80%)" v="+15%" c={T.amber} />}
        <div style={{ borderTop: `1px solid ${T.border}`, margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Total</span><span style={{ fontSize: 20, fontWeight: 800, color: T.void }}>{inr(pricing.total)}</span></div>
        <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 6 }}>+ GST at checkout · Razorpay (UPI / cards / net banking)</div>
      </Card>
    </div>
  </div>;
}
function Row({ k, v, c }) { return <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}><span style={{ color: T.ink2 }}>{k}</span><span style={{ fontWeight: 600, color: c || T.ink }}>{v}</span></div>; }

function ConfirmationGraphic({ booking, reset }) {
  const { dispatch } = useStore();
  return <div style={{ maxWidth: 460, margin: "10px auto" }}>
    <Card pad={0} style={{ overflow: "hidden" }}>
      <div style={{ background: T.void, color: "#fff", padding: "30px 24px", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 70% 20%, ${T.blue}44, transparent 60%)` }} />
        <div style={{ position: "relative" }}>
          <Badge c={T.void} bg="#fff">FOUNDING MEMBER</Badge>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, margin: "14px 0 4px" }}>I'm exhibiting at The Wall</div>
          <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13.5 }}>Slot{booking.slots.length > 1 ? "s" : ""} {booking.slots.join(", ")} · {booking.days} days · Ric Platter, Jaipur</div>
          <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,.55)" }}><QrCode size={14} /> artwalllabs.com</div>
        </div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><CheckCircle2 size={18} color={T.green} /><span style={{ fontWeight: 700, fontSize: 14 }}>Booking confirmed · {inr(booking.total)} paid</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Btn variant="outline" icon={Share2} onClick={() => dispatch({ type: "TOAST", msg: "Shareable graphic downloaded — post to your story." })}>Share graphic</Btn>
          <Btn variant="ghost" onClick={reset}>Book another</Btn>
        </div>
      </div>
    </Card>
  </div>;
}

function WaitlistView() {
  const { state, dispatch } = useStore();
  const [f, setF] = useState({ name: "", city: "Jaipur", medium: "Painting", pref: "" });
  const join = () => { if (!f.name.trim()) return; dispatch({ type: "ADD_WAITLIST", entry: f }); dispatch({ type: "TOAST", msg: "Added to the waitlist — we'll notify you when a matching slot opens." }); setF({ name: "", city: "Jaipur", medium: "Painting", pref: "" }); };
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }} className="book-grid">
    <Card>
      <Label>Join the waitlist</Label>
      <p style={{ fontSize: 12.5, color: T.ink2, marginBottom: 14 }}>When the wall is full, join the priority queue — Founding Members and referred artists move up first.</p>
      <Field label="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="City"><Select value={f.city} onChange={e => setF({ ...f, city: e.target.value })}>{CITIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Medium"><Select value={f.medium} onChange={e => setF({ ...f, medium: e.target.value })}>{MEDIUMS.map(m => <option key={m}>{m}</option>)}</Select></Field>
      </div>
      <Field label="Slot preference"><Input value={f.pref} onChange={e => setF({ ...f, pref: e.target.value })} placeholder="e.g. Large / eye-level" /></Field>
      <Btn full onClick={join}>Join waitlist</Btn>
    </Card>
    <Card>
      <Label>Current queue</Label>
      {state.waitlist.map((w, i) => <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < state.waitlist.length - 1 ? `1px solid ${T.border}` : "none" }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: T.blueL, color: T.blue, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12 }}>{i + 1}</div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{w.name}</div><div style={{ fontSize: 11.5, color: T.ink2 }}>{w.city} · {w.medium} · {w.pref}</div></div>
      </div>)}
    </Card>
  </div>;
}

function FeedbackSurvey() {
  const { dispatch } = useStore();
  const [rating, setRating] = useState(0);
  const [nps, setNps] = useState(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <Card pad={36} style={{ textAlign: "center", maxWidth: 440, margin: "20px auto" }}><Heart size={30} color={T.red} /><div style={{ fontSize: 17, fontWeight: 800, marginTop: 12 }}>Thanks for the feedback</div><div style={{ fontSize: 13, color: T.ink2, marginTop: 6 }}>It goes straight into our exhibition improvement loop.</div></Card>;
  return <Card style={{ maxWidth: 480, margin: "0 auto" }}>
    <Label>Post-exhibition</Label>
    <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 14px" }}>How was your exhibition?</h2>
    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Overall experience</div>
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`} style={{ border: "none", background: "none", cursor: "pointer", padding: 2 }}><Star size={30} color={n <= rating ? T.amber : T.border} fill={n <= rating ? T.amber : "none"} /></button>)}</div>
    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Would you recommend The Wall? (0–10)</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 18 }}>{Array.from({ length: 11 }, (_, n) => <button key={n} onClick={() => setNps(n)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${nps === n ? T.blue : T.border}`, background: nps === n ? T.blue : "#fff", color: nps === n ? "#fff" : T.ink2, cursor: "pointer", fontWeight: 700, fontSize: 12.5, fontFamily: FONT }}>{n}</button>)}</div>
    <Field label="Anything we could do better?"><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} /></Field>
    <Btn full disabled={!rating} onClick={() => { dispatch({ type: "ADD_FEEDBACK", entry: { rating, nps, note } }); dispatch({ type: "TOAST", msg: "Feedback submitted" }); setDone(true); }}>Submit feedback</Btn>
  </Card>;
}

/* ══════════════════════════════════════════════════════════════════
   SHARED — WALL GRID (used by artist booking + admin editor)
════════════════════════════════════════════════════════════════════ */
function WallGrid({ slots, selectable, picked = [], onPick, editable, onSelectSlot, activeId, onDrop }) {
  const { state } = useStore();
  const cols = state.grid.cols;
  const [dragId, setDragId] = useState(null);
  const sorted = [...slots].sort((a, b) => a.row - b.row || a.col - b.col);
  const sizeH = { S: 46, M: 60, L: 78, XL: 96 };
  return <div style={{ background: T.ivory, border: `1px solid ${T.border}`, borderRadius: 14, padding: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
      {sorted.map(s => {
        const meta = SLOT_STATE_META[s.state];
        const isPicked = picked.includes(s.id);
        const canPick = selectable && s.state === "available";
        const tc = SLOT_TYPES[s.type].c;
        return <div key={s.id}
          draggable={editable}
          onDragStart={() => editable && setDragId(s.id)}
          onDragOver={e => editable && e.preventDefault()}
          onDrop={() => editable && dragId && dragId !== s.id && onDrop?.(dragId, s.id)}
          onClick={() => { if (canPick) onPick?.(s.id); else if (editable) onSelectSlot?.(s); }}
          title={`${s.id} · ${SIZE_META[s.size].label} · ${SLOT_TYPES[s.type].label} · ${meta.label}`}
          style={{
            height: sizeH[s.size], borderRadius: 9, position: "relative",
            background: isPicked ? T.blue : meta.bg,
            border: `2px solid ${isPicked ? T.blue : activeId === s.id ? T.void : "transparent"}`,
            cursor: canPick ? "pointer" : editable ? "grab" : "default",
            display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 6,
            transition: "all .12s", opacity: (selectable && s.state !== "available" && !isPicked) ? 0.55 : 1,
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: isPicked ? "#fff" : meta.c }}>{s.id}</span>
            {editable && <Grip size={11} color={isPicked ? "#fff" : T.ink3} />}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: isPicked ? "#fff" : tc, background: isPicked ? "rgba(255,255,255,.2)" : "#fff", padding: "1px 4px", borderRadius: 4 }}>{s.size}</span>
            {isPicked && <Check size={12} color="#fff" />}
          </div>
        </div>;
      })}
    </div>
    {/* legend */}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
      {Object.entries(SLOT_STATE_META).slice(0, 6).map(([k, m]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.ink2 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: m.bg, border: `1.5px solid ${m.c}` }} />{m.label}</span>)}
    </div>
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   ADMIN SURFACE
════════════════════════════════════════════════════════════════════ */
function AdminApp() {
  const [view, setView] = useState("overview");
  const items = [
    ["overview", "Overview", TrendingUp], ["wall", "Wall map", LayoutGrid], ["bookings", "Bookings", FileText],
    ["calendar", "Calendar", Calendar], ["checkin", "Check-in", ClipboardCheck], ["finance", "Finance", Wallet],
    ["community", "Community", ImageIcon],
  ];
  return <div style={{ display: "grid", gridTemplateColumns: "210px minmax(0,1fr)", gap: 0, minHeight: "calc(100vh - 60px)" }} className="admin-grid">
    <div style={{ borderRight: `1px solid ${T.border}`, padding: "16px 12px", background: "#fff" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.ink3, padding: "0 8px 10px" }}>ADMIN CONSOLE</div>
      {items.map(([id, lbl, Icon]) => <button key={id} onClick={() => setView(id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", marginBottom: 2, fontFamily: FONT, fontSize: 13, fontWeight: 600, background: view === id ? T.void : "transparent", color: view === id ? "#fff" : T.ink2, textAlign: "left" }}><Icon size={16} />{lbl}</button>)}
      <div style={{ marginTop: 14, padding: "10px", background: T.blueL, borderRadius: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: T.blue, letterSpacing: .5 }}>RBAC</div>
        <div style={{ fontSize: 11, color: T.ink2, marginTop: 4, lineHeight: 1.4 }}>You're signed in as <b>admin</b> — full override, takeover and finance access.</div>
      </div>
    </div>
    <div style={{ padding: 20, background: T.bg, overflow: "auto" }}>
      {view === "overview" ? <AdminOverview />
        : view === "wall" ? <AdminWall />
        : view === "bookings" ? <AdminBookings />
        : view === "calendar" ? <AdminCalendar />
        : view === "checkin" ? <AdminCheckin />
        : view === "finance" ? <AdminFinance />
        : <AdminCommunity />}
    </div>
  </div>;
}

function AdminOverview() {
  const { state } = useStore();
  const today = state.revenueByDay[state.revenueByDay.length - 1].v;
  const week = state.revenueByDay.reduce((s, d) => s + d.v, 0);
  const live = state.slots.filter(s => s.state === "live").length;
  const occ = Math.round((1 - state.slots.filter(s => s.state === "available").length / state.slots.length) * 100);
  const max = Math.max(...state.revenueByDay.map(d => d.v));
  return <div>
    <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Overview</h1>
    <p style={{ fontSize: 13, color: T.ink2, marginBottom: 18 }}>{state.grid.name} · Thursday, 13 Aug 2026</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
      <Stat label="Revenue today" value={inr(today)} sub="+18% vs yesterday" icon={Wallet} c={T.green} />
      <Stat label="This week" value={inr(week)} sub="7-day gross" icon={TrendingUp} c={T.blue} />
      <Stat label="Live artworks" value={live} sub={`${occ}% occupancy`} icon={LayoutGrid} c={T.amber} />
      <Stat label="Waitlist" value={state.waitlist.length} sub="priority queue" icon={Clock} c={T.purple} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 16 }} className="book-grid">
      <Card>
        <Label>Daily revenue</Label>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 150, padding: "10px 0" }}>
          {state.revenueByDay.map(d => <div key={d.d} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ height: (d.v / max) * 120, background: `linear-gradient(180deg,${T.blue},${T.blueH})`, borderRadius: 6, marginBottom: 6 }} />
            <div style={{ fontSize: 10.5, color: T.ink2, fontWeight: 600 }}>{d.d}</div>
          </div>)}
        </div>
      </Card>
      <Card>
        <Label>Alerts</Label>
        {[["2 installations due today", T.amber], ["1 slot in maintenance", T.red], ["Waitlist has a Large-slot match", T.blue]].map(([t, c], i) =>
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none" }}><AlertTriangle size={15} color={c} /><span style={{ fontSize: 12.5, color: T.ink }}>{t}</span></div>)}
      </Card>
    </div>
  </div>;
}

function AdminWall() {
  const { state, dispatch } = useStore();
  const [sel, setSel] = useState(null);
  const [rows, setRows] = useState(state.grid.rows);
  const [cols, setCols] = useState(state.grid.cols);
  const applyGrid = () => { dispatch({ type: "GRID_RESIZE", rows: +rows, cols: +cols }); dispatch({ type: "TOAST", msg: `Grid resized to ${rows}×${cols}` }); };
  const slot = sel && state.slots.find(s => s.id === sel.id);
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
      <div><h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Wall map editor</h1><p style={{ fontSize: 12.5, color: T.ink2, margin: "4px 0 0" }}>Drag slots to reorder · click a slot to configure · status follows the lifecycle state machine.</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Input value={rows} onChange={e => setRows(e.target.value.replace(/\D/g, ""))} style={{ width: 52, textAlign: "center" }} aria-label="rows" />
        <span style={{ color: T.ink3 }}>×</span>
        <Input value={cols} onChange={e => setCols(e.target.value.replace(/\D/g, ""))} style={{ width: 52, textAlign: "center" }} aria-label="cols" />
        <Btn size="sm" variant="outline" onClick={applyGrid}>Resize grid</Btn>
      </div>
    </div>
    <WallGrid slots={state.slots} editable activeId={sel?.id} onSelectSlot={setSel} onDrop={(from, to) => dispatch({ type: "SLOT_MOVE", from, to })} />

    <Modal open={!!sel} onClose={() => setSel(null)} title={`Slot ${slot?.id}`}>
      {slot && <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Size"><Select value={slot.size} onChange={e => dispatch({ type: "SLOT_UPDATE", id: slot.id, patch: { size: e.target.value } })}>{Object.entries(SIZE_META).map(([k, m]) => <option key={k} value={k}>{k} · {m.label}</option>)}</Select></Field>
          <Field label="Type"><Select value={slot.type} onChange={e => dispatch({ type: "SLOT_UPDATE", id: slot.id, patch: { type: e.target.value } })}>{Object.entries(SLOT_TYPES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Select></Field>
        </div>
        <Field label="Status"><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Badge c={SLOT_STATE_META[slot.state].c} bg={SLOT_STATE_META[slot.state].bg}>{SLOT_STATE_META[slot.state].label}</Badge></div></Field>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink2, marginBottom: 6 }}>Allowed transitions</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {SLOT_TRANSITIONS[slot.state].map(to => <button key={to} onClick={() => dispatch({ type: "SLOT_TRANSITION", id: slot.id, to })} style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#fff", cursor: "pointer", color: SLOT_STATE_META[to].c }}>→ {SLOT_STATE_META[to].label}</button>)}
          {SLOT_TRANSITIONS[slot.state].length === 0 && <span style={{ fontSize: 12, color: T.ink3 }}>Terminal state</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          <Btn variant="dark" size="sm" icon={Lock} onClick={() => { dispatch({ type: "SLOT_UPDATE", id: slot.id, patch: { state: "booked", artistId: state.artists[0].id } }); dispatch({ type: "TOAST", msg: `Force-booked ${slot.id}` }); }}>Force-book</Btn>
          <Btn variant="danger" size="sm" icon={LogOut} onClick={() => { dispatch({ type: "SLOT_UPDATE", id: slot.id, patch: { state: "available", artistId: null, artworkId: null } }); dispatch({ type: "TOAST", msg: `Force-released ${slot.id} — refund queued` }); }}>Force-release</Btn>
        </div>
      </>}
    </Modal>
  </div>;
}

function AdminBookings() {
  const { state, dispatch } = useStore();
  const rows = state.slots.filter(s => ["booked", "received", "installed", "live"].includes(s.state));
  const artist = (id) => state.artists.find(a => a.id === id)?.name || "—";
  return <div>
    <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 14px" }}>Bookings</h1>
    <Card pad={0} style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ background: T.bg }}>{["Slot", "Artist", "Size", "Type", "Status", "Actions"].map(h => <th key={h} style={{ textAlign: "left", padding: "11px 14px", fontSize: 11, fontWeight: 800, color: T.ink2, textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((s, i) => { const m = SLOT_STATE_META[s.state]; return <tr key={s.id} style={{ borderTop: `1px solid ${T.border}` }}>
          <td style={{ padding: "11px 14px", fontWeight: 800 }}>{s.id}</td>
          <td style={{ padding: "11px 14px" }}>{artist(s.artistId)}</td>
          <td style={{ padding: "11px 14px" }}>{s.size}</td>
          <td style={{ padding: "11px 14px" }}>{SLOT_TYPES[s.type].label}</td>
          <td style={{ padding: "11px 14px" }}><Badge c={m.c} bg={m.bg}>{m.label}</Badge></td>
          <td style={{ padding: "9px 14px" }}><div style={{ display: "flex", gap: 6 }}>
            <Btn size="sm" variant="outline" onClick={() => dispatch({ type: "SLOT_UPDATE", id: s.id, patch: { state: SLOT_TRANSITIONS[s.state][0] || s.state } })}>Advance</Btn>
            <Btn size="sm" variant="danger" onClick={() => { dispatch({ type: "SLOT_UPDATE", id: s.id, patch: { state: "available", artistId: null, artworkId: null } }); dispatch({ type: "TOAST", msg: `Released ${s.id}` }); }}>Release</Btn>
          </div></td>
        </tr>; })}</tbody>
      </table>
      {rows.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.ink2, fontSize: 13 }}>No active bookings.</div>}
    </Card>
  </div>;
}

function AdminCalendar() {
  const { state } = useStore();
  const days = ["11", "12", "13", "14", "15", "16", "17"];
  const bars = state.slots.filter(s => ["booked", "live", "installed"].includes(s.state)).slice(0, 8).map((s, i) => ({
    id: s.id, artist: state.artists.find(a => a.id === s.artistId)?.name || "Open call", start: i % 4, span: 2 + (i % 3), c: SLOT_STATE_META[s.state].c,
  }));
  return <div>
    <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Exhibition calendar</h1>
    <p style={{ fontSize: 12.5, color: T.ink2, marginBottom: 16 }}>Master schedule · Gantt view of overlapping bookings across the wall.</p>
    <Card pad={0} style={{ overflow: "auto" }}>
      <div style={{ minWidth: 620 }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px repeat(7,1fr)", borderBottom: `1px solid ${T.border}`, background: T.bg }}>
          <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 800, color: T.ink2 }}>SLOT</div>
          {days.map(d => <div key={d} style={{ padding: "10px", textAlign: "center", fontSize: 11.5, fontWeight: 700, color: d === "13" ? T.blue : T.ink2 }}>Aug {d}</div>)}
        </div>
        {bars.map(b => <div key={b.id} style={{ display: "grid", gridTemplateColumns: "120px repeat(7,1fr)", borderBottom: `1px solid ${T.border}`, alignItems: "center", height: 44 }}>
          <div style={{ padding: "0 14px" }}><div style={{ fontSize: 12.5, fontWeight: 800 }}>{b.id}</div><div style={{ fontSize: 10.5, color: T.ink2 }}>{b.artist}</div></div>
          <div style={{ gridColumn: `${b.start + 2} / span ${b.span}`, margin: "0 4px", height: 22, borderRadius: 6, background: b.c + "22", border: `1px solid ${b.c}`, display: "flex", alignItems: "center", padding: "0 8px" }}><span style={{ fontSize: 10.5, fontWeight: 700, color: b.c }}>{b.span}d</span></div>
        </div>)}
      </div>
    </Card>
  </div>;
}

function AdminCheckin() {
  const { state, dispatch } = useStore();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [verified, setVerified] = useState(null);
  const checklist = ["Booking QR verified", "Artwork matches uploaded specs", "Condition photos taken", "NFC tag assigned & linked", "Hung & lighting adjusted"];
  const [done, setDone] = useState([]);
  const doScan = () => {
    setScanning(true);
    setTimeout(() => {
      const booked = state.slots.find(s => s.state === "booked");
      setVerified(booked || state.slots[3]);
      setScanning(false);
      dispatch({ type: "TOAST", msg: "QR verified — identity and booking match." });
    }, 900);
  };
  const complete = () => {
    dispatch({ type: "CHECKIN", entry: { slot: verified.id, checks: done.length } });
    if (verified.state === "booked") dispatch({ type: "SLOT_UPDATE", id: verified.id, patch: { state: "installed" } });
    dispatch({ type: "TOAST", msg: `${verified.id} installed and live.` });
    setVerified(null); setDone([]); setCode("");
  };
  return <div>
    <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Installation check-in</h1>
    <p style={{ fontSize: 12.5, color: T.ink2, marginBottom: 16 }}>Scan the artist's booking QR, run the pre-install checklist, then activate the NFC tag.</p>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }} className="book-grid">
      <Card>
        <Label>Step 1 · Verify</Label>
        <div style={{ borderRadius: 12, height: 150, background: verified ? T.greenL : T.void, display: "grid", placeItems: "center", marginBottom: 12, transition: "all .2s" }}>
          {scanning ? <ScanLine size={30} color="#fff" style={{ animation: "pulse 1s infinite" }} />
            : verified ? <div style={{ textAlign: "center" }}><CheckCircle2 size={30} color={T.green} /><div style={{ fontSize: 13, fontWeight: 800, color: T.green, marginTop: 6 }}>Verified · {verified.id}</div></div>
            : <QrCode size={40} color="rgba(255,255,255,.4)" />}
        </div>
        {!verified && <Btn full icon={ScanLine} onClick={doScan} disabled={scanning}>{scanning ? "Scanning…" : "Scan booking QR"}</Btn>}
      </Card>
      <Card>
        <Label>Step 2 · Pre-install checklist</Label>
        {checklist.map((c, i) => { const on = done.includes(i); return <button key={i} disabled={!verified} onClick={() => setDone(p => on ? p.filter(x => x !== i) : [...p, i])} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0", border: "none", borderBottom: i < checklist.length - 1 ? `1px solid ${T.border}` : "none", background: "none", cursor: verified ? "pointer" : "not-allowed", fontFamily: FONT, opacity: verified ? 1 : 0.5, textAlign: "left" }}>
          {on ? <CheckCircle2 size={18} color={T.green} /> : <Circle size={18} color={T.ink3} />}<span style={{ fontSize: 13, color: T.ink, fontWeight: on ? 700 : 500 }}>{c}</span>
        </button>; })}
        <Btn full style={{ marginTop: 12 }} variant="amber" disabled={!verified || done.length < checklist.length} onClick={complete}>Activate & go live</Btn>
      </Card>
    </div>
    {state.checkins.length > 0 && <Card style={{ marginTop: 16 }}><Label>Today's check-ins</Label>{state.checkins.map(c => <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 12.5, borderBottom: `1px solid ${T.border}` }}><span style={{ fontWeight: 700 }}>{c.slot}</span><span style={{ color: T.ink2 }}>{c.at}</span></div>)}</Card>}
  </div>;
}

function AdminFinance() {
  const { state } = useStore();
  const week = state.revenueByDay.reduce((s, d) => s + d.v, 0);
  const month = week * 4.2;
  const pnl = [
    ["Slot rental revenue", month, T.green],
    ["Add-on revenue", month * 0.22, T.green],
    ["Sales commission (15%)", month * 0.18, T.green],
    ["Platform & payment fees", -month * 0.06, T.red],
    ["Venue revenue share", -month * 0.15, T.red],
    ["Operations & staff", -month * 0.28, T.red],
  ];
  const net = pnl.reduce((s, r) => s + r[1], 0);
  return <div>
    <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Finance</h1>
    <p style={{ fontSize: 12.5, color: T.ink2, marginBottom: 16 }}>Auto-generated P&amp;L · GST-compliant (GSTIN 08ABFCA1595D1ZR) · Razorpay settled.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
      <Stat label="Revenue today" value={inr(state.revenueByDay[6].v)} icon={Wallet} c={T.green} />
      <Stat label="This week" value={inr(week)} icon={TrendingUp} c={T.blue} />
      <Stat label="Projected month" value={inr(Math.round(month))} icon={Calendar} c={T.amber} />
    </div>
    <Card>
      <Label>Monthly P&amp;L (auto-generated)</Label>
      {pnl.map(([k, v, c], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13.5 }}>
        <span style={{ color: T.ink }}>{k}</span><span style={{ fontWeight: 700, color: c }}>{v < 0 ? "−" : ""}{inr(Math.abs(Math.round(v)))}</span>
      </div>)}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 0", fontSize: 15 }}><span style={{ fontWeight: 800 }}>Net profit</span><span style={{ fontWeight: 800, color: net >= 0 ? T.green : T.red }}>{inr(Math.round(net))}</span></div>
    </Card>
  </div>;
}

function AdminCommunity() {
  const { state, dispatch } = useStore();
  return <div>
    <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Community gallery</h1>
    <p style={{ fontSize: 12.5, color: T.ink2, marginBottom: 16 }}>Moderate visitor UGC before it appears on the homepage carousel.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
      {state.ugc.map(u => <Card key={u.id} pad={0} style={{ overflow: "hidden" }}>
        <div style={{ height: 110, background: `linear-gradient(135deg,${u.color},${u.color}aa)` }} />
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 12.5, color: T.ink }}>{u.note}</div>
          <div style={{ fontSize: 11, color: T.ink3, margin: "6px 0 10px" }}>— {u.by}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn size="sm" variant="outline" icon={Check} onClick={() => dispatch({ type: "TOAST", msg: "Approved for homepage" })}>Approve</Btn>
            <Btn size="sm" variant="ghost" icon={Trash2} onClick={() => dispatch({ type: "TOAST", msg: "Hidden from gallery" })}>Hide</Btn>
          </div>
        </div>
      </Card>)}
    </div>
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initStore);
  const [role, setRole] = useState(ROLES.VISITOR);
  const store = useMemo(() => ({ state, dispatch, role }), [state, role]);

  useEffect(() => {
    if (state.toast) { const t = setTimeout(() => dispatch({ type: "CLEAR_TOAST" }), 2600); return () => clearTimeout(t); }
  }, [state.toast]);

  return <Ctx.Provider value={store}>
    <div style={{ fontFamily: FONT, background: T.bg, minHeight: "100vh", color: T.ink }}>
      <style>{`
        * { box-sizing: border-box; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid ${T.blue}; outline-offset: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @media (max-width: 760px) {
          .admin-grid { grid-template-columns: 1fr !important; }
          .book-grid, .aw-grid { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      {/* Top bar */}
      <header style={{ height: 60, borderBottom: `1px solid ${T.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: T.void, display: "grid", placeItems: "center" }}><LayoutGrid size={16} color="#fff" /></div>
          <div><div style={{ fontSize: 14.5, fontWeight: 800, color: T.void, letterSpacing: -.2 }}>Artwall Labs</div><div style={{ fontSize: 10, color: T.ink3, marginTop: -2 }}>Wall Management System</div></div>
        </div>
        <div style={{ display: "flex", gap: 4, background: T.bg, padding: 4, borderRadius: 10 }}>
          {[[ROLES.VISITOR, "Visitor", Eye], [ROLES.ARTIST, "Artist", PenLine], [ROLES.ADMIN, "Admin", ShieldCheck]].map(([r, lbl, Icon]) =>
            <button key={r} onClick={() => setRole(r)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: role === r ? "#fff" : "transparent", color: role === r ? T.void : T.ink2, boxShadow: role === r ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}><Icon size={14} />{lbl}</button>)}
        </div>
      </header>

      <main style={{ paddingBottom: 40 }}>
        {role === ROLES.VISITOR ? <VisitorApp /> : role === ROLES.ARTIST ? <ArtistApp /> : <AdminApp />}
      </main>

      {/* Toast */}
      {state.toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: T.void, color: "#fff", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: "0 10px 30px rgba(0,0,0,.25)", display: "flex", alignItems: "center", gap: 8, maxWidth: 380, animation: "slideUp .2s" }}>
        <CheckCircle2 size={16} color={T.green} />{state.toast}
      </div>}
    </div>
  </Ctx.Provider>;
}
