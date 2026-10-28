# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served in phases:

- **Now: the small seller.** A maker with one to three printers who sells parts to customers or on marketplaces (Etsy, Wallapop, local orders). Their job: put a price on a part without losing money, and send the customer a clean quote. They work at the desk, with the slicer (Bambu Studio, OrcaSlicer, PrusaSlicer, Cura) open next to layercents, dropping the file they just sliced. This is the free calculator, with no account.
- **Next: the print farm.** A business with several printers in production. Beyond pricing, it needs the fleet: live status, a job history, failure rate and real versus estimated print time. This is the future paid customer, with an account and the fleet synced to the cloud (design in `docs/NUBE.md`).

Product decisions today are guided by the small seller; the farm must not be designed out.

## Product Purpose

layercents works out the real cost of a 3D printed part and the price to charge for it, then turns saved parts into a quote for the customer. Success: a seller drops a sliced file and, without typing print data, knows what the part costs them, what to charge for their target margin, and has a quote ready to send.

## Positioning

What competitors (MakerQuote, 3DPCC, CraftersQuote) cannot truthfully claim all at once, and every design must protect:

1. **Drop the file, type nothing.** A `.gcode`, `.bgcode` or `.gcode.3mf` fills in print time, grams and purge, including several parts per plate and several plates.
2. **The whole cost, not just filament.** Material and purge, electricity, printer wear, failed prints, the seller's time, packaging and platform fees, plus a recommended price for a target margin.
3. **Private, no account required.** Everything runs in the browser and is stored in `localStorage`. An account will add things (sync, fleet) but never becomes a requirement for the calculator.
4. **Real data from the printer.** The local agent (`agent/`) reads the printers themselves (Bambu over MQTT, Klipper over Moonraker), so cost and time move from estimated to measured.

## Operating Context

- Main use: desktop, at the workshop PC, next to the slicer. Mobile is secondary (checking a price, showing a quote), but must still work.
- Flow: slice → drop the file → adjust per-part data → read cost and recommended price → save to History → tick parts for one customer → Customer quote → save as PDF with the browser's print dialog.
- "Your setup" (printer, electricity, rate, fee, margin) is remembered per device; other per-part data resets on reload.
- Outputs leave the app as documents: customer quote and report as PDF (`window.print()`), history as `.xlsx`, backup as a versioned JSON file.
- Printers tab appears only when the person enables the agent with `?agent`; without it the web makes no request to `127.0.0.1`.
- Currency selector with live exchange rates (api.frankfurter.dev).

## Capabilities and Constraints

- React + Vite single-page app, static on GitHub Pages at https://layercents.com. All code and interface copy in English.
- Data lives in `localStorage` (`savedQuotes`, `business`, `quoteCounter`, `setup`, `agentEnabled`, `lastBackupAt`). Clearing browser data deletes it; backup/restore is the safety net.
- Money on customer quotes is computed in cents so totals add up.
- No backend beyond what is agreed: the local agent (listens only on 127.0.0.1) and the Supabase + Lemon Squeezy plan in `docs/NUBE.md`, built in steps.
- The agent never uploads a printer's access code, serial number, IP or certificate fingerprint.
- Undecided / private: what is paid and at what price lives in a private document, not in this public repository. Do not state pricing or plan contents in the product. Excel and PDF cannot be protected as "Pro" client-side.
- Printer support beyond Bambu and Klipper (PrusaLink, Creality, Elegoo, Anycubic, Flashforge, OctoPrint) is planned only when someone can test it.

## Brand Commitments

- Name: **layercents**, always lowercase. Tagline: "Layer by layer, cent by cent."
- Logo in `src/Logo.jsx`; icons and share image in `public/`. The cost chart uses the ¢ symbol (`src/CostSymbol.jsx`, `src/symbolChart.js`).
- Existing identity is dark with the brand gold (`--oro`), colors as variables in `src/index.css`. Never use Bambu Lab green.
- Voice: plain, short sentences, second person, concrete numbers over adjectives ("Drop your sliced file, get the real cost and a customer quote in seconds. Free, no account.").
- A customer quote never shows the seller's costs or margins.

## Evidence on Hand

- Screenshots: `screenshots/calculator.png`, `screenshots/quote.png`, `screenshots/history.png`, `screenshots/logo.svg`.
- Real-world test: importing a Bambu Studio `.gcode.3mf` from a P1S works (2026-10-22).
- Feature idea from a Reddit user: parts per week a printer can produce.
- No testimonials, customer logos, user counts, benchmarks or press exist. Do not fabricate any.

## Product Principles

1. **Never make people type what a file or a printer already knows.**
2. **Real cost over flattering cost.** Show every cost component and say when a number is estimated versus measured; never show a statistic without enough data behind it.
3. **The free calculator stays whole without an account.** Accounts and paid features add on top; they never take away.
4. **Privacy is a feature, stated precisely.** Say exactly what stays local and what syncs, and keep printer credentials on the user's machine.
5. **Desk-first, phone-capable.** Optimize for the workshop desktop next to the slicer; keep every screen usable on a phone.
