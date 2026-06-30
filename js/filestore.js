/**
 * filestore.js
 * ------------
 * Kapselt den kompletten Dateizugriff über die File System Access API
 * des Browsers. Dadurch braucht dieses Tool KEINEN Server und KEINE
 * Installation — der Nutzer wählt einmalig den Projektordner aus, danach
 * liest und schreibt JavaScript direkt die echten JSON-Dateien auf der
 * Festplatte (data/kunden.json, data/artikel.json, data/einstellungen.json)
 * und legt fertige Rechnungen im output/-Ordner ab.
 *
 * Funktionsweise:
 * 1. Beim ersten Start fragt der Browser einmalig nach der Erlaubnis,
 *    auf den gewählten Ordner zugreifen zu dürfen (Standard-Browserdialog,
 *    keine Installation).
 * 2. Der "Handle" auf diesen Ordner wird im IndexedDB des Browsers
 *    gespeichert, sodass der Nutzer den Ordner nicht jedes Mal neu
 *    auswählen muss — nur beim allerersten Mal und nach manuellem
 *    Daten-löschen im Browser.
 * 3. Alle Lese-/Schreibvorgänge laufen über diesen Handle direkt auf
 *    der Festplatte — es gibt keinen Server dazwischen.
 *
 * Browser-Voraussetzung: Chrome, Edge oder ein anderer Chromium-Browser
 * (Windows-Standardbrowser Edge erfüllt das). Firefox/Safari unterstützen
 * die File System Access API aktuell nicht vollständig — das Tool prüft
 * das beim Start und zeigt ggf. einen Hinweis.
 */

const DB_NAME = 'rechnungstool-filestore';
const DB_STORE = 'handles';
const ROOT_HANDLE_KEY = 'projektordner';

/**
 * Werden verwendet, falls eine JSON-Datei beim allerersten Start noch
 * nicht existiert — dann wird sie automatisch mit diesem Inhalt angelegt.
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

const STANDARD_KUNDEN = { kunden: [], naechste_laufnummer: 1 };
const STANDARD_ARTIKEL = { artikel: [] };

/* ── Prüfen, ob der Browser die nötige API überhaupt unterstützt ── */
function unterstuetztDateizugriff() {
  return 'showDirectoryPicker' in window;
}

/* ── Kleine IndexedDB-Wrapper, um den Ordner-Handle dauerhaft zu merken ── */
function oeffneHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function speichereHandleDauerhaft(key, handle) {
  const db = await oeffneHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ladeHandleDauerhaft(key) {
  const db = await oeffneHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * FileStore — zentrale Klasse für den gesamten Dateizugriff.
 * Wird einmal pro Seite instanziiert und initialisiert.
 */
class FileStore {
  constructor() {
    this.rootHandle = null;   // Handle auf den gewählten Projektordner
    this.dataHandle = null;   // Handle auf data/
    this.outputHandle = null; // Handle auf output/
  }

  /**
   * Versucht, den zuletzt gewählten Projektordner automatisch wieder zu
   * verbinden (falls die Berechtigung noch gültig ist). Gibt true zurück,
   * wenn das geklappt hat, sonst false — dann muss der Nutzer den Ordner
   * erneut per Klick auswählen (z.B. nach Browser-Neustart, einmalig).
   */
  async versucheAutoVerbindung() {
    const gespeichert = await ladeHandleDauerhaft(ROOT_HANDLE_KEY);
    if (!gespeichert) return false;

    const erlaubnis = await gespeichert.queryPermission({ mode: 'readwrite' });
    if (erlaubnis === 'granted') {
      this.rootHandle = gespeichert;
      await this._initUnterordner();
      return true;
    }
    // Berechtigung könnte mit einem stillen Request (ohne Klick) noch
    // erteilt werden, falls der Browser das zulässt:
    const erneut = await gespeichert.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (erneut === 'granted') {
      this.rootHandle = gespeichert;
      await this._initUnterordner();
      return true;
    }
    return false;
  }

  /**
   * Öffnet den Auswahldialog, damit der Nutzer den Projektordner (den
   * Ordner, in dem sich diese HTML-Datei befindet) auswählt. Muss durch
   * eine direkte Nutzerinteraktion (Klick) ausgelöst werden — das ist
   * eine Sicherheitsvorgabe der Browser, kein Bug.
   *
   * WICHTIG: Es gibt keine Möglichkeit, den Dialog automatisch im Ordner
   * dieser HTML-Datei zu öffnen — file://-Seiten haben aus Sicherheits-
   * gründen keinen Zugriff auf ihren eigenen Dateisystempfad, und die
   * File System Access API erlaubt als Startordner nur feste System-
   * ordner (Desktop, Dokumente, Downloads, …) oder einen bereits zuvor
   * erteilten Handle. Deshalb wird hier bewusst KEIN startIn gesetzt:
   * ohne explizite Angabe merkt sich der Browser selbstständig den
   * zuletzt verwendeten Ordner über mehrere Aufrufe hinweg, was nach
   * dem ersten korrekten Setup zuverlässiger ist als ein fest codierter
   * (und in der Praxis meist falscher) Standardordner.
   */
  async waehleProjektordner() {
    this.rootHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });
    await speichereHandleDauerhaft(ROOT_HANDLE_KEY, this.rootHandle);
    await this._initUnterordner();
  }

  async _initUnterordner() {
    this.dataHandle = await this.rootHandle.getDirectoryHandle('data', { create: true });
    this.outputHandle = await this.rootHandle.getDirectoryHandle('output', { create: true });
  }

  istVerbunden() {
    return this.rootHandle !== null;
  }

  /**
   * Liest die aktuelle Vorschau der nächsten Rechnungsnummer, OHNE sie zu
   * verbrauchen (für die Anzeige im Formular, solange die Rechnung noch
   * Entwurf ist).
   */
  async leseRechnungsnummerVorschau() {
    const einstellungen = await this.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN);
    const rn = einstellungen.rechnungsnummer || { praefix: 'R-', stellen: 4, naechste_laufnummer: 1 };
    return rn.praefix + String(rn.naechste_laufnummer).padStart(rn.stellen, '0');
  }

  /**
   * Vergibt die nächste Rechnungsnummer endgültig: liest einstellungen.json,
   * erhöht den Zähler, schreibt die Datei sofort zurück. Da JavaScript in
   * einem Tab single-threaded läuft, ist das innerhalb dieses Tools sicher
   * vor doppelter Vergabe — nur bei mehreren gleichzeitig geöffneten Tabs
   * auf denselben Ordner könnte es theoretisch zu einem Konflikt kommen
   * (siehe Hinweis im README).
   */
  async vergibNaechsteRechnungsnummer() {
    const einstellungen = await this.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN);
    const rn = einstellungen.rechnungsnummer || { praefix: 'R-', stellen: 4, naechste_laufnummer: 1 };
    const vergebeneNummer = rn.praefix + String(rn.naechste_laufnummer).padStart(rn.stellen, '0');
    rn.naechste_laufnummer = rn.naechste_laufnummer + 1;
    einstellungen.rechnungsnummer = rn;
    await this.schreibeJSON('einstellungen.json', einstellungen);
    return vergebeneNummer;
  }

  /**
   * Vergibt automatisch eine neue, fortlaufende Kundennummer (z.B. K-00003)
   * und erhöht den Zähler in kunden.json.
   */
  async vergibNaechsteKundennummer() {
    const daten = await this.leseJSON('kunden.json', { kunden: [], naechste_laufnummer: 1 });
    const laufnummer = daten.naechste_laufnummer || 1;
    const nummer = 'K-' + String(laufnummer).padStart(5, '0');
    daten.naechste_laufnummer = laufnummer + 1;
    await this.schreibeJSON('kunden.json', daten);
    return nummer;
  }

  /* ── JSON LESEN ── */
  async leseJSON(dateiname, fallback = {}) {
    try {
      const fileHandle = await this.dataHandle.getFileHandle(dateiname, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (!text.trim()) return fallback;
      return JSON.parse(text);
    } catch (err) {
      if (err.name === 'NotFoundError') {
        // Datei existiert noch nicht -> mit Fallback-Inhalt neu anlegen
        await this.schreibeJSON(dateiname, fallback);
        return fallback;
      }
      throw err;
    }
  }

  /* ── JSON SCHREIBEN (komplette Datei wird ersetzt) ── */
  async schreibeJSON(dateiname, data) {
    const fileHandle = await this.dataHandle.getFileHandle(dateiname, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  /**
   * Legt eine fertige Rechnung als HTML-Datei im passenden Kundenordner
   * unter output/ ab. Erstellt den Kundenordner automatisch, falls er
   * noch nicht existiert.
   */
  async speichereRechnungImKundenordner(kundennummer, kundenname, dateiname, htmlInhalt) {
    const ordnerName = baueKundenOrdnerNamen(kundennummer, kundenname);
    const kundenOrdner = await this.outputHandle.getDirectoryHandle(ordnerName, { create: true });
    const fileHandle = await kundenOrdner.getFileHandle(dateiname, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(htmlInhalt);
    await writable.close();
    return ordnerName;
  }
}

/**
 * Wandelt Kundennummer + Name in einen dateisystemsicheren Ordnernamen um.
 * Example: ("K-00001", "Max Mustermann") -> "K-00001_Max_Mustermann"
 */
function baueKundenOrdnerNamen(kundennummer, kundenname) {
  const slugify = (text) => {
    const umlaute = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
    let t = (text || '').replace(/[äöüÄÖÜß]/g, m => umlaute[m] || m);
    t = t.replace(/[^A-Za-z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
    return t || 'unbekannt';
  };

  if (!kundennummer || !kundennummer.trim()) {
    return '_ohne_kundennummer';
  }
  return `${slugify(kundennummer)}_${slugify(kundenname)}`;
}

// Eine einzige, geteilte Instanz für die ganze Seite
const fileStore = new FileStore();