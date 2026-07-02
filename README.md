# Invoice Tool — Quick Start

## How to start

1. Double-click **`start.bat`** in the project folder.
   A small window opens briefly, then your browser launches automatically at `http://localhost:8000`.

2. Done. No installation, no downloads, nothing else needed.

> **Note:** Keep the black command window open while you work — it runs the local server.
> Closing it shuts down the tool.

---

## First-time setup

Before creating your first invoice, fill in your company details once:

1. Click **"Firma"** in the bottom-right button bar
2. Enter your name, address, bank details, tax number, etc.
3. Click **"Alles speichern"**

These details appear automatically on every invoice from that point on.

---

## What the pages do

| Page | Purpose |
|---|---|
| `Rechnungstool.html` | Create and finalize invoices |
| `Rechnungen.html` | Invoice history — view, filter, cancel |
| `Kunden.html` | Add, edit, delete customers |
| `Artikel.html` | Manage your service/item catalog |
| `Firma.html` | Company details, bank info, invoice number format |

---

## The invoice workflow

### 1. Fill in the invoice
- Select a customer from the address book (top-left dropdown) or type the address manually
- Add line items from your catalog or as empty positions
- Adjust quantities, prices, discount as needed
- Set the date and service period

### 2. Finalize
Click the green **"Rechnung erstellen"** button.

This will:
- Assign the next sequential invoice number (e.g. `R-0001`)
- Save a complete snapshot to `data/invoices.json`
- Unlock the PDF and XML export buttons

> You cannot export before finalizing. This ensures every exported invoice has a real number and is recorded in the history.

### 3. Export
After finalizing, two export options are available:

**Als PDF exportieren** — opens your browser's print dialog. Choose "Save as PDF" and pick a location.

**Als XML exportieren** — downloads a valid **XRechnung 2.3** file (UN/CEFACT CII format), ready for import into accounting software (DATEV, Lexware, Sage, etc.) or submission to customers who require electronic invoices.

### 4. File in customer folder (optional)
**"Im Kundenordner ablegen"** saves a copy of the invoice as an HTML file into `output/`, automatically sorted into a subfolder by customer number and name.

---

## Multi-page invoices

When you add more line items than fit on one page, the tool automatically creates additional pages.

- Set **"Max. pro Seite"** (bottom of the items table) to control how many positions fit per page
- All pages share the same header, address, and footer — edit on page 1, all pages update instantly
- Line items are editable on every page
- Totals always appear on the last page only
- The "Add item" bar always appears on the last page only
- Page numbers are shown when there is more than one page

---

## Invoice history

Click **"Rechnungen"** to open the invoice history.

- All finalized invoices are listed with number, date, customer, total, and status
- Toggle **"Stornierte anzeigen"** to show or hide cancelled invoices
- Click **"Öffnen"** to view any past invoice — it opens pixel-perfectly as it was at the time of finalization
- To cancel an invoice, click **"Stornieren"** — it stays in the list marked as cancelled, and the number is never reused (correct bookkeeping practice)

## Re-exporting past invoices

Every finalized invoice is stored as a complete snapshot in `data/invoices.json`, including a pixel-perfect HTML copy of the invoice as it looked at the time of finalization — layout, fonts, company details, everything.

To re-export a past invoice:

1. Open **"Rechnungen"** → click **"Öffnen"** next to the invoice
2. The invoice opens exactly as it was originally created — nothing is editable
3. Use **"Als PDF exportieren"** or **"Als XML exportieren"** to download it again

This means even if you lose a PDF you sent to a customer, you can always reproduce it with the exact same content and layout, without creating a new invoice number.

---

## Autocomplete for line items

When typing in the title field of a line item, a dropdown appears with matching items from your catalog (`Artikel.html`). Click a suggestion to fill in title, description, unit price, and unit in one step.

---

## Where your data lives

Everything stays on your own computer, in the project folder:

```
data/
  kunden.json          → customers
  artikel.json         → service/item catalog
  einstellungen.json   → company details, invoice number counter
  invoices.json        → complete history of all finalized invoices

output/
  K-00001_Customer_Name/
    Rechnung_R-0001_2026-07-01.html
  K-00002_Another_Customer/
    Rechnung_R-0002_2026-07-02.html
```

**Tip:** back up this whole folder regularly (e.g. copy to a USB stick or cloud folder).

---

## Frequently asked questions

**The browser didn't open automatically after double-clicking start.bat.**
Open your browser manually and go to `http://localhost:8000`. If that doesn't work either, check that the black command window is still open and shows no error message.

**I'm using Firefox and it doesn't work.**
Please use Microsoft Edge or Google Chrome. Edge comes pre-installed on every Windows computer (blue "e" icon).

**Can I create a new invoice after finalizing one?**
Yes — simply refresh the page (`F5`) or close and reopen the tab. The form resets to a new draft. The finalized invoice remains safely in `data/invoices.json`.

**The PDF/XML buttons are greyed out.**
Click **"Rechnung erstellen"** first to finalize the invoice. The export buttons unlock automatically afterwards.

**Is my data sent anywhere over the internet?**
No. The tool runs entirely on your computer via a local server (`localhost`). Nothing leaves your machine.

**What is the XRechnung format?**
XRechnung is the official German electronic invoice standard (EN 16931), required for invoices to public authorities since 2020 and increasingly expected in B2B transactions. The exported file can be validated at [https://www.portals.de/xrechnung/pruefen](https://www.portals.de/xrechnung/pruefen).