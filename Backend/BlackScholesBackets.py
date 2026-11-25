import numpy as np
from scipy.stats import norm
import pandas as pd

# call function for the black scholes model

def blackscholes_calls(S, K, T, rate, sigma):
    if T < 1/365:
        return float(max(S - K, 0))

    d1 = (np.log(S/K) + (rate + .5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - (sigma * np.sqrt(T))

    call_price = S * norm.cdf(d1) - (K * np.exp(-rate * T) * norm.cdf(d2))
    return call_price


# put function for the black scholes model

def blackscholes_puts(S, K, T, rate, sigma):
    if T < 1/365:
        return float(max(K - S, 0))

    d1 = (np.log(S/K) + (rate + .5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - (sigma * np.sqrt(T))

    put_price = (K * np.exp(-rate * T) * norm.cdf(-d2)) - (S * norm.cdf(-d1))
    return put_price


def price_chain(calls_df, puts_df, S0, T, rate):
    calls = calls_df.copy()
    puts = puts_df.copy()

    if T < 1/365:
        # nothing meaningful to calibrate ATM vol against this close to expiry --
        # still price off whatever IV each row already has, per-row, rather than crash
        calls["BS_Price"] = calls.apply(
            lambda row: blackscholes_calls(S0, row["Strike"], T, rate, row["IV"] / 100), axis=1
        )
        puts["BS_Price"] = puts.apply(
            lambda row: blackscholes_puts(S0, row["Strike"], T, rate, row["IV"] / 100), axis=1
        )
        return calls, puts

    atm_row = calls.iloc[(calls["Strike"] - S0).abs().argsort().iloc[0]]
    atm_sigma = atm_row["IV"] / 100

    calls["BS_Price"] = calls.apply(
        lambda row: blackscholes_calls(S0, row["Strike"], T, rate, atm_sigma), axis=1
    )
    puts["BS_Price"] = puts.apply(
        lambda row: blackscholes_puts(S0, row["Strike"], T, rate, atm_sigma), axis=1
    )
    return calls, puts


if __name__ == "__main__":
    # standalone test now needs to fetch its own data first, since price_chain
    # no longer does that internally
    from OptionsData import fetch_current_price, get_calls, get_puts
    from datetime import datetime

    ticker, expiration_date, rate = "RPRX", "2026-08-21", 0.045
    S0 = fetch_current_price(ticker)
    calls_df = get_calls(ticker, expiration_date)
    puts_df = get_puts(ticker, expiration_date)
    T = (datetime.strptime(expiration_date, "%Y-%m-%d") - datetime.now()).days / 365

    calls, puts = price_chain(calls_df, puts_df, S0, T, rate)
    print(calls[["Strike", "IV", "BS_Price", "Last"]].head())