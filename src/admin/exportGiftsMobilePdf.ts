// A second, PURELY READ-ONLY export next to exportGiftsWorkbook.ts's Excel
// file - Gil asked for something nicer to glance at on an iPhone than a
// wide, multi-column Excel sheet opened in Numbers/Excel. Rather than
// drawing PDF text directly (jsPDF's built-in fonts have no Hebrew glyphs,
// and jsPDF doesn't auto-handle RTL bidi ordering - exactly the class of bug
// this codebase already fought with plain Hebrew+number strings elsewhere),
// this renders a real, off-screen HTML view using the browser's own
// correct Hebrew/RTL text engine (same one already used on-screen), turns
// it into an image with html2canvas-pro (already a project dependency, used
// the same way for the seating floor plan export), and slices that image
// across as many A4 pages as needed via jsPDF. Guaranteed-correct Hebrew
// text, no data written anywhere - it only ever reads the combinedTotals /
// linkedMemberNames already computed for the gifts tab and Excel export.
import { CURRENCY_SYMBOLS, formatCurrencyAmount, GIFT_CURRENCIES, type GiftCurrencyTotals } from '../utils/gifts';

export interface GiftMobilePdfRecord {
  id: string;
  fullName: string;
  side: string;
  combinedTotals: GiftCurrencyTotals;
  linkedMemberNames: string[];
}

export interface GiftMobilePdfLabels {
  title: string;
  generatedOn: string;
  linkedWith: string;
  emptyState: string;
}

interface ExportGiftsMobilePdfOptions {
  records: GiftMobilePdfRecord[];
  labels: GiftMobilePdfLabels;
  isRtl: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function exportGiftsMobilePdf({ records, labels, isRtl }: ExportGiftsMobilePdfOptions): Promise<void> {
  // Fixed pixel width chosen to closely match an A4 page's aspect ratio at
  // typical screen DPI, so the captured image maps onto the PDF page
  // without stretching text oddly thin or wide.
  const CONTENT_WIDTH = 750;

  const container = document.createElement('div');
  container.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  container.style.position = 'fixed';
  container.style.top = '0';
  // Off-screen (not display:none - html2canvas needs the node actually
  // laid out/rendered, just not visible to the person using the page).
  container.style.left = '-99999px';
  container.style.width = `${CONTENT_WIDTH}px`;
  container.style.background = '#ffffff';
  container.style.padding = '36px 32px';
  container.style.color = '#111827';
  container.style.fontFamily = "Arial, sans-serif";
  container.style.boxSizing = 'border-box';

  let bodyHtml = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-family:'Miriam Libre', Arial, sans-serif; font-size:30px; font-weight:700; color:#7c2d42;">${escapeHtml(labels.title)}</div>
      <div style="font-size:13px; color:#6b7280; margin-top:6px;">${escapeHtml(labels.generatedOn)}</div>
    </div>
  `;

  let hasAnySection = false;

  // Mirrors exportGiftsWorkbook.ts's per-side "top gifts" sheets exactly:
  // grouped by side first, then by currency within each side (currencies
  // never combine into one number), sorted highest-first, top 3 per
  // side+currency group highlighted. Same grouping Gil already has in the
  // Excel export, just laid out as a single scrollable phone-friendly list
  // instead of separate spreadsheet tabs.
  const sides = Array.from(new Set(records.map((record) => record.side || '-'))).sort((first, second) =>
    first.localeCompare(second, 'he'),
  );

  sides.forEach((side) => {
    const sideRecords = records.filter((record) => (record.side || '-') === side);
    let sideHtml = '';
    let sideHasContent = false;

    GIFT_CURRENCIES.forEach((currency) => {
      const withAmount = sideRecords
        .map((record) => ({ record, amount: record.combinedTotals[currency] }))
        .filter((entry): entry is { record: GiftMobilePdfRecord; amount: number } => !!entry.amount)
        .sort((first, second) => second.amount - first.amount);

      if (withAmount.length === 0) return;
      sideHasContent = true;
      hasAnySection = true;

      const rowsHtml = withAmount
        .map(({ record, amount }, index) => {
          const rank = index + 1;
          const background = rank === 1 ? '#fef3c7' : rank === 2 ? '#f3f4f6' : rank === 3 ? '#ffedd5' : index % 2 === 0 ? '#ffffff' : '#f9fafb';
          // One combined name line (primary + every linked member together)
          // rather than a name line plus a separate gray "linked with" line
          // underneath - matches the Excel export's combined-name column.
          const displayName = record.linkedMemberNames.length > 0
            ? [record.fullName, ...record.linkedMemberNames].join(', ')
            : record.fullName;

          return `
            <div data-page-block="1" style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 14px; border-radius:12px; background:${background}; margin-bottom:6px;">
              <div style="min-width:0;">
                <div style="font-size:16px; font-weight:600; color:#111827;">${escapeHtml(displayName)}</div>
              </div>
              <div dir="ltr" style="font-size:17px; font-weight:700; color:#111827; white-space:nowrap; flex-shrink:0;">${CURRENCY_SYMBOLS[currency]}${formatCurrencyAmount(amount)}</div>
            </div>
          `;
        })
        .join('');

      sideHtml += `
        <div style="margin-bottom:18px;">
          <div data-page-block="1" style="font-size:15px; font-weight:700; color:#6b7280; margin-bottom:8px;" dir="ltr">
            ${CURRENCY_SYMBOLS[currency]} ${currency}
          </div>
          ${rowsHtml}
        </div>
      `;
    });

    if (!sideHasContent) return;

    bodyHtml += `
      <div style="margin-bottom:32px;">
        <div data-page-block="1" style="font-size:20px; font-weight:700; color:#ffffff; background:#7c2d42; border-radius:10px; padding:10px 16px; margin-bottom:14px;">
          ${escapeHtml(side)}
        </div>
        ${sideHtml}
      </div>
    `;
  });

  if (!hasAnySection) {
    bodyHtml += `<div style="text-align:center; padding:40px 0; color:#6b7280; font-size:15px;">${escapeHtml(labels.emptyState)}</div>`;
  }

  container.innerHTML = bodyHtml;
  document.body.appendChild(container);

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas-pro'),
      import('jspdf'),
    ]);

    // Page geometry, needed BEFORE capturing so we can push any row/header
    // that would straddle a page boundary down to start on the next page
    // instead - without this, a naive pixel-height slice of one tall image
    // (see the pagination loop below) cuts straight through whatever
    // happens to sit at that height, literally slicing a guest's row (and
    // its amount) in half between two pages.
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    // CONTENT_WIDTH CSS px maps to imgWidth (= pageWidth) pt once captured
    // and placed on the page, so this converts one page's height from pt
    // back into the same CSS px units the DOM is laid out in.
    const pageHeightPx = (pageHeight * CONTENT_WIDTH) / pageWidth;

    const containerTop = container.getBoundingClientRect().top;
    let nextPageBoundary = pageHeightPx;
    container.querySelectorAll<HTMLElement>('[data-page-block]').forEach((block) => {
      const rect = block.getBoundingClientRect();
      const top = rect.top - containerTop;
      const bottom = top + rect.height;
      if (top < nextPageBoundary && bottom > nextPageBoundary) {
        // Straddles the boundary - push it down to start exactly at the
        // next page instead of being cut mid-way through.
        const currentMarginTop = parseFloat(block.style.marginTop || '0') || 0;
        block.style.marginTop = `${currentMarginTop + (nextPageBoundary - top)}px`;
      }
      const updatedRect = block.getBoundingClientRect();
      const updatedBottom = updatedRect.top - containerTop + updatedRect.height;
      while (updatedBottom > nextPageBoundary) {
        nextPageBoundary += pageHeightPx;
      }
    });

    // The page-break math above assumes the captured canvas is exactly
    // CONTENT_WIDTH * scale px wide - without pinning `width`/`windowWidth`
    // explicitly, html2canvas can size its internal clone from the real
    // browser window instead of this off-screen container's own width,
    // silently invalidating every offset computed above (the earlier
    // version of this fix had exactly that bug: the spacer math ran, but
    // against a canvas whose actual pixel width didn't match what the math
    // assumed, so the page break landed in the same spot as before).
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      width: CONTENT_WIDTH,
      windowWidth: CONTENT_WIDTH,
    });
    // JPEG instead of PNG: this is a flat-color list, not a photo, but PNG
    // still stores it losslessly at full resolution - for ~200+ guests that
    // was producing a many-page, many-megapixel image and a huge PDF. JPEG
    // at 0.85 quality is visually indistinguishable here (solid backgrounds,
    // crisp text) and is a fraction of the size.
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Standard html2canvas -> multi-page jsPDF slicing trick: redraw the
    // SAME full-height image on each page at a progressively larger
    // negative y-offset, which - since addImage clips to the page bounds -
    // has the effect of "scrolling" the tall image up by one page height
    // each time, without needing to manually crop the canvas into per-page
    // slices. Passing the same `alias` on every call is what actually makes
    // this cheap: without it, jsPDF has no way to know it's the same image
    // and embeds a full separate copy of it per page, which was the other
    // big contributor to file size on multi-page exports.
    const imageAlias = 'gifts-mobile-pdf-page-image';
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, imageAlias);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, imageAlias);
      heightLeft -= pageHeight;
    }

    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`gifts-mobile-${date}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
