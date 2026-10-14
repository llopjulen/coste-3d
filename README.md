# 3D Print Cost Calculator

A free calculator that shows what a 3D printed part *actually* costs you: material, power, printer depreciation, failed prints, your own time and platform fees.

**Live:** https://llopjulen.github.io/coste-3d/

## Features

- Full cost breakdown per part, with a layered chart
- Recommended selling price from your target margin and platform fee
- Toggle to hide labor/selling and see only the raw printing cost
- Currency selector with live exchange rates (Frankfurter API)
- Save quotes locally in your browser (localStorage)
- Everything runs in the browser, nothing is sent to any server

## Run it locally

```bash
git clone https://github.com/llopjulen/coste-3d.git
cd coste-3d
npm install
npm run dev
```

## Roadmap

- Delete individual saved quotes
- CSV export of saved quotes
- Printer utilization / parts per week
- Charts and month-to-month comparison

Ideas and feedback are welcome. Open an issue.

## Built with

React + Vite. Deployed on GitHub Pages.
