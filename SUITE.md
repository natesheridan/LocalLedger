# LocaLedger Suite

> A unified, offline-first personal finance ecosystem — one app family, one JSON data model, zero servers.

## Overview

LocaLedger is a suite of six focused financial tools that share a common design language, storage model, and data flow. Each app handles one domain of personal finance; together they give a complete picture of your financial life.

All modules:
- Run entirely in the browser (offline-first PWA)
- Store data in `localStorage` with independent JSON structures
- Share data across modules by reading each other's localStorage keys
- Require no accounts, no sync, no subscriptions

---

## Module Status

| Module | Purpose | Status | localStorage Key |
|--------|---------|--------|-----------------|
| LocaLabor | Income Tracking | **LIVE** | `income_data` |
| LocaLoss | Spending Tracker | Planned | `locaLossData` |
| LocaLimit | Budget Intelligence | Planned | `locaLimitData` |
| LocaLoan | Loan Payoff Optimizer | Planned | `locaLoanData` |
| LocaLegacy | Investment Tracker | Planned | `locaLegacyData` |
| LocaLiquid | Net Worth Engine | Planned | `locaLiquidData` |

---

## LocaLabor — Income Tracking
*Status: LIVE · Color: Indigo `#6366F1`*

The foundation of the suite. Tracks all sources of income for gig workers, freelancers, salaried employees, and anyone with variable earnings.

**Core Features**
- Hourly and flat-rate income entry
- Recurring transactions (weekly, bi-weekly, monthly, etc.)
- Custom fields per entry (text, number, money, date, checkbox, longtext)
- Location intelligence with rate memory
- Dashboard with charts and totals
- History with filtering, sorting, and infinite scroll
- Demo workspace with realistic multi-gig persona data

**Data Structure**
```json
{
  "records": [
    {
      "id": "income_user1_1",
      "date": "2026-03-14",
      "hours": 6,
      "rate": 95,
      "tips": 0,
      "location": "Freelance Dev",
      "payType": "hourly",
      "type": "recurring",
      "recurringFreq": 14,
      "recurringEnd": "2027-01-01",
      "deleted": false,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ],
  "locations": {
    "Freelance Dev": { "lastRate": 95, "preferredColor": "#6366F1" }
  },
  "customFields": [
    { "key": "CustomField_Platform_Venue", "label": "Platform", "type": "text" }
  ],
  "version": 1
}
```

---

## LocaLoss — Spending Tracker
*Status: Planned · Color: Rose `#F43F5E`*

Track every dollar that leaves your wallet — from rent to coffee.

**Planned Features**
- Daily spending capture with one-tap entry
- Recurring bills and subscriptions
- Category tagging (Food, Transport, Housing, Entertainment, custom)
- Fuel and small purchase quick-add mode
- Spending trends by day, week, month
- Budget threshold alerts
- CSV import from bank exports

**Proposed Data Structure**
```json
{
  "expenses": [
    {
      "id": "exp_...",
      "date": "2026-03-14",
      "amount": 42.50,
      "category": "food",
      "merchant": "Whole Foods",
      "tags": ["groceries"],
      "recurring": false,
      "notes": ""
    }
  ],
  "categories": [
    { "key": "food", "label": "Food & Dining", "color": "#F43F5E", "budget": 400 }
  ],
  "recurringBills": [
    { "id": "bill_...", "label": "Rent", "amount": 1500, "dueDay": 1, "category": "housing" }
  ]
}
```

**Feeds into:** LocaLimit, LocaLoan, LocaLiquid

---

## LocaLimit — Budget Intelligence
*Status: Planned · Color: Amber `#F59E0B`*

Compare income to spending, model budgets, and project cash flow.

**Planned Features**
- Income vs. spending side-by-side dashboard
- Budget envelope system by category
- Savings rate tracker
- Estimated self-employment tax modeling
- Net income after tax projection
- Predictive budget scenarios ("what if I earn 20% more?")
- Multi-period comparison

**Proposed Data Structure**
```json
{
  "budgets": [
    { "category": "food", "limit": 400, "period": "monthly" }
  ],
  "taxSettings": {
    "selfEmploymentRate": 0.153,
    "estimatedFederalRate": 0.22,
    "stateRate": 0.05,
    "quarterlyDueDates": ["04-15","06-15","09-15","01-15"]
  }
}
```

**Reads from:** LocaLabor, LocaLoss
**Feeds into:** LocaLoan, LocaLiquid

---

## LocaLoan — Loan Payoff Optimizer
*Status: Planned · Color: Orange `#F97316`*

Model every debt and find the fastest, cheapest path to zero.

**Planned Features**
- Multi-loan tracking (credit cards, auto, student, personal)
- APR modeling including promotional 0% periods
- Promo APR expiry countdown alerts
- Snowball strategy (smallest balance first)
- Avalanche strategy (highest APR first)
- Custom extra-payment scenarios
- Full amortization tables
- Refi analyzer with break-even calculation

**Proposed Data Structure**
```json
{
  "loans": [
    {
      "id": "loan_...",
      "label": "Chase Sapphire",
      "type": "credit_card",
      "balance": 4200.00,
      "apr": 0.2499,
      "promoApr": 0.0,
      "promoAprEnds": "2026-09-01",
      "minimumPayment": 85,
      "openedDate": "2024-01-15"
    }
  ],
  "strategies": { "active": "avalanche", "extraMonthly": 200 }
}
```

**Reads from:** LocaLimit (budget surplus)
**Feeds into:** LocaLiquid (liability side of net worth)

---

## LocaLegacy — Investment Tracker
*Status: Planned · Color: Emerald `#10B981`*

Track every asset you own — from index funds to rare sneakers.

**Planned Features**
- Stocks, ETFs, and crypto portfolio tracking
- Commodities (gold, silver, oil)
- Alternative assets (art, collectibles, vehicles, domains, IP)
- Asset class diversification view
- Year-over-year growth and CAGR per position
- Unrealized gain/loss tracking with cost basis
- Dividend and distribution tracker
- Tax lot tracking (short vs. long-term gains)
- Watchlist with price alerts

**Proposed Data Structure**
```json
{
  "assets": [
    {
      "id": "asset_...",
      "symbol": "AAPL",
      "class": "stock",
      "shares": 15,
      "costBasis": 148.50,
      "currentPrice": 212.40,
      "lastUpdated": "2026-03-16"
    },
    {
      "id": "asset_...",
      "label": "1965 Ford Mustang",
      "class": "vehicle",
      "purchasePrice": 28000,
      "estimatedValue": 41000,
      "lastUpdated": "2026-01-01"
    }
  ],
  "assetClasses": ["stock","crypto","commodity","real_estate","vehicle","art","other"]
}
```

**Feeds into:** LocaLiquid (asset side of net worth)

---

## LocaLiquid — Net Worth Engine
*Status: Planned · Color: Cyan `#06B6D4`*

Your entire financial life distilled into one living number.

**Planned Features**
- Real-time net worth (assets minus liabilities)
- Liquid vs. illiquid asset breakdown
- Net worth over time chart
- Future wealth projections (5, 10, 25 years)
- Income trajectory modeling with growth assumptions
- Retirement readiness score
- Milestone alerts ($10k, $50k, $100k, etc.)
- Inflation-adjusted projection mode
- Partner/household mode (combine two people's financials)
- Exportable financial snapshot for mortgage/advisor use

**Proposed Data Structure**
```json
{
  "snapshot": {
    "date": "2026-03-16",
    "totalAssets": 142500,
    "totalLiabilities": 28400,
    "netWorth": 114100,
    "liquidAssets": 22000,
    "illiquidAssets": 120500
  },
  "projections": {
    "annualSavingsRate": 0.22,
    "expectedReturnRate": 0.07,
    "targetRetirementAge": 55
  }
}
```

**Reads from:** LocaLabor, LocaLoss, LocaLegacy, LocaLoan, LocaLimit

---

## Data Flow Diagram

```
LocaLabor ──────────────────────────────────────────► LocaLimit
    │                                                      │
    │                                                      │
LocaLoss ───────────────────────────────────────────► LocaLimit
    │                                                      │
    └───────────────────────────────────────────────► LocaLoan
                                                           │
LocaLegacy ─────────────────────────────────────────► LocaLiquid
                                                      ▲
LocaLabor ─────────────────────────────────────────► LocaLiquid
LocaLoss ──────────────────────────────────────────► LocaLiquid
LocaLoan ──────────────────────────────────────────► LocaLiquid
LocaLimit ─────────────────────────────────────────► LocaLiquid
```

---

## Architecture Principles

1. **Offline-first** — all data lives in `localStorage`, no network required after initial load
2. **JSON-first storage** — each module has an independent, documented JSON schema
3. **Module independence** — each app can run standalone; integrations are additive, not required
4. **Vanilla JS** — no frameworks, no build steps, no dependencies beyond Tailwind CDN
5. **Progressive enhancement** — features degrade gracefully when linked modules aren't populated
6. **Privacy by default** — data never leaves the device without explicit user action

---

## Suite Launcher UI

The header logo animates through all module names as a slot-machine drum. Clicking opens the suite launcher panel showing all six modules with their status badges. Selecting a live module loads it; selecting a planned module shows its feature preview page.

The drum only animates:
- While hovering over the logo (desktop)
- While the suite launcher panel is open

When static, the drum shows the currently active module name in that module's brand color.
