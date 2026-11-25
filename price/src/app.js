const API_BASE = import.meta.env.VITE_API_BASE || '';  //leave as a empty string

export const optionService = {
  async getOptions(ticker, expirationDate) {
    const url = expirationDate
      ? `${API_BASE}/options/${ticker}?expiration_date=${expirationDate}`
      : `${API_BASE}/options/${ticker}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch options for ${ticker}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to load options');
    }
    
    return {
      BatesCalls:data.BatesCalls,
      BatesPuts:data.BatesPuts,
      MertonCalls:data.MertonCalls,
      MertonPuts:data.MertonPuts,
      HestonCalls:data.HestonCalls,
      HestonPuts: data.HestonPuts,
      BSCalls: data.BSCalls,
      BSPuts: data.BSPuts,
      current_price: data.current_price,
      calls: data.calls,
      puts: data.puts
    };
  },

  async getExpirations(ticker) {
    const response = await fetch(`${API_BASE}/expirations/${ticker}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch expirations for ${ticker}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load expirations');
    }

    return data.expirations;
  },

  async getPriceHistory(ticker) {
    const response = await fetch(`${API_BASE}/History/${ticker}`);

    if (!response.ok){
      throw new Error(`Failed to pull Historical data for ${ticker}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load Historical Data');
    }

    return {
      historical_price: data.historical_price,
      Vol_1yr: data.Vol_1yr,
      Vol_Mon: data.Vol_Mon,
      MarketHigh: data.MarketHigh,
      MarketLow: data.MarketLow
    }
  },

async getPdufaWatch() {
  const response = await fetch(`${API_BASE}/pdufa-watch`);

  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    const text = await response.text();
    console.error('PDUFA API error:', response.status, text);

    throw new Error(
      `Failed to fetch PDUFA watch data (${response.status})`
    );
  }

  if (!contentType?.includes('application/json')) {
    const text = await response.text();

    console.error('Expected JSON but received:', {
      status: response.status,
      contentType,
      response: text.slice(0, 500)
    });

    throw new Error('PDUFA endpoint returned HTML instead of JSON');
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to load PDUFA data');
  }

  return data.results;
},
async getPdufaHistory(ticker) {
  const response = await fetch(`${API_BASE}/PDUFAHistory/${ticker}`);

  if (!response.ok) {
    throw new Error(`Failed to pull PDUFA history for ${ticker}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to load PDUFA history');
  }

  return data.pdufa_history;
},
};