// Phone upload page (upload.html): photo -> OCR on the phone -> draft lines -> user review -> POST /api/receipt/commit.
// Not part of the frame bundle (main.js never imports it). OCR is Tesseract.js, self-hosted under /ocr/ (see
// SETUP.md, Receipt upload). Without those files the page still works with "Enter by hand".
import { parseReceipt } from '../receipt-parse.js';

const TOKEN = import.meta.env.VITE_DASH_TOKEN || '';
const OCR = '/ocr/';
const DRAFT = 'receipt-draft';
const EMPTY = { store: '', purchase_date: '', items: [] };
const $ = id => document.getElementById(id);

// ---- Messages -------------------------------------------------------------------------------------------

// kind: info (default), ok, warn, error. The review bar has its own box so a message is visible next to Confirm.
function status(text, kind = 'info') {
  const el = $('status');
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = !text;
}
function sendmsg(text, kind = 'info') {
  $('sendtxt').textContent = text;
  $('sendbox').dataset.kind = kind;
  $('sendbox').hidden = !text;
  $('undo').hidden = !removed;
}

let busy = false, sending = false, removed = null, armed = { key: '', until: 0 };

function setBusy(b) {
  busy = b;
  for (const id of ['take', 'choose', 'manual']) $(id).disabled = b;
  $('prog').hidden = !b;
  $('prog').removeAttribute('value');
}

// A second tap within 5 s confirms an action that would replace lines the user typed. No confirm() dialog.
function guard(key, go) {
  if (dirty() && !(armed.key === key && Date.now() < armed.until)) {
    armed = { key, until: Date.now() + 5000 };
    removed = null;
    sendmsg('This replaces the lines below. Tap again to continue.', 'warn');
    return;
  }
  armed = { key: '', until: 0 };
  go();
}

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

// Tesseract reports its own stage names; show the ones a person can follow. The first scan downloads the reader
// and the German language data, which takes a while on mobile data.
function onOcrLog(m) {
  if (typeof m.progress === 'number') $('prog').value = m.progress;
  if (m.status === 'recognizing text') status('Reading… ' + Math.round(m.progress * 100) + ' %');
  else if (/language/.test(m.status)) status('Loading German language data (first scan only)…');
  else if (/core/.test(m.status)) status('Loading the reader (first scan only)…');
  else if (/initiali/.test(m.status)) status('Getting ready…');
}

async function readPhoto(file) {
  status('Getting ready…');
  let T;
  try { T = await loadOcr(); } catch {
    status('Scanning is not installed on this server. Enter the lines by hand.', 'error');
    showReview(EMPTY);
    return;
  }
  const canvas = await prepare(file);
  const worker = await T.createWorker('deu', 1, {
    workerPath: OCR + 'worker.min.js', corePath: OCR + 'core', langPath: OCR + 'lang', logger: onOcrLog
  });
  try {
    // PSM 4: one column of lines of different sizes. Keeps name and price on one line; the default (auto)
    // often returns all names first and all prices after.
    try { await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' }); } catch (e) { console.warn('setParameters', e); }
    const { data } = await worker.recognize(canvas);
    showRaw(data.text);
    const draft = parseReceipt(data.text);
    status(draft.items.length ? draft.items.length + ' lines found. Check names, quantities and prices.' : 'No lines found. Try a sharper photo or enter by hand.', draft.items.length ? 'info' : 'warn');
    showReview(draft, true);
  } finally {
    await worker.terminate();
  }
}

// Scanned text, collapsed, so a bad scan can be diagnosed and turned into a parser test
function showRaw(text) {
  $('raw').querySelector('pre').textContent = text || '(empty)';
  $('raw').hidden = false;
}

// ---- Review ---------------------------------------------------------------------------------------------

const today = () => {
  const t = new Date(), p = n => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
};

const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// Name on its own full-width line so a long receipt name stays readable; qty, total and delete below it
function row(item) {
  const li = document.createElement('li');
  li.className = 'up-row';
  li.innerHTML =
    '<input class="up-name" name="name" required maxlength="80" autocomplete="off" enterkeyhint="next">' +
    '<label class="up-f">Qty<input name="qty" type="number" inputmode="decimal" min="0.01" step="any" enterkeyhint="next"></label>' +
    '<label class="up-f">Total, EUR<input name="price" type="number" inputmode="decimal" min="0" step="0.01" enterkeyhint="next"></label>' +
    '<button type="button" class="up-del">' + X + '</button>';
  li.querySelector('[name=name]').value = item.name || '';
  li.querySelector('[name=qty]').value = item.qty || 1;
  if (item.total_price != null) li.querySelector('[name=price]').value = Number(item.total_price).toFixed(2);
  li.querySelector('.up-del').onclick = () => removeRow(li);
  return li;
}

// Row numbers in the accessible names, the confirm count, and the confirm enabled state
function renumber() {
  const rows = [...$('rows').children];
  rows.forEach((li, i) => {
    const n = i + 1;
    li.querySelector('[name=name]').setAttribute('aria-label', 'Item, line ' + n);
    li.querySelector('[name=qty]').setAttribute('aria-label', 'Qty, line ' + n);
    li.querySelector('[name=price]').setAttribute('aria-label', 'Total EUR, line ' + n);
    li.querySelector('.up-del').setAttribute('aria-label', 'Delete line ' + n);
  });
  const n = rows.length;
  $('confirm').textContent = n ? 'Confirm ' + n + (n === 1 ? ' line' : ' lines') + ' to fridge' : 'Confirm to fridge';
  $('confirm').disabled = sending || !n;
}

function removeRow(li) {
  const next = li.nextElementSibling, prev = li.previousElementSibling;
  removed = { li, next };
  li.remove();
  renumber();
  sendmsg('Line removed.');
  ((next || prev)?.querySelector('[name=name]') || $('add')).focus();
  saveDraft();
}

function lines() {
  return [...$('rows').children].map(tr => {
    const v = n => tr.querySelector('[name=' + n + ']').value.trim();
    return { name: v('name'), qty: Number(v('qty')) || 1, total_price: v('price') === '' ? null : Number(v('price')) };
  });
}

// True when the review holds something the user typed or scanned, so replacing it needs a second tap
const dirty = () => !$('review').hidden && lines().some(i => i.name || i.total_price != null);

function showReview(draft, scroll) {
  const rows = $('rows');
  rows.textContent = '';
  removed = null;
  sendmsg('');
  (draft.items.length ? draft.items : [{}]).forEach(i => rows.appendChild(row(i)));
  renumber();
  $('date').value = draft.purchase_date || today();
  const warn = $('warn');
  warn.hidden = draft.store !== 'REWE';
  warn.textContent = 'This looks like a REWE receipt. If it also arrives as eBon by mail, the job already adds it, and confirming here counts it twice. Discard this one if the eBon is coming.';
  $('review').hidden = false;
  saveDraft();
  // Bring the result and the lines into view; the entry buttons are no longer needed
  if (scroll || !$('status').hidden) $('status').scrollIntoView({ block: 'start' });
}

function closeReview() {
  $('review').hidden = true;
  $('warn').hidden = true;
  removed = null;
  clearDraft();
}

// ---- Draft: a camera app or a task switch can reload the tab, so keep unsent lines for a day -------------

function saveDraft() {
  try {
    if ($('review').hidden) return;
    localStorage.setItem(DRAFT, JSON.stringify({ at: Date.now(), date: $('date').value, items: lines() }));
  } catch { /* storage blocked: the page still works, it just cannot restore */ }
}
function clearDraft() { try { localStorage.removeItem(DRAFT); } catch { /* ignore */ } }
function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (!d || Date.now() - d.at > 864e5 || !d.items.some(i => i.name)) return;
    showReview({ store: '', purchase_date: d.date, items: d.items });
    status('Restored the lines you had not sent yet.');
  } catch { /* corrupt draft: ignore */ }
}

// ---- Send -----------------------------------------------------------------------------------------------

async function commit(e) {
  e.preventDefault();
  if (sending) return;
  const items = lines().filter(i => i.name);
  if (!items.length) { sendmsg('Add at least one line with a name.', 'error'); return; }
  sending = true;
  renumber();
  sendmsg('Sending…');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch('/api/receipt/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dash-Token': TOKEN },
      body: JSON.stringify({ purchase_date: $('date').value, items }),
      signal: ctl.signal
    });
    if (res.status === 401) { sendmsg('This phone is not signed in. Open the dashboard key link on it once, then try again.', 'error'); return; }
    if (!res.ok) { sendmsg('Not saved (' + res.status + '). Your lines are still here, try again.', 'error'); return; }
    const out = await res.json();
    closeReview();
    status(out.added + (out.added === 1 ? ' line is' : ' lines are') + ' in the fridge. The frame shows them within 5 minutes.', 'ok');
    $('status').scrollIntoView({ block: 'start' });
  } catch {
    sendmsg('No connection or no answer. Your lines are still here, try again.', 'error');
  } finally {
    clearTimeout(timer);
    sending = false;
    renumber();
  }
}

// ---- Wiring ---------------------------------------------------------------------------------------------

// Camera and image picker feed the same OCR flow
const onPick = e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  setBusy(true);
  readPhoto(f)
    .catch(() => { status('Could not read that image. Try a JPEG or PNG photo, or enter the lines by hand.', 'error'); showReview(EMPTY); })
    .finally(() => setBusy(false));
};
$('photo').onchange = $('pick').onchange = onPick;
$('take').onclick = () => guard('take', () => $('photo').click());
$('choose').onclick = () => guard('choose', () => $('pick').click());
$('manual').onclick = () => guard('manual', () => { status(''); showReview(EMPTY); });
$('discard').onclick = () => guard('discard', () => { closeReview(); status(''); });
$('add').onclick = () => {
  const li = row({});
  $('rows').appendChild(li);
  removed = null;
  sendmsg('');
  renumber();
  li.querySelector('[name=name]').focus();
  saveDraft();
};
$('undo').onclick = () => {
  if (!removed) return;
  $('rows').insertBefore(removed.li, removed.next);
  removed = null;
  renumber();
  sendmsg('');
  saveDraft();
};
$('review').onsubmit = commit;
$('review').addEventListener('input', saveDraft);
// The phone keyboard's Go key would send the receipt from a text field. Move to the next field instead.
$('review').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const all = [...$('review').querySelectorAll('input')], i = all.indexOf(e.target);
  (all[i + 1] || $('add')).focus();
});

restoreDraft();
