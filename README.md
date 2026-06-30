# Interior Quotation & Invoice Generator

A free, browser-based quotation and invoice generator tailored for interior
design / furniture businesses. Inspired by Refrens' online invoice generator.
Built with React + Vite. No backend — everything runs in your browser and is
saved to `localStorage`.

## Features

- **Two document types** — switch between **Invoice** and **Quotation** with
  appropriate fields (Due Date vs. Valid Until) and default terms.
- **Live A4 preview** — edit on the left, see a print-accurate document on the right.
- **Interior-specific items** — quick-add chips for common jobs (Modular Kitchen,
  Wardrobe, False Ceiling, TV Unit, etc.) and interior units (Sq.ft, Rft, Lump sum…).
- **Line items** with name, description, HSN/SAC, qty, unit, rate, per-item
  discount % and tax %, with reorder/remove controls.
- **Tax modes** — IGST (single), CGST + SGST (split), or No Tax.
- **Charges** — shipping/other charges, flat extra discount, optional round-off.
- **Totals** — sub total, discounts, tax breakup by rate, grand total, and
  automatic **amount in words** (Indian Lakh/Crore or international format).
- **Branding** — upload logo & signature, pick from 6 theme colors, multi-currency
  (INR, USD, EUR, GBP, AED).
- **Templates** — choose from 5 layout templates (Classic, Modern, Minimal, Bold,
  Compact) to change the look of your document independently of the theme colour.
- **Bank / UPI details** block for receiving payments.
- **Save & manage** — documents, clients and your business profile are stored in
  the browser. Reopen or delete saved documents anytime.
- **Export** — Download as multi-page **PDF**, as an **Excel (.xlsx)** spreadsheet,
  or **Print** directly. Pick the format from the **Download ▾** menu.

> Note: As requested, there is no server. Saved data lives only in this browser.

## Getting started

```bash
npm install
npm run dev      # start dev server (http://localhost:5173)
```

Build for production:

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  App.jsx                  App shell, toolbar, save/load/PDF actions
  components/
    Editor.jsx             Left-hand editing form (all sections)
    DocumentPreview.jsx    Print-accurate A4 document
    SavedModal.jsx         Saved documents list
  lib/
    format.js              Currency, dates, number-to-words helpers
    calc.js                Totals & tax computation
    defaults.js            New-document factory, themes, templates, sample items
    storage.js             localStorage persistence
    pdf.js                 html2canvas + jsPDF export
    excel.js               SheetJS (xlsx) spreadsheet export
  index.css                App UI + document/print/template styles
```

## Tech

React 18, Vite 5, jsPDF + html2canvas for PDF export, SheetJS (xlsx) for Excel export.
