// Phone upload page (upload.html): photo -> OCR on the phone -> draft lines -> user review -> POST /api/receipt/commit.
// Not part of the frame bundle (main.js never imports it). OCR is Tesseract.js, self-hosted under /ocr/ (see
// SETUP.md, Receipt upload). Without those files the page still works with "Enter by hand".
import { parseReceipt } from '../receipt-parse.js';

const TOKEN = import.meta.env.VITE_DASH_TOKEN || '';
const OCR = '/ocr/';
const $ = id => document.getElementById(id);
const status = t => { $('status').textContent = t; };

// ---- OCR ------------------------------------------------------------------------------------------------

let ocrLib = null;
function loadOcr() {
  if (ocrLib) return ocrLib;
  ocrLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = OCR + 'tesseract.min.js';
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('no Tesseract'));
    s.onerror = () => { ocrLib = null; reject(new Error('OCR files missing')); };
    document.head.appendChild(s);
  });
  return ocrLib;
}

// Scale to at most 2000 px wide, grayscale, then black and white with an Otsu threshold: thermal receipts are
// faint and grey, and Tesseract drops grey text.
async function prepare(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height), d = px.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const k = 255 / Math.max(1, hi - lo), hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) { d[i] = Math.round((d[i] - lo) * k); hist[d[i]]++; }
  const cut = otsu(hist, d.length / 4);
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > cut ? 255 : 0;
  ctx.putImageData(px, 0, 0);
  return c;
}

// Grey level that best splits the histogram into ink and paper
function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, cut = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; cut = t; }
  }
  return cut;
}

async function readPhoto(file) {
  status('Reading the receipt on this phone…');
  let T;
  try { T = await loadOcr(); } catch {
    status('OCR is not installed on this server. Enter the lines by hand.');
    showReview({ store: '', purchase_date: '', items: [] });
    return;
  }
  const canvas = await prepare(file);
  const worker = await T.createWorker('deu', 1, {
    workerPath: OCR + 'worker.min.js', corePath: OCR + 'core', langPath: OCR + 'lang',
    logger: m => { if (m.status === 'recognizing text') status('Reading… ' + Math.round(m.progress * 100) + ' %'); }
  });
  try {
    // PSM 4: one column of lines of different sizes. Keeps name and price on one line; the default (auto)
    // often returns all names first and all prices after.
    try { await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' }); } catch (e) { console.warn('setParameters', e); }
    const { data } = await worker.recognize(canvas);
    showRaw(data.text);
    const draft = parseReceipt(data.text);
    status(draft.items.length ? draft.items.length + ' lines found. Check names, quantities and prices.' : 'No lines found. Try a sharper photo or enter by hand.');
    showReview(draft);
  } finally {
    await worker.terminate();
  }
}

// Raw OCR output, collapsed, so a bad scan can be diagnosed and turned into a parser test
function showRaw(text) {
  $('raw').querySelector('pre').textContent = text || '(empty)';
  $('raw').hidden = false;
}

// ---- Review ---------------------------------------------------------------------------------------------

const today = () => {
  const t = new Date(), p = n => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
};

function row(item) {
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input name="name" required maxlength="80"></td>' +
    '<td><input name="qty" type="number" inputmode="decimal" min="0.01" step="any" value="1"></td>' +
    '<td><input name="price" type="number" inputmode="decimal" min="0" step="0.01"></td>' +
    '<td><button type="button" class="up-del" aria-label="Delete line">×</button></td>';
  tr.querySelector('[name=name]').value = item.name || '';
  tr.querySelector('[name=qty]').value = item.qty || 1;
  if (item.total_price != null) tr.querySelector('[name=price]').value = item.total_price.toFixed(2);
  tr.querySelector('.up-del').onclick = () => tr.remove();
  return tr;
}

function showReview(draft) {
  const rows = $('rows');
  rows.textContent = '';
  (draft.items.length ? draft.items : [{}]).forEach(i => rows.appendChild(row(i)));
  $('date').value = draft.purchase_date || today();
  const warn = $('warn');
  warn.hidden = draft.store !== 'REWE';
  warn.textContent = 'This looks like a REWE receipt. If it also arrives as eBon by mail, the job already adds it, and confirming here counts it twice.';
  $('review').hidden = false;
}

async function commit(e) {
  e.preventDefault();
  const items = [...$('rows').children].map(tr => {
    const v = n => tr.querySelector('[name=' + n + ']').value.trim();
    return { name: v('name'), qty: Number(v('qty')) || 1, total_price: v('price') === '' ? null : Number(v('price')) };
  }).filter(i => i.name);
  if (!items.length) { status('No lines to send.'); return; }
  status('Sending…');
  try {
    const res = await fetch('/api/receipt/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dash-Token': TOKEN },
      body: JSON.stringify({ purchase_date: $('date').value, items })
    });
    if (res.status === 401) { status('Not signed in. Open the dashboard key link on this phone once, then try again.'); return; }
    if (!res.ok) { status('Not saved (' + res.status + '). Your lines are still here, try again.'); return; }
    const out = await res.json();
    status(out.added + ' lines are in the fridge. The frame shows them within 5 minutes.');
    $('review').hidden = true;
    $('warn').hidden = true;
  } catch {
    status('No connection. Your lines are still here, try again.');
  }
}

$('photo').onchange = e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) readPhoto(f).catch(() => { status('Reading failed. Enter the lines by hand.'); showReview({ store: '', purchase_date: '', items: [] }); });
};
$('manual').onclick = () => { status(''); showReview({ store: '', purchase_date: '', items: [] }); };
$('add').onclick = () => $('rows').appendChild(row({}));
$('review').onsubmit = commit;
