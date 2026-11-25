import numpy as np
from scipy.stats import norm
import pandas as pd 
from BlackScholesBackets import blackscholes_calls, blackscholes_puts
import math

#implementation of the merton closed form sum SDE 

'''the main problme we are looking to address is that we do not know how many jumps will occur 
before the expirary  thus making the pricing problem intractable

S = spot price
K = strike price
T = time to expiry
rate = risk-free-rate
sigma = diffusion volatility only
lam = jump intensity
m = mean-jump-multiplier
nu = jump-size volatilty
'''


def Merton_Calls(S, K, T, rate, sigma, lam, m, nu, n_terms=20):
    if T < 1/365:  #safeguard to check if there is no more time 
        return float(max(S-K, 0))
    
    lamda_prime = lam * m 
    total = 0.0
    
    for n in range(n_terms):
        sigma_n = np.sqrt(sigma ** 2 + n * (nu ** 2 / T))
        r_n = rate - lam * (m-1)+ (n*np.log(m))/T
        poisson_weight = np.exp(-lamda_prime*T) * (lamda_prime*T)**n / math.factorial(n)
        
        total += poisson_weight * blackscholes_calls(S, K, T, r_n, sigma_n) #recalling the parameters from the imprted BS call function
    
    return total


def Merton_Puts(S, K, T, rate, sigma, lam, m, nu, n_terms=20):
    if T < 1/365:
        return float(max(K-S, 0))
    
    lamda_prime = lam * m
    total = 0.0
    
    for n in range(n_terms):
        sigma_n = np.sqrt(sigma ** 2 + n *(nu ** 2 / T))
        r_n = rate-lam * (m-1) + (n*np.log(m))/T
        poisson_weight = np.exp(-lamda_prime * T) * (lamda_prime * T) ** n / math.factorial(n)
        
        total += poisson_weight * blackscholes_puts(S,K, T, r_n, sigma)
        
    return total


def price_merton_chain(calls_df, puts_df, S0, T, rate, sigma, lam, m, nu):
    calls = calls_df.copy()
    puts = puts_df.copy()
    
    calls["Merton_Price"] = calls.apply(
        lambda row: Merton_Calls(S0, row["Strike"], T,rate, sigma, lam, m,nu), axis=1
    )
    puts["Merton_Price"] = puts.apply(
        lambda row: Merton_Puts(S0, row["Strike"], T, rate, sigma, lam, m,nu), axis=1
    )    
    return calls, puts


if __name__ == "__main__":
    S0, K, T, r = 50.0, 50.0, 1.0, 0.04
    sigma, lam, nu, m = 0.30, 1.0, 1.0, 0.35

    call_price = Merton_Calls(S0, K, T, r, sigma, lam, m, nu)
    put_price = Merton_Puts(S0, K, T, r, sigma, lam,m, nu )
    print(f"Merton Call Price: {call_price:.4f}")
    print(f"Merton Put Price: {put_price:.4f}")
    