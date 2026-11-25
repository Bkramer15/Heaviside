# Heaviside

![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![Status](https://img.shields.io/badge/status-in%20development-orange.svg)

**Pricing binary biotech catalysts as step functions.**

Heaviside is a quantitative research project on implied volatility around binary biopharma events: PDUFA dates, Phase 2/3 readouts, and AdCom votes. It is named after the Heaviside step function, which is flat until a single point and then jumps. Small- and mid-cap biotech stocks often behave the same way around a catalyst.

The core question: **is the options market correctly pricing the size and probability of the jump?**

---

## Thesis

- Ahead of a binary catalyst, option prices assume large moves in either direction. After the event, implied volatility collapses, which is called an IV crush.
- The real outcome is usually **bimodal**: the stock either gaps up on approval or positive data, or gaps down on a CRL or failed endpoint. A smooth lognormal distribution (as in Black-Scholes) misprices this.
- If the probability of success and the size of the jump in each direction can be estimated independently, the gap between the **market-implied move** and the **model-implied move** is a tradeable signal.

## Methodology

1. **Event dataset:** historical catalyst dates, outcomes, and pre/post-event prices.
2. **Implied move extraction:** the expected move implied by the at-the-money straddle price before the event.
3. **Monte Carlo simulation:** price paths are simulated under three models of increasing complexity (see [Models](#models)), then calibrated to pre-event option prices.
4. **Signal:** the model-implied move compared with the market-implied move. The goal is to flag events where IV looks too rich or too cheap.
5. **Backtest:** P&L of straddle/strangle and defined-risk structures across historical events.

## Models

| Model | Stochastic volatility | Jumps | Role in Heaviside |
|---|:---:|:---:|---|
| **Merton (1976)** | ✗ | ✓ | Baseline jump-diffusion: constant vol plus Poisson-driven lognormal jumps |
| **Heston (1993)** | ✓ | ✗ | Captures the volatility smile and changing pre-event vol, without discrete jumps |
| **Bates (1996)** | ✓ | ✓ | Heston volatility plus Merton jumps; the main model for catalyst pricing |

### Merton Jump-Diffusion

```math
\frac{dS_t}{S_t} = (\mu - \lambda k)\,dt + \sigma\,dW_t + (J - 1)\,dN_t
```

```math
\ln J \sim \mathcal{N}(\mu_J, \sigma_J^2), \qquad k = \mathbb{E}[J - 1] = e^{\mu_J + \frac{1}{2}\sigma_J^2} - 1, \qquad N_t \sim \text{Poisson}(\lambda t)
```

### Heston Stochastic Volatility

```math
dS_t = \mu S_t\,dt + \sqrt{v_t}\,S_t\,dW_t^{S}
```

```math
dv_t = \kappa(\theta - v_t)\,dt + \xi\sqrt{v_t}\,dW_t^{v}, \qquad dW_t^{S}\,dW_t^{v} = \rho\,dt
```

### Bates (Stochastic Volatility + Jumps)

```math
\frac{dS_t}{S_t} = (\mu - \lambda k)\,dt + \sqrt{v_t}\,dW_t^{S} + (J - 1)\,dN_t
```

```math
dv_t = \kappa(\theta - v_t)\,dt + \xi\sqrt{v_t}\,dW_t^{v}, \qquad dW_t^{S}\,dW_t^{v} = \rho\,dt
```

| Symbol | Meaning |
|---|---|
| $S_t$ | Stock price |
| $v_t$ | Instantaneous variance |
| $\mu$ | Drift |
| $\sigma$ | Constant volatility (Merton) |
| $\kappa$ | Speed of mean reversion of variance |
| $\theta$ | Long-run variance |
| $\xi$ | Volatility of variance (vol of vol) |
| $\rho$ | Correlation between price and variance shocks |
| $\lambda$ | Jump intensity (expected jumps per year) |
| $J$ | Jump size multiplier |
| $\mu_J,\ \sigma_J$ | Mean and std. dev. of log jump size |
| $N_t$ | Poisson counting process |

### Adapting the Models to Scheduled Catalysts

Standard Merton and Bates assume jumps arrive at random times (Poisson) and have a single lognormal size. A PDUFA date or data readout is *known in advance* and its outcome is *binary*. Heaviside adds a deterministic jump at the event date $\tau$:

```math
S_{\tau^+} = S_{\tau^-} \cdot J_\tau, \qquad
\ln J_\tau \sim
\begin{cases}
\mathcal{N}(\mu_u, \sigma_u^2) & \text{with probability } p \quad \text{(approval / positive data)} \\
\mathcal{N}(\mu_d, \sigma_d^2) & \text{with probability } 1 - p \quad \text{(CRL / failed endpoint)}
\end{cases}
```

This two-component mixture produces the bimodal post-event distribution that a single lognormal jump cannot.

## Repository Structure

```
Heaviside/
├── data/               # raw + processed event data (gitignored)
├── notebooks/          # exploratory analysis
├── src/
│   ├── simulation.py   # Monte Carlo engine
│   ├── implied_move.py # straddle-implied move extraction
│   └── backtest.py     # strategy backtests
├── requirements.txt
└── README.md
```

## Setup

```bash
git clone https://github.com/Bkramer15/Heaviside.git
cd Heaviside
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

```bash
python src/simulation.py --ticker XXXX --event-date YYYY-MM-DD --n-paths 100000
```

## Roadmap

- [ ] Expand the catalyst dataset (PDUFA + Phase 3 readouts)
- [ ] Calibrate $p$ using historical approval rates by phase and therapeutic area
- [ ] Model the IV term structure into the event
- [ ] Add transaction costs and bid-ask slippage to backtests

## References

- Merton, R. C. (1976). Option pricing when underlying stock returns are discontinuous. *Journal of Financial Economics*, 3(1–2), 125–144.
- Heston, S. L. (1993). A closed-form solution for options with stochastic volatility with applications to bond and currency options. *Review of Financial Studies*, 6(2), 327–343.
- Bates, D. S. (1996). Jumps and stochastic volatility: Exchange rate processes implicit in Deutsche Mark options. *Review of Financial Studies*, 9(1), 69–107.

## Disclaimer

This project is for research and educational purposes only. Nothing here is investment advice or a recommendation to trade any security.

## Author

**Birhanu Kramer**: Finance, Economics & Applied Mathematics, Liberty University
