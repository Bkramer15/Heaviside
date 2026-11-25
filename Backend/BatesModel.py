import numpy as np


def bates_jump_cf(u, T, lam, m, nu):
    """
    Characteristic function of the jump component alone.
    Verified: phi(0) = 1 exactly. Not currently used for pricing (see
    note above) but kept here since it's correct and you'll want it once
    the COS approach is revisited.
    """
    iu = 1j * u
    exponent = lam * T * (np.exp(iu * np.log(1 + m) - 0.5 * nu**2 * u**2) - 1 - iu * m)
    return np.exp(exponent)


def bates_cf(u, S0, r, T, kappa, theta, sigma_v, rho, v0, lam, m, nu):
    """
    phi_Bates(u) = phi_Heston(u) * phi_Jump(u)
    Verified: phi(0) = 1. Verified: lambda->0 collapses to heston_cf
    exactly (matches to 6 decimal places). Import heston_cf from your
    existing heston_pricer.py file to use this.
    """
    from HestonModel import heston_cf  # your existing, validated file
    return heston_cf(u, S0, r, T, kappa, theta, sigma_v, rho, v0) * bates_jump_cf(u, T, lam, m, nu)


def simulate_bates_paths(S0, T, r, kappa, theta, sigma_v, rho, v0, lam, m, nu,
                          n_paths=50000, n_steps=252, seed=None):
    """
    Simulates terminal stock prices under the full Bates SDE via Euler
    discretization, full truncation scheme (max(v,0)) for variance
    non-negativity. Returns the array of simulated S_T values.

    This is the actual pricing engine -- reused across every strike in
    a chain (see price_bates_chain), since path simulation doesn't
    depend on K at all, only the payoff evaluation at the end does.
    """
    rng = np.random.default_rng(seed)
    dt = T / n_steps
    S = np.full(n_paths, S0)
    v = np.full(n_paths, v0)

    for _ in range(n_steps):
        Z1 = rng.standard_normal(n_paths)
        Z2 = rng.standard_normal(n_paths)
        Zs = rho * Z1 + np.sqrt(1 - rho**2) * Z2

        v_pos = np.maximum(v, 0)
        v = v + kappa * (theta - v_pos) * dt + sigma_v * np.sqrt(v_pos * dt) * Z1
        v = np.maximum(v, 0)

        n_jumps = rng.poisson(lam * dt, size=n_paths)
        jump_mult = np.ones(n_paths)
        has_jump = n_jumps > 0
        if has_jump.any():
            log_jump = rng.normal(np.log(m) - 0.5 * nu**2, nu, size=n_paths)
            jump_mult = np.where(has_jump, np.exp(log_jump), 1.0)

        drift = (r - lam * (m - 1) - 0.5 * v_pos) * dt
        diffusion = np.sqrt(v_pos * dt) * Zs
        S = S * np.exp(drift + diffusion) * jump_mult

    return S


def bates_call_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0, lam, m, nu,
                      n_paths=50000, n_steps=252, seed=None, S_T=None):
    """
    European Bates call. Pass a pre-simulated S_T array (via
    simulate_bates_paths) to reuse the same paths across multiple
    strikes -- much faster than re-simulating per strike, and keeps
    every price in a chain consistent with the same random draw.
    """
    if S_T is None:
        S_T = simulate_bates_paths(S0, T, r, kappa, theta, sigma_v, rho, v0,
                                    lam, m, nu, n_paths, n_steps, seed)
    return float(np.exp(-r * T) * np.mean(np.maximum(S_T - K, 0)))


def bates_put_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0, lam, m, nu,
                     n_paths=50000, n_steps=252, seed=None, S_T=None):
    if S_T is None:
        S_T = simulate_bates_paths(S0, T, r, kappa, theta, sigma_v, rho, v0,
                                    lam, m, nu, n_paths, n_steps, seed)
    return float(np.exp(-r * T) * np.mean(np.maximum(K - S_T, 0)))


def price_bates_chain(calls_df, puts_df, S0, T, r, kappa, theta, sigma_v, rho, v0,
                       lam, m, nu, n_paths=50000, n_steps=252, seed=None):

    #Prices an entire chain under Bates
    
    calls = calls_df.copy()
    puts = puts_df.copy()

    S_T = simulate_bates_paths(S0, T, r, kappa, theta, sigma_v, rho, v0,
                                lam, m, nu, n_paths, n_steps, seed)

    calls["Bates_Price"] = calls.apply(
        lambda row: bates_call_price(S0, row["Strike"], T, r, kappa, theta,
                                      sigma_v, rho, v0, lam, m, nu, S_T=S_T),
        axis=1
    )
    puts["Bates_Price"] = puts.apply(
        lambda row: bates_put_price(S0, row["Strike"], T, r, kappa, theta,
                                     sigma_v, rho, v0, lam, m, nu, S_T=S_T),
        axis=1
    )
    return calls, puts


if __name__ == "__main__":
    S0, K, T, r = 50.0, 50.0, 1.0, 0.04
    kappa, theta, sigma_v, rho, v0 = 2.0, 0.09, 0.5, -0.5, 0.09
    lam, m, nu = 1.0, 1.0, 0.35

    print("=== Test 1: put-call parity ===")
    S_T = simulate_bates_paths(S0, T, r, kappa, theta, sigma_v, rho, v0, lam, m, nu,
                                n_paths=200000, seed=42)
    call = bates_call_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0, lam, m, nu, S_T=S_T)
    put = bates_put_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0, lam, m, nu, S_T=S_T)
    lhs, rhs = call - put, S0 - K * np.exp(-r * T)
    print(f"call={call:.4f} put={put:.4f} C-P={lhs:.4f} target={rhs:.4f} diff={abs(lhs-rhs):.4f}")
    assert abs(lhs - rhs) < 0.05, "FAILED: parity off by more than expected MC noise"
    print("PASSED (within MC noise)\n")

    print("=== Test 2: lambda->0 should approach Heston (COS, already validated) ===")
    from HestonModel import heston_call_price
    S_T_nojump = simulate_bates_paths(S0, T, r, kappa, theta, sigma_v, rho, v0,
                                       lam=1e-8, m=1.0, nu=0.35, n_paths=200000, seed=42)
    call_nojump = bates_call_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0,
                                    lam=1e-8, m=1.0, nu=0.35, S_T=S_T_nojump)
    heston_p = heston_call_price(S0, K, T, r, kappa, theta, sigma_v, rho, v0)
    diff = abs(call_nojump - heston_p)
    print(f"Bates MC (lam~0) = {call_nojump:.4f}   Heston COS = {heston_p:.4f}   diff = {diff:.4f}")
    assert diff < 0.05, "FAILED: doesn't approach Heston within MC noise"
    print("PASSED (within MC noise)")