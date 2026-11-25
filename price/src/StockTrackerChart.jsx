import { useState, useEffect } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import { optionService } from './app.js';

// Assumes a backend route like GET /history/<Ticker> returning
// historical_price: [{ Date, Close }, ...] (lowercase date/close also accepted)

const C = {
  amber: '#FFA028',
  amberDim: '#5C3A0C',
  up: '#00D26A',
  down: '#FF3B3B',
  white: '#FFFFFF',
  grid: '#1F1F1F',
  axis: '#8A8A8A',
  line: '#2B2B2B',
};

const axisTick = { fill: C.axis, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" };

const css = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600&display=swap');
.bt-root { background: #000; color: #E6E6E6; font-family: 'IBM Plex Sans Condensed', system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.bt-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.bt-amber { color: #FFA028; }
.bt-dim { color: #8A8A8A; }
.bt-panel { background: #080808; border: 1px solid #2B2B2B; }
.bt-title { background: #14100A; border-bottom: 1px solid #5C3A0C; }
.bt-root :focus-visible { outline: 2px solid #FFA028; outline-offset: 1px; }
`;

const num = (v) => {
  if (v === null || v === undefined || v === '' || Array.isArray(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const money = (v) => (v === null ? '–' : `$${v.toFixed(2)}`);
const pct = (v) => (v === null ? '–' : `${v.toFixed(1)}%`);

const fmtDate = (t, long = false) =>
  new Date(t).toLocaleDateString('en-US', long
    ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: '2-digit', timeZone: 'UTC' });

// PDUFA label layout: labels that would overlap get stacked into separate rows.
const LANE_H = 14;
const CHAR_W = 6.4;
const LABEL_GAP = 8;
const PLOT_INSET = 68; // left axis (52) + right margin (16)
const DAY = 86400000;

function MarkerLabel({ viewBox, text, lane = 0, anchor = 'start' }) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const ty = y - 6 - lane * LANE_H;
  return (
    <g>
      {lane > 0 && (
        <line x1={x} x2={x} y1={y} y2={ty + 3} stroke={C.amber} strokeOpacity={0.5} strokeWidth={1} />
      )}
      <text
        x={anchor === 'end' ? x - 3 : x + 3}
        y={ty}
        textAnchor={anchor}
        fill={C.amber}
        fontSize={11}
        fontFamily="'IBM Plex Mono', monospace"
      >
        {text}
      </text>
    </g>
  );
}

function PriceTip({ active, payload, markers = [] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const near = markers.filter((m) => Math.abs(m.t - d.t) <= 2 * DAY);
  return (
    <div className="bt-mono text-xs px-3 py-2" style={{ background: '#000', border: `1px solid ${C.amber}` }}>
      <div className="bt-amber mb-1">{fmtDate(d.t, true)}</div>
      <div className="flex justify-between gap-5"><span>Close</span><span>{money(d.Close)}</span></div>
      {near.map((m, i) => (
        <div key={i} className="mt-1 bt-amber">{m.label}</div>
      ))}
    </div>
  );
}

function StockTrackerChart({ ticker }) {
  const [history, sethistory] = useState([]);
  const [Vol_1yr, setVol_1yr] = useState(null);
  const [Vol_Mon, setVol_Mon] = useState(null);
  const [MarketHigh, setMarketHigh] = useState(null);
  const [MarketLow, setMarketLow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdufaMarkers, setPdufaMarkers] = useState([]);
  const [chartW, setChartW] = useState(900); // measured by ResponsiveContainer, used to lay out PDUFA labels

  useEffect(() => {
    if (!ticker) return;

    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await optionService.getPriceHistory(ticker);
        sethistory(data.historical_price ?? []);
        setVol_1yr(data.Vol_1yr ?? null);
        setVol_Mon(data.Vol_Mon ?? null);
        setMarketHigh(data.MarketHigh ?? null);
        setMarketLow(data.MarketLow ?? null);
      } catch (err) {
        setError(err.message);
        sethistory([]);
        setVol_1yr(null);
        setVol_Mon(null);
        setMarketHigh(null);
        setMarketLow(null);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;

    const loadPdufaHistory = async () => {
      try {
        const markers = await optionService.getPdufaHistory(ticker);
        setPdufaMarkers(markers ?? []);
      } catch (err) {
        console.error('Failed to load PDUFA history:', err);
        setPdufaMarkers([]);
      }
    };

    loadPdufaHistory();
  }, [ticker]);

  if (!ticker) return null;

  /* ---------- derived data (display only) ---------- */

  // Normalize rows so Date/date, Close/close and string/epoch dates all work.
  const rows = (Array.isArray(history) ? history : [])
    .map((r) => {
      const t = new Date(r?.Date ?? r?.date).getTime();
      const Close = num(r?.Close ?? r?.close);
      return Number.isFinite(t) && Close !== null ? { t, Close } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  // Markers use real timestamps, so they don't need to match a data date exactly.
  // Anything outside the plotted range is dropped.
  const markers = (Array.isArray(pdufaMarkers) ? pdufaMarkers : [])
    .map((m) => ({ t: new Date(m?.date ?? m?.Date).getTime(), label: m?.label ?? m?.Label ?? 'PDUFA' }))
    .filter((m) => Number.isFinite(m.t) && rows.length > 0 && m.t >= rows[0].t && m.t <= rows[rows.length - 1].t);

  // Assign each marker a row (lane) so labels never overlap. Labels read left to right
  // from the line; near the right edge they flip to read right to left.
  const plotW = Math.max(200, chartW - PLOT_INSET);
  const span = rows.length > 1 ? rows[rows.length - 1].t - rows[0].t : 1;
  const laneBoxes = [];
  const laidOut = [...markers]
    .sort((a, b) => a.t - b.t)
    .map((m) => {
      const w = m.label.length * CHAR_W + 6;
      const px = ((m.t - rows[0].t) / span) * plotW;
      const flip = px + w > plotW;
      const s = flip ? px - w : px;
      const e = flip ? px : px + w;
      let lane = laneBoxes.findIndex((boxes) => boxes.every(([bs, be]) => e + LABEL_GAP <= bs || s >= be + LABEL_GAP));
      if (lane === -1) { laneBoxes.push([]); lane = laneBoxes.length - 1; }
      laneBoxes[lane].push([s, e]);
      return { ...m, lane, anchor: flip ? 'end' : 'start' };
    });
  const laneCount = laneBoxes.length;
  const chartTop = 12 + laneCount * LANE_H;

  const last = rows.length ? rows[rows.length - 1].Close : null;
  const first = rows.length ? rows[0].Close : null;
  const change = last !== null && first ? ((last - first) / first) * 100 : null;
  const lo = rows.length ? Math.min(...rows.map((r) => r.Close)) : 0;
  const hi = rows.length ? Math.max(...rows.map((r) => r.Close)) : 1;
  const yDomain = [Math.floor(lo * 0.97 * 100) / 100, Math.ceil(hi * 1.03 * 100) / 100];

  const high = num(MarketHigh);
  const low = num(MarketLow);
  const rangePos = last !== null && high !== null && low !== null && high > low
    ? Math.min(1, Math.max(0, (last - low) / (high - low)))
    : null;

  const animate =
    typeof window !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stats = [
    { label: 'Realized vol (full year)', value: pct(num(Vol_1yr)), labelColor: C.axis },
    { label: 'Realized vol (1–2 months)', value: pct(num(Vol_Mon)), labelColor: C.axis },
    { label: '52 week high', value: money(high), labelColor: C.up },
    { label: '52 week low', value: money(low), labelColor: C.down },
  ];

  return (
    <div className="bt-root p-1 sm:p-2 max-w-[1500px] mx-auto">
      <style>{css}</style>

      {/* Header strip */}
      <div className="bt-panel px-4 py-3 mb-0.5 flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div>
          <div className="bt-amber bt-mono text-3xl font-semibold leading-none">{ticker.toUpperCase()}</div>
          <div className="text-sm mt-1.5 bt-dim">Price history</div>
        </div>
        <div className="flex gap-x-8 bt-mono">
          <div>
            <div className="bt-dim text-[11px] font-sans">Last close</div>
            <div className="text-lg font-medium">{money(last)}</div>
          </div>
          <div>
            <div className="bt-dim text-[11px] font-sans">Change over window</div>
            <div className="text-lg font-medium" style={{ color: change === null ? C.white : change >= 0 ? C.up : C.down }}>
              {change === null ? '–' : `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`}
            </div>
          </div>
          <div>
            <div className="bt-dim text-[11px] font-sans">PDUFA events</div>
            <div className="text-lg font-medium bt-amber">{markers.length}</div>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-0.5 px-3 py-2 text-sm bt-mono" style={{ border: `1px solid ${C.down}`, color: '#FF9C9C', background: '#1A0505' }}>
          Couldn’t load price history for {ticker.toUpperCase()}: {error}. Check that the ticker is valid and the backend is running.
        </div>
      )}

      {/* Price chart */}
      <section className="bt-panel mb-0.5 transition-opacity" style={{ opacity: loading ? 0.5 : 1 }}>
        <header className="bt-title flex items-center justify-between px-3 py-1.5">
          <h2 className="bt-amber text-xs font-semibold uppercase">Price history — {ticker.toUpperCase()}</h2>
          <span className="flex items-center gap-1.5 text-[11px] bt-dim">
            <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: C.amber }} />
            PDUFA date
          </span>
        </header>
        <div className="p-3">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center text-sm bt-dim bt-mono text-center px-4" style={{ height: 320 }}>
              {loading ? 'Loading price history…' : `No price history returned for ${ticker.toUpperCase()}`}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320 + laneCount * LANE_H} onResize={(w) => setChartW(Math.round(w))}>
              <ComposedChart data={rows} margin={{ top: chartTop, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pxFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.grid} strokeDasharray="2 4" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t) => fmtDate(t)}
                  tickCount={8}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: C.line }}
                />
                <YAxis
                  domain={yDomain}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                />
                <Tooltip content={<PriceTip markers={markers} />} cursor={{ stroke: C.amber, strokeDasharray: '3 3' }} />
                {laidOut.map((m, i) => (
                  <ReferenceLine
                    key={`${m.t}-${i}`}
                    x={m.t}
                    stroke={C.amber}
                    strokeDasharray="4 3"
                    label={<MarkerLabel text={m.label} lane={m.lane} anchor={m.anchor} />}
                  />
                ))}
                <Area type="monotone" dataKey="Close" stroke="none" fill="url(#pxFill)" isAnimationActive={animate} />
                <Line type="monotone" dataKey="Close" stroke={C.white} strokeWidth={2} dot={false} isAnimationActive={animate} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0.5">
        {stats.map((s) => (
          <div key={s.label} className="bt-panel px-4 py-3">
            <div className="text-xs font-semibold mb-1" style={{ color: s.labelColor }}>{s.label}</div>
            <div className="bt-mono text-2xl">{s.value}</div>
          </div>
        ))}
      </div>

      {/* 52-week range */}
      {rangePos !== null && (
        <div className="bt-panel px-4 py-3 mt-0.5">
          <div className="flex justify-between text-xs bt-mono mb-2">
            <span style={{ color: C.down }}>{money(low)}</span>
            <span className="bt-dim font-sans">Last close within the 52 week range</span>
            <span style={{ color: C.up }}>{money(high)}</span>
          </div>
          <div className="relative h-1.5" style={{ background: `linear-gradient(90deg, ${C.down}, ${C.amberDim} 50%, ${C.up})` }}>
            <div
              className="absolute -top-1 w-0.5 h-3.5"
              style={{ left: `calc(${(rangePos * 100).toFixed(1)}% - 1px)`, background: C.white }}
              aria-label={`Last close ${money(last)}`}
            />
          </div>
        </div>
      )}

      {/* Status bar */}
      <footer className="mt-0.5 px-3 py-1.5 flex flex-wrap gap-x-6 gap-y-1 text-[11px] bt-mono bt-dim" style={{ background: '#14100A', borderTop: `1px solid ${C.amberDim}` }}>
        <span>{loading ? 'Loading…' : error ? 'Error' : 'Ready'}</span>
        <span>Closes {rows.length}</span>
        {rows.length > 0 && <span>{fmtDate(rows[0].t, true)} to {fmtDate(rows[rows.length - 1].t, true)}</span>}
        <span>PDUFA markers {markers.length} of {Array.isArray(pdufaMarkers) ? pdufaMarkers.length : 0} in range</span>
      </footer>
    </div>
  );
}

export default StockTrackerChart;