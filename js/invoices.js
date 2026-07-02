/**
 * invoices.js
 * -----------
 * Logic for the invoice history page (Rechnungen.html).
 * Reads from data/invoices.json, allows cancellation with reason.
 * All variable names and code comments in English.
 * UI text remains in German for the end user.
 */

/** @type {Array} All invoices loaded from storage */
let allInvoices = [];

/** The invoice number currently being cancelled */
let pendingCancelId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await stelleDatenzugriffSicher();
  await loadInvoices();
});

// ── DATA ──────────────────────────────────────────────────────────────────────

const DEFAULT_INVOICES = { invoices: [], next_sequence_number: 1 };

async function loadInvoices() {
  try {
    const resp = await fetch(`/data/invoices.json?_=${Date.now()}`);
    if (resp.status === 404 || !resp.ok) {
      // File doesn't exist yet — no invoices created yet, that's fine
      allInvoices = [];
      renderInvoiceTable();
      renderStats();
      return;
    }
    const text = await resp.text();
    const data = text.trim() ? JSON.parse(text) : DEFAULT_INVOICES;
    allInvoices = data.invoices || [];
    renderInvoiceTable();
    renderStats();
  } catch (err) {
    showToast('Fehler beim Laden der Rechnungen: ' + err.message, true);
    allInvoices = [];
    renderInvoiceTable();
    renderStats();
  }
}

async function saveInvoices() {
  const data = await fileStore.leseJSON('invoices.json', DEFAULT_INVOICES);
  data.invoices = allInvoices;
  await fileStore.schreibeJSON('invoices.json', data);
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderStats() {
  const total      = allInvoices.length;
  const finalized  = allInvoices.filter(i => i.status === 'finalized').length;
  const cancelled  = allInvoices.filter(i => i.status === 'cancelled').length;
  const totalValue = allInvoices
    .filter(i => i.status === 'finalized')
    .reduce((sum, i) => sum + (i.totals.grand_total || 0), 0);

  document.getElementById('historyStats').innerHTML =
    `<span>${total} Rechnungen gesamt</span>
     <span class="stat-sep">·</span>
     <span>${finalized} aktiv</span>
     <span class="stat-sep">·</span>
     <span>${cancelled} storniert</span>
     <span class="stat-sep">·</span>
     <span>Gesamt aktiv: <strong>€ ${formatEuro(totalValue)}</strong></span>`;
}

function renderInvoiceTable() {
  const body = document.getElementById('invoiceTableBody');
  const showCancelled = document.getElementById('filterShowCancelled').checked;

  const filtered = showCancelled
    ? allInvoices
    : allInvoices.filter(i => i.status !== 'cancelled');

  // Sort: newest first
  const sorted = [...filtered].sort((a, b) =>
    new Date(b.finalized_at) - new Date(a.finalized_at)
  );

  if (sorted.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Noch keine Rechnungen erstellt.</td></tr>';
    return;
  }

  body.innerHTML = sorted.map(inv => {
    const isCancelled = inv.status === 'cancelled';
    const statusBadge = isCancelled
      ? '<span class="status-badge cancelled">Storniert</span>'
      : '<span class="status-badge active">Aktiv</span>';

    const actions = isCancelled
      ? `<a class="btn btn-secondary btn-sm" href="Rechnung-Ansicht.html?id=${escapeHtml(inv.id)}" target="_blank">Öffnen</a>`
      : `<a class="btn btn-secondary btn-sm" href="Rechnung-Ansicht.html?id=${escapeHtml(inv.id)}" target="_blank">Öffnen</a>
         <button class="btn btn-danger btn-sm" onclick="openCancelModal('${escapeHtml(inv.id)}')">Stornieren</button>`;

    return `<tr class="${isCancelled ? 'row-cancelled' : ''}">
      <td><strong>${escapeHtml(inv.invoice_number)}</strong></td>
      <td>${escapeHtml(isoDatumZuDE(inv.date))}</td>
      <td>${escapeHtml(inv.customer_name || '—')}</td>
      <td>${escapeHtml(inv.subject || '—')}</td>
      <td class="num">€ ${formatEuro(inv.totals.grand_total)}</td>
      <td>${statusBadge}${isCancelled && inv.cancel_reason ? `<br><span class="muted" style="font-size:7.4pt;">${escapeHtml(inv.cancel_reason)}</span>` : ''}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

// ── CANCEL MODAL ──────────────────────────────────────────────────────────────

function openCancelModal(invoiceId) {
  const invoice = allInvoices.find(i => i.id === invoiceId);
  if (!invoice) return;
  pendingCancelId = invoiceId;
  document.getElementById('cancelInvoiceNr').textContent = invoice.invoice_number;
  document.getElementById('cancelReason').value = '';
  document.getElementById('cancelModal').style.display = 'flex';
}

function closeCancelModal() {
  pendingCancelId = null;
  document.getElementById('cancelModal').style.display = 'none';
}

async function confirmCancel() {
  if (!pendingCancelId) return;
  const invoice = allInvoices.find(i => i.id === pendingCancelId);
  if (!invoice) return;

  invoice.status        = 'cancelled';
  invoice.cancelled_at  = new Date().toISOString();
  invoice.cancel_reason = document.getElementById('cancelReason').value.trim();

  try {
    await saveInvoices();
    showToast(`Rechnung ${invoice.invoice_number} wurde storniert.`);
    closeCancelModal();
    renderInvoiceTable();
    renderStats();
  } catch (err) {
    showToast('Fehler beim Stornieren: ' + err.message, true);
  }
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.id === 'cancelModal') closeCancelModal();
});