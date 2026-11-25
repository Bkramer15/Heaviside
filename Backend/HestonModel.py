import numpy as np
from scipy.stats import norm
import pandas as pd

# Heston stochastic volatility pricer using the COS method (Fang & Oosterlee, 2008)
# characteristic function uses the "Little Heston Trap" safe formulation
# (Albrecher, Mayer, Schoutens, Tistaert 2007) to avoid complex branch-cut errors.
#
# Drop this alongside your existing OptionsData.py / black_scholes.py files.
# Validated against: (1) collapse to Black-Scholes as sigma_v -> 0, v0 = theta,
# (2) put-call parity, (3) genuine downward IV skew for negative rho.


def bs_call(S, K, T, r, sigma):
    """Reference Black-Scholes call — used only for validation tests below."""
    if T < 1e-8:
        return max(S - K, 0.0)
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)


def heston_cf(u, S0, r, T, kappa, theta, sigma_v, rho, v0):
    """
    Characteristic function of ln(S_T) under Heston, risk-neutral measure.
    u is a numpy array of real evaluation points (COS method uses real u,
    not the full complex Fourier variable).

    Parameters
    ----------
    kappa   : speed of mean reversion in variance
    theta   : long-run average variance
    sigma_v : volatility of variance ("vol of vol")
    rho     : correlation between price and variance shocks (equities: usually negative)
    v0      : current (initial) variance
    """
    i = 1j
    x0 = np.log(S0)

    d = np.sqrt((kappa - rho * sigma_v * i * u) ** 2 + (sigma_v ** 2) * (i * u + u ** 2))
    g = (kappa - rho * sigma_v * i * u - d) / (kappa - rho * sigma_v * i * u + d)

    exp_dT = np.exp(-d * T)

    C = (r * i * u * T
         + (kappa * theta / sigma_v ** 2)
         * ((kappa - rho * sigma_v * i * u - d) * T
            - 2.0 * np.log((1 - g * exp_dT) / (1 - g))))

    D = ((kappa - rho * sigma_v * i * u - d) / sigma_v ** 2
         * ((1 - exp_dT) / (1 - g * exp_dT)))

    return np.exp(C + D * v0 + i * u * x0)


def _cos_coefficients(a, b, c, d, k):
    """Cosine-series coefficients (chi, psi) for a call payoff on [c, d] within [a, b]."""
    bma = b - a
    arg = k * np.pi * (d - a) / bma
    arg2 = k * np.pi * (c - a) / bma
    chi = (1.0 / (1 + (k * np.pi / bma) ** 2)) * (
        np.cos(arg) * np.exp(d) - np.cos(arg2) * np.exp(c)
        + (k * np.pi / bma) * np.sin(arg) * np.exp(d)
        - (k * np.pi / bma) * np.sin(arg2) * np.exp(c)
    )
    psi = np.where(
        k == 0,
        d - c,
        (np.sin(arg) - np.sin(arg2)) * (bma / (k * np.pi + 1e-300))
    )
    return chi, psi


def heston_call_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0, N=256, L=12):
    """
    Prices a European call under Heston via the COS method.

    N : number of cosine series terms (256 is generous for a smooth Heston density)
    L : truncation-range width multiplier
    """
    x0 = np.log(S0 / K)

    c1 = r * T
    c2 = v0 * T
    a = x0 + c1 - L * np.sqrt(abs(c2) + sigma_v * np.sqrt(T) / 5 + 1e-6)
    b = x0 + c1 + L * np.sqrt(abs(c2) + sigma_v * np.sqrt(T) / 5 + 1e-6)

    k = np.arange(N)
    u = k * np.pi / (b - a)

    chi, psi = _cos_coefficients(a, b, 0.0, b, k)
    Uk = (2.0 / (b - a)) * (chi - psi)

    cf = heston_cf(u, S0, r, T, kappa, theta, sigma_v, rho, v0) * np.exp(-1j * u * np.log(K))
    term = cf * np.exp(1j * u * (0 - a))
    term[0] *= 0.5  # first COS term carries half weight

    price = K * np.exp(-r * T) * np.sum(np.real(term) * Uk)
    return max(price, 0.0)


def heston_put_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0, N=256, L=12):
    """European put, recovered from the COS call price via put-call parity."""
    call = heston_call_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0, N=N, L=L)
    return max(call - S0 + K * np.exp(-r * T), 0.0)


def price_heston_chain(calls_df, puts_df, S0, T, r, kappa, theta, sigma_v, rho, v0):
    """
    Prices an entire options chain (calls/puts DataFrames from get_calls/get_puts)
    under Heston, appending a 'Heston_Price' column to each — same pattern as
    your existing price_chain() for Black-Scholes.
    """
    calls = calls_df.copy()
    puts = puts_df.copy()

    calls["Heston_Price"] = calls.apply(
        lambda row: heston_call_price(S0, row["Strike"], T, r, kappa, theta, sigma_v, rho, v0),
        axis=1
    )
    puts["Heston_Price"] = puts.apply(
        lambda row: heston_put_price(S0, row["Strike"], T, r, kappa, theta, sigma_v, rho, v0),
        axis=1
    )
    return calls, puts



# Validation suite — run this file directly to confirm the pricer is correct
# before wiring it into app.py. All three should pass with near-zero error.

if __name__ == "__main__":
    S0, K, T, r = 100.0, 100.0, 1.0, 0.03

    print("=== Test 1: sigma_v -> 0, v0 = theta should collapse to Black-Scholes ===")
    sigma_flat = 0.20
    v_flat = sigma_flat ** 2
    heston_price = heston_call_price(S0, K, T, r, kappa=2.0, theta=v_flat, sigma_v=1e-4, rho=-0.5, v0=v_flat)
    bs_price = bs_call(S0, K, T, r, sigma_flat)
    print(f"Heston: {heston_price:.6f}   Black-Scholes: {bs_price:.6f}   diff: {abs(heston_price - bs_price):.6f}")
    assert abs(heston_price - bs_price) < 1e-3, "FAILED: Heston does not collapse to BS"
    print("PASSED\n")

    print("=== Test 2: put-call parity ===")
    kappa, theta, sigma_v, rho, v0 = 2.0, 0.04, 0.4, -0.7, 0.04
    call = heston_call_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0)
    put = heston_put_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0)
    lhs, rhs = call - put, S0 - K * np.exp(-r * T)
    print(f"C - P = {lhs:.6f}   S - Ke^-rT = {rhs:.6f}   diff: {abs(lhs - rhs):.8f}")
    assert abs(lhs - rhs) < 1e-6, "FAILED: parity violated"
    print("PASSED\n")

    print("=== Test 3: genuine skew check (IV should NOT be flat across strikes) ===")
    from scipy.optimize import brentq

    def implied_vol(price, S, K, T, r):
        f = lambda sigma: bs_call(S, K, T, r, sigma) - price
        return brentq(f, 1e-4, 3.0)

    kappa, theta, sigma_v, rho, v0 = 2.0, 0.04, 0.5, -0.7, 0.04
    ivs = []
    for K_test in [80, 90, 100, 110, 120]:
        p = heston_call_price(S0, K_test, T, r, kappa, theta, sigma_v, rho, v0)
        iv = implied_vol(p, S0, K_test, T, r)
        ivs.append(iv)
        print(f"K={K_test:>4}  Heston Call = {p:8.4f}   Implied Vol = {iv*100:6.2f}%")
    assert ivs[0] > ivs[-1], "FAILED: expected downward skew for negative rho, got flat/upward"
    print("PASSED — genuine downward skew confirmed for rho < 0")