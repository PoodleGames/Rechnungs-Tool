/**
 * artikel.js
 * ----------
 * Logik für die Artikelverwaltungsseite. Liest/schreibt direkt
 * data/artikel.json über fileStore — kein Server beteiligt.
 */

let alleArtikel = [];

document.addEventListener('DOMContentLoaded', async () => {
  await stelleDatenzugriffSicher();
  await ladeArtikel();
});

async function ladeArtikel() {
  try {
    const daten = await fileStore.leseJSON('artikel.json', STANDARD_ARTIKEL);
    alleArtikel = daten.artikel || [];
    renderArtikelTabelle();
  } catch (err) {
    showToast('Fehler beim Laden der Artikel: ' + err.message, true);
  }
}

function renderArtikelTabelle() {
  const body = document.getElementById('artikelTabelleBody');

  if (alleArtikel.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">Noch keine Artikel angelegt.</td></tr>';
    return;
  }

  body.innerHTML = alleArtikel.map(a => `
    <tr>
      <td><strong>${escapeHtml(a.title)}</strong></td>
      <td class="muted">${escapeHtml(a.description || '')}</td>
      <td>€ ${formatEuro(a.einzelpreis)}</td>
      <td>${escapeHtml(a.einheit || '')}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Bearbeiten" onclick="artikelBearbeiten('${escapeHtml(a.id)}')">✎</button>
          <button class="icon-btn danger" title="Löschen" onclick="artikelLoeschen('${escapeHtml(a.id)}')">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function artikelBearbeiten(id) {
  const a = alleArtikel.find(x => x.id === id);
  if (!a) return;

  document.getElementById('formTitel').textContent = 'Artikel bearbeiten: ' + a.title;
  document.getElementById('artikelIdHidden').value = a.id;
  document.getElementById('artikelTitle').value = a.title || '';
  document.getElementById('artikelDescription').value = a.description || '';
  document.getElementById('artikelPreis').value = formatEuro(a.einzelpreis);
  document.getElementById('artikelEinheit').value = a.einheit || 'Stück';
  document.getElementById('artikelUst').value = a.ust ?? 0;
  document.getElementById('btnAbbrechen').style.display = 'inline-block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formZuruecksetzen() {
  document.getElementById('formTitel').textContent = 'Neuen Artikel anlegen';
  document.getElementById('artikelIdHidden').value = '';
  document.getElementById('artikelForm').reset();
  document.getElementById('artikelEinheit').value = 'Stück';
  document.getElementById('btnAbbrechen').style.display = 'none';
}

async function artikelSpeichern() {
  const title = document.getElementById('artikelTitle').value.trim();
  if (!title) {
    showToast('Bitte einen Title eingeben.', true);
    return;
  }

  try {
    const daten = await fileStore.leseJSON('artikel.json', STANDARD_ARTIKEL);
    daten.artikel = daten.artikel || [];

    let id = document.getElementById('artikelIdHidden').value.trim();
    if (!id) {
      id = 'art-' + String(daten.artikel.length + 1).padStart(4, '0') + '-' + Math.random().toString(36).slice(2, 6);
    }

    const neuerArtikel = {
      id,
      title,
      description: document.getElementById('artikelDescription').value.trim(),
      einzelpreis: parseEuroInput(document.getElementById('artikelPreis').value),
      einheit: document.getElementById('artikelEinheit').value.trim() || 'Stück',
      ust: parseFloat(document.getElementById('artikelUst').value) || 0,
    };

    const idx = daten.artikel.findIndex(a => a.id === id);
    if (idx >= 0) {
      daten.artikel[idx] = neuerArtikel;
    } else {
      daten.artikel.push(neuerArtikel);
    }

    await fileStore.schreibeJSON('artikel.json', daten);

    showToast(`Artikel "${neuerArtikel.title}" gespeichert.`);
    formZuruecksetzen();
    await ladeArtikel();
  } catch (err) {
    showToast('Fehler beim Speichern: ' + err.message, true);
  }
}

async function artikelLoeschen(id) {
  const a = alleArtikel.find(x => x.id === id);
  if (!a) return;
  if (!confirm(`Artikel "${a.title}" wirklich löschen?`)) return;

  try {
    const daten = await fileStore.leseJSON('artikel.json', STANDARD_ARTIKEL);
    daten.artikel = (daten.artikel || []).filter(x => x.id !== id);
    await fileStore.schreibeJSON('artikel.json', daten);

    showToast('Artikel gelöscht.');
    await ladeArtikel();
  } catch (err) {
    showToast('Fehler beim Löschen: ' + err.message, true);
  }
}
