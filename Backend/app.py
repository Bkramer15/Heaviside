from flask import Flask, jsonify, request,json
from flask_cors import CORS
import numpy as np
from datetime import datetime
import os
import math
import pandas as pd

#import the data loader file
from OptionsData import fetch_current_price, get_calls, get_puts, get_expirations,fetch_price_history
from BlackScholesBackets import price_chain #importing the price caller function in black scholes model
from HestonModel import price_heston_chain
from MertonModel import price_merton_chain
from BatesModel import price_bates_chain #please review code strucutre
from PDUFAEdgarTracker import run_watch_cycle, fetch_pdufa_history


app = Flask(__name__)
CORS(app)  # allows for the connection for the react app

def df_to_records(df):
    return df.replace({np.nan: None}).to_dict(orient="records")


#create the small functions to calculate te realized vol(1-2) and 52 week high/low
#call these channges in the hsitory function right before it gets converted to JSON



def Realized_volatility(prices):
    log_returns  = np.log(prices/prices.shift())
    daily_std = log_returns.std()
    annualized_returns = daily_std * np.sqrt(252)
    annualized_returns = (annualized_returns * 100).round(2)
    return annualized_returns 
    

def CalculateMarketHigh(prices):
    MarketHigh = prices.max()
    MarketHigh = MarketHigh.round(2)
    return MarketHigh
    

def CalculateMarketLow(prices):
    MarketLow = prices.min()
    MarketLow  = MarketLow.round(2)
    return MarketLow
  


@app.route('/History/<Ticker>', methods=['GET'])
def get_historical(Ticker):
    try:
        Historical_price = fetch_price_history(Ticker)
        Historical_Close = Historical_price["Close"]
        Vol_1yr = Realized_volatility(Historical_Close)
        Vol_Mon = Realized_volatility(Historical_Close.tail(21))
        MarketHigh = CalculateMarketHigh(Historical_Close)
        MarketLow = CalculateMarketLow(Historical_Close)
        Historical_price = Historical_price.reset_index() #resets the dataframe's index into a real column before converting to JSON 
        historical_price = Historical_price.to_dict(orient="records")
        # Data_dump = json.dumps(Historical_data)
        return jsonify({"success": True,
                        "historical_price": historical_price,
                        "Vol_1yr": Vol_1yr,
                        "Vol_Mon": Vol_Mon,
                        "MarketHigh":MarketHigh,
                        "MarketLow": MarketLow
                        })
    except Exception as e:
        return jsonify({"succes": False, "error": str(e)}), 500

@app.route('/options/<Ticker>', methods=['GET'])
def get_options(Ticker):
    try:
        expiration_date = request.args.get('expiration_date')
        rate = 0.045

        current_price = fetch_current_price(Ticker)
        calls = get_calls(Ticker, expiration_date) if expiration_date else get_calls(Ticker)
        puts = get_puts(Ticker, expiration_date) if expiration_date else get_puts(Ticker)

        if not expiration_date:
            import yfinance as yf
            expiration_date = yf.Ticker(Ticker).options[0]

        T = max((datetime.strptime(expiration_date, "%Y-%m-%d") - datetime.now()).days / 365, 0)

        BSCalls, BSPuts = price_chain(calls, puts, S0=current_price, T=T, rate=rate)

        atm_row = calls.iloc[(calls["Strike"] - current_price).abs().argsort().iloc[0]]
        atm_var = (atm_row["IV"] / 100) ** 2

        HestonCalls, HestonPuts = price_heston_chain(
            calls, puts, S0=current_price, T=T, r=rate,
            kappa=2.0, theta=atm_var, sigma_v=0.5, rho=-0.5, v0=atm_var
        )
        
        MertonCalls, MertonPuts = price_merton_chain(
            calls, puts, S0=current_price, T=T, rate=rate,
            sigma=0.38, lam=1.0, nu=0.35, m=1.0
        )
        
        BatesCalls, BatesPuts = price_bates_chain(
            calls, puts, S0=current_price, T=T, r=rate,
            kappa=2.0, theta=atm_var, sigma_v=0.5, rho=-0.5, v0=atm_var,
            lam=1.0, m=1.0, nu=0.35
        )
        

        return jsonify({
            "success": True,
            "current_price": current_price,
            "calls": df_to_records(calls),
            "puts": df_to_records(puts),
            "BSCalls": df_to_records(BSCalls),
            "BSPuts": df_to_records(BSPuts),
            "HestonCalls": df_to_records(HestonCalls),
            "HestonPuts": df_to_records(HestonPuts),
            "MertonCalls": df_to_records(MertonCalls),
            "MertonPuts": df_to_records(MertonPuts),
            "BatesCalls": df_to_records(BatesCalls),
            "BatesPuts": df_to_records(BatesPuts)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/expirations/<Ticker>', methods=['GET'])
def get_expirations_route(Ticker):
    try:
        expirations = get_expirations(Ticker)
        return jsonify({"success": True, "expirations": expirations})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    
    
@app.route('/pdufa-watch', methods=['GET'])
def get_pdufa_route():
    try:
        path = os.path.join(os.path.dirname(__file__), 'pdufa_watch_results.json')
        with open(path) as f:
            data = json.load(f)
        return jsonify({"success": True, "results": data})
    except FileNotFoundError:
        return jsonify({"success": True, "results": []})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    
    
@app.route('/PDUFAHistory/<Ticker>', methods=['GET'])
def get_pdufa_history(Ticker):
    try:
        history = fetch_pdufa_history(Ticker)
        return jsonify({"success": True, "pdufa_history": history})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    
if __name__ == '__main__':
    app.run(debug=True, port=5000)