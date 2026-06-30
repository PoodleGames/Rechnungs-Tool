# Invoice Tool — Technical Documentation

> For the simple end-user instructions, see `READ_ME_FIRST.txt`.
> This document is for anyone who wants to understand or extend the code.

A fully **serverless** invoicing tool with a pixel-exact A4 layout. Runs
as a pure HTML/CSS/JS application directly in the browser — no
installation, no server, no runtime, no dependencies.

---

## 1. Architecture decision: why no server?

The target audience is non-technical end users who should be able to
open and use the tool with a single double-click — without installing
PHP, Node, Python, or anything else. That's why this project
deliberately has no backend at all.

Instead, the browser's **File System Access API**
(`window.showDirectoryPicker()`) handles all file work:

- The user picks a folder once (a single click plus the browser's own
  picker dialog — no installation involved).
- The browser remembers this permission persistently (in its own
  IndexedDB), so the dialog only appears the very first time.
- After that, JavaScript reads and writes the real JSON files under
  `data/`, as well as the invoices under `output/`, directly — with
  no server in between.

**Supported browsers:** Chrome, Microsoft Edge (or any other
Chromium-based browser). Edge ships pre-installed on every Windows
machine. Firefox and Safari don't currently support
`showDirectoryPicker()` — the tool detects this automatically and
shows a clear message instead of failing silently (see
`zeigeBrowserHinweis()` in `js/common.js`).

`file://` pages are treated as a "secure context" by browsers, which
is why the API also works when the local HTML file is opened by
double-click (no HTTPS or localhost server required).

---

## 2. Project structure

```
rechnungstool/
├── READ_ME_FIRST.txt         end-user instructions (plain language)
├── README.md                  this file
│
├── Rechnungstool.html         main page: create/edit an invoice
├── Kunden.html                 customer management
├── Artikel.html                 item/catalog management
│
├── css/
│   └── style.css                shared stylesheet (A4 layout, forms)
│
├── js/
│   ├── filestore.js              wraps the entire File System Access API
│   ├── common.js                  connection overlay + shared helpers
│   ├── invoice.js                  logic for the invoice page
│   ├── kunden.js                    logic for customer management
│   └── artikel.js                    logic for item/catalog management
│
├── data/                      ── the actual JSON databases ──
│   ├── kunden.json               customer records + customer number counter
│   ├── artikel.json               item catalog (title, description, price, …)
│   └── einstellungen.json         company details, footer text, invoice number counter
│
└── output/                    ── generated invoices (created automatically) ──
    └── {customer_number}_{customer_name}/
        └── Rechnung_{number}_{date}.html
```

There is intentionally **no** `backend/` folder and **no** server file
anymore — all file access goes through `js/filestore.js`.

---

## 3. `js/filestore.js` in detail

A central `FileStore` class, instantiated once per page as a single
shared instance (`const fileStore = new FileStore()`).

| Method | Purpose |
|---|---|
| `versucheAutoVerbindung()` | On page load, tries to silently reconnect to the previously chosen folder if permission is still valid. |
| `waehleProjektordner()` | Opens the folder picker (must be triggered by an actual click — a browser security requirement). |
| `leseJSON(filename, fallback)` | Reads a JSON file from `data/`. If it doesn't exist yet, it's created automatically with the given fallback content. |
| `schreibeJSON(filename, data)` | Writes an object as formatted JSON into `data/` (overwrites the whole file). |
| `vergibNaechsteRechnungsnummer()` | Reads `einstellungen.json`, increments the counter, writes it back immediately, and returns the assigned number. |
| `vergibNaechsteKundennummer()` | Same idea, for customer numbers in `kunden.json`. |
| `speichereRechnungImKundenordner(...)` | Creates the customer's folder under `output/` if needed and saves the invoice as an HTML file inside it. |

### Why no API layer anymore?

The previous version had a PHP backend with a single `api.php`
endpoint that, on every request, read or rewrote an entire JSON file —
classic REST routing for something that was really just "read the
whole file" and "write the whole file". Since the browser can now
access the files directly, that detour is gone entirely:
`fileStore.leseJSON(...)` and `fileStore.schreibeJSON(...)` are the
only two operations the tool actually needs.

---

## 4. Consistency under concurrent access

Since JavaScript runs single-threaded within a browser tab, individual
write operations within one tab are automatically safe from race
conditions. One edge case remains: if the user has **two tabs open at
once** on the same project folder and saves an invoice in both at
nearly the same time, both could theoretically draw the same invoice
number before the other tab's write completes.

For a single-user tool running on a local machine, this risk is
negligible in practice (a user doesn't typically work on two invoices
in two tabs simultaneously). If stronger guarantees are needed, the
`navigator.locks` API could be wrapped around the read-modify-write
cycles in `filestore.js` — this extra complexity was deliberately
skipped for the current use case.

---

## 5. The JSON databases in detail

### `data/kunden.json`
```json
{
  "kunden": [
    {
      "kundennummer": "K-00001",
      "name": "Max Mustermann",
      "strasse": "Musterstraße 1",
      "plz": "12345",
      "ort": "Musterstadt",
      "telefon": "",
      "email": "",
      "notiz": ""
    }
  ],
  "naechste_laufnummer": 2
}
```
(`kundennummer` = customer number, `strasse` = street, `plz` = postal
code, `ort` = city, `telefon` = phone, `notiz` = note,
`naechste_laufnummer` = next sequence number.)

### `data/artikel.json`
```json
{
  "artikel": [
    {
      "id": "art-0001",
      "title": "Example service",
      "description": "Describe what this line item covers.",
      "einzelpreis": 50.00,
      "einheit": "Stück",
      "ust": 0
    }
  ]
}
```
(`einzelpreis` = unit price, `einheit` = unit, e.g. "Stück" = piece,
"Stunde" = hour, `ust` = VAT rate in %.)

Both structures can be extended with additional fields at any time
(e.g. `ust_id`, `kategorie`) — the tool won't automatically surface
new fields in the form UI, but the underlying data won't break either.

### `data/einstellungen.json`
Holds company details, footer labels, the default discount
percentage, and the counter for sequential invoice numbers
(`rechnungsnummer.naechste_laufnummer`). The prefix (`R-`) and digit
count (`4` → four digits like `0001`) can be adjusted directly here.

> **Privacy note:** this file ships with generic placeholder values
> (`Meine Firma`, `Musterstraße 1`, etc.) on purpose. Replace them with
> your real company details directly inside the running tool (the
> header, footer, and sign-off fields are all editable in place) or by
> editing `data/einstellungen.json` yourself — never commit real
> business or customer data into a shared or public copy of this
> project.

---

## 6. The output folder (`output/`)

Clicking "Im Kundenordner ablegen" (file in customer folder)
automatically creates:

```
output/
├── K-00001_Max_Mustermann/
│   ├── Rechnung_R-0001_2026-06-30.html
│   └── Rechnung_R-0005_2026-07-12.html
├── K-00002_Another_Customer/
│   └── Rechnung_R-0002_2026-06-30.html
└── _ohne_kundennummer/
    └── Rechnung_R-0003_2026-06-30.html
```

Folder name pattern: `{customer_number}_{customer_name}` (umlauts and
special characters are automatically converted into something
filesystem-safe). Without a customer number entered, the invoice ends
up in the catch-all folder `_ohne_kundennummer/` ("without customer
number").

---

## 7. Extending the project

- **New fields for customers/items:** extend the JSON structure, then
  add a matching form field in `Kunden.html`/`Artikel.html` and wire it
  up for load/save in `js/kunden.js`/`js/artikel.js`.
- **Custom invoice number format:** adjust
  `rechnungsnummer.praefix` and `rechnungsnummer.stellen` in
  `data/einstellungen.json`.
- **Colors/branding:** centrally adjustable in `css/style.css` via
  `#1a4f82` (primary color) and `#1a2a3a` (dark blue).
- **Stricter concurrency safety:** wrap the read-modify-write cycles in
  `filestore.js` with `navigator.locks` if needed.

---

## 8. Data protection / privacy

This tool stores all data locally on the user's own machine — nothing
is ever transmitted to a server. That said, the `data/` and `output/`
folders will contain real personal and business information once in
use (customer names, addresses, invoice amounts). A few practical
notes:

- The `.gitignore` file excludes `output/` from version control by
  default, since it fills up with real customer invoices over time.
- If this project is shared, copied, or put under version control
  (e.g. Git), make sure `data/kunden.json`, `data/einstellungen.json`,
  and the contents of `output/` are reset to placeholder values or
  excluded first — they are not anonymized automatically.
- There is no telemetry, analytics, or network call of any kind in
  this codebase; it works fully offline by design.
