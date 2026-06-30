/**
 * kunden.js
 * ---------
 * Logik für die Kundenverwaltungsseite. Liest/schreibt direkt
 * data/kunden.json über fileStore — kein Server beteiligt.
 */

let alleKunden = [];

document.addEventListener('DOMContentLoaded', async () => {
  await stelleDatenzugriffSicher();
  await ladeKunden();
});

async function ladeKunden() {
  try {
    const daten = await fileStore.leseJSON('kunden.json', STANDARD_KUNDEN);
    alleKunden = daten.kunden || [];
    renderKundenTabelle();
  } catch (err) {
    showToast('Fehler beim Laden der Kunden: ' + err.message, true);
  }
}

function renderKundenTabelle() {
  const body = document.getElementById('kundenTabelleBody');

  if (alleKunden.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">Noch keine Kunden angelegt.</td></tr>';
    return;
  }

  body.innerHTML = alleKunden.map(k => `
    <tr>
      <td><strong>${escapeHtml(k.kundennummer)}</strong></td>
      <td>${escapeHtml(k.name)}</td>
      <td>${escapeHtml(k.strasse)}<br><span class="muted">${escapeHtml(k.plz)} ${escapeHtml(k.ort)}</span></td>
      <td>${k.telefon ? escapeHtml(k.telefon) + '<br>' : ''}<span class="muted">${escapeHtml(k.email || '')}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Bearbeiten" onclick="kundeBearbeiten('${escapeHtml(k.kundennummer)}')">✎</button>
          <button class="icon-btn danger" title="Löschen" onclick="kundeLoeschen('${escapeHtml(k.kundennummer)}')">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function kundeBearbeiten(kundennummer) {
  const k = alleKunden.find(x => x.kundennummer === kundennummer);
  if (!k) return;

  document.getElementById('formTitel').textContent = 'Kunde bearbeiten: ' + k.name;
  document.getElementById('kundeKundennummerHidden').value = k.kundennummer;
  document.getElementById('kundeName').value = k.name || '';
  document.getElementById('kundeNummer').value = k.kundennummer || '';
  document.getElementById('kundeStrasse').value = k.strasse || '';
  document.getElementById('kundePlz').value = k.plz || '';
  document.getElementById('kundeOrt').value = k.ort || '';
  document.getElementById('kundeTelefon').value = k.telefon || '';
  document.getElementById('kundeEmail').value = k.email || '';
  document.getElementById('kundeNotiz').value = k.notiz || '';
  document.getElementById('btnAbbrechen').style.display = 'inline-block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formZuruecksetzen() {
  document.getElementById('formTitel').textContent = 'Neuen Kunden anlegen';
  document.getElementById('kundeKundennummerHidden').value = '';
  document.getElementById('kundeForm').reset();
  document.getElementById('btnAbbrechen').style.display = 'none';
}

async function kundeSpeichern() {
  const name = document.getElementById('kundeName').value.trim();
  if (!name) {
    showToast('Bitte einen Namen eingeben.', true);
    return;
  }

  try {
    const daten = await fileStore.leseJSON('kunden.json', STANDARD_KUNDEN);
    daten.kunden = daten.kunden || [];
    daten.naechste_laufnummer = daten.naechste_laufnummer || 1;

    let kundennummer = document.getElementById('kundeNummer').value.trim();
    if (!kundennummer) {
      kundennummer = 'K-' + String(daten.naechste_laufnummer).padStart(5, '0');
      daten.naechste_laufnummer += 1;
    }

    const neuerKunde = {
      kundennummer,
      name,
      strasse: document.getElementById('kundeStrasse').value.trim(),
      plz: document.getElementById('kundePlz').value.trim(),
      ort: document.getElementById('kundeOrt').value.trim(),
      telefon: document.getElementById('kundeTelefon').value.trim(),
      email: document.getElementById('kundeEmail').value.trim(),
      notiz: document.getElementById('kundeNotiz').value.trim(),
    };

    const idx = daten.kunden.findIndex(k => k.kundennummer === kundennummer);
    if (idx >= 0) {
      daten.kunden[idx] = neuerKunde;
    } else {
      daten.kunden.push(neuerKunde);
    }

    await fileStore.schreibeJSON('kunden.json', daten);

    showToast(`Kunde "${neuerKunde.name}" (${neuerKunde.kundennummer}) gespeichert.`);
    formZuruecksetzen();
    await ladeKunden();
  } catch (err) {
    showToast('Fehler beim Speichern: ' + err.message, true);
  }
}

async function kundeLoeschen(kundennummer) {
  const k = alleKunden.find(x => x.kundennummer === kundennummer);
  if (!k) return;
  if (!confirm(`Kunde "${k.name}" (${k.kundennummer}) wirklich löschen?\n\nHinweis: Bereits gespeicherte Rechnungen im Kundenordner bleiben unangetastet.`)) {
    return;
  }

  try {
    const daten = await fileStore.leseJSON('kunden.json', STANDARD_KUNDEN);
    daten.kunden = (daten.kunden || []).filter(x => x.kundennummer !== kundennummer);
    await fileStore.schreibeJSON('kunden.json', daten);

    showToast('Kunde gelöscht.');
    await ladeKunden();
  } catch (err) {
    showToast('Fehler beim Löschen: ' + err.message, true);
  }
}
