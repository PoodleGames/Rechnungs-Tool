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
    const [artikelDaten, kundenDaten, settingsDaten, nummerVorschau] = await Promise.all([
      fileStore.leseJSON('artikel.json', STANDARD_ARTIKEL),
      fileStore.leseJSON('kunden.json', STANDARD_KUNDEN),
      fileStore.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN),
      fileStore.leseRechnungsnummerVorschau(),
    ]);

    katalog = artikelDaten.artikel || [];
    kundenListe = kundenDaten.kunden || [];
    einstellungen = settingsDaten || {};

    befuelleArtikelDropdown();
    befuelleKundenDropdown();
    wendeEinstellungenAn();
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

  checkOverflow();
  if (window.ResizeObserver) new ResizeObserver(checkOverflow).observe(document.getElementById('invoicePage'));
}

function wendeEinstellungenAn() {
  const firma = einstellungen.firma || {};
  if (firma.name) {
    document.getElementById('firmaName').textContent = firma.name;
    document.getElementById('footerAbsenderTitel').textContent = firma.name;
    document.getElementById('grussName').textContent = firma.name;
  }
  document.getElementById('senderZeile').textContent =
    `${firma.name || ''} | ${firma.strasse || ''} | ${firma.plz || ''} ${firma.ort || ''}`;

  document.getElementById('footerAbsenderAdresse').innerHTML =
    `${firma.strasse || ''}<br>${firma.plz || ''} ${firma.ort || ''}<br>Steuernummer: ${firma.steuernummer || ''}<br>Inhaber: ${firma.inhaber || ''}`;

  document.getElementById('footerKontaktInhalt').innerHTML =
    `Telefon: ${firma.telefon || ''}<br>E-Mail: ${firma.email || ''}`;

  document.getElementById('footerBankInhalt').innerHTML =
    `Bank: ${firma.bank_name || ''}<br>IBAN: ${firma.iban || ''}<br>BIC: ${firma.bic || ''}`;

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

function renderPositionen() {
  const body = document.getElementById('positionsBody');
  body.innerHTML = '';

  positionen.forEach((pos, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'item-row';
    tr.innerHTML = `
      <td class="item-pos">${idx + 1}.</td>
      <td>
        <textarea class="item-title-input" rows="1" data-id="${pos._id}" data-field="title" placeholder="Titel">${escapeHtml(pos.title)}</textarea>
        <textarea class="item-desc-input" rows="2" data-id="${pos._id}" data-field="description" placeholder="Beschreibung">${escapeHtml(pos.description)}</textarea>
      </td>
      <td class="num"><input class="item-num-input" type="number" min="0" step="0.01" data-id="${pos._id}" data-field="menge" value="${pos.menge}"></td>
      <td><input class="item-num-input" style="text-align:left" type="text" data-id="${pos._id}" data-field="einheit" value="${escapeHtml(pos.einheit)}"></td>
      <td class="num"><input class="item-num-input" type="number" min="0" step="1" data-id="${pos._id}" data-field="ust" value="${pos.ust}">%</td>
      <td class="num"><input class="item-num-input" type="text" data-id="${pos._id}" data-field="einzelpreis" value="${formatEuro(pos.einzelpreis)}"></td>
      <td class="num item-gesamt" data-row="${pos._id}">€ ${formatEuro(pos.menge * pos.einzelpreis)}</td>
      <td class="no-print" style="width:0;padding:0;">
        <div class="item-row-actions">
          <button class="row-btn" type="button" title="Position duplizieren" onclick="duplicatePosition('${pos._id}')">+</button>
          <button class="row-btn minus" type="button" title="Position entfernen" onclick="removePosition('${pos._id}')">−</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('textarea, input').forEach(el => {
    el.addEventListener('input', onPositionFieldChange);
    if (el.tagName === 'TEXTAREA') autoResize(el);
  });

  berechneSummen();
  checkOverflow();
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
  const page = document.getElementById('invoicePage');
  const bar = document.getElementById('overflowBar');
  bar.classList.toggle('visible', page.scrollHeight > page.offsetHeight + 2);
}

/* ── HTML-EXPORT (lokaler Download) ── */
function buildExportHTML() {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('.no-print, .action-btns, .overflow-bar, .toast, .connect-overlay').forEach(el => el.remove());
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
  const page = document.getElementById('invoicePage');
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(s => s.outerHTML).join('\n');

  const printClone = page.cloneNode(true);
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
    .invoice-page { box-shadow: none; width: 210mm; height: 297mm; }
  </style>
  </head><body>${printClone.outerHTML}</body></html>`);
  doc.close();

  const doPrint = () => {
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
