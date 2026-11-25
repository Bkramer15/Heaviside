import yfinance as yf
from yfinance import Ticker 
import pandas as pd
from datetime import datetime

#restructing columns from yfinance for options data
column_name = {
    "strike": "Strike",
    "lastPrice": "Last",
    "bid": "Bid",
    "ask": "Ask",
    "volume": "Vol",
    "openInterest": "OI",
    "impliedVolatility": "IV",
}


def fetch_current_price(symbol):
    try:
        ticker = yf.Ticker(symbol)
        print("Test") #test case

        df = ticker.history(period="1d", interval="1m")
    
        if not df.empty:
            return float(df['Close'].iloc[-1])

        else:
            print("no data available")
            return None
    
    except Exception as e:
        print("error fetching price: {e}")
        return None
        
        
        
def fetch_price_history(symbol, start_date=None, end_date=None, period="1y", interval="1d"):
    try:
        ticker = yf.Ticker(symbol)
        print("test2")
        
        if start_date or end_date:
            df=ticker.history(
                start=start_date, end=end_date, interval=interval
            )
        else:
            df=ticker.history(period=period, interval=interval)
            
         #check if any data was returned
        if df.empty:
            print(f"Warning: No data was found for this ticker: {ticker}")
            return pd.DataFrame()
        
        return df        
            
    except Exception as e:
        print(f"An error occured while fetching historical data for: {ticker}")
        return pd.DataFrame()

        
def get_expirations(ticker):
     stock=yf.Ticker(ticker)
     return list (stock.options)       

def clean_chain(df):
    df = df[list(column_name.keys())].rename(columns=column_name)
    df["IV"] = (df["IV"] * 100).round(2)  # yfinance gives IV as a decimal (0.284 → 28.4)
    df = df.where(pd.notnull(df), None)
    return df

def get_options_chain(ticker="CAPR", expiration_date=None):
    stock = yf.Ticker(ticker)
    
    
    if expiration_date is None:
        expirations = stock.options
        expiration_date = expirations[0] #get the nearest stock option by default
    return stock.option_chain(expiration_date)
    
    
def get_calls(ticker="CAPR", expiration_date=None):
    chain = get_options_chain(ticker,expiration_date)
    return clean_chain(chain.calls)
    
    
def get_puts(ticker="CAPR", expiration_date=None):
    chain = get_options_chain(ticker, expiration_date)
    return clean_chain(chain.puts)
    
    
if __name__ == "__main__":
    print("Fetching options data...\n")
    
    current_price = fetch_current_price("CAPR")
    print(current_price)
    
    historical_price = fetch_price_history("CAPR")
    print(historical_price)
    
    calls = get_calls("CAPR")
    puts = get_puts("CAPR")
    
    print("Calls Data:")
    print(calls.head())
    
    print("\nPuts Data:")
    print(puts.head())
    