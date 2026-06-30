# Invoice Tool — Quick Start

## How to start

1. Double-click the file **`Rechnungstool.html`**
   (it opens automatically in your browser, e.g. Microsoft Edge)

2. The first time you open it, a window will appear: *"Connect the Invoice Tool to your folder"*
   - Click **"Choose folder"**
   - In the dialog that opens, navigate to the folder that contains `Rechnungstool.html`, `data`, and `output` — this might **not** be the folder the dialog opens in by default, so look around if needed
   - Select that folder
   - Done! You only have to do this **once** — the browser remembers your choice afterwards.

3. From now on you can create invoices normally.

That's it. No installation, nothing to download, nothing else needed.

## What the four pages do

| Page | Purpose |
|---|---|
| `Rechnungstool.html` | Create and edit an invoice |
| `Kunden.html` | Add, edit, delete customers |
| `Artikel.html` | Add services/items you can insert into invoices |
| `Firma.html` | Your company details (name, address, bank details, invoice number format) — set this up once, it's then used automatically on every invoice |

You can switch between the pages anytime using the buttons in the top-right corner.

## Typing an item title shows suggestions

When you start typing into the "Beschreibung" (description/title) field of a line item, a small dropdown automatically shows matching items from your catalog (the ones you saved in `Artikel.html`). Click a suggestion to fill in the title, description, and price all at once.

## How to save an invoice

There are three buttons in the bottom-right corner:

**HTML speichern** (Save HTML)
Downloads the invoice as a file into your normal downloads folder.

**Im Kundenordner ablegen** (File in customer folder)
This is the important button for real, sequentially numbered invoices. It automatically assigns the next invoice number (`R-0001`, `R-0002`, `R-0003`, ...) and saves the invoice directly into the right customer folder under `output/`. Every customer automatically gets their own folder.

**Als PDF exportieren** (Export as PDF)
Opens your browser's normal print dialog, where you can choose "Save as PDF".

## Where your data lives

Everything stays on your own computer, inside this folder:

```
data/
  kunden.json          → all your customers
  artikel.json         → all your services/items
  einstellungen.json   → your company details, invoice number counter

output/
  K-00001_Customer_Name/
    Rechnung_R-0001_2026-06-30.html
    Rechnung_R-0005_2026-07-12.html
  K-00002_Another_Customer/
    Rechnung_R-0002_2026-06-30.html
```

**Tip:** back up this whole folder every now and then (e.g. copy it to a USB stick) so nothing gets lost.

## Frequently asked questions

**A security prompt from the browser appeared — is that normal?**
Yes. The browser is asking, once, whether this page is allowed to access your files. That's expected and necessary — it's the only way the tool can save your invoices directly to your computer. Just click "Allow" / select the folder.

**I'm using Firefox and it doesn't work.**
Please use Microsoft Edge or Google Chrome instead. Edge comes pre-installed on every Windows computer (the blue "e" icon). Firefox doesn't currently support the required technology.

**Do I have to choose the folder again every time?**
No, only the very first time. After that, the browser remembers your choice automatically.

**Can I move or rename the folder?**
Yes. You'll just need to select the folder once more afterwards (the connection window will simply appear again, once).

**My company details / customers aren't showing up on the invoice.**
This usually means the tool got connected to the wrong folder the first time (e.g. a "Documents" folder instead of the actual program folder), so it created an empty `data/` folder there instead of using the real one. Check whether there's a stray `data` folder somewhere outside this project folder; if so, delete it, then reconnect and make sure to actively navigate to *this* folder in the picker dialog.

**Is my data sent anywhere over the internet?**
No. Everything happens locally on your computer. Nothing is uploaded anywhere.