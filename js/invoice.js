/**
 * invoice.js
 * ----------
 * Steuert das Rechnungsformular. Läuft komplett ohne Server: alle Daten
 * (Artikelkatalog, Kundenliste, Firmeneinstellungen, Rechnungsnummer)
 * werden direkt über fileStore aus den echten JSON-Dateien gelesen bzw.
 * dorthin zurückgeschrieben.
 *
 * Funktional unverändert gegenüber der Server-Version:
 * - Positionen verwalten (hinzufügen/entfernen/bearbeiten)
 * - Zwischensumme, Rabatt, Gesamtsumme automatisch berechnet (nicht editierbar)
 * - PDF-Export per Browser-Druckdialog
 * - HTML-Download wie gehabt
 * - "Im Kundenordner ablegen" vergibt eine fortlaufende Rechnungsnummer
 *   und legt die Datei automatisch im richtigen output/-Unterordner ab
 */

let katalog = [];
let kundenListe = [];
let einstellungen = {};
let positionen = [];
let posCounter = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await stelleDatenzugriffSicher();
  await init();
});

async function init() {
  document.getElementById('feldDatum').value = heutigesDatumISO();

  try {
    const [artikelDaten, kundenDaten, settingsDaten] = await Promise.all([
      fileStore.leseJSON('artikel.json', STANDARD_ARTIKEL),
      fileStore.leseJSON('kunden.json', STANDARD_KUNDEN),
      fileStore.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN),
    ]);

    katalog = artikelDaten.artikel || [];
    kundenListe = kundenDaten.kunden || [];
    einstellungen = settingsDaten || {};

    befuelleArtikelDropdown();
    befuelleKundenDropdown();
    wendeEinstellungenAn();

    // Rechnungsnummer-Vorschau direkt aus den bereits geladenen Einstellungen
    // berechnen, statt die Datei ein zweites Mal separat zu lesen — das
    // vermeidet zwei gleichzeitige Lesezugriffe auf dieselbe Datei beim
    // Seitenstart.
    const rn = einstellungen.rechnungsnummer || { praefix: 'R-', stellen: 4, naechste_laufnummer: 1 };
    const nummerVorschau = rn.praefix + String(rn.naechste_laufnummer).padStart(rn.stellen, '0');
    document.getElementById('feldRechnungsnummer').value = nummerVorschau + ' (Entwurf)';

    if (katalog.length > 0) {
      katalog.slice(0, Math.min(2, katalog.length)).forEach(a => addPosition(a));
    } else {
      addLeerePosition();
    }
  } catch (err) {
    showToast('Fehler beim Laden: ' + err.message, true);
    addLeerePosition();
  }

  document.getElementById('rabattProzent').addEventListener('input', berechneSummen);
  document.getElementById('invoicePage').addEventListener('input', checkOverflow);

  // Wenn der Nutzer Adresse/Firma/Titel auf Seite 1 direkt bearbeitet,
  // sollen die Folgeseiten sofort synchron aktualisiert werden (Single Source of Truth).
  ['empfaengerBlock', 'firmaName', 'firmaAdresse', 'firmaKontakt',
   'anredeBlock', 'feldBetreff', 'feldRechnungsnummer', 'feldKundennummer',
   'feldLeistungszeitraumVon', 'feldLeistungszeitraumBis'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      if (document.querySelectorAll('.invoice-page-extra').length > 0) {
        renderPositionen();
      }
    });
  });

  checkOverflow();
  if (window.ResizeObserver) new ResizeObserver(checkOverflow).observe(document.getElementById('invoicePage'));
}

/**
 * Verbindet eine Liste von Textzeilen mit <br>, lässt dabei aber leere
 * oder reine Whitespace-Zeilen komplett weg. So entstehen keine nackten
 * Labels ("Tel:") wenn das zugehörige Feld in den Firmeneinstellungen
 * (noch) nicht ausgefüllt ist.
 */
function baueZeilen(zeilen) {
  return zeilen.filter(z => z && z.trim()).join('<br>');
}

function wendeEinstellungenAn() {
  const firma = einstellungen.firma || {};
  if (firma.name) {
    document.getElementById('firmaName').textContent = firma.name;
    document.getElementById('footerAbsenderTitel').textContent = firma.name;
    document.getElementById('grussName').textContent = firma.name;
  }

  document.getElementById('firmaAdresse').innerHTML = baueZeilen([
    firma.strasse,
    [firma.plz, firma.ort].filter(Boolean).join(' '),
  ]);

  document.getElementById('firmaKontakt').innerHTML = baueZeilen([
    firma.telefon ? `Tel: ${firma.telefon}` : '',
    firma.email,
  ]);

  document.getElementById('footerAbsenderAdresse').innerHTML = baueZeilen([
    firma.steuernummer ? `Steuernummer: ${firma.steuernummer}` : '',
    firma.inhaber ? `Inhaber: ${firma.inhaber}` : '',
  ]);

  document.getElementById('footerKontaktInhalt').innerHTML = baueZeilen([
    firma.telefon ? `Telefon: ${firma.telefon}` : '',
    firma.email ? `E-Mail: ${firma.email}` : '',
  ]);

  document.getElementById('footerBankInhalt').innerHTML = baueZeilen([
    firma.bank_name ? `Bank: ${firma.bank_name}` : '',
    firma.iban ? `IBAN: ${firma.iban}` : '',
    firma.bic ? `BIC: ${firma.bic}` : '',
  ]);

  if (firma.kleinunternehmer_hinweis) document.getElementById('hinweisUst').textContent = firma.kleinunternehmer_hinweis;
  if (firma.zahlungshinweis) document.getElementById('hinweisZahlung').textContent = firma.zahlungshinweis;
  if (firma.gruss) document.getElementById('grussText').textContent = firma.gruss;

  if (typeof einstellungen.standard_rabatt_prozent === 'number') {
    document.getElementById('rabattProzent').value = einstellungen.standard_rabatt_prozent;
  }
}

/* ── KUNDEN-DROPDOWN ── */
function befuelleKundenDropdown() {
  const select = document.getElementById('kundenAuswahl');
  select.innerHTML = '<option value="">+ Kunde aus Adressbuch wählen…</option>';
  kundenListe.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k.kundennummer;
    opt.textContent = `${k.name} (${k.kundennummer})`;
    select.appendChild(opt);
  });
}

function uebernehmeKunde() {
  const select = document.getElementById('kundenAuswahl');
  const nummer = select.value;
  if (!nummer) { showToast('Bitte zuerst einen Kunden auswählen.', true); return; }
  const k = kundenListe.find(x => x.kundennummer === nummer);
  if (!k) return;

  document.getElementById('feldKundennummer').value = k.kundennummer;
  document.getElementById('empfaengerBlock').textContent =
    `${k.name}\n${k.strasse}\n${k.plz} ${k.ort}`;
  showToast(`Kunde "${k.name}" übernommen.`);
  checkOverflow();
}

/* ── ARTIKEL-DROPDOWN ── */
function befuelleArtikelDropdown() {
  const select = document.getElementById('artikelAuswahl');
  select.innerHTML = '<option value="">+ Artikel aus Katalog wählen…</option>';
  katalog.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.title} (€ ${formatEuro(a.einzelpreis)})`;
    select.appendChild(opt);
  });
}

function addPositionFromCatalog() {
  const select = document.getElementById('artikelAuswahl');
  const id = select.value;
  if (!id) { showToast('Bitte zuerst einen Artikel auswählen.', true); return; }
  const artikel = katalog.find(a => a.id === id);
  if (artikel) addPosition(artikel);
  select.value = '';
}

function addLeerePosition() {
  addPosition({ title: '', description: '', einzelpreis: 0, einheit: 'Stück', ust: 0 });
}

/* ── POSITIONEN ── */
function addPosition(artikel) {
  const pos = {
    _id: 'pos' + (posCounter++),
    title: artikel.title || '',
    description: artikel.description || '',
    menge: 1,
    einheit: artikel.einheit || 'Stück',
    ust: artikel.ust ?? 0,
    einzelpreis: artikel.einzelpreis ?? 0,
  };
  positionen.push(pos);
  renderPositionen();
}

function removePosition(id) {
  if (positionen.length <= 1) { showToast('Mindestens eine Position muss bestehen bleiben.', true); return; }
  positionen = positionen.filter(p => p._id !== id);
  renderPositionen();
}

function berechneSeiten(positionen) {
  const max = parseInt(document.getElementById('maxPositionenProSeite').value, 10) || 5;
  if (positionen.length === 0) return [[]];
  const seiten = [];
  for (let i = 0; i < positionen.length; i += max) {
    seiten.push(positionen.slice(i, i + max));
  }
  return seiten;
}

function renderPositionen() {
  // ── Seite 1 bleibt immer im DOM, unverändert in Struktur ──
  // Alle zuvor erzeugten Folgeseiten entfernen (werden gleich neu gebaut).
  document.querySelectorAll('.invoice-page-extra').forEach(el => el.remove());

  // Positionen aufteilen: 7 pro normale Seite, max 5 auf der letzten Seite.
  const seiten = berechneSeiten(positionen);

  const gesamtSeiten = seiten.length;

  // ── Seite 1: Positionen in die bestehende Tabelle schreiben ──
  const ersteBody = document.getElementById('positionsBody');
  ersteBody.innerHTML = '';
  seiten[0].forEach((pos, idx) => ersteBody.appendChild(buildPositionRow(pos, idx)));
  aktiviereZeilenEvents(ersteBody);

  // Summen auf Seite 1 nur anzeigen wenn es genau EINE Seite gibt.
  document.querySelector('#invoicePage .inv-totals-wrap').style.display =
    gesamtSeiten === 1 ? '' : 'none';

  // Seitenzahl Seite 1.
  setSeitenzahl(document.getElementById('invoicePage'), 1, gesamtSeiten);

  // ── Folgeseiten: Klon von Seite 1, bereinigt und befüllt ──
  const container = document.getElementById('pagesContainer');

  for (let s = 1; s < gesamtSeiten; s++) {
    const istLetzte = s === gesamtSeiten - 1;

    const klon = document.getElementById('invoicePage').cloneNode(true);
    klon.id = '';
    klon.classList.add('invoice-page-extra');

    // Doppelte IDs entfernen
    klon.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

    // Nur den Kundenpicker ausblenden, NICHT alle .no-print Elemente
    // (die +/- Buttons und add-item-bar sollen auf Folgeseiten bleiben)
    const picker = klon.querySelector('#kundenPickerBar, [id="kundenPickerBar"]');
    if (picker) picker.remove();
    // Auch contenteditable auf Folgeseiten deaktivieren (nur Seite 1 editierbar)
    klon.querySelectorAll('[contenteditable]').forEach(el => el.setAttribute('contenteditable', 'false'));

    // Positionen dieser Seite schreiben
    const klonBody = klon.querySelector('.inv-items-table tbody');
    klonBody.innerHTML = '';
    const max = parseInt(document.getElementById('maxPositionenProSeite').value, 10) || 5;
    const startIdx = s * max;
    seiten[s].forEach((pos, idx) => {
      const row = buildPositionRow(pos, startIdx + idx);
      klonBody.appendChild(row);
    });
    aktiviereZeilenEvents(klonBody);

    // Summen: nur auf der letzten Seite
    const klonTotals = klon.querySelector('.inv-totals-wrap');
    if (klonTotals) klonTotals.style.display = istLetzte ? '' : 'none';

    setSeitenzahl(klon, s + 1, gesamtSeiten);

    container.appendChild(klon);
  }

  berechneSummen();
  checkOverflow();
}

/**
 * Setzt die Seitenzahl-Anzeige ("Seite X von N") auf einer Seite.
 * Bei nur einer Seite bleibt die Anzeige leer — kein "Seite 1 von 1".
 */
function setSeitenzahl(seitenEl, nummer, gesamt) {
  let badge = seitenEl.querySelector('.inv-pagenumber');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'inv-pagenumber';
    seitenEl.appendChild(badge);
  }
  badge.textContent = gesamt > 1 ? `Seite ${nummer} von ${gesamt}` : '';
}


function buildPositionRow(pos, idx) {
  const tr = document.createElement('tr');
  tr.className = 'item-row';
  tr.innerHTML = `
    <td class="item-pos">${idx + 1}.</td>
    <td>
      <div class="autocomplete-wrap">
        <textarea class="item-title-input" rows="1" data-id="${pos._id}" data-field="title" placeholder="Titel — tippen für Vorschläge" autocomplete="off">${escapeHtml(pos.title)}</textarea>
        <div class="autocomplete-list" data-list-for="${pos._id}"></div>
      </div>
      <textarea class="item-desc-input" rows="2" data-id="${pos._id}" data-field="description" placeholder="Beschreibung">${escapeHtml(pos.description)}</textarea>
    </td>
    <td class="num"><input class="item-num-input" type="number" min="0" step="0.01" data-id="${pos._id}" data-field="menge" value="${pos.menge}"></td>
    <td><input class="item-num-input" style="text-align:left" type="text" data-id="${pos._id}" data-field="einheit" value="${escapeHtml(pos.einheit)}"></td>
    <td class="num"><input class="item-num-input" type="number" min="0" step="1" data-id="${pos._id}" data-field="ust" value="${pos.ust}">%</td>
    <td class="num"><input class="item-num-input" type="text" data-id="${pos._id}" data-field="einzelpreis" value="${formatEuro(pos.einzelpreis)}"></td>
    <td class="num item-gesamt" data-row="${pos._id}">€ ${formatEuro(pos.menge * pos.einzelpreis)}</td>
    <td class="no-print item-actions-cell">
      <div class="item-row-actions">
        <button class="row-btn" type="button" title="Position duplizieren" onclick="duplicatePosition('${pos._id}')">+</button>
        <button class="row-btn minus" type="button" title="Position entfernen" onclick="removePosition('${pos._id}')">−</button>
      </div>
    </td>
  `;
  return tr;
}

/**
 * Hängt an eine Tabellen-tbody die nötigen Event-Listener (Eingabe-Handler,
 * Autocomplete) an — identisch für Seite 1 und alle Folgeseiten.
 */
function aktiviereZeilenEvents(body) {
  body.querySelectorAll('textarea, input').forEach(el => {
    el.addEventListener('input', onPositionFieldChange);
    if (el.tagName === 'TEXTAREA') autoResize(el);
  });

  body.querySelectorAll('.item-title-input').forEach(el => {
    el.addEventListener('input', onTitleAutocompleteInput);
    el.addEventListener('focus', onTitleAutocompleteInput);
    el.addEventListener('blur', () => {
      // Kurze Verzögerung, damit ein Klick auf einen Vorschlag noch ankommt,
      // bevor die Liste durch den Fokusverlust geschlossen wird.
      setTimeout(() => closeAutocomplete(el.dataset.id), 150);
    });
  });
}

/* ── ARTIKEL-AUTOFILL BEIM TIPPEN ── */
function onTitleAutocompleteInput(e) {
  const input = e.target;
  const id = input.dataset.id;
  const query = input.value.trim().toLowerCase();
  const list = document.querySelector(`.autocomplete-list[data-list-for="${id}"]`);
  if (!list) return;

  if (!query) {
    // Beim reinen Fokussieren ohne Text: ganzen Katalog als Vorschlag zeigen
    renderAutocompleteOptions(list, katalog.slice(0, 8), id);
    return;
  }

  const treffer = katalog.filter(a => a.title.toLowerCase().includes(query)).slice(0, 8);
  if (treffer.length === 0) {
    closeAutocomplete(id);
    return;
  }
  renderAutocompleteOptions(list, treffer, id);
}

function renderAutocompleteOptions(list, treffer, id) {
  list.innerHTML = treffer.map(a => `
    <div class="autocomplete-item" data-artikel-id="${escapeHtml(a.id)}" data-pos-id="${id}">
      <span class="ac-price">€ ${formatEuro(a.einzelpreis)}</span>
      <span class="ac-title">${escapeHtml(a.title)}</span>
      ${a.description ? `<span class="ac-desc">${escapeHtml(a.description)}</span>` : ''}
    </div>
  `).join('');
  list.classList.add('open');

  list.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', (ev) => {
      ev.preventDefault(); // verhindert, dass das Textarea-blur vor dem Klick feuert
      const artikelId = item.dataset.artikelId;
      const posId = item.dataset.posId;
      uebernehmeArtikelInPosition(posId, artikelId);
    });
  });
}

function closeAutocomplete(id) {
  const list = document.querySelector(`.autocomplete-list[data-list-for="${id}"]`);
  if (list) { list.classList.remove('open'); list.innerHTML = ''; }
}

function uebernehmeArtikelInPosition(posId, artikelId) {
  const pos = positionen.find(p => p._id === posId);
  const artikel = katalog.find(a => a.id === artikelId);
  if (!pos || !artikel) return;

  pos.title = artikel.title;
  pos.description = artikel.description || '';
  pos.einzelpreis = artikel.einzelpreis ?? 0;
  pos.einheit = artikel.einheit || pos.einheit;
  pos.ust = artikel.ust ?? pos.ust;

  renderPositionen();
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function duplicatePosition(id) {
  const pos = positionen.find(p => p._id === id);
  if (!pos) return;
  const copy = { ...pos, _id: 'pos' + (posCounter++) };
  const idx = positionen.findIndex(p => p._id === id);
  positionen.splice(idx + 1, 0, copy);
  renderPositionen();
}

function onPositionFieldChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  const pos = positionen.find(p => p._id === id);
  if (!pos) return;

  if (field === 'menge') {
    pos.menge = parseEuroInput(e.target.value);
  } else if (field === 'einzelpreis') {
    pos.einzelpreis = parseEuroInput(e.target.value);
  } else if (field === 'ust') {
    pos.ust = parseFloat(e.target.value) || 0;
  } else {
    pos[field] = e.target.value;
  }

  if (e.target.tagName === 'TEXTAREA') autoResize(e.target);

  const gesamtCell = document.querySelector(`.item-gesamt[data-row="${id}"]`);
  if (gesamtCell) gesamtCell.textContent = '€ ' + formatEuro(pos.menge * pos.einzelpreis);

  berechneSummen();
}

/* ── SUMMEN (nicht direkt editierbar, nur berechnet) ── */
function berechneSummen() {
  const zwischensumme = positionen.reduce((sum, p) => sum + (p.menge * p.einzelpreis), 0);
  const rabattProzent = parseFloat(document.getElementById('rabattProzent').value) || 0;
  const rabattBetrag = zwischensumme * (rabattProzent / 100);
  const gesamt = zwischensumme - rabattBetrag;

  document.getElementById('sumZwischensumme').textContent = '€ ' + formatEuro(zwischensumme);
  document.getElementById('sumRabatt').textContent = '-€ ' + formatEuro(rabattBetrag);
  document.getElementById('sumGesamt').textContent = '€ ' + formatEuro(gesamt);

  checkOverflow();
}

/* ── OVERFLOW-PRÜFUNG ── */
function checkOverflow() {
  const seiten = document.querySelectorAll('.invoice-page');
  const bar = document.getElementById('overflowBar');
  let ueberlauf = false;
  seiten.forEach(page => {
    if (page.scrollHeight > page.offsetHeight + 2) ueberlauf = true;
  });
  bar.classList.toggle('visible', ueberlauf);
}

/* ── HTML-EXPORT (lokaler Download) ── */
function buildExportHTML() {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('.no-print, .action-btns, .overflow-bar, .toast, .connect-overlay, .autocomplete-list, #kundenPickerBar').forEach(el => el.remove());
  clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('textarea, input').forEach(el => {
    if (el.tagName === 'TEXTAREA') {
      const div = document.createElement('div');
      div.className = el.className.replace('item-title-input', 'item-title').replace('item-desc-input', 'item-desc');
      div.textContent = el.value;
      el.replaceWith(div);
    } else if (el.type !== 'date') {
      const span = document.createElement('span');
      span.className = 'field-value';
      span.textContent = el.value;
      el.replaceWith(span);
    }
  });
  clone.querySelectorAll('script').forEach(el => el.remove());
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}

function saveHTML() {
  const html = buildExportHTML();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const nr = document.getElementById('feldRechnungsnummer').value.replace(/[^A-Za-z0-9\-]/g, '_');
  a.href = url;
  a.download = `Rechnung_${nr}_${heutigesDatumISO()}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('HTML-Datei wurde heruntergeladen.');
}

/* ── PDF-EXPORT über Druckdialog (identisch zur Vorlage) ── */
function printPDF() {
  const container = document.getElementById('pagesContainer');
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(s => s.outerHTML).join('\n');

  const printClone = container.cloneNode(true);
  printClone.querySelectorAll('textarea, input').forEach(el => {
    if (el.tagName === 'TEXTAREA') {
      const div = document.createElement('div');
      div.className = el.className.replace('item-title-input', 'item-title').replace('item-desc-input', 'item-desc');
      div.textContent = el.value;
      el.replaceWith(div);
    } else if (el.type !== 'date') {
      const span = document.createElement('span');
      span.textContent = el.value;
      el.replaceWith(span);
    }
  });

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}
  <style>
    @page { size: 210mm 297mm; margin: 0; }
    html, body { margin:0; padding:0; background:#fff; display:block; }
    .no-print { display: none !important; }
    .invoice-page { box-shadow: none; width: 210mm; height: 297mm; page-break-after: always; }
    .invoice-page:last-child { page-break-after: auto; }
    #pagesContainer { gap: 0; }
  </style>
  </head><body>${printClone.outerHTML}</body></html>`);
  doc.close();

  let gedruckt = false;
  const doPrint = () => {
    if (gedruckt) return;
    gedruckt = true;
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    finally { setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 2000); }
  };
  iframe.onload = doPrint;
  setTimeout(doPrint, 800);
}

/* ── IM KUNDENORDNER ABLEGEN (direkter Dateizugriff, fortlaufende Nummer) ── */
async function speichereImKundenordner() {
  const kundennummer = document.getElementById('feldKundennummer').value.trim();
  const empfaengerText = document.getElementById('empfaengerBlock').textContent.trim();
  const kundenname = empfaengerText.split('\n')[0].trim() || 'Unbekannt';
  const datum = document.getElementById('feldDatum').value || heutigesDatumISO();

  if (!confirm('Rechnung jetzt final speichern? Dabei wird eine neue, fortlaufende Rechnungsnummer vergeben.\n\nFortfahren?')) {
    return;
  }

  try {
    const vergebeneNummer = await fileStore.vergibNaechsteRechnungsnummer();

    const feld = document.getElementById('feldRechnungsnummer');
    feld.value = vergebeneNummer;
    feld.title = '';

    const html = buildExportHTML();
    const dateiNummer = vergebeneNummer.replace(/[^A-Za-z0-9\-]/g, '_');
    const dateiname = `Rechnung_${dateiNummer}_${datum}.html`;

    const ordnerName = await fileStore.speichereRechnungImKundenordner(
      kundennummer, kundenname, dateiname, html
    );

    feld.title = 'Bereits vergeben — gespeichert in output/' + ordnerName + '/' + dateiname;
    showToast(`Gespeichert als ${dateiname} im Ordner output/${ordnerName}/`);
  } catch (err) {
    showToast('Fehler beim Speichern: ' + err.message, true);
  }
}