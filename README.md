# layercents

**Layer by layer, cent by cent.** A free 3D print cost calculator that shows what a printed part *actually* costs you (material, power, printer depreciation, failed prints, your own time and platform fees) and turns it into a quote for your customer.

**Live:** https://llopjulen.github.io/coste-3d/

## Features

- **Import from your slicer:** drop a `.gcode`, `.bgcode` or `.gcode.3mf` from Bambu Studio, OrcaSlicer, PrusaSlicer or Cura and print time, grams and purge fill in by themselves. Works with several parts per plate and several plates.
- **Customer quotes:** tick several saved parts and get a quote for your client with your logo, shipping, tax and notes, ready to save as PDF. Costs and margins stay private.
- Full cost breakdown per part, with a layered chart
- Recommended selling price from your target margin and platform fee
- Toggle to hide labor/selling and see only the raw printing cost
- Currency selector with live exchange rates (Frankfurter API)
- Save quotes with part name and client, in your browser (localStorage)
- Quote history grouped by month, with search and one-click reload
- Excel export (.xlsx) and a printable PDF report with charts
- Everything runs in the browser, nothing is sent to any server

## Run it locally

```bash
git clone https://github.com/llopjulen/coste-3d.git
cd coste-3d
npm install
npm run dev
```

## Roadmap

- Several filaments per part, each with its own price
- Printer and material presets
- Printer utilization / parts per week

Ideas and feedback are welcome. Open an issue.

## Built with

React + Vite. Deployed on GitHub Pages.
