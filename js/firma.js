/**
 * firma.js
 * --------
 * Logik für die Firmendaten-Seite. Liest/schreibt direkt
 * data/einstellungen.json über fileStore — kein Server beteiligt.
 * Diese zentralen Firmendaten werden auf jeder neuen Rechnung
 * automatisch im Kopfbereich, Footer und in der Grußformel verwendet.
 */

document.addEventListener('DOMContentLoaded', async () => {
  await stelleDatenzugriffSicher();
  await ladeFirmendaten();
});

async function ladeFirmendaten() {
  try {
    const daten = await fileStore.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN);
    const firma = daten.firma || {};
    const rn = daten.rechnungsnummer || { praefix: 'R-', stellen: 4, naechste_laufnummer: 1 };

    document.getElementById('firmaNameFeld').value = firma.name || '';
    document.getElementById('firmaStrasseFeld').value = firma.strasse || '';
    document.getElementById('firmaPlzFeld').value = firma.plz || '';
    document.getElementById('firmaOrtFeld').value = firma.ort || '';
    document.getElementById('firmaInhaberFeld').value = firma.inhaber || '';
    document.getElementById('firmaTelefonFeld').value = firma.telefon || '';
    document.getElementById('firmaEmailFeld').value = firma.email || '';
    document.getElementById('firmaSteuernummerFeld').value = firma.steuernummer || '';

    document.getElementById('bankNameFeld').value = firma.bank_name || '';
    document.getElementById('bicFeld').value = firma.bic || '';
    document.getElementById('ibanFeld').value = firma.iban || '';

    document.getElementById('ustHinweisFeld').value = firma.kleinunternehmer_hinweis || '';
    document.getElementById('zahlungshinweisFeld').value = firma.zahlungshinweis || '';
    document.getElementById('grussFeld').value = firma.gruss || '';
    document.getElementById('rabattFeld').value = daten.standard_rabatt_prozent ?? 0;
    document.getElementById('praefixFeld').value = rn.praefix || 'R-';
    document.getElementById('stellenFeld').value = rn.stellen || 4;

    const vorschau = (rn.praefix || 'R-') + String(rn.naechste_laufnummer || 1).padStart(rn.stellen || 4, '0');
    document.getElementById('naechsteNummerAnzeige').textContent = vorschau;
  } catch (err) {
    showToast('Fehler beim Laden der Firmendaten: ' + err.message, true);
  }
}

async function firmaSpeichern() {
  const name = document.getElementById('firmaNameFeld').value.trim();
  if (!name) {
    showToast('Bitte einen Firmennamen eingeben.', true);
    return;
  }

  try {
    const daten = await fileStore.leseJSON('einstellungen.json', STANDARD_EINSTELLUNGEN);

    daten.firma = {
      name,
      strasse: document.getElementById('firmaStrasseFeld').value.trim(),
      plz: document.getElementById('firmaPlzFeld').value.trim(),
      ort: document.getElementById('firmaOrtFeld').value.trim(),
      inhaber: document.getElementById('firmaInhaberFeld').value.trim(),
      telefon: document.getElementById('firmaTelefonFeld').value.trim(),
      email: document.getElementById('firmaEmailFeld').value.trim(),
      steuernummer: document.getElementById('firmaSteuernummerFeld').value.trim(),
      bank_name: document.getElementById('bankNameFeld').value.trim(),
      bic: document.getElementById('bicFeld').value.trim(),
      iban: document.getElementById('ibanFeld').value.trim(),
      kleinunternehmer_hinweis: document.getElementById('ustHinweisFeld').value.trim(),
      zahlungshinweis: document.getElementById('zahlungshinweisFeld').value.trim(),
      gruss: document.getElementById('grussFeld').value.trim(),
    };

    daten.standard_rabatt_prozent = parseFloat(document.getElementById('rabattFeld').value) || 0;

    const rn = daten.rechnungsnummer || { naechste_laufnummer: 1 };
    rn.praefix = document.getElementById('praefixFeld').value.trim() || 'R-';
    rn.stellen = parseInt(document.getElementById('stellenFeld').value, 10) || 4;
    daten.rechnungsnummer = rn;

    await fileStore.schreibeJSON('einstellungen.json', daten);

    showToast('Firmendaten gespeichert.');
    await ladeFirmendaten();
  } catch (err) {
    showToast('Fehler beim Speichern: ' + err.message, true);
  }
}
