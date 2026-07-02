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

/** Tracks whether the current invoice has been finalized */
let invoiceFinalized = false;
/** The finalized invoice record (stored in invoices.json) */
let currentFinalizedInvoice = null;

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

  // Alle Stammdaten-Felder auf Seite 1 synchronisieren die Folgeseiten,
  // da diese komplette Klons von Seite 1 sind (Single Source of Truth).
  // contenteditable-Felder feuern 'input', date/text-Inputs feuern 'input' oder 'change'.
  const syncFelder = [
    'empfaengerBlock','firmaName','firmaAdresse','firmaKontakt',
    'anredeBlock','feldBetreff','feldKundennummer',
    'feldRechnungsnummer',
    'feldDatum','feldLeistungszeitraumVon','feldLeistungszeitraumBis',
    'footerAbsenderTitel','footerAbsenderAdresse',
    'footerKontaktTitel','footerKontaktInhalt',
    'footerBankTitel','footerBankInhalt',
    'grussText','grussName',
    'hinweisUst','hinweisZahlung',
  ];

  const syncHandler = () => {
    if (document.querySelectorAll('.invoice-page-extra').length > 0) {
      renderPositionen();
    }
  };

  syncFelder.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', syncHandler);
    el.addEventListener('change', syncHandler); // für date-Inputs
  });

  checkOverflow();
  if (window.ResizeObserver) new ResizeObserver(checkOverflow).observe(document.getElementById('invoicePage'));
  updateExportButtonState();
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

  if (document.querySelectorAll('.invoice-page-extra').length > 0) {
    renderPositionen();
  } else {
    checkOverflow();
  }
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
  document.querySelectorAll('.invoice-page-extra').forEach(el => el.remove());

  const seiten = berechneSeiten(positionen);
  const gesamtSeiten = seiten.length;
  const max = parseInt(document.getElementById('maxPositionenProSeite').value, 10) || 5;

  // ── Seite 1 ──
  const ersteBody = document.getElementById('positionsBody');
  ersteBody.innerHTML = '';
  seiten[0].forEach((pos, idx) => ersteBody.appendChild(buildPositionRow(pos, idx)));
  aktiviereZeilenEvents(ersteBody);

  // Summen nur wenn Seite 1 die letzte ist
  document.querySelector('#invoicePage .inv-totals-wrap').style.display =
    gesamtSeiten === 1 ? '' : 'none';

  // Add-Bar: auf Seite 1 nur zeigen wenn sie die letzte Seite ist
  const addBar = document.getElementById('addItemBar');
  addBar.style.display = gesamtSeiten === 1 ? '' : 'none';

  setSeitenzahl(document.getElementById('invoicePage'), 1, gesamtSeiten);

  // ── Folgeseiten ──
  const container = document.getElementById('pagesContainer');

  for (let s = 1; s < gesamtSeiten; s++) {
    const istLetzte = s === gesamtSeiten - 1;

    const klon = document.getElementById('invoicePage').cloneNode(true);
    klon.id = '';
    klon.classList.add('invoice-page-extra');

    // Stammdaten — nicht editierbar auf Folgeseiten
    klon.querySelectorAll('[contenteditable]').forEach(el =>
      el.setAttribute('contenteditable', 'false')
    );

    // Stammdaten-Inputs readonly — Positions-Inputs (data-id) bleiben editierbar
    klon.querySelectorAll('input, textarea').forEach(el => {
      if (!el.dataset.id && !el.classList.contains('rabatt-input-inline')) {
        el.setAttribute('readonly', 'true');
      }
    });

    // Kundenpicker + Max-Pos-Bar entfernen (nur Seite 1)
    const klonPickerBar = klon.querySelector('#kundenPickerBar');
    if (klonPickerBar) klonPickerBar.remove();
    klon.querySelectorAll('.max-pos-bar').forEach(el => el.remove());

    // Add-Bar: nur auf der letzten Seite anzeigen
    const klonAddBar = klon.querySelector('#addItemBar');
    if (klonAddBar) klonAddBar.style.display = istLetzte ? '' : 'none';

    // Artikel-Select und Button auf der letzten Seite verdrahten
    if (istLetzte && klonAddBar) {
      const origSelect = document.getElementById('artikelAuswahl');
      const klonSelect = klonAddBar.querySelector('select');
      if (klonSelect && origSelect) {
        klonSelect.innerHTML = origSelect.innerHTML;
        const btn = klonAddBar.querySelector('button.primary');
        if (btn) {
          btn.onclick = null;
          btn.addEventListener('click', () => {
            origSelect.value = klonSelect.value;
            addPositionFromCatalog();
          });
        }
      }
    }

    // Rabatt-Input mit Seite-1-Rabatt synchronisieren
    const klonRabatt = klon.querySelector('.rabatt-input-inline');
    if (klonRabatt) {
      const origRabatt = document.getElementById('rabattProzent');
      klonRabatt.value = origRabatt.value;
      klonRabatt.addEventListener('input', () => {
        origRabatt.value = klonRabatt.value;
        berechneSummen();
      });
    }

    // IDs erst jetzt entfernen, nachdem alles oben per ID selektiert wurde
    klon.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

    // Positionen dieser Seite — editierbar!
    const klonBody = klon.querySelector('.inv-items-table tbody');
    klonBody.innerHTML = '';
    const startIdx = s * max;
    seiten[s].forEach((pos, idx) => {
      klonBody.appendChild(buildPositionRow(pos, startIdx + idx));
    });
    aktiviereZeilenEvents(klonBody);

    // Summen nur auf letzter Seite
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
    <td class="num"><input class="item-num-input" type="number" min="1" step="1" data-id="${pos._id}" data-field="menge" value="${Math.round(pos.menge) || 1}"></td>
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
    pos.menge = Math.max(1, parseInt(e.target.value, 10) || 1);
    e.target.value = pos.menge; // Korrigierten Wert zurückschreiben
  } else if (field === 'einzelpreis') {
    pos.einzelpreis = parseEuroInput(e.target.value);
  } else if (field === 'ust') {
    pos.ust = parseFloat(e.target.value) || 0;
  } else {
    pos[field] = e.target.value;
  }

  if (e.target.tagName === 'TEXTAREA') autoResize(e.target);

  // Alle Gesamt-Zellen für diese Position aktualisieren (auch auf Folgeseiten)
  document.querySelectorAll(`.item-gesamt[data-row="${id}"]`).forEach(cell =>
    cell.textContent = '€ ' + formatEuro(pos.einzelpreis * pos.menge)
  );

  berechneSummen();
}

/* ── SUMMEN — rechnet aus dem positionen-Array, schreibt in alle Seiten ── */
function berechneSummen() {
  // Zwischensumme: sum(einzelpreis * menge) über alle Positionen
  const zwischensumme = positionen.reduce((sum, p) => sum + (p.einzelpreis * p.menge), 0);

  // Rabatt immer von Seite-1-Input lesen (Single Source of Truth)
  const rabattProzent = parseFloat(document.getElementById('rabattProzent').value) || 0;
  const rabattBetrag  = zwischensumme * (rabattProzent / 100);
  const gesamt        = zwischensumme - rabattBetrag;

  // In alle Summen-Elemente schreiben (Seite 1 per ID, letzte Seite per Klasse)
  document.querySelectorAll('.sum-zwischensumme').forEach(el =>
    el.textContent = '€ ' + formatEuro(zwischensumme));
  document.querySelectorAll('.sum-rabatt').forEach(el =>
    el.textContent = '-€ ' + formatEuro(rabattBetrag));
  document.querySelectorAll('.sum-gesamt').forEach(el =>
    el.textContent = '€ ' + formatEuro(gesamt));

  // Rabatt-Inputs auf allen Seiten synchron halten
  const rabattWert = document.getElementById('rabattProzent').value;
  document.querySelectorAll('.rabatt-input-inline').forEach(el => {
    if (el !== document.getElementById('rabattProzent')) el.value = rabattWert;
  });

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
// ── INVOICE FINALIZATION ──────────────────────────────────────────────────────

const DEFAULT_INVOICES = { invoices: [], next_sequence_number: 1 };

/**
 * Updates the enabled/disabled state of export buttons based on
 * whether the invoice has been finalized.
 */
function updateExportButtonState() {
  const exportButtons = ['btnSaveFolder', 'btnXml', 'btnPdf'];
  exportButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !invoiceFinalized;
    btn.title = invoiceFinalized ? '' : 'Erst Rechnung erstellen';
    btn.style.opacity = invoiceFinalized ? '1' : '0.45';
  });

  const finalizeBtn = document.getElementById('btnFinalize');
  if (finalizeBtn) {
    finalizeBtn.disabled = invoiceFinalized;
    finalizeBtn.style.opacity = invoiceFinalized ? '0.45' : '1';
    finalizeBtn.title = invoiceFinalized
      ? 'Rechnung bereits erstellt'
      : '';
  }
}

/**
 * Finalizes the current invoice:
 *  1. Assigns the next sequential invoice number
 *  2. Saves a complete snapshot to data/invoices.json
 *  3. Unlocks PDF and XML export buttons
 */
async function finalizeInvoice() {
  if (invoiceFinalized) {
    showToast('Diese Rechnung wurde bereits erstellt.', true);
    return;
  }

  if (positionen.length === 0) {
    showToast('Bitte mindestens eine Position hinzufügen.', true);
    return;
  }

  if (!confirm('Rechnung jetzt erstellen und finalisieren?\n\nDanach wird eine fortlaufende Rechnungsnummer vergeben und die Rechnung kann nicht mehr geändert werden.')) {
    return;
  }

  try {
    // Read and update invoice store atomically
    const store = await fileStore.leseJSON('invoices.json', DEFAULT_INVOICES);
    const seqNum   = store.next_sequence_number || 1;
    const settings = await fileStore.leseJSON('einstellungen.json', {});
    const rn       = settings.rechnungsnummer || { praefix: 'R-', stellen: 4 };
    const invoiceNumber = rn.praefix + String(seqNum).padStart(rn.stellen, '0');

    // Build totals
    const subtotal     = positionen.reduce((s, p) => s + p.einzelpreis * p.menge, 0);
    const discountPct  = parseFloat(document.getElementById('rabattProzent').value) || 0;
    const discountAmt  = subtotal * (discountPct / 100);
    const grandTotal   = subtotal - discountAmt;

    // Extract customer name from recipient block
    const recipientLines = document.getElementById('empfaengerBlock')
      .textContent.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const salutationPattern = /^(herrn?|frau|firma|z\.hd\.|an\s)/i;
    const customerName = (recipientLines[0] && salutationPattern.test(recipientLines[0]))
      ? (recipientLines[1] || '')
      : (recipientLines[0] || '');

    // Set the real invoice number in the form BEFORE capturing the HTML snapshot
    document.getElementById('feldRechnungsnummer').value = invoiceNumber;

    // Sync continuation pages so the snapshot includes all pages
    if (document.querySelectorAll('.invoice-page-extra').length > 0) {
      renderPositionen();
    }

    // Capture pixel-perfect HTML snapshot — this is what gets shown in the archive view
    const htmlSnapshot = buildExportHTML();

    // Build invoice record
    const invoice = {
      id:               'inv-' + Date.now(),
      invoice_number:   invoiceNumber,
      date:             document.getElementById('feldDatum').value,
      subject:          document.getElementById('feldBetreff').value.trim(),
      customer_number:  document.getElementById('feldKundennummer').value.trim(),
      customer_name:    customerName,
      customer_address: document.getElementById('empfaengerBlock').textContent.trim(),
      service_from:     document.getElementById('feldLeistungszeitraumVon').value,
      service_to:       document.getElementById('feldLeistungszeitraumBis').value,
      salutation_text:  document.getElementById('anredeBlock').textContent.trim(),
      html_snapshot:    htmlSnapshot,
      // Company snapshot at time of finalization
      company: {
        name:         document.getElementById('firmaName').textContent.trim(),
        address:      document.getElementById('firmaAdresse').innerText.trim(),
        contact:      document.getElementById('firmaKontakt').innerText.trim(),
        footer_left:  document.getElementById('footerAbsenderAdresse').innerText.trim(),
        footer_mid_title:   document.getElementById('footerKontaktTitel').textContent.trim(),
        footer_mid:   document.getElementById('footerKontaktInhalt').innerText.trim(),
        footer_right_title: document.getElementById('footerBankTitel').textContent.trim(),
        footer_right: document.getElementById('footerBankInhalt').innerText.trim(),
        vat_note:     document.getElementById('hinweisUst').textContent.trim(),
        payment_note: document.getElementById('hinweisZahlung').textContent.trim(),
        greeting:     document.getElementById('grussText').textContent.trim(),
        greeting_name:document.getElementById('grussName').textContent.trim(),
      },
      line_items: positionen.map(p => ({
        title:        p.title,
        description:  p.description,
        quantity:     p.menge,
        unit:         p.einheit,
        unit_price:   p.einzelpreis,
        vat_rate:     p.ust,
        line_total:   p.einzelpreis * p.menge,
      })),
      totals: {
        subtotal,
        discount_percent: discountPct,
        discount_amount:  discountAmt,
        grand_total:      grandTotal,
      },
      status:        'finalized',
      finalized_at:  new Date().toISOString(),
    };

    // Save to store
    store.invoices = store.invoices || [];
    store.invoices.push(invoice);
    store.next_sequence_number = seqNum + 1;
    await fileStore.schreibeJSON('invoices.json', store);

    // Update UI state
    invoiceFinalized = true;
    currentFinalizedInvoice = invoice;

    updateExportButtonState();
    showToast(`Rechnung ${invoiceNumber} wurde erstellt.`);
  } catch (err) {
    showToast('Fehler beim Erstellen der Rechnung: ' + err.message, true);
  }
}

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
    } else if (el.type === 'date') {
      const span = document.createElement('span');
      span.className = 'field-value';
      span.textContent = el.value ? isoDatumZuDE(el.value) : '';
      el.replaceWith(span);
    } else {
      const span = document.createElement('span');
      span.className = 'field-value';
      span.textContent = el.value;
      el.replaceWith(span);
    }
  });
  clone.querySelectorAll('script').forEach(el => el.remove());
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}

function exportXML() {
  const esc = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // Daten aus dem Formular lesen
  const nr      = document.getElementById('feldRechnungsnummer').value.trim().replace(/\s*\(Entwurf\)/i, '');
  const datum   = document.getElementById('feldDatum').value;           // YYYY-MM-DD
  const lzVon   = document.getElementById('feldLeistungszeitraumVon').value;
  const lzBis   = document.getElementById('feldLeistungszeitraumBis').value;
  const knr     = document.getElementById('feldKundennummer').value.trim();
  const betreff = document.getElementById('feldBetreff').value.trim();

  // Firmendaten (Verkäufer)
  const firmaName  = document.getElementById('firmaName').textContent.trim();
  const firmaAdr   = document.getElementById('firmaAdresse').innerText.trim();
  const firmaTel   = document.getElementById('firmaKontakt').innerText.trim();
  const footerAdr  = document.getElementById('footerAbsenderAdresse').innerText.trim();

  // Steuernummer aus Footer extrahieren
  const steuernrMatch = footerAdr.match(/Steuernummer[:\s]+([^\n]+)/i);
  const steuernr = steuernrMatch ? steuernrMatch[1].trim() : '';

  // IBAN aus Footer
  const bankInfo  = document.getElementById('footerBankInhalt').innerText.trim();
  const ibanMatch = bankInfo.match(/IBAN[:\s]+([^\n]+)/i);
  const bicMatch  = bankInfo.match(/BIC[:\s]+([^\n]+)/i);
  const iban = ibanMatch ? ibanMatch[1].trim() : '';
  const bic  = bicMatch  ? bicMatch[1].trim()  : '';

  // Empfänger (Käufer)
  // Empfänger parsen — erste Zeile kann Anrede sein (Herrn/Frau/Herr/Frau)
  const empfLines = document.getElementById('empfaengerBlock')
    .textContent.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const anredePattern = /^(herrn?|frau|firma|z\.hd\.|an\s)/i;
  const empfOhneAnrede = empfLines[0] && anredePattern.test(empfLines[0])
    ? empfLines.slice(1) : empfLines;
  const kaeuferName    = empfOhneAnrede[0] || '';
  const kaeuferStr     = empfOhneAnrede[1] || '';
  const kaeuferPlzOrt  = empfOhneAnrede[2] || '';
  const plzOrtParts    = kaeuferPlzOrt.match(/^(\d{4,5})\s+(.+)$/);
  const kaeuferPlz     = plzOrtParts ? plzOrtParts[1] : kaeuferPlzOrt;
  const kaeuferOrt     = plzOrtParts ? plzOrtParts[2] : '';

  // Summen
  const rabattProzent = parseFloat(document.getElementById('rabattProzent').value) || 0;
  const zwischensumme = positionen.reduce((s, p) => s + p.einzelpreis * p.menge, 0);
  const rabattBetrag  = zwischensumme * (rabattProzent / 100);
  const gesamt        = zwischensumme - rabattBetrag;

  // UN/ECE Einheitencodes — https://docs.peppol.eu/poacc/billing/3.0/codelist/UNECERec20/
  const einheitCode = (e) => {
    const map = {
      'stück': 'C62', 'stk': 'C62', 'stk.': 'C62', 'stuck': 'C62',
      'stunde': 'HUR', 'stunden': 'HUR', 'std': 'HUR', 'std.': 'HUR', 'h': 'HUR',
      'minute': 'MIN', 'minuten': 'MIN', 'min': 'MIN',
      'tag': 'DAY', 'tage': 'DAY',
      'woche': 'WEE', 'wochen': 'WEE',
      'monat': 'MON', 'monate': 'MON',
      'jahr': 'ANN', 'jahre': 'ANN',
      'meter': 'MTR', 'm': 'MTR',
      'kilometer': 'KMT', 'km': 'KMT',
      'kilogramm': 'KGM', 'kg': 'KGM',
      'gramm': 'GRM', 'g': 'GRM',
      'liter': 'LTR', 'l': 'LTR',
      'pauschal': 'LS', 'pauschale': 'LS', 'psch': 'LS', 'psch.': 'LS',
      'seite': 'EA', 'seiten': 'EA',
      'stk ': 'C62',
    };
    return map[(e || '').toLowerCase().trim()] || 'C62';
  };

  // Datumsformat für XRechnung: YYYYMMDD
  const toXRDate = iso => iso ? iso.replace(/-/g, '') : '';

  // Positionen
  const posLines = positionen.map((p, i) => `
  <ram:IncludedSupplyChainTradeLineItem>
    <ram:AssociatedDocumentLineDocument>
      <ram:LineID>${i + 1}</ram:LineID>
    </ram:AssociatedDocumentLineDocument>
    <ram:SpecifiedTradeProduct>
      <ram:Name>${esc(p.title)}</ram:Name>
      ${p.description ? `<ram:Description>${esc(p.description)}</ram:Description>` : ''}
    </ram:SpecifiedTradeProduct>
    <ram:SpecifiedLineTradeAgreement>
      <ram:NetPriceProductTradePrice>
        <ram:ChargeAmount>${p.einzelpreis.toFixed(2)}</ram:ChargeAmount>
      </ram:NetPriceProductTradePrice>
    </ram:SpecifiedLineTradeAgreement>
    <ram:SpecifiedLineTradeDelivery>
      <ram:BilledQuantity unitCode="${einheitCode(p.einheit)}">${p.menge}</ram:BilledQuantity>
    </ram:SpecifiedLineTradeDelivery>
    <ram:SpecifiedLineTradeSettlement>
      <ram:ApplicableTradeTax>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementLineMonetarySummation>
        <ram:LineTotalAmount>${(p.einzelpreis * p.menge).toFixed(2)}</ram:LineTotalAmount>
      </ram:SpecifiedTradeSettlementLineMonetarySummation>
    </ram:SpecifiedLineTradeSettlement>
  </ram:IncludedSupplyChainTradeLineItem>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${esc(nr)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${toXRDate(datum)}</udt:DateTimeString>
    </ram:IssueDateTime>
    ${betreff ? `<ram:IncludedNote><ram:Content>${esc(betreff)}</ram:Content></ram:IncludedNote>` : ''}
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
${posLines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(knr)}</ram:BuyerReference>

      <ram:SellerTradeParty>
        <ram:Name>${esc(firmaName)}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:TradingBusinessName>${esc(firmaName)}</ram:TradingBusinessName>
        </ram:SpecifiedLegalOrganization>
        ${steuernr ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${esc(steuernr)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>

      <ram:BuyerTradeParty>
        <ram:Name>${esc(kaeuferName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(kaeuferPlz)}</ram:PostcodeCode>
          <ram:CityName>${esc(kaeuferOrt)}</ram:CityName>
          <ram:LineOne>${esc(kaeuferStr)}</ram:LineOne>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>
      ${lzVon || lzBis ? `<ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${toXRDate(lzVon || lzBis)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>` : ''}
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(nr)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${iban ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        ${bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${esc(bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>` : ''}

      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:ExemptionReason>Steuerbefreiung gemäß §19 UStG (Kleinunternehmer)</ram:ExemptionReason>
        <ram:BasisAmount>${gesamt.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:ExemptionReasonCode>vatex-eu-ae</ram:ExemptionReasonCode>
        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>

      ${lzVon ? `<ram:BillingSpecifiedPeriod>
        <ram:StartDateTime>
          <udt:DateTimeString format="102">${toXRDate(lzVon)}</udt:DateTimeString>
        </ram:StartDateTime>
        <ram:EndDateTime>
          <udt:DateTimeString format="102">${toXRDate(lzBis || lzVon)}</udt:DateTimeString>
        </ram:EndDateTime>
      </ram:BillingSpecifiedPeriod>` : ''}

      ${rabattBetrag > 0 ? `<ram:SpecifiedTradeAllowanceCharge>
        <ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>
        <ram:CalculationPercent>${rabattProzent}</ram:CalculationPercent>
        <ram:BasisAmount>${zwischensumme.toFixed(2)}</ram:BasisAmount>
        <ram:ActualAmount>${rabattBetrag.toFixed(2)}</ram:ActualAmount>
        <ram:CategoryTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>E</ram:CategoryCode>
          <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
        </ram:CategoryTradeTax>
      </ram:SpecifiedTradeAllowanceCharge>` : ''}

      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(document.getElementById('hinweisZahlung').textContent.trim())}</ram:Description>
      </ram:SpecifiedTradePaymentTerms>

      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${zwischensumme.toFixed(2)}</ram:LineTotalAmount>
        <ram:AllowanceTotalAmount>${rabattBetrag.toFixed(2)}</ram:AllowanceTotalAmount>
        <ram:TaxBasisTotalAmount>${gesamt.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${gesamt.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${gesamt.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Rechnung_${nr.replace(/[^A-Za-z0-9\-]/g,'_')}_${heutigesDatumISO()}.xml`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('XRechnung XML wurde heruntergeladen.');
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
    } else if (el.type === 'date') {
      const span = document.createElement('span');
      span.textContent = el.value ? isoDatumZuDE(el.value) : '';
      el.replaceWith(span);
    } else {
      const span = document.createElement('span');
      span.textContent = el.value.replace(/\s*\(Entwurf\)/i, '');
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