# Pricing Calculator

![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square) ![PWA](https://img.shields.io/badge/PWA-offline--ready-brightgreen?style=flat-square&logo=pwa) ![Built with](https://img.shields.io/badge/built%20with-HTML%2FVanilla%20JS-orange?style=flat-square)

A single-file, offline-first web app for MRP-based pricing and profit calculations in automotive parts distribution. No build step, no dependencies — open `index.html` in any browser.

---

## 🧮 Core Calculation

### MRP-Based Pricing
All prices derive from the Maximum Retail Price (MRP).

- **GST rates:** 18% (default) or 5% — toggle with keyboard `1` / `2`
- Every price is shown in two forms: **excl GST** (for accounting) and **incl GST** (sticker price)

### Three Solve Modes
Select what you want the calculator to *compute* vs what you *input*:

| Mode | You enter | Calculator computes |
|---|---|---|
| **Profit** (default) | MRP · CP · SP | Profit amount, GP %, Margin % |
| **Selling Price** | MRP · CP · target profit | Selling Price |
| **Cost Price** | MRP · SP · target profit | Cost Price |

Keyboard shortcuts: `P` (Profit), `L` (Selling Price), `K` (Cost Price)

### Price Input Methods
Both CP and SP support three independent input modes:

| Mode | How it works |
|---|---|
| **Discount excl GST** | Enter % discount on MRP excl GST; displays price incl GST |
| **Nett Discount incl GST** | Enter % discount directly on the MRP (incl GST) |
| **Manual ₹ entry** | Type the price directly in rupees |

### Profit Display Modes
Switch how profit is expressed:

| Mode | Formula |
|---|---|
| **₹ Value** | Eff. SP excl GST − Eff. CP excl GST |
| **GP %** | Profit ÷ Eff. SP excl GST × 100 |
| **Margin %** | Profit ÷ Eff. CP excl GST × 100 |

---

## 💰 Incentive System

### CP Incentives (reduce effective Cost Price)
Five incentive types, each independently togglable:

| Code | Name (customisable) | Input |
|---|---|---|
| **CD** | Cash Discount | % or ₹ — on CP excl or incl GST (selectable) |
| **EB** | Early Bird Discount | % of CP excl GST |
| **QT** | Quarterly Discount | % of CP excl GST |
| **AN** | Annual Discount | % of CP excl GST |
| **SC** | Scheme | % of CP excl GST *or* fixed ₹ amount |

The footer of the panel shows: **Total incentive ₹**, **Effective incentive % on CP**, **Effective CP excl GST**.

### SP Incentives (reduce effective Selling Price)
Identical set of five types applied against SP instead of CP. Useful for modelling customer-facing discounts (e.g. scheme passed on to dealer).

- CD can be calculated on SP excl or incl GST
- Scheme can be % or fixed ₹
- Footer shows: **Total SP incentive ₹**, **Eff. incentive % on SP**, **Effective SP excl GST**

### Custom Incentive Labels
Settings → Incentive Labels: rename any of the five types (CD, EB, QT, AN, SC) to your own terminology. Changes persist across sessions.

---

## 📊 Calculation Summary

A sticky summary bar below the cards shows:

- CP incl GST · SP incl GST · Effective CP · Effective SP
- Profit ₹ · GP % · Margin %
- Warnings when GP % or Margin % fall below your floor limits

### Copy & Share
- **Copy summary** — copies a formatted text block to clipboard (`⌘/Ctrl + C`)
- **WhatsApp share** — opens a pre-filled WhatsApp message
- **Email share** — opens a mailto with the summary
- **PDF export** — print-friendly layout via browser print (`Ctrl + P`)
- **Share link** — encodes the full calculator state into a URL for sharing

---

## 🔀 What-If Analysis

Three side-by-side SP scenarios (A · B · C) to compare outcomes before committing:

- Each scenario takes its own SP input (discount % or manual ₹)
- Shows for each: SP, Profit ₹, GP %, Margin %
- Best scenario (highest GP %) is highlighted automatically
- Updates live as you adjust values

---

## 📋 History

- Calculations are **auto-saved** to history after 900 ms of inactivity (when both CP and SP are filled)
- Auto-save can be toggled off in Settings
- History **persists across page reloads** (stored in `localStorage`)
- Up to **50 entries** retained

### Per Entry
Each history card shows: Time (relative + absolute on hover), MRP, CP excl, SP excl, CP incentives ₹, Profit ₹, GP %, Margin %, GST rate.

### Actions
- **Save current** — manually save the active calculation
- **Compare** — open a side-by-side comparison with the current state showing deltas (↑↓) for CP, SP, Profit, GP %, Margin %
- **× button** — delete an individual entry
- **Export CSV** — download full history as a spreadsheet
- **Clear all** — remove all history entries

---

## ⚙️ Settings

| Setting | Description |
|---|---|
| **Dark mode** | Full dark colour scheme; persists across sessions |
| **Minimum GP %** | Highlights values in red when GP % falls below this threshold |
| **Minimum Margin %** | Highlights values in red when Margin % falls below this threshold |
| **Auto-save** | Toggle automatic history logging |
| **Incentive Labels** | Rename CD/EB/QT/AN/SC to custom names; persists across sessions |
| **App tour** | Restart the interactive onboarding walkthrough |
| **Keyboard shortcuts** | View all shortcuts |

Floor limits and auto-save preference **persist across sessions**.

---

## ⚡ Quick (Flashcard) Mode

A mobile-optimised 4-step card interface — like swiping through cards:

1. **MRP card** — enter MRP, choose GST rate and solve-for mode
2. **CP card** — enter cost price (discount % or manual ₹)
3. **SP card** — enter selling price (or profit if solving for SP/CP)
4. **Result card** — shows profit, GP %, Margin %, effective prices

### Navigation
- **Swipe left** → next card
- **Swipe right** → previous card
- **Enter / →** → next card
- **←** → previous card
- **Q** → toggle between Default and Quick mode

### State Persistence
Quick mode **remembers your last inputs** (MRP, CP, SP, GST, modes) — restoring them automatically when you return to Quick mode.

---

## 🔄 Pull to Reset

In Default mode, **pull down from the top of the page** to reveal the reset bar. Pull past 90 px and release to reset all inputs to defaults. Clears the saved session state.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `?` | Open keyboard shortcuts |
| `S` | Open settings |
| `R` | Reset all inputs |
| `⌘/Ctrl + S` | Save to history |
| `⌘/Ctrl + C` | Copy summary |
| `Q` | Toggle Default / Quick mode |
| `1` | Set GST to 18% |
| `2` | Set GST to 5% |
| `P` | Calculate Profit mode |
| `L` | Calculate Selling Price mode |
| `K` | Calculate Cost Price mode |

---

## 💾 State Persistence (localStorage)

| Key | Contents |
|---|---|
| `pc-state` | Full calculator state (MRP, CP/SP inputs, modes, incentives, floor limits, auto-save pref) |
| `pc-history` | History array — up to 50 entries |
| `pc-qstate` | Quick mode inputs and settings |
| `pc-labels` | Custom incentive label names |
| `pc-theme` | Dark / light mode preference |
| `ob-done` | Onboarding completion flag |

URL share (`?s=…`) encodes calculator state as base64 JSON and takes **priority over localStorage** on load.

---

## 📱 Offline / PWA

- **Service worker** (`sw.js`) caches the app using a stale-while-revalidate strategy — works offline after first visit
- **Web app manifest** (`manifest.json`) — installable as a standalone app on Android / iOS
- Update detection: a banner appears when a new version is deployed

---

## 🔢 Number Formatting

All monetary values use **Indian number formatting** (₹1,00,000.00). Percentages are shown to 2 decimal places.

---

## 🛠️ Technical Notes

- Single HTML file — all CSS and JS embedded, no external dependencies beyond Google Fonts
- Vanilla JS (ES5-compatible), no frameworks
- Google Fonts: Syne (headings), DM Sans (UI), JetBrains Mono (numbers)
- MIT Licence
