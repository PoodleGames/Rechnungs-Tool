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
 * Prüft ob das Tool korrekt über localhost läuft.
 * Gibt ein Promise zurück, das sofort auflöst wenn alles korrekt ist.
 * Zeigt einen Hinweis wenn die Datei direkt (file://) geöffnet wurde.
 */
async function stelleDatenzugriffSicher() {
  if (!unterstuetztDateizugriff()) {
    zeigeFalschGeoeffnetHinweis();
    return new Promise(() => {}); // hängt absichtlich
  }
  await fileStore.init();
}

function zeigeFalschGeoeffnetHinweis() {
  const overlay = document.createElement('div');
  overlay.className = 'connect-overlay';
  overlay.innerHTML = `
    <div class="connect-box">
      <div class="connect-icon">⚠️</div>
      <h2>Bitte über start.bat öffnen</h2>
      <p>
        Das Rechnungstool wurde direkt als Datei geöffnet.<br>
        Bitte schließe diesen Tab und starte das Tool stattdessen
        per Doppelklick auf <strong>start.bat</strong> im Projektordner.
      </p>
      <p class="connect-hint">
        start.bat startet automatisch einen lokalen Server und
        öffnet das Tool im Browser — kein weiterer Schritt nötig.
      </p>
    </div>
  `;
  document.body.appendChild(overlay);
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