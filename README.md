# 3D Print Cost Calculator

A free calculator that shows what a 3D printed part *actually* costs you: material, power, printer depreciation, failed prints, your own time and platform fees.

**Live:** https://llopjulen.github.io/coste-3d/

## Features

- **Import from your slicer:** drop a `.gcode`, `.bgcode` or `.gcode.3mf` from Bambu Studio, OrcaSlicer, PrusaSlicer or Cura and print time, grams and purge fill in by themselves. Works with several parts per plate and several plates.
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

- Customer quotes with several parts and your logo
- Several filaments per part, each with its own price
- Printer and material presets
- Printer utilization / parts per week

Ideas and feedback are welcome. Open an issue.

## Built with

React + Vite. Deployed on GitHub Pages.
