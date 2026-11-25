
// export default OptionsChain;

import { useState, useEffect, useRef, Fragment} from 'react';
import { optionService } from "./app.js";
import "./App.css";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  Config + helpers                                                   */
/* ------------------------------------------------------------------ */

const MODELS = [
  { key: 'BS_Price',     name: 'Black-Scholes', color: '#FF7A59' },
  { key: 'Heston_Price', name: 'Heston',        color: '#FFC857' },
  { key: 'Merton_Price', name: 'Merton',        color: '#5CC8FF' },
  { key: 'Bates_Price',  name: 'Bates',         color: '#C792EA' },
];

const BONE = '#F4EFE0';
const GRID = '#1E4450';
const DIM = '#8FA9B0';

// Backend rows are inconsistent about Strike vs strike (Bates used lowercase).
const strikeOf = (r) => r?.Strike ?? r?.strike;

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (v) => {
  if (v === null || v === undefined || v === '') return '–';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  return String(v);
};

const money = (v) => (v === null || v === undefined ? '–' : `$${v.toFixed(2)}`);

// Pull the model price out of a row, falling back to any *_Price column.
const pickPrice = (row, key) => {
  if (!row) return null;
  const k = key in row ? key : Object.keys(row).find((x) => x.endsWith('_Price'));
  return k ? num(row[k]) : null;
};

const theme = {
  '--oc-bg': '#00000',
  '--oc-panel': '#14100A',
  '--oc-line': GRID,
  '--oc-text': '#E8F1EE',
  '--oc-dim': DIM,
  '--oc-bone': BONE,
  '--oc-call': '#46C8AA',
  '--oc-put': '#FF7A59',
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap');
.oc-root { font-family: 'IBM Plex Sans', system-ui, sans-serif; font-variant-numeric: tabular-nums; background: var(--oc-bg); color: var(--oc-text); }
.oc-serif { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; letter-spacing: -0.01em; }
.oc-panel { background: var(--oc-panel); border: 1px solid var(--oc-line); border-radius: 12px; }
.oc-dim { color: var(--oc-dim); }
.oc-root :focus-visible { outline: 2px solid var(--oc-bone); outline-offset: 2px; }
.oc-root input::placeholder { color: #5E7B84; }
.oc-root input[type="date"] { color-scheme: dark; }
.oc-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
.oc-scroll::-webkit-scrollbar-thumb { background: var(--oc-line); border-radius: 4px; }
`;

/* ------------------------------------------------------------------ */
/*  Small presentational pieces                                        */
/* ------------------------------------------------------------------ */

function ChainTooltip({ active, payload, hidden }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows = MODELS
    .filter((m) => !hidden[m.key] && d[m.key] != null)
    .map((m) => ({ ...m, price: d[m.key], diff: d.Last > 0 ? d[m.key] - d.Last : null }))
    .sort((a, b) => Math.abs(a.diff ?? Infinity) - Math.abs(b.diff ?? Infinity));

  return (
    <div
      className="text-sm rounded-lg px-3 py-2 shadow-xl"
      style={{ background: '#0A1F27', border: `1px solid ${GRID}`, minWidth: 210 }}
    >
      <div className="font-semibold mb-1">Strike {d.Strike}</div>
      <div className="flex justify-between gap-6 pb-1 mb-1" style={{ borderBottom: `1px solid ${GRID}` }}>
        <span style={{ color: BONE }}>Market (last)</span>
        <span>{money(d.Last)}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex justify-between gap-6 py-0.5">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-0.5" style={{ background: r.color }} />
            {r.name}
          </span>
          <span>
            {money(r.price)}
            {r.diff !== null && (
              <span className="ml-2 text-xs" style={{ color: r.diff >= 0 ? '#FF7A59' : '#46C8AA' }}>
                {r.diff >= 0 ? '+' : '−'}{Math.abs(r.diff).toFixed(2)}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function RawTable({ rows, title }) {
  if (!rows?.length) return null;
  const columns = Object.keys(rows[0]);
  return (
    <div className="mb-5">
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      <div className="oc-scroll overflow-x-auto oc-panel">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="text-left font-medium px-3 py-2 oc-dim whitespace-nowrap"
                    style={{ borderBottom: `1px solid ${GRID}` }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className="px-3 py-1.5 whitespace-nowrap" style={{ borderBottom: `1px solid ${GRID}55` }}>
                    {fmt(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

function OptionsChain({controlledTicker, controlledExpiration, onSearch}) {
  const [ticker, setTicker] = useState('');
  const [calls, setCalls] = useState([]);
  const [puts, setPuts] = useState([]);
  const [BSCalls, setBSCalls] = useState([]);
  const [BSPuts, setblackScholesPuts] = useState([]);
  const [HestonCalls, setHestonCalls] = useState([]);
  const [HestonPuts, setHestonPuts] = useState([]);
  const [MertonCalls, setMertonCalls] = useState([]);
  const [MertonPuts, setMertonPuts] = useState([]);
  const [BatesCalls, setBatesCalls] = useState([]);
  const [batesPuts, setBatesPuts] = useState([]);
  const [ExpirationDate, setExpirationDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [current_price, setCurrent_price] = useState('');
  const [companyName, setCompanyName] = useState('');
 

  // UI-only state
  const [side, setSide] = useState('call');
  const [hidden, setHidden] = useState({});
  const [hasFetched, setHasFetched] = useState(false);
  const lastFetched = useRef({ sym: '', expiry: '' });

  const handleFetched = async (override, expiryOverride) => {
    const sym = (typeof override === 'string' ? override : ticker).trim();
    if (!sym) return;
    const expiry = expiryOverride !== undefined ? expiryOverride : ExpirationDate;
    lastFetched.current = {sym : sym.toUpperCase(), expiry: expiry || ''};
    setLoading(true);
    setError(null);
    try {
      const data = await optionService.getOptions(sym.toUpperCase(), expiry || null)
      setCalls(data.calls || []);
      setPuts(data.puts || []);
      setCurrent_price(data.current_price);
      setCompanyName(data.company_name);
      setBSCalls(data.BSCalls || []);
      setblackScholesPuts(data.BSPuts || []);
      setHestonCalls(data.HestonCalls || []);
      setHestonPuts(data.HestonPuts || []);
      setMertonCalls(data.MertonCalls || []);
      setMertonPuts(data.MertonPuts || []);
      setBatesCalls(data.BatesCalls || []);
      setBatesPuts(data.BatesPuts || []);
      setHasFetched(true);
    } catch (err) {
      setError(err.message);
      setCalls([]);
      setPuts([]);
      setCurrent_price('');
      setCompanyName('');
    } finally {
      setLoading(false);
    }
  };

  // App changed the ticker (preset on load, banner click, catalyst pick): load it.
useEffect(() => {
  if (!controlledTicker) return;
  const last = lastFetched.current;
  const sameTicker = controlledTicker.toUpperCase() === last.sym;
  const sameExpiry = !controlledExpiration || controlledExpiration === last.expiry;
  if (sameTicker && sameExpiry) return; // this component already loaded it
  setTicker(controlledTicker);
  setExpirationDate(controlledExpiration || '');
  handleFetched(controlledTicker, controlledExpiration || '');
}, [controlledTicker, controlledExpiration]);

// User typed a ticker and pressed GO: load it here and tell App so the price chart follows.
const handleGo = () => {
  const sym = ticker.trim().toUpperCase();
  if (!sym) return;
  handleFetched(sym);
  if (sym !== (controlledTicker || '').toUpperCase()) onSearch?.(sym);
};
  /* ---------- derived data ---------- */

  const spot = num(current_price);

  const modelRows = {
    call: { BS_Price: BSCalls, Heston_Price: HestonCalls, Merton_Price: MertonCalls, Bates_Price: BatesCalls },
    put:  { BS_Price: BSPuts,  Heston_Price: HestonPuts,  Merton_Price: MertonPuts,  Bates_Price: batesPuts },
  };

  const buildChartData = () => {
    const base = side === 'call' ? calls : puts;
    const lookups = MODELS.map((m) => {
      const map = new Map();
      (modelRows[side][m.key] || []).forEach((r) => map.set(num(strikeOf(r)), r));
      return map;
    });
    return base
      .map((row) => {
        const strike = num(strikeOf(row));
        if (strike === null) return null;
        const point = { Strike: strike, Last: num(row.Last) };
        MODELS.forEach((m, i) => {
          point[m.key] = pickPrice(lookups[i].get(strike), m.key);
        });
        return point;
      })
      .filter(Boolean)
      .sort((a, b) => a.Strike - b.Strike);
  };

  const chartData = buildChartData();

  const scores = MODELS
    .map((m) => {
      let n = 0, abs = 0, signed = 0;
      chartData.forEach((d) => {
        const p = d[m.key];
        if (p !== null && d.Last > 0) {
          n += 1;
          abs += Math.abs(p - d.Last);
          signed += p - d.Last;
        }
      });
      return { ...m, n, mae: n ? abs / n : null, bias: n ? signed / n : null };
    })
    .filter((s) => s.mae !== null)
    .sort((a, b) => a.mae - b.mae);
  const maxMae = Math.max(...scores.map((s) => s.mae), 0.0001);
  const maxN = Math.max(...scores.map((s) => s.n), 0);

  const atm = spot && chartData.length
    ? chartData.reduce((best, d) => (Math.abs(d.Strike - spot) < Math.abs(best.Strike - spot) ? d : best))
    : null;

  // Calls | strike | puts ladder
  const callMap = new Map(calls.map((r) => [num(strikeOf(r)), r]));
  const putMap = new Map(puts.map((r) => [num(strikeOf(r)), r]));
  const strikes = [...new Set([...callMap.keys(), ...putMap.keys()])]
    .filter((k) => k !== null)
    .sort((a, b) => a - b);
  const callCols = calls[0] ? Object.keys(calls[0]).filter((c) => c.toLowerCase() !== 'strike') : [];
  const putCols = puts[0] ? Object.keys(puts[0]).filter((c) => c.toLowerCase() !== 'strike') : [];
  const totalCols = callCols.length + putCols.length + 1;

  const itmTint = (strike, type) => {
    if (!spot) return undefined;
    const m = type === 'call' ? (spot - strike) / spot : (strike - spot) / spot;
    const rgb = type === 'call' ? '70,200,170' : '255,122,89';
    if (m > 0.05) return `rgba(${rgb},0.16)`;
    if (m > 0) return `rgba(${rgb},0.08)`;
    return undefined;
  };

  const animate =
    typeof window !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const toggleModel = (key) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  const hasData = calls.length > 0 || puts.length > 0;

  const spotRow = (key) => (
    <tr key={key}>
      <td
        colSpan={totalCols}
        className="text-center text-xs font-medium py-1"
        style={{
          background: 'rgba(244,239,224,0.10)',
          color: BONE,
          borderTop: `1px solid ${BONE}`,
          borderBottom: `1px solid ${BONE}`,
        }}
      >
        Spot price {money(spot)}
      </td>
    </tr>
  );

  /* ---------- render ---------- */

  return (
    <div className="oc-root rounded-2xl p-4 sm:p-8 max-w-7xl mx-auto" style={theme}>
      <style>{css}</style>

      {/* Command bar */}
      <div className="oc-panel flex flex-wrap items-stretch overflow-hidden">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGo()}
          placeholder="Ticker, e.g. RPRX"
          aria-label="Ticker symbol"
          className="bg-transparent px-5 py-4 text-xl uppercase flex-1 min-w-[200px] focus:outline-none"
        />
        <div className="flex items-center px-4" style={{ borderLeft: `1px solid ${GRID}` }}>
          <label className="flex items-center gap-3 text-sm oc-dim">
            Expiration
            <input
              type="date"
              value={ExpirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="bg-transparent text-sm py-3 focus:outline-none"
              style={{ color: 'var(--oc-text)' }}
            />
          </label>
        </div>
        <button
          onClick={() => handleGo()}
          disabled={loading || !ticker.trim()}
          className="px-8 py-4 text-base font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ background: BONE, color: '#091C24' }}
        >
          {loading ? 'Pricing…' : 'Price the chain'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg px-4 py-3 text-sm"
          style={{ border: '1px solid #FF7A59', background: '#000', color: '#FFB4A0' }}
        >
          Couldn’t load {ticker.toUpperCase() || 'that ticker'}: {error}. Check the symbol and expiration date, then try again.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_340px]" aria-busy="true">
          <div className="oc-panel h-[460px] motion-safe:animate-pulse" />
          <div className="oc-panel h-[460px] motion-safe:animate-pulse" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && !error && (
        <div className="mt-14 mb-10 max-w-2xl">
          <h1 className="oc-serif text-5xl sm:text-6xl leading-[1.05]">
            Where do the models disagree with the market?
          </h1>
          <p className="oc-dim mt-5 text-lg leading-relaxed">
            Pull a live options chain and see how Black-Scholes, Heston, Merton and Bates price every strike against what actually traded.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="oc-dim text-sm mr-1">Try</span>
            {['RPRX', 'SPY', 'NVDA'].map((t) => (
              <button
                key={t}
                onClick={() => {setTicker(t); handleFetched(t); onSearch?.(t);}}
                className="px-3 py-1.5 rounded-full text-sm transition-colors hover:bg-white/10"
                style={{ border: `1px solid ${GRID}` }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && hasData && (
        <>
          {/* Header */}
          <header className="mt-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="oc-serif text-5xl sm:text-6xl leading-none">
                {companyName || ticker.toUpperCase()}
              </h1>
              <p className="oc-dim mt-3 text-sm">
                {ticker.toUpperCase()} · {ExpirationDate || 'Nearest expiration'} · {strikes.length} strikes
              </p>
            </div>
            <div className="text-right">
              <div className="oc-serif text-5xl sm:text-6xl leading-none tabular-nums">
                {spot !== null ? `$${spot.toFixed(2)}` : '–'}
              </div>
              {atm && (
                <p className="oc-dim mt-3 text-sm">
                  At-the-money strike {atm.Strike}, last traded {money(atm.Last)}
                </p>
              )}
            </div>
          </header>

          {/* Hero: chart + scorecard */}
          <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="oc-panel p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">Market vs. models by strike</h2>
                <div role="group" aria-label="Option side" className="inline-flex rounded-lg p-0.5" style={{ border: `1px solid ${GRID}` }}>
                  {['call', 'put'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      aria-pressed={side === s}
                      className="px-4 py-1 text-sm rounded-md transition-colors"
                      style={side === s ? { background: BONE, color: '#14100A' } : { color: DIM }}
                    >
                      {s === 'call' ? 'Calls' : 'Puts'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="flex items-center gap-2 text-sm px-3 py-1 rounded-full" style={{ border: `1px solid ${BONE}` }}>
                  <span className="inline-block w-4 h-[3px]" style={{ background: BONE }} />
                  Market
                </span>
                {MODELS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => toggleModel(m.key)}
                    aria-pressed={!hidden[m.key]}
                    className="flex items-center gap-2 text-sm px-3 py-1 rounded-full transition-opacity"
                    style={{ border: `1px solid ${m.color}`, opacity: hidden[m.key] ? 0.35 : 1 }}
                  >
                    <span className="inline-block w-4 h-0.5" style={{ background: m.color }} />
                    {m.name}
                  </button>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={420}>
                <ComposedChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="mktFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BONE} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={BONE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 6" vertical={false} />
                  <XAxis
                    dataKey="Strike"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: DIM, fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                  />
                  <YAxis
                    tick={{ fill: DIM, fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                    width={52}
                  />
                  <Tooltip content={<ChainTooltip hidden={hidden} />} cursor={{ stroke: DIM, strokeDasharray: '3 3' }} />
                  {spot !== null && (
                    <ReferenceLine
                      x={spot}
                      stroke={BONE}
                      strokeDasharray="4 4"
                      label={{ value: `Spot ${spot.toFixed(2)}`, position: 'insideTopRight', fill: BONE, fontSize: 12 }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="Last"
                    name="Market"
                    stroke={BONE}
                    strokeWidth={3}
                    fill="url(#mktFill)"
                    dot={false}
                    isAnimationActive={animate}
                  />
                  {MODELS.map((m) =>
                    hidden[m.key] ? null : (
                      <Line
                        key={m.key}
                        type="monotone"
                        dataKey={m.key}
                        name={m.name}
                        stroke={m.color}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        isAnimationActive={animate}
                      />
                    )
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Scorecard */}
            <aside className="oc-panel p-4 sm:p-6 flex flex-col">
              <h2 className="text-lg font-semibold">Which model is closest</h2>
              <p className="oc-dim text-sm mt-1">Average gap to the last traded price, {side}s.</p>

              {scores.length === 0 ? (
                <p className="oc-dim text-sm mt-6">No model prices to compare yet for this side.</p>
              ) : (
                <ul className="mt-6 space-y-6">
                  {scores.map((s, i) => (
                    <li key={s.key}>
                      <div className="flex items-baseline justify-between">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.color }} />
                          {s.name}
                          {i === 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: BONE, color: '#091C24' }}>
                              Closest
                            </span>
                          )}
                        </span>
                        <span className="oc-serif text-3xl">{money(s.mae)}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full" style={{ background: GRID }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(4, (s.mae / maxMae) * 100)}%`, background: s.color }}
                        />
                      </div>
                      <p className="oc-dim text-xs mt-1.5">
                        {s.bias >= 0 ? 'Overprices' : 'Underprices'} by {money(Math.abs(s.bias))} on average
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <p className="oc-dim text-xs mt-auto pt-6 leading-relaxed">
                Based on {maxN} strikes with a nonzero last price. Illiquid strikes carry stale prints, so treat this as a first look, not a verdict.
              </p>
            </aside>
          </section>

          {/* Chain ladder */}
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold">Option chain</h2>
              <p className="text-xs oc-dim flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(70,200,170,0.4)' }} />
                  In-the-money calls
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(255,122,89,0.4)' }} />
                  In-the-money puts
                </span>
              </p>
            </div>

            <div className="oc-panel oc-scroll overflow-auto max-h-[560px]">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr>
                    <th
                      colSpan={callCols.length}
                      className="sticky top-0 z-10 text-center py-2 font-semibold"
                      style={{ background: 'var(--oc-panel)', color: 'var(--oc-call)' }}
                    >
                      Calls
                    </th>
                    <th className="sticky top-0 z-10" style={{ background: 'var(--oc-panel)' }} />
                    <th
                      colSpan={putCols.length}
                      className="sticky top-0 z-10 text-center py-2 font-semibold"
                      style={{ background: 'var(--oc-panel)', color: 'var(--oc-put)' }}
                    >
                      Puts
                    </th>
                  </tr>
                  <tr>
                    {callCols.map((c) => (
                      <th key={`c-${c}`} className="sticky top-[37px] z-10 text-left font-medium px-3 py-2 oc-dim whitespace-nowrap"
                          style={{ background: 'var(--oc-panel)', borderBottom: `1px solid ${GRID}` }}>{c}</th>
                    ))}
                    <th className="sticky top-[37px] z-10 text-center font-medium px-4 py-2 whitespace-nowrap"
                        style={{ background: 'var(--oc-panel)', borderBottom: `1px solid ${GRID}`, borderLeft: `1px solid ${GRID}`, borderRight: `1px solid ${GRID}` }}>
                      Strike
                    </th>
                    {putCols.map((c) => (
                      <th key={`p-${c}`} className="sticky top-[37px] z-10 text-left font-medium px-3 py-2 oc-dim whitespace-nowrap"
                          style={{ background: 'var(--oc-panel)', borderBottom: `1px solid ${GRID}` }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strikes.map((k, i) => {
                    const showSpot =
                      spot !== null &&
                      ((i === 0 && spot <= k) || (i > 0 && strikes[i - 1] < spot && spot <= k));
                    const cRow = callMap.get(k);
                    const pRow = putMap.get(k);
                    const cTint = itmTint(k, 'call');
                    const pTint = itmTint(k, 'put');
                    return (
                      <Fragment key={k}>
                        {showSpot && spotRow(`spot-${k}`)}
                        <tr className="hover:bg-white/5">
                          {callCols.map((c) => (
                            <td key={`c-${c}`} className="px-3 py-1.5 whitespace-nowrap"
                                style={{ background: cTint, borderBottom: `1px solid ${GRID}55` }}>
                              {fmt(cRow?.[c])}
                            </td>
                          ))}
                          <td className="px-4 py-1.5 text-center font-semibold whitespace-nowrap"
                              style={{ borderBottom: `1px solid ${GRID}55`, borderLeft: `1px solid ${GRID}`, borderRight: `1px solid ${GRID}`, color: BONE }}>
                            {fmt(k)}
                          </td>
                          {putCols.map((c) => (
                            <td key={`p-${c}`} className="px-3 py-1.5 whitespace-nowrap"
                                style={{ background: pTint, borderBottom: `1px solid ${GRID}55` }}>
                              {fmt(pRow?.[c])}
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })}
                  {spot !== null && strikes.length > 0 && spot > strikes[strikes.length - 1] && spotRow('spot-end')}
                </tbody>
              </table>
            </div>
          </section>

          {/* Raw model output */}
          <details className="mt-8">
            <summary className="cursor-pointer text-sm oc-dim hover:text-white py-2">
              Raw model output ({side}s)
            </summary>
            <div className="mt-3">
              <RawTable rows={modelRows[side].BS_Price} title="Black-Scholes" />
              <RawTable rows={modelRows[side].Heston_Price} title="Heston" />
              <RawTable rows={modelRows[side].Merton_Price} title="Merton" />
              <RawTable rows={modelRows[side].Bates_Price} title="Bates" />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

export default OptionsChain;
