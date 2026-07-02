/**
 * invoice-view.js
 * ---------------
 * Loads a finalized invoice from invoices.json by ID (?id=...) and
 * displays its stored HTML snapshot pixel-perfectly in an iframe.
 *
 * Also handles XRechnung XML export from the structured snapshot data.
 * Nothing is editable — the snapshot is the authoritative record.
 *
 * All variable names and comments in English.
 * UI text remains in German for the end user.
 */

/** @type {Object|null} The loaded invoice snapshot */
let snapshot = null;

document.addEventListener('DOMContentLoaded', async () => {
  await stelleDatenzugriffSicher();
  await loadSnapshot();
});

// ── LOAD & DISPLAY ────────────────────────────────────────────────────────────

async function loadSnapshot() {
  const invoiceId = new URLSearchParams(window.location.search).get('id');
  if (!invoiceId) {
    document.body.innerHTML = '<p style="padding:40px;color:#c83220;font-family:sans-serif;">Keine Rechnungs-ID angegeben.</p>';
    return;
  }

  try {
    const resp = await fetch(`/data/invoices.json?_=${Date.now()}`);
    if (!resp.ok) throw new Error('invoices.json nicht gefunden');
    const data = await resp.json();
    snapshot = (data.invoices || []).find(inv => inv.id === invoiceId);

    if (!snapshot) {
      document.body.innerHTML = '<p style="padding:40px;color:#c83220;font-family:sans-serif;">Rechnung nicht gefunden.</p>';
      return;
    }

    // Update page title
    document.title = `Rechnung ${snapshot.invoice_number}`;

    // Show cancelled banner if applicable
    if (snapshot.status === 'cancelled') {
      const bar = document.getElementById('cancelledBar');
      if (bar) {
        bar.style.display = 'block';
        bar.textContent = `⚠ Diese Rechnung wurde storniert${snapshot.cancel_reason ? ' — ' + snapshot.cancel_reason : ''}`;
        document.getElementById('invoiceFrame').style.paddingTop = '38px';
        document.getElementById('invoiceFrame').style.height = 'calc(100vh - 38px)';
      }
    }

    // Render the HTML snapshot into the iframe
    const frame = document.getElementById('invoiceFrame');
    if (snapshot.html_snapshot) {
      // Use stored pixel-perfect HTML snapshot
      frame.srcdoc = snapshot.html_snapshot;
    } else {
      // Fallback for older snapshots without html_snapshot
      frame.srcdoc = '<p style="padding:40px;font-family:sans-serif;color:#888;">Kein HTML-Snapshot vorhanden. Bitte Rechnung erneut erstellen.</p>';
    }

  } catch (err) {
    document.body.innerHTML = `<p style="padding:40px;color:#c83220;font-family:sans-serif;">Fehler: ${err.message}</p>`;
  }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

function showLocalToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── XML EXPORT from structured snapshot data ──────────────────────────────────

function exportXml() {
  if (!snapshot) return;
  const inv = snapshot;
  const co  = inv.company || {};
  const t   = inv.totals  || {};

  const esc = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const toXRDate = iso => iso ? iso.replace(/-/g, '') : '';

  // Parse buyer address lines
  const buyerLines = (inv.customer_address || '').split('\n').map(l => l.trim()).filter(Boolean);
  const salutationPattern = /^(herrn?|frau|firma|z\.hd\.|an\s)/i;
  const buyerClean  = buyerLines[0] && salutationPattern.test(buyerLines[0]) ? buyerLines.slice(1) : buyerLines;
  const buyerName   = buyerClean[0] || '';
  const buyerStr    = buyerClean[1] || '';
  const buyerPlzOrt = buyerClean[2] || '';
  const buyerPlzMatch = buyerPlzOrt.match(/^(\d{4,5})\s+(.+)$/);
  const buyerPlz    = buyerPlzMatch ? buyerPlzMatch[1] : buyerPlzOrt;
  const buyerOrt    = buyerPlzMatch ? buyerPlzMatch[2] : '';

  // Extract tax ID and banking details from stored company footer data
  const taxMatch  = (co.footer_left  || '').match(/Steuernummer[:\s]+([^\n]+)/i);
  const ibanMatch = (co.footer_right || '').match(/IBAN[:\s]+([^\n]+)/i);
  const bicMatch  = (co.footer_right || '').match(/BIC[:\s]+([^\n]+)/i);
  const taxId = taxMatch  ? taxMatch[1].trim()  : '';
  const iban  = ibanMatch ? ibanMatch[1].trim() : '';
  const bic   = bicMatch  ? bicMatch[1].trim()  : '';

  // UN/ECE unit code map
  const unitCodeMap = {
    'stück':'C62','stk':'C62','stk.':'C62',
    'stunde':'HUR','stunden':'HUR','std':'HUR','std.':'HUR','h':'HUR',
    'minute':'MIN','minuten':'MIN','min':'MIN',
    'tag':'DAY','tage':'DAY','woche':'WEE','wochen':'WEE',
    'monat':'MON','monate':'MON','jahr':'ANN','jahre':'ANN',
    'meter':'MTR','m':'MTR','kilometer':'KMT','km':'KMT',
    'kilogramm':'KGM','kg':'KGM','gramm':'GRM','g':'GRM',
    'liter':'LTR','l':'LTR','pauschal':'LS','pauschale':'LS','psch':'LS','psch.':'LS',
  };
  const unitCode = u => unitCodeMap[(u || '').toLowerCase().trim()] || 'C62';

  const lineItemsXml = (inv.line_items || []).map((item, i) => `
  <ram:IncludedSupplyChainTradeLineItem>
    <ram:AssociatedDocumentLineDocument>
      <ram:LineID>${i + 1}</ram:LineID>
    </ram:AssociatedDocumentLineDocument>
    <ram:SpecifiedTradeProduct>
      <ram:Name>${esc(item.title)}</ram:Name>
      ${item.description ? `<ram:Description>${esc(item.description)}</ram:Description>` : ''}
    </ram:SpecifiedTradeProduct>
    <ram:SpecifiedLineTradeAgreement>
      <ram:NetPriceProductTradePrice>
        <ram:ChargeAmount>${Number(item.unit_price).toFixed(2)}</ram:ChargeAmount>
      </ram:NetPriceProductTradePrice>
    </ram:SpecifiedLineTradeAgreement>
    <ram:SpecifiedLineTradeDelivery>
      <ram:BilledQuantity unitCode="${unitCode(item.unit)}">${item.quantity}</ram:BilledQuantity>
    </ram:SpecifiedLineTradeDelivery>
    <ram:SpecifiedLineTradeSettlement>
      <ram:ApplicableTradeTax>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementLineMonetarySummation>
        <ram:LineTotalAmount>${Number(item.line_total).toFixed(2)}</ram:LineTotalAmount>
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
    <ram:ID>${esc(inv.invoice_number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${toXRDate(inv.date)}</udt:DateTimeString>
    </ram:IssueDateTime>
    ${inv.subject ? `<ram:IncludedNote><ram:Content>${esc(inv.subject)}</ram:Content></ram:IncludedNote>` : ''}
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
${lineItemsXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(inv.customer_number)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(co.name)}</ram:Name>
        ${taxId ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${esc(taxId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(buyerName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(buyerPlz)}</ram:PostcodeCode>
          <ram:CityName>${esc(buyerOrt)}</ram:CityName>
          <ram:LineOne>${esc(buyerStr)}</ram:LineOne>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>
      ${inv.service_from ? `<ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${toXRDate(inv.service_from)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>` : ''}
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(inv.invoice_number)}</ram:PaymentReference>
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
        <ram:BasisAmount>${Number(t.grand_total).toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:ExemptionReasonCode>vatex-eu-ae</ram:ExemptionReasonCode>
        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>

      ${inv.service_from ? `<ram:BillingSpecifiedPeriod>
        <ram:StartDateTime>
          <udt:DateTimeString format="102">${toXRDate(inv.service_from)}</udt:DateTimeString>
        </ram:StartDateTime>
        <ram:EndDateTime>
          <udt:DateTimeString format="102">${toXRDate(inv.service_to || inv.service_from)}</udt:DateTimeString>
        </ram:EndDateTime>
      </ram:BillingSpecifiedPeriod>` : ''}

      ${(t.discount_amount || 0) > 0 ? `<ram:SpecifiedTradeAllowanceCharge>
        <ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>
        <ram:CalculationPercent>${t.discount_percent}</ram:CalculationPercent>
        <ram:BasisAmount>${Number(t.subtotal).toFixed(2)}</ram:BasisAmount>
        <ram:ActualAmount>${Number(t.discount_amount).toFixed(2)}</ram:ActualAmount>
        <ram:CategoryTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>E</ram:CategoryCode>
          <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
        </ram:CategoryTradeTax>
      </ram:SpecifiedTradeAllowanceCharge>` : ''}

      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(co.payment_note || '')}</ram:Description>
      </ram:SpecifiedTradePaymentTerms>

      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${Number(t.subtotal).toFixed(2)}</ram:LineTotalAmount>
        <ram:AllowanceTotalAmount>${Number(t.discount_amount || 0).toFixed(2)}</ram:AllowanceTotalAmount>
        <ram:TaxBasisTotalAmount>${Number(t.grand_total).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${Number(t.grand_total).toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${Number(t.grand_total).toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Rechnung_${inv.invoice_number.replace(/[^A-Za-z0-9\-]/g,'_')}.xml`;
  a.click();
  URL.revokeObjectURL(url);
  showLocalToast('XRechnung XML wurde heruntergeladen.');
}