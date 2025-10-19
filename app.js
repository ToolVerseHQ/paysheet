// ==== Utilitaires ====
const sKey = 'ps-settings';
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const rnd = () => Math.random().toString(36).slice(2, 8);

// Polyfill <dialog> si nécessaire (Safari anciens)
window.addEventListener('DOMContentLoaded', () => {
  if (window.dialogPolyfill) {
    document.querySelectorAll('dialog').forEach(d => {
      if (typeof d.showModal !== 'function') dialogPolyfill.registerDialog(d);
    });
  }
});

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(sKey) || '{}'); }
  catch { return {}; }
}
function saveSettings(o) { localStorage.setItem(sKey, JSON.stringify(o)); }

// normalise l’affichage (autorise 1 séparateur décimal et 2 décimales)
function normalizeAmountDisplay(str) {
  let v = (str || '').replace(/[^\d.,]/g, '');
  const firstSep = v.search(/[.,]/);
  if (firstSep !== -1) {
    const head = v.slice(0, firstSep + 1);
    const tail = v.slice(firstSep + 1).replace(/[.,]/g, '');
    v = head + tail;
  }
  const parts = v.replace(',', '.').split('.');
  if (parts[1] && parts[1].length > 2) {
    v = parts[0] + (v.includes(',') ? ',' : '.') + parts[1].slice(0, 2);
  }
  if (/^\d+$/.test(v)) v = String(parseInt(v || '0', 10));
  if (v === 'NaN') v = '';
  return v || '';
}
function parseAmountToNumber(str) {
  const n = Number.parseFloat((str || '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function formatAmountTwo(n) { return n.toFixed(2); }

// Construit l’URL vers la page /pay (qui gère deep links & fallback)
function makePayUrl({ name, iban, amount, ref }) {
  const base = location.origin + location.pathname.replace(/\/app\/?$/, '') + '/pay/';
  const p = new URLSearchParams({
    name, iban, amount, ref, txid: Date.now().toString(36) + rnd()
  });
  return `${base}?${p.toString()}`;
}

// ==== Rendu du QR avec LOGO au centre ====
// Utilise qrcodejs (vendor/qrcode.min.js) – API: new QRCode(...)
function renderQR(url) {
  const qrContainer = $('#qr');
  qrContainer.innerHTML = '';

  // QR clair sur fond sombre (style de l’app)
  const qr = new QRCode(qrContainer, {
    text: url,
    width: 300,
    height: 300,
    colorDark: "#ffffff",   // modules (blanc)
    colorLight: "#0f1117",  // fond foncé (accordé au thème)
    correctLevel: QRCode.CorrectLevel.H
  });

  // Ajout du logo au centre une fois le canvas prêt
  setTimeout(() => {
    const canvas = qrContainer.querySelector('canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const logo = new Image();
    logo.src = 'vendor/logo.png'; // <-- TON ICÔNE

    logo.onload = () => {
      const size = canvas.width * 0.22; // ~22% de la taille du QR
      const x = (canvas.width - size) / 2;
      const y = (canvas.height - size) / 2;

      ctx.save();
      ctx.globalAlpha = 0.95; // légère transparence pour la lisibilité
      ctx.drawImage(logo, x, y, size, size);
      ctx.restore();
    };
  }, 250);

  $('#qrWrap').hidden = false;
}

// ==== Initialisation UI ====
function init() {
  const dlg    = $('#dlg');
  const sName  = $('#sName');
  const sIban  = $('#sIban');
  const amount = $('#amount');

  // Charger paramètres
  const st = loadSettings();
  if (st.name) sName.value = st.name;
  if (st.iban) sIban.value = st.iban;

  // Ouverture/fermeture du dialog
  $('#btnSettings').onclick = () => dlg.showModal();
  $('#close').onclick       = () => dlg.close();

  // Enregistrer paramètres
  $('#save').onclick = () => {
    const name = sName.value.trim();
    const iban = sIban.value.replace(/\s+/g, '').toUpperCase();
    if (!name || !/^([A-Z]{2}\d{2}[A-Z0-9]{1,30})$/.test(iban)) {
      alert('Nom/IBAN invalide.');
      return;
    }
    saveSettings({ name, iban });
    dlg.close();
    alert('Paramètres enregistrés.');
  };

  // Pavé numérique
  function applyKey(k) {
    let v = amount.value;
    if (k === 'C')  { amount.value = ''; return; }
    if (k === '⌫') { amount.value = v.slice(0, -1); return; }
    if (k === '00'){ amount.value = normalizeAmountDisplay(v + '00'); return; }
    if (k === ',' || k === '.') {
      if (!/[.,]/.test(v)) amount.value = (v || '0') + (k === ',' ? ',' : '.');
      return;
    }
    if (/^\d$/.test(k)) { amount.value = normalizeAmountDisplay(v + k); }
  }
  $$('.numpad [data-key]').forEach(btn =>
    btn.addEventListener('click', () => applyKey(btn.dataset.key))
  );

  // Nettoyage à la volée
  amount.addEventListener('input', () => {
    const pos = amount.selectionStart;
    const before = amount.value;
    amount.value = normalizeAmountDisplay(before);
    amount.selectionStart = amount.selectionEnd = Math.min(pos, amount.value.length);
  });

  // Génération du QR
  function generate() {
    const cfg = loadSettings();
    if (!cfg.name || !cfg.iban) { alert('Renseignez d’abord vos paramètres (Nom + IBAN).'); return; }
    const num = parseAmountToNumber(amount.value);
    if (!(num > 0)) { alert('Saisissez un montant valide.'); return; }

    const display = formatAmountTwo(num);
    const ref = 'PS-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + rnd().toUpperCase();
    const url = makePayUrl({ name: cfg.name, iban: cfg.iban, amount: display, ref });
    renderQR(url);
  }

  $('#btnGen').onclick = generate;
  $('#btnRetry').onclick = generate;
  $('#btnFullscreen').onclick = () => {
    const el = $('#qr').firstElementChild || $('#qr');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  };

  // Entrée = générer
  amount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btnGen').click(); }
  });
}

window.addEventListener('DOMContentLoaded', init);

