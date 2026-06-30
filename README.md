# Rechnungstool — Technische Dokumentation

> Für die einfache Bedienungsanleitung als Endnutzer siehe `LIESMICH.txt`.
> Dieses Dokument richtet sich an alle, die den Code verstehen oder
> erweitern möchten.

Ein vollständig **serverloses** Rechnungstool im exakten DIN-A4-Layout.
Läuft als reine HTML/CSS/JS-Anwendung direkt im Browser — keine
Installation, kein Server, keine Laufzeitumgebung, keine Abhängigkeiten.

---

## 1. Architektur-Entscheidung: Warum kein Server?

Die Zielgruppe sind Laien/Endnutzer, die das Tool mit einem einzigen
Doppelklick öffnen und benutzen können sollen — ohne PHP, Node, Python
oder irgendetwas anderes zu installieren. Deshalb verzichtet dieses
Projekt bewusst auf jedes Backend.

Stattdessen übernimmt die **File System Access API** des Browsers
(`window.showDirectoryPicker()`) die komplette Dateiarbeit:

- Der Nutzer wählt einmalig den Projektordner aus (ein Klick + ein
  Browser-eigener Auswahldialog — keine Installation).
- Der Browser merkt sich diese Berechtigung dauerhaft (in seiner eigenen
  IndexedDB), sodass der Dialog nur beim allerersten Start erscheint.
- Danach liest und schreibt JavaScript direkt die echten JSON-Dateien
  unter `data/` sowie die Rechnungen unter `output/` — ganz ohne
  Server dazwischen.

**Unterstützte Browser:** Chrome, Microsoft Edge (und andere
Chromium-Browser). Edge ist auf jedem Windows-Rechner vorinstalliert.
Firefox und Safari unterstützen `showDirectoryPicker()` aktuell nicht
— das Tool erkennt das automatisch und zeigt einen klaren Hinweis statt
unklar zu scheitern (siehe `zeigeBrowserHinweis()` in `js/common.js`).

`file://`-Seiten gelten browserseitig als "secure context", weshalb die
API auch beim direkten Doppelklick auf die lokale HTML-Datei funktioniert
(keine HTTPS- oder localhost-Server-Pflicht).

---

## 2. Projektstruktur

```
rechnungstool/
├── LIESMICH.txt              Anleitung für Endnutzer (einfache Sprache)
├── README.md                 diese Datei
│
├── Rechnungstool.html        Hauptseite: Rechnung erstellen/bearbeiten
├── Kunden.html                Kundenverwaltung
├── Artikel.html                Artikelverwaltung
│
├── css/
│   └── style.css              gemeinsames Stylesheet (A4-Layout, Formulare)
│
├── js/
│   ├── filestore.js            kapselt die komplette File System Access API
│   ├── common.js                Verbindungs-Overlay + allgemeine Helfer
│   ├── invoice.js                Logik der Rechnungsseite
│   ├── kunden.js                 Logik der Kundenverwaltung
│   └── artikel.js                Logik der Artikelverwaltung
│
├── data/                      ── echte JSON-Datenbanken ──
│   ├── kunden.json              Kundenstammdaten + Kundennummern-Zähler
│   ├── artikel.json              Artikelkatalog (Title, Description, Preis, …)
│   └── einstellungen.json        Firmendaten, Footer-Texte, Rechnungsnummern-Zähler
│
└── output/                    ── generierte Rechnungen (automatisch erstellt) ──
    └── {Kundennummer}_{Kundenname}/
        └── Rechnung_{Nummer}_{Datum}.html
```

Es gibt absichtlich **keinen** `backend/`-Ordner und **keine**
Server-Datei mehr — der gesamte Dateizugriff läuft über
`js/filestore.js`.

---

## 3. `js/filestore.js` im Detail

Zentrale Klasse `FileStore`, eine einzige geteilte Instanz pro Seite
(`const fileStore = new FileStore()`).

| Methode | Zweck |
|---|---|
| `versucheAutoVerbindung()` | Versucht beim Seitenstart, den zuvor gewählten Ordner automatisch (ohne erneuten Klick) wiederzuverbinden, sofern die Berechtigung noch besteht. |
| `waehleProjektordner()` | Öffnet den Auswahldialog (muss durch einen echten Klick ausgelöst werden — Browser-Sicherheitsvorgabe). |
| `leseJSON(dateiname, fallback)` | Liest eine JSON-Datei aus `data/`. Existiert sie noch nicht, wird sie automatisch mit dem übergebenen Fallback-Inhalt neu angelegt. |
| `schreibeJSON(dateiname, data)` | Schreibt ein Objekt als formatiertes JSON in `data/` (überschreibt die komplette Datei). |
| `vergibNaechsteRechnungsnummer()` | Liest `einstellungen.json`, erhöht den Zähler, schreibt sofort zurück, gibt die vergebene Nummer zurück. |
| `vergibNaechsteKundennummer()` | Analog für Kundennummern in `kunden.json`. |
| `speichereRechnungImKundenordner(...)` | Legt bei Bedarf den Kundenordner unter `output/` an und speichert die Rechnung als HTML-Datei darin. |

### Warum kein API-Layer mehr?

In der vorherigen Version gab es ein PHP-Backend mit einem zentralen
`api.php`-Endpunkt, der bei jeder Anfrage die komplette JSON-Datei
gelesen oder neu geschrieben hat — klassisches REST-Routing für etwas,
das eigentlich nur "Datei komplett lesen" und "Datei komplett
schreiben" war. Da der Browser jetzt direkt auf die Dateien zugreifen
kann, entfällt dieser Umweg vollständig: `fileStore.leseJSON(...)` und
`fileStore.schreibeJSON(...)` sind die einzigen zwei Operationen, die
es überhaupt braucht.

---

## 4. Konsistenz bei gleichzeitigem Zugriff

Da JavaScript in einem Browser-Tab single-threaded läuft, sind
einzelne Schreibvorgänge innerhalb eines Tabs automatisch sicher vor
Race Conditions. Ein Sonderfall bleibt: Wenn der Nutzer **zwei Tabs
gleichzeitig** mit demselben Projektordner offen hat und in beiden
parallel eine Rechnung abspeichert, könnten theoretisch beide dieselbe
Rechnungsnummer ziehen, bevor der jeweils andere Tab seine Änderung
geschrieben hat.

Für ein Einzelnutzer-Tool auf einem lokalen Rechner ist dieses Risiko
vernachlässigbar (in der Praxis arbeitet ein Nutzer nicht in zwei Tabs
gleichzeitig an zwei Rechnungen). Falls gewünscht, ließe sich das mit
der `navigator.locks`-API weiter absichern — für den aktuellen Einsatzzweck
wurde bewusst auf diese zusätzliche Komplexität verzichtet.

---

## 5. Die JSON-Datenbanken im Detail

### `data/kunden.json`
```json
{
  "kunden": [
    {
      "kundennummer": "K-00001",
      "name": "Thomas Schweder",
      "strasse": "Juliusplate 4",
      "plz": "27804",
      "ort": "Berne",
      "telefon": "",
      "email": "",
      "notiz": ""
    }
  ],
  "naechste_laufnummer": 2
}
```

### `data/artikel.json`
```json
{
  "artikel": [
    {
      "id": "art-0001",
      "title": "Rüsten",
      "description": "Anfahrt, Vorbereitung, ...",
      "einzelpreis": 95.00,
      "einheit": "Stück",
      "ust": 0
    }
  ]
}
```

Beide Strukturen lassen sich beliebig um weitere Felder erweitern
(z.B. `ust_id`, `kategorie`) — das Tool übernimmt zusätzliche Felder
zwar nicht automatisch in die Formularmaske, aber die Datenbasis selbst
bleibt davon unberührt und bricht nicht.

### `data/einstellungen.json`
Enthält Firmendaten, Footer-Beschriftungen, Standard-Rabattsatz sowie
den Zähler für fortlaufende Rechnungsnummern
(`rechnungsnummer.naechste_laufnummer`). Präfix (`R-`) und Stellenzahl
(`4` → vierstellig wie `0001`) lassen sich hier direkt anpassen.

---

## 6. Der Ausgabeordner (`output/`)

Beim Klick auf „Im Kundenordner ablegen“ entsteht automatisch:

```
output/
├── K-00001_Thomas_Schweder/
│   ├── Rechnung_R-0001_2026-06-30.html
│   └── Rechnung_R-0005_2026-07-12.html
├── K-00002_Erika_Musterfrau/
│   └── Rechnung_R-0002_2026-06-30.html
└── _ohne_kundennummer/
    └── Rechnung_R-0003_2026-06-30.html
```

Ordnername: `{Kundennummer}_{Kundenname}` (Umlaute/Sonderzeichen werden
automatisch dateisystemsicher umgewandelt). Ohne eingetragene
Kundennummer landet die Rechnung im Sammelordner `_ohne_kundennummer/`.

---

## 7. Eigene Erweiterungen

- **Neue Felder bei Kunden/Artikeln:** JSON-Struktur erweitern, dann in
  `Kunden.html`/`Artikel.html` ein passendes Formularfeld ergänzen und
  in `js/kunden.js`/`js/artikel.js` beim Speichern/Laden mit übernehmen.
- **Eigenes Rechnungsnummern-Format:** `data/einstellungen.json` →
  `rechnungsnummer.praefix` und `rechnungsnummer.stellen` anpassen.
- **Farben/Branding:** zentral in `css/style.css` über `#1a4f82`
  (Hauptfarbe) und `#1a2a3a` (Dunkelblau) anpassbar.
- **Striktere Nebenläufigkeitssicherung:** bei Bedarf `navigator.locks`
  in `filestore.js` um die Lese-Ändere-Schreibe-Zyklen legen.
