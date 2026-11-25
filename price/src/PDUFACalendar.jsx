import { useState, useEffect, useMemo } from 'react';
import { optionService } from './app.js';

const C = {
  amber: '#FFA028',
  amberDim: '#5C3A0C',
  up: '#00D26A',
  down: '#FF3B3B',
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600&display=swap');
@keyframes pdufa-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.pdufa-viewport { overflow: hidden; }
.pdufa-track { display: inline-flex; width: max-content; animation: pdufa-scroll var(--pdufa-dur, 40s) linear infinite; }
.pdufa-viewport:hover .pdufa-track,
.pdufa-viewport:focus-within .pdufa-track { animation-play-state: paused; }
.pdufa-chip:hover { background: #1A1405; }
.pdufa-chip:focus-visible { outline: 2px solid ${C.amber}; outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) {
  .pdufa-track { animation: none; }
  .pdufa-viewport { overflow-x: auto; }
}
`;

// A bare "2026-08-30" parses as UTC and shows up a day early in US timezones.
// Build ISO dates from local parts; everything else goes through Date as before.
function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(str);
}

function daysUntil(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function urgencyColor(days) {
  if (days < 0) return '#6B6B6B';
  if (days <= 7) return C.down;
  if (days <= 30) return C.amber;
  return C.up;
}

function PDUFATickerBanner({ onSelectCatalyst, activeTicker }) {
  const [catalysts, setCatalysts] = useState([]);
  const [loadingWatch, setLoadingWatch] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const loadWatchData = async () => {
      setLoadingWatch(true);
      setLoadError(false);
      try {
        const results = await optionService.getPdufaWatch();
        const rows = [];
        results.forEach((r, filingIdx) => {
          if (!r.candidate_dates?.length) return;
          const seen = new Set();
          r.candidate_dates.forEach((cd, dateIdx) => {
            if (seen.has(cd.matched_date_text)) return;
            seen.add(cd.matched_date_text);
            const match = r.company_name?.match(/\(([A-Z]{1,5})\)/);
            rows.push({
              id: `edgar-${filingIdx}-${dateIdx}`,
              ticker: match ? match[1] : '',
              // the dashboard shows this next to the chart, so strip the "(TICK)" suffix
              companyName: r.company_name?.replace(/\s*\([A-Z]{1,5}\)\s*$/, '') ?? '',
              pdufaDate: parseDate(cd.matched_date_text),
              pdufaDateOverride: cd.matched_date_text,
            });
          });
        });
        setCatalysts(rows.filter(r => !isNaN(r.pdufaDate)));
      } catch (err) {
        console.error('PDUFA watch load failed:', err);
        setLoadError(true);
      } finally {
        setLoadingWatch(false);
      }
    };
    loadWatchData();
  }, []);

  const sorted = useMemo(
    () => [...catalysts].sort((a, b) => a.pdufaDate - b.pdufaDate),
    [catalysts]
  );

  // The marquee loops by rendering two identical groups and sliding by exactly one group.
  // Each group must be wider than the screen or a gap shows, so short lists repeat inside a group.
  const reps = Math.max(1, Math.ceil(12 / Math.max(1, sorted.length)));
  const groupItems = Array.from({ length: reps }).flatMap((_, rep) => sorted.map((c) => ({ c, rep })));
  const duration = Math.max(25, groupItems.length * 2.5);

  const renderGroup = (g) =>
    groupItems.map(({ c, rep }) => {
      const days = daysUntil(c.pdufaDate);
      const active = !!c.ticker && c.ticker === (activeTicker || '').toUpperCase();
      return (
        <button
          key={`${g}-${rep}-${c.id}`}
          type="button"
          onClick={() => onSelectCatalyst?.(c)}
          tabIndex={g === 0 ? 0 : -1}
          aria-hidden={g === 1}
          title={c.companyName || undefined}
          className="pdufa-chip inline-flex items-center gap-2 px-3 py-1.5 mr-1 text-xs font-mono whitespace-nowrap cursor-pointer"
          style={active ? { background: '#2A1A04', boxShadow: `inset 0 -2px 0 ${C.amber}` } : undefined}
        >
          <span className="font-semibold" style={{ color: c.ticker ? C.amber : '#6B6B6B' }}>{c.ticker || '—'}</span>
          <span style={{ color: '#E6E6E6' }}>
            {c.pdufaDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span style={{ color: urgencyColor(days) }}>{days >= 0 ? `${days}d` : 'passed'}</span>
        </button>
      );
    });

  return (
    <div className="max-w-[1500px] mx-auto p-1 sm:p-2 pb-0">
      <style>{css}</style>
      <div
        className="flex items-stretch"
        style={{ background: '#0B0804', border: `1px solid ${C.amberDim}`, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
      >
        <div
          className="flex items-center px-3 text-xs font-semibold whitespace-nowrap"
          style={{ background: '#14100A', color: C.amber, borderRight: `1px solid ${C.amberDim}`, fontFamily: "'IBM Plex Sans Condensed', system-ui, sans-serif" }}
        >
          PDUFA watch
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-2 text-xs" style={{ color: loadError ? '#FF9C9C' : '#8A8A8A' }}>
            {loadingWatch
              ? 'Loading PDUFA dates…'
              : loadError
                ? 'Couldn’t load PDUFA dates. Check that the backend is running.'
                : 'No PDUFA dates found in recent filings.'}
          </div>
        ) : (
          <div className="pdufa-viewport flex-1 min-w-0" style={{ '--pdufa-dur': `${duration}s` }}>
            <div className="pdufa-track">
              <div className="inline-flex">{renderGroup(0)}</div>
              <div className="inline-flex">{renderGroup(1)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PDUFATickerBanner;