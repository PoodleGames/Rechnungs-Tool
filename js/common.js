/**
 * common.js
 * ---------
 * Gemeinsame Hilfsfunktionen für alle drei Seiten. Ersetzt die frühere
 * API-Kommunikation komplett: es gibt keinen Server mehr, alle Daten
 * werden direkt über filestore.js auf der Festplatte gelesen/geschrieben.
 *
 * Dieses Modul kümmert sich zusätzlich um den "Verbinden"-Bildschirm,
 * der beim ersten Öffnen (oder nach Browser-Neustart) kurz erscheint,
 * damit der Nutzer den Projektordner einmalig freigibt.
 */

/**
 * Zeigt — falls nötig — den Verbindungs-Bildschirm und wartet, bis der
 * Nutzer den Projektordner ausgewählt hat. Wird von jeder Seite ganz am
 * Anfang aufgerufen, bevor irgendwelche Daten geladen werden.
 * Gibt ein Promise zurück, das erst auflöst, wenn fileStore verbunden ist.
 */
function stelleDatenzugriffSicher() {
  return new Promise((resolve) => {
    if (!unterstuetztDateizugriff()) {
      zeigeBrowserHinweis();
      return; // löst absichtlich nie auf — Tool kann ohne passenden Browser nicht funktionieren
    }

    fileStore.versucheAutoVerbindung().then(verbunden => {
      if (verbunden) {
        resolve();
        return;
      }
      zeigeVerbindenBildschirm(resolve);
    });
  });
}

function zeigeBrowserHinweis() {
  const overlay = erzeugeOverlay();
  overlay.innerHTML = `
    <div class="connect-box">
      <div class="connect-icon">⚠️</div>
      <h2>Bitte Microsoft Edge oder Google Chrome verwenden</h2>
      <p>
        Dieses Rechnungstool benötigt einen modernen Browser (Microsoft Edge
        oder Google Chrome), um direkt auf Dateien zugreifen zu können.
        Edge ist auf jedem Windows-Rechner bereits vorinstalliert.
      </p>
      <p class="connect-hint">Bitte öffne diese Datei stattdessen in Edge oder Chrome.</p>
    </div>
  `;
}

function zeigeVerbindenBildschirm(onConnected) {
  const overlay = erzeugeOverlay();
  overlay.innerHTML = `
    <div class="connect-box">
      <div class="connect-icon">📁</div>
      <h2>Rechnungstool mit deinem Ordner verbinden</h2>
      <p>
        Klicke unten auf <strong>"Ordner auswählen"</strong>. Im sich
        öffnenden Fenster musst du dann zu dem Ordner navigieren, in dem
        sich diese Datei (<code>Rechnungstool.html</code>) befindet, und
        genau diesen Ordner auswählen.
      </p>
      <p class="connect-warning">
        ⚠️ Wichtig: Der Dialog öffnet sich möglicherweise zunächst in
        einem anderen Ordner (z.B. "Dokumente"). Bitte navigiere darin
        aktiv zum richtigen Ordner, statt einfach zu bestätigen — sonst
        werden deine Daten am falschen Ort gespeichert.
      </p>
      <p class="connect-hint">
        Das musst du nur beim ersten Mal machen — danach merkt sich der
        Browser deine Auswahl automatisch. Die Unterordner "data" und
        "output" werden darin automatisch angelegt, falls sie noch
        nicht existieren.
      </p>
      <button class="btn btn-primary connect-btn" id="btnOrdnerWaehlen">📂 Ordner auswählen</button>
      <p class="connect-error" id="connectError" style="display:none;"></p>
    </div>
  `;

  document.getElementById('btnOrdnerWaehlen').addEventListener('click', async () => {
    const errorEl = document.getElementById('connectError');
    errorEl.style.display = 'none';
    try {
      await fileStore.waehleProjektordner();
      overlay.remove();
      onConnected();
    } catch (err) {
      if (err.name === 'AbortError') return; // Nutzer hat Dialog abgebrochen, einfach nochmal versuchen lassen
      errorEl.textContent = 'Hinweis: ' + err.message;
      errorEl.style.display = 'block';
    }
  });
}

function erzeugeOverlay() {
  let overlay = document.getElementById('connectOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'connectOverlay';
    overlay.className = 'connect-overlay';
    document.body.appendChild(overlay);
  }
  return overlay;
}

/**
 * Zeigt eine kurze Toast-Benachrichtigung unten rechts an.
 */
function showToast(message, isError = false) {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

/**
 * Formatiert eine Zahl als deutschen Euro-Betrag, z.B. 1234.5 -> "1.234,50"
 */
function formatEuro(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parst einen deutsch formatierten Betrag ("1.234,50" oder "1234,50" oder "1234.50")
 * zurück in eine Float-Zahl.
 */
function parseEuroInput(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const cleaned = String(value).trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function heutigesDatumISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Wandelt ein ISO-Datum (JJJJ-MM-TT, wie es <input type="date"> liefert)
 * in das deutsche Anzeigeformat TT.MM.JJJJ um.
 */
function isoDatumZuDE(isoDatum) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDatum || '').trim());
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/**
 * Einfache HTML-Escape-Funktion, um XSS bei dynamisch eingefügten
 * Texten (z.B. aus JSON-Daten) zu vermeiden.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}