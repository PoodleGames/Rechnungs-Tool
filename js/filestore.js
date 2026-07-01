/**
 * filestore.js
 * ------------
 * Datenzugriff über den lokalen HTTP-Server (start.bat / start.ps1).
 *
 * Da das Tool über http://localhost läuft, können JSON-Dateien direkt
 * per fetch() gelesen und per POST-Request geschrieben werden — kein
 * Picker-Dialog, keine Berechtigung, kein OPFS nötig.
 *
 * Der Server (start.ps1) übernimmt das eigentliche Lesen/Schreiben
 * auf der Festplatte, direkt im Projektordner neben start.bat.
 *
 * Für den Rechnungs-Export ("Im Kundenordner ablegen") wird ebenfalls
 * der Server genutzt — die Datei landet im output/-Unterordner des
 * Projektordners, sichtbar im Windows-Explorer.
 */

const STANDARD_EINSTELLUNGEN = {
  firma: {
    name: 'Meine Firma',
    strasse: '',
    plz: '',
    ort: '',
    telefon: '',
    email: '',
    bank_name: '',
    iban: '',
    bic: '',
    steuernummer: '',
    inhaber: '',
    kleinunternehmer_hinweis: 'Gemäß § 19 UStG wird aufgrund der Kleinunternehmerregelung keine Umsatzsteuer erhoben.',
    zahlungshinweis: 'Bitte überweisen Sie den Rechnungsbetrag innerhalb der nächsten 14 Tage auf das unten genannte Konto.',
    gruss: 'Mit freundlichen Grüßen',
  },
  footer: { rechtsspalte_titel: 'Kontakt', rechtsspalte2_titel: 'Bankverbindung' },
  rechnungsnummer: { praefix: 'R-', stellen: 4, naechste_laufnummer: 1 },
  standard_rabatt_prozent: 0,
};

const STANDARD_KUNDEN  = { kunden: [], naechste_laufnummer: 1 };
const STANDARD_ARTIKEL = { artikel: [] };

/* ── Prüfen ob wir über localhost laufen ── */
function unterstuetztDateizugriff() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

class FileStore {
  constructor() {
    this.bereit = false;
  }

  async init() {
    // Auf localhost: sofort bereit, kein Dialog nötig.
    this.bereit = true;
  }

  istVerbunden() {
    return this.bereit;
  }

  /* ── JSON LESEN vom Server ── */
  async leseJSON(dateiname, fallback = {}) {
    try {
      const resp = await fetch(`/data/${dateiname}?_=${Date.now()}`);
      if (resp.status === 404) {
        // Datei existiert noch nicht → anlegen und Fallback zurückgeben
        await this.schreibeJSON(dateiname, fallback);
        return fallback;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      if (!text.trim()) return fallback;
      return JSON.parse(text);
    } catch (err) {
      if (err.message && err.message.includes('JSON')) {
        return fallback;
      }
      throw err;
    }
  }

  /* ── JSON SCHREIBEN über Server-API ── */
  async schreibeJSON(dateiname, data) {
    const resp = await fetch(`/api/schreibe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datei: `data/${dateiname}`, inhalt: data }),
    });
    if (!resp.ok) throw new Error(`Schreiben fehlgeschlagen: HTTP ${resp.status}`);
  }

  /* ── Rechnungsnummer-Vorschau (ohne Vergabe) ── */
  async leseRechnungsnummerVorschau() {
    const e = await this.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN);
    const rn = e.rechnungsnummer || { praefix: 'R-', stellen: 4, naechste_laufnummer: 1 };
    return rn.praefix + String(rn.naechste_laufnummer).padStart(rn.stellen, '0');
  }

  /* ── Rechnungsnummer endgültig vergeben ── */
  async vergibNaechsteRechnungsnummer() {
    const e = await this.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN);
    const rn = e.rechnungsnummer || { praefix: 'R-', stellen: 4, naechste_laufnummer: 1 };
    const nummer = rn.praefix + String(rn.naechste_laufnummer).padStart(rn.stellen, '0');
    rn.naechste_laufnummer += 1;
    e.rechnungsnummer = rn;
    await this.schreibeJSON('einstellungen.json', e);
    return nummer;
  }

  /* ── Rechnung im Kundenordner ablegen ── */
  async speichereRechnungImKundenordner(kundennummer, kundenname, dateiname, htmlInhalt) {
    const ordnerName = baueKundenOrdnerNamen(kundennummer, kundenname);
    const pfad = `output/${ordnerName}/${dateiname}`;
    const resp = await fetch(`/api/schreibe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datei: pfad, inhalt: htmlInhalt, roh: true }),
    });
    if (!resp.ok) throw new Error(`Export fehlgeschlagen: HTTP ${resp.status}`);
    return ordnerName;
  }
}

function baueKundenOrdnerNamen(kundennummer, kundenname) {
  const slugify = (text) => {
    const u = { 'ä':'ae','ö':'oe','ü':'ue','Ä':'Ae','Ö':'Oe','Ü':'Ue','ß':'ss' };
    let t = (text || '').replace(/[äöüÄÖÜß]/g, m => u[m] || m);
    t = t.replace(/[^A-Za-z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
    return t || 'unbekannt';
  };
  if (!kundennummer || !kundennummer.trim()) return '_ohne_kundennummer';
  return `${slugify(kundennummer)}_${slugify(kundenname)}`;
}

const fileStore = new FileStore();