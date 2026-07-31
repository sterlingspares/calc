# Pricing Calculator

![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square) ![PWA](https://img.shields.io/badge/PWA-offline--ready-brightgreen?style=flat-square&logo=pwa) ![Built with](https://img.shields.io/badge/built%20with-HTML%2FVanilla%20JS-orange?style=flat-square)

**Live app:** [calc.sterlingspares.com](https://calc.sterlingspares.com)

A single-file, offline-first web app for MRP-based pricing and profit calculations in automotive parts distribution. No build step, no dependencies — open `index.html` in any browser.

---

## 🧮 Core Calculation

### MRP-Based Pricing
All prices derive from the Maximum Retail Price (MRP).

- **GST rates:** 18% (default) or 5% — toggle with keyboard `1` / `2`
- **Custom GST rate:** type any rate (0–100 %, decimals allowed) into the **Other %** box in the control bar. It feeds straight into every calculation, and all `excl/incl X% GST` labels update to match.
- Every price is shown in two forms: **excl GST** (for accounting) and **incl GST** (sticker price)

### Quantity / Order Value
Set a **Quantity** in the MRP bar. Per-unit figures are unaffected; once quantity is above 1 the summary gains an order block:

| Row | Meaning |
|---|---|
| **Quantity** | Units in the order |
| **Order Value (incl GST)** | SP incl GST × qty |
| **Total Profit ₹** | Per-unit profit × qty |

Quantity is saved with history entries and included in the CSV export. Absolute (₹) incentives are per-unit, consistent with every other figure.

### Rounding
Settings → **Rounding**: **Off**, **₹1** or **₹5**. Rounding is applied to the incl-GST (sticker) price, with excl-GST and profit derived from the rounded figure — so what you quote and what you bank stay consistent. It applies to the main calculator and every quote line.

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
Five incentive types ship by default, each independently togglable:

| Code | Name (customisable) | Input |
|---|---|---|
| **CD** | Cash Discount | % or ₹ — on CP excl or incl GST (selectable) |
| **EB** | Early Bird Discount | % of CP excl GST |
| **QT** | Quarterly Discount | % of CP excl GST |
| **AN** | Annual Discount | % of CP excl GST |
| **SC** | Scheme | % of CP excl GST *or* fixed ₹ amount |

The footer of the panel shows: **Total incentive ₹**, **Effective incentive % on CP**, **Effective CP excl GST**.

### SP Incentives (reduce effective Selling Price)
Identical set applied against SP instead of CP. Useful for modelling customer-facing discounts (e.g. scheme passed on to dealer).

- CD can be calculated on SP excl or incl GST
- Scheme can be % or fixed ₹
- Footer shows: **Total SP incentive ₹**, **Eff. incentive % on SP**, **Effective SP excl GST**

### ✏️ Editable Incentives
Each incentive panel has its own **Edit** button, next to the collapse chevron in the panel header. CP and SP are edited independently — the two lists need not match.

Tapping **Edit** puts that panel into edit mode:

| Action | How |
|---|---|
| **Rename** | The label becomes a text field — type a new name (max 30 chars) |
| **Delete** | Tap the red **⊖** badge on the row (iOS-style), then confirm |
| **Add** | Tap **+ Add incentive** below the grid |

Tap **Done** to leave edit mode.

- **New incentives** get the same **% / ₹ Absolute** choice the Scheme row has — pick *percentage* to deduct a share of the base price excl GST, or *fixed amount* to deduct a flat rupee value. They default to percentage, and the unit beside the input flips between `%` and `₹` to match. Each added incentive keeps its own setting, and CP and SP are independent.
- **Deleting** asks for confirmation first, and is undoable. Removal takes effect in the calculation immediately. The built-in five can be deleted too — including CD and Scheme, along with their extra option rows.
- Toggle states and entered values are preserved when entering or leaving edit mode.
- Your incentive list and custom names **persist across sessions** (`pc-labels` in `localStorage`).

> Renaming used to live in Settings → Incentive Labels. That section has been removed; renaming now happens inline in each panel.

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
Each history card shows: Time (relative + absolute on hover), tag, quantity (if above 1), MRP, CP excl, SP excl, CP incentives ₹, Profit ₹, GP %, Margin %, GST rate.

### Search, Filters & Tags
- **Search** — matches tags, GST rate, date and any numeric value in the entry (case-insensitive)
- **Filters** — `All` · `Profit +` · `Loss` · `Below floor` · `Tagged`
- **Tags** — click **+ Tag** on any entry to label it (e.g. a dealer or customer name), max 24 chars. Click an existing tag to edit, clear it to remove. Tags are searchable and exported to CSV.

The panel header shows `N of M` while a search or filter is active.

### Actions
- **Save current** — manually save the active calculation
- **Compare** — open a side-by-side comparison with the current state showing deltas (↑↓) for CP, SP, Profit, GP %, Margin %
- **× button** — delete an individual entry (undoable)
- **Export CSV** — download full history as a spreadsheet
- **Clear all** — remove all entries, after confirmation (undoable)

---

## ⚙️ Settings

| Setting | Description |
|---|---|
| **Dark mode** | Full dark colour scheme; persists across sessions |
| **Minimum GP %** | Highlights values in red when GP % falls below this threshold |
| **Minimum Margin %** | Highlights values in red when Margin % falls below this threshold |
| **Auto-save** | Toggle automatic history logging |
| **Rounding** | Round prices to the nearest ₹1 or ₹5 (or off) |
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

## ↩️ Undo / Redo

Every state-changing action is undoable: adding, deleting, renaming or retyping an incentive, changing rounding, resetting, editing the quote, and all history operations (delete, clear, tag).

- **Undo / Redo buttons** in the header (Undo also appears in the mobile menu)
- `⌘/Ctrl + Z` to undo, `⌘/Ctrl + ⇧ + Z` to redo — these work even while typing in a field
- Destructive actions show a toast with an inline **Undo**
- Up to **40 steps** are retained

---

## 🧾 Quote Builder

A multi-line quoting tool — press `M`, or use **Quote** in the header / menu.

Each line takes a description, MRP, quantity and net CP/SP discounts, and computes SP incl GST, line value, line profit and GP %. Lines below your GP floor are flagged red. A totals row gives line count, total units, order value, total profit and **blended GP %** across the whole quote.

| Action | Description |
|---|---|
| **Add line** | Append a blank line |
| **Add current calculation** | Pull MRP, quantity and both discounts in from the main calculator |
| **Export CSV** | Per-line breakdown plus a totals row |
| **Copy quote** | Formatted plain-text quote for pasting into email or WhatsApp |
| **Clear all** | Remove every line, after confirmation |

On phones the table becomes a **stacked card per line** — no sideways scrolling — with the action bar pinned to the bottom of the dialog. Wide screens keep the table. Rotating the device switches layout automatically.

Lines use the calculator's current GST rate and rounding setting. Incentives are **not** applied per line — enter the net discount you're quoting. The quote persists across sessions.

---

## 📱 Mobile

The layout adapts below 800px:

- **Sticky result bar** — Profit, GP % and Margin % stay pinned above the bottom nav in Default mode, so you can watch them move while editing discounts instead of scrolling to the summary and back. Values below your floor limits turn amber; losses turn red.
- **Floating action button** — a thumb-reachable ⊕ above the bottom-right corner opens the six primary actions (Save to history, Copy summary, WhatsApp, Share link, Email, Export PDF), which otherwise live in the top header. Tap the scrim or press Escape to dismiss. Default mode only.
- **Bottom nav** — Calc · Incentives · Summary · History · Quote
- **Quote builder** — card layout per line, pinned action bar
- **Dialogs** — every modal is constrained to the viewport with a scrolling body, so its buttons are always reachable
- **Touch targets** — controls meet the 44px guidance, with press feedback (touch has no hover)
- **Zoom** — pinch-zoom works; double-tap zoom is suppressed only on controls

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
| `M` | Open quote builder |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + ⇧ + Z` | Redo |
| `1` | Set GST to 18% |
| `2` | Set GST to 5% (any other rate: use the **Other %** box) |
| `P` | Calculate Profit mode |
| `L` | Calculate Selling Price mode |
| `K` | Calculate Cost Price mode |

---

## 💾 State Persistence (localStorage)

| Key | Contents |
|---|---|
| `pc-state` | Full calculator state (MRP, quantity, CP/SP inputs, modes, incentives, rounding, floor limits, auto-save pref) |
| `pc-history` | History array — up to 50 entries |
| `pc-qstate` | Quick mode inputs and settings |
| `pc-quote` | Quote builder lines |
| `pc-labels` | Custom incentive names + the CP/SP incentive lists |
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
