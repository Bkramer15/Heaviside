import { useState } from 'react';
import PDUFACalendar from './PDUFACalendar.jsx';
import OptionsChain from './OptionsChain.jsx';
import { optionService } from './app.js';
import StockTrackerChart from './StockTrackerChart.jsx';

// Picks the nearest listed expiration that falls ON or AFTER the PDUFA date --
// that's the contract whose remaining life actually spans the catalyst.
// An expiration before the PDUFA date has nothing to do with the event.
function pickExpirationAfterCatalyst(expirations, pdufaDateStr) {
  // ISO date strings (YYYY-MM-DD) sort correctly as plain strings, no need
  // to parse into Date objects for comparison.
  const sorted = [...expirations].sort();
  const match = sorted.find(exp => exp >= pdufaDateStr);
  return match || sorted[sorted.length - 1] || null; // fall back to farthest-out if nothing exists past the date
}

function normalizeToISODate(dateStr) {
  // Candidate dates from the EDGAR extractor can arrive as "August 30, 2026"
  // or "08/30/2026" -- normalize to YYYY-MM-DD for comparison against
  // yfinance's expiration list, which is always ISO format.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  // Build from local parts: toISOString() converts to UTC and can shift the date by a day.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function TradingDashboard() {
  const [selectedTicker, setSelectedTicker] = useState('CAPR');

  const [selectedExpiration, setSelectedExpiration] = useState('');
  const [catalystContext, setCatalystContext] = useState(null); // shows what triggered the current view
  const [resolveError, setResolveError] = useState(null);

  // Used by typing + GO in the options box. A new ticker invalidates any
  // expiration/catalyst picked for the previous one, so those are cleared together.
  const handleTickerChange = (sym) => {
    setSelectedTicker(sym);
    setSelectedExpiration('');
    setCatalystContext(null);
    setResolveError(null);
  };

  const handleSelectCatalyst = async (catalyst) => {
    setResolveError(null);
    const isoDate = normalizeToISODate(catalyst.pdufaDateOverride || catalyst.pdufaDate);

    if (!catalyst.ticker || catalyst.ticker === '—' || !isoDate) {
      setResolveError('This catalyst is missing a ticker or a parseable date -- fix it in the calendar before selecting.');
      return;
    }

    try {
      const expirations = await optionService.getExpirations(catalyst.ticker);
      if (!expirations.length) {
        setResolveError(`${catalyst.ticker} has no listed options expirations.`);
        return;
      }

      const chosenExpiration = pickExpirationAfterCatalyst(expirations, isoDate);

      setSelectedTicker(catalyst.ticker);
      setSelectedExpiration(chosenExpiration);
      setCatalystContext({
        ticker: catalyst.ticker,
        pdufaDate: isoDate,
        chosenExpiration,
        companyName: catalyst.companyName,
      });
    } catch (err) {
      setResolveError(err.message);
    }
  };

  return (
    <div className="min-h-screen p-2 space-y-2" style={{ background: '#000' }}>

      {/* One of each. Everything follows selectedTicker. */}
      <PDUFACalendar onSelectCatalyst={handleSelectCatalyst} activeTicker={selectedTicker} />

      {resolveError && (
        <div className="max-w-[1500px] mx-auto text-sm font-mono px-3 py-2"
             style={{ border: '1px solid #FF3B3B', color: '#FF9C9C', background: '#1A0505' }}>
          {resolveError}
        </div>
      )}

      {catalystContext && (
        <div className="max-w-[1500px] mx-auto text-xs font-mono px-3 py-2"
             style={{ border: '1px solid #5C3A0C', color: '#FFA028', background: '#14100A' }}>
          Viewing {catalystContext.ticker} ({catalystContext.companyName}) —
          catalyst date {catalystContext.pdufaDate}, priced against the {catalystContext.chosenExpiration} expiration
          (nearest listed expiration on or after the catalyst).
        </div>
      )}

      <OptionsChain
        controlledTicker={selectedTicker}
        controlledExpiration={selectedExpiration}
        onSearch={handleTickerChange}
      />

      {/* lam / sigma / m were passed here before but StockTrackerChart doesn't read them */}
      <StockTrackerChart ticker={selectedTicker} />
    </div>
  );
}

export default TradingDashboard;