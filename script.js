'use strict';
/* PrismCalc: expression engine (no eval), scientific functions, history, memory, graphing */

const $ = s => document.querySelector(s);
const state = { angle: 'DEG', ans: 0, vars: {} };
let dry = false;      // true while previewing, so assignments don't get stored
let M = 0;            // memory
let fresh = false;    // true right after "=", next digit starts a new expression

/* ---------- storage helpers ---------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ---------- math library ---------- */
const rad = x => state.angle === 'DEG' ? x * Math.PI / 180 : state.angle === 'GRAD' ? x * Math.PI / 200 : x;
const deg = x => state.angle === 'DEG' ? x * 180 / Math.PI : state.angle === 'GRAD' ? x * 200 / Math.PI : x;
const snap = r => Math.abs(r) < 1e-14 ? 0 : r;

function fact(n) {
  if (n < 0 || !Number.isInteger(n)) throw new Error('Factorial needs a whole number ≥ 0');
  if (n > 170) throw new Error('Result is too large');
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}
function ncr(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) throw new Error('nCr needs whole numbers with 0 ≤ r ≤ n');
  k = Math.min(k, n - k); let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return Math.round(r);
}
const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);

const FN = {
  sin: [1, x => snap(Math.sin(rad(x)))],
  cos: [1, x => snap(Math.cos(rad(x)))],
  tan: [1, x => { const a = rad(x); if (Math.abs(Math.cos(a)) < 1e-14) throw new Error('tan is undefined here'); return snap(Math.tan(a)); }],
  asin: [1, x => deg(Math.asin(x))], acos: [1, x => deg(Math.acos(x))], atan: [1, x => deg(Math.atan(x))],
  sinh: [1, Math.sinh], cosh: [1, Math.cosh], tanh: [1, Math.tanh],
  ln: [1, Math.log], log: [1, Math.log10], log2: [1, Math.log2],
  sqrt: [1, Math.sqrt], cbrt: [1, Math.cbrt], abs: [1, Math.abs], exp: [1, Math.exp],
  floor: [1, Math.floor], ceil: [1, Math.ceil], round: [1, Math.round],
  fact: [1, fact], ncr: [2, ncr], npr: [2, (n, r) => ncr(n, r) * fact(r)],
  gcd: [2, gcd], lcm: [2, (a, b) => Math.abs(a * b) / gcd(a, b)],
  pow: [2, Math.pow], root: [2, (x, n) => Math.pow(x, 1 / n)]
};
const CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };

/* ---------- tokenizer + recursive-descent parser (compiles to closures) ---------- */
function tokenize(src) {
  const s = src.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
    .replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\s+/g, '');
  const t = []; let i = 0, m;
  while (i < s.length) {
    const r = s.slice(i);
    if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(r))) t.push({ t: 'num', v: parseFloat(m[0]) });
    else if ((m = /^(log2|[a-z_]+)/.exec(r))) t.push({ t: 'id', v: m[0] });
    else if ('+-*/^%!(),='.includes(r[0])) { m = [r[0]]; t.push({ t: 'op', v: r[0] }); }
    else throw new Error('Unexpected "' + r[0] + '"');
    i += m[0].length;
  }
  return t;
}

function parse(src) {
  const T = tokenize(src); let p = 0;
  const isOp = v => T[p] && T[p].t === 'op' && T[p].v === v;
  const next = () => T[p++];

  function expr() {
    if (T[p] && T[p].t === 'id' && T[p + 1] && T[p + 1].v === '=' && !FN[T[p].v] && !(T[p].v in CONST) && T[p].v !== 'ans') {
      const name = T[p].v; p += 2; const r = add();
      return e => { const v = r(e); if (!dry) state.vars[name] = v; return v; };
    }
    return add();
  }
  function add() {
    let l = mul();
    while (isOp('+') || isOp('-')) {
      const o = next().v, r = mul(), a = l;
      const rv = r.pct ? (e => a(e) * r.pct(e) / 100) : r;   // 200 + 10% = 220
      l = o === '+' ? e => a(e) + rv(e) : e => a(e) - rv(e);
    }
    return l;
  }
  function mul() {
    let l = unary();
    for (;;) {
      let o = null;
      if (isOp('*') || isOp('/')) o = next().v;
      else if (T[p] && T[p].t === 'id' && T[p].v === 'mod') { p++; o = 'mod'; }
      else if (T[p] && (T[p].t === 'num' || T[p].t === 'id' || isOp('('))) o = '*';   // 2pi, 3(4), 2sin(x)
      else break;
      const a = l, r = unary();
      l = o === '*' ? e => a(e) * r(e)
        : o === '/' ? e => { const d = r(e); if (d === 0) throw new Error('Cannot divide by zero'); return a(e) / d; }
        : e => { const d = r(e); if (d === 0) throw new Error('Cannot divide by zero'); return ((a(e) % d) + d) % d; };
    }
    return l;
  }
  function unary() {
    if (isOp('-')) { p++; const r = unary(); return e => -r(e); }
    if (isOp('+')) { p++; return unary(); }
    return pow();
  }
  function pow() {
    const b = post();
    if (isOp('^')) { p++; const x = unary(); return e => Math.pow(b(e), x(e)); }
    return b;
  }
  function post() {
    let v = prim();
    while (isOp('!') || isOp('%')) {
      const o = next().v, a = v;
      if (o === '!') v = e => fact(a(e));
      else { v = e => a(e) / 100; v.pct = a; }
    }
    return v;
  }
  function close() {
    if (isOp(')')) p++;
    else if (p < T.length) throw new Error('Expected ")"');   // missing ")" at the very end is forgiven
  }
  function prim() {
    const k = next();
    if (!k) throw new Error('Expression is incomplete');
    if (k.t === 'num') return () => k.v;
    if (k.t === 'id') {
      const fn = FN[k.v];
      if (fn) {
        const args = [];
        if (isOp('(')) {
          p++;
          if (!isOp(')')) for (;;) { args.push(add()); if (isOp(',')) p++; else break; }
          close();
        } else args.push(unary());
        if (args.length !== fn[0]) throw new Error(k.v + ' needs ' + fn[0] + ' value' + (fn[0] > 1 ? 's' : ''));
        return e => fn[1](...args.map(a => a(e)));
      }
      return e => {
        if (k.v in e) return e[k.v];
        if (k.v === 'ans') return state.ans;
        if (k.v in state.vars) return state.vars[k.v];
        if (k.v in CONST) return CONST[k.v];
        throw new Error('Unknown name "' + k.v + '"');
      };
    }
    if (k.v === '(') { const v = add(); close(); return v; }
    throw new Error('Unexpected "' + k.v + '"');
  }

  const f = expr();
  if (p < T.length) throw new Error('Unexpected "' + T[p].v + '"');
  return f;
}

function run(src) {
  const v = parse(src)({});
  if (typeof v !== 'number' || isNaN(v)) throw new Error('Math error: result is undefined');
  if (!isFinite(v)) throw new Error('Result is too large');
  return v;
}

/* ---------- formatting ---------- */
const raw = v => String(+(v + 0).toPrecision(12));
function fmt(v) {
  v += 0; const a = Math.abs(v);
  if (a !== 0 && (a >= 1e15 || a < 1e-7)) return v.toExponential(8).replace(/\.?0+e/, 'e');
  return (+v.toPrecision(12)).toLocaleString('en-IN', { maximumFractionDigits: 12 });
}

/* ---------- calculator UI ---------- */
const E = $('#expr'), O = $('#out'), B = $('#bases'), MSG = $('#msg');
let hist = store.get('prismcalc-history', []);

function msg(t, err) { MSG.textContent = t; MSG.className = 'msg' + (err ? ' err' : ''); }
function bases(v) {
  B.innerHTML = '';
  if (!Number.isInteger(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) return;
  const s = v < 0 ? '-' : '', a = Math.abs(v);
  [['HEX', 16], ['DEC', 10], ['OCT', 8], ['BIN', 2]].forEach(([n, b]) => {
    const sp = document.createElement('span'); sp.textContent = n + ' ' + s + a.toString(b).toUpperCase(); B.append(sp);
  });
}
function live() {
  msg('');
  const v = E.value.trim();
  if (!v) { O.textContent = '0'; B.innerHTML = ''; return; }
  dry = true;
  try { const r = run(v); O.textContent = fmt(r); O.dataset.v = raw(r); bases(r); }
  catch { O.textContent = ''; B.innerHTML = ''; }
  dry = false;
}
function ins(t) {
  if (fresh) { if (/^[\d.a-zπ√(]/i.test(t)) E.value = ''; fresh = false; }
  const s = E.selectionStart ?? E.value.length, e = E.selectionEnd ?? s;
  E.setRangeText(t, s, e, 'end'); E.focus(); live();
}
function commit() {
  const v = E.value.trim(); if (!v) return;
  try {
    const r = run(v); state.ans = r;
    hist.unshift({ e: v, r: raw(r) }); hist.length = Math.min(hist.length, 60);
    store.set('prismcalc-history', hist); drawHist();
    E.value = raw(r); fresh = true; live();
  } catch (x) { msg(x.message, true); }
  E.focus();
}
function clr() { E.value = ''; fresh = false; live(); E.focus(); }
function back() {
  const s = E.selectionStart, e = E.selectionEnd;
  if (s === e && s > 0) E.setRangeText('', s - 1, e, 'end'); else E.setRangeText('', s, e, 'end');
  fresh = false; live(); E.focus();
}
function neg() {
  const v = E.value.trim(); if (!v) return ins('-');
  E.value = /^-\(.*\)$/.test(v) ? v.slice(2, -1) : '-(' + v + ')'; fresh = false; live(); E.focus();
}
function cur() { dry = true; try { return run(E.value); } catch { return state.ans; } finally { dry = false; } }
function memDo(fn) { fn(); $('#mem').hidden = M === 0; E.focus(); }

function build(host, keys) {
  keys.forEach(([l, c, a]) => {
    const b = document.createElement('button'); b.textContent = l; b.className = c;
    b.onclick = typeof a === 'function' ? a : () => ins(a); host.append(b);
  });
}
build($('#sci'), [
  ['sin', 'f', 'sin('], ['cos', 'f', 'cos('], ['tan', 'f', 'tan('], ['π', 'f', 'π'],
  ['sin⁻¹', 'f', 'asin('], ['cos⁻¹', 'f', 'acos('], ['tan⁻¹', 'f', 'atan('], ['e', 'f', 'e'],
  ['ln', 'f', 'ln('], ['log', 'f', 'log('], ['√', 'f', '√('], ['xʸ', 'f', '^'],
  ['x²', 'f', '^2'], ['n!', 'f', '!'], ['(', 'f', '('], [')', 'f', ')'],
  ['nCr', 'f', 'nCr('], ['|x|', 'f', 'abs('], ['mod', 'f', ' mod '], ['Ans', 'f', 'ans']
]);
build($('#main'), [
  ['AC', 'c', clr], ['⌫', 'c', back], ['%', 'o', '%'], ['÷', 'o', '÷'],
  ['7', 'n', '7'], ['8', 'n', '8'], ['9', 'n', '9'], ['×', 'o', '×'],
  ['4', 'n', '4'], ['5', 'n', '5'], ['6', 'n', '6'], ['−', 'o', '−'],
  ['1', 'n', '1'], ['2', 'n', '2'], ['3', 'n', '3'], ['+', 'o', '+'],
  ['±', 'n', neg], ['0', 'n', '0'], ['.', 'n', '.'], ['=', 'eq', commit]
]);
build($('#memrow'), [
  ['MC', '', () => memDo(() => M = 0)], ['MR', '', () => ins(raw(M))],
  ['M−', '', () => memDo(() => M -= cur())], ['M+', '', () => memDo(() => M += cur())]
]);

E.addEventListener('input', () => { fresh = false; live(); });
E.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); commit(); }
  else if (e.key === 'Escape') clr();
  else if (fresh && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    if (/[\d.a-z(]/i.test(e.key)) E.value = '';
    fresh = false;
  }
});
document.addEventListener('keydown', e => {   // keyboard works even after clicking a button
  if (!$('#calc').hidden && document.activeElement !== E && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Backspace')) E.focus();
});
O.onclick = async () => {
  if (!O.textContent) return;
  try { await navigator.clipboard.writeText(O.dataset.v); msg('Copied ' + O.dataset.v); } catch { msg('Copy is not allowed here', true); }
};

function drawHist() {
  const H = $('#hist'); H.innerHTML = '';
  if (!hist.length) { H.innerHTML = '<p class="empty">Your calculations appear here. Click one to reuse it.</p>'; return; }
  hist.forEach(h => {
    const b = document.createElement('button'); b.className = 'hi'; b.innerHTML = '<span></span><b></b>';
    b.children[0].textContent = h.e; b.children[1].textContent = fmt(+h.r);
    b.onclick = () => { E.value = h.e; fresh = false; live(); E.focus(); };
    H.append(b);
  });
}
$('#clearhist').onclick = () => { hist = []; store.set('prismcalc-history', hist); drawHist(); };

/* ---------- angle mode, themes, tabs ---------- */
const ANGLES = ['DEG', 'RAD', 'GRAD'], THEMES = ['aurora', 'ember', 'lagoon'];
$('#angle').onclick = e => {
  state.angle = ANGLES[(ANGLES.indexOf(state.angle) + 1) % 3]; e.target.textContent = state.angle; live();
};
function setTheme(t) {
  document.documentElement.dataset.theme = t; $('#theme').textContent = t[0].toUpperCase() + t.slice(1);
  store.set('prismcalc-theme', t); if (!$('#graph').hidden) plot();
}
$('#theme').onclick = () => setTheme(THEMES[(THEMES.indexOf(document.documentElement.dataset.theme) + 1) % 3]);
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#calc').hidden = b.dataset.tab !== 'calc'; $('#graph').hidden = b.dataset.tab !== 'graph';
  if (b.dataset.tab === 'graph') requestAnimationFrame(plot); else E.focus();
});

/* ---------- graph plotter ---------- */
const G = { cx: 0, cy: 0, s: 48, fns: [] };
function compileFns() {
  const gm = $('#gmsg'); G.fns = [];
  try {
    $('#fx').value.split(/[;\n]/).map(s => s.replace(/^\s*(y|f\(x\))\s*=/i, '').trim()).filter(Boolean)
      .forEach(s => G.fns.push(parse(s)));
    gm.className = 'msg'; gm.textContent = 'Separate functions with ;  Drag to pan, scroll to zoom. Graphs always use radians.';
  } catch (x) { gm.className = 'msg err'; gm.textContent = x.message; }
  plot();
}
function plot() {
  const cv = $('#cv'), r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
  if (!r.width) return;
  cv.width = r.width * d; cv.height = r.height * d;
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
  const W = r.width, H = r.height, X = x => W / 2 + (x - G.cx) * G.s, Y = y => H / 2 - (y - G.cy) * G.s;
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
  const x0 = G.cx - W / 2 / G.s, x1 = G.cx + W / 2 / G.s, y0 = G.cy - H / 2 / G.s, y1 = G.cy + H / 2 / G.s;
  const need = 80 / G.s, mag = Math.pow(10, Math.floor(Math.log10(need)));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= need);
  c.font = '11px Sora, system-ui, sans-serif'; c.fillStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1;
  const ax = Math.min(Math.max(Y(0), 14), H - 6), ay = Math.min(Math.max(X(0) + 6, 4), W - 40);
  for (let i = Math.ceil(x0 / step); i * step <= x1; i++) {
    const px = Math.round(X(i * step)) + .5; c.strokeStyle = i ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.5)';
    c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke();
    if (i) c.fillText(+(i * step).toFixed(10), px + 3, ax + (ax > H - 20 ? -4 : 12));
  }
  for (let j = Math.ceil(y0 / step); j * step <= y1; j++) {
    const py = Math.round(Y(j * step)) + .5; c.strokeStyle = j ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.5)';
    c.beginPath(); c.moveTo(0, py); c.lineTo(W, py); c.stroke();
    if (j) c.fillText(+(j * step).toFixed(10), ay, py - 4);
  }
  const colors = [col('--b2'), col('--b3'), col('--b1')], saved = state.angle;
  state.angle = 'RAD'; dry = true;
  G.fns.forEach((f, i) => {
    c.beginPath(); c.strokeStyle = colors[i % 3]; c.lineWidth = 2.4; c.lineJoin = 'round';
    let pen = false, py = 0;
    for (let px = 0; px <= W; px++) {
      let y; try { y = f({ x: G.cx + (px - W / 2) / G.s }); } catch { y = NaN; }
      if (typeof y !== 'number' || !isFinite(y)) { pen = false; continue; }
      const sy = Y(y);
      if (pen && Math.abs(sy - py) > H * 1.5) pen = false;   // break lines at asymptotes
      pen ? c.lineTo(px, sy) : c.moveTo(px, sy); pen = true; py = sy;
    }
    c.stroke();
  });
  state.angle = saved; dry = false;
}
(() => {
  const cv = $('#cv'); let drag = null;
  cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => {
    if (!drag) return;
    G.cx -= (e.clientX - drag.x) / G.s; G.cy += (e.clientY - drag.y) / G.s; drag = { x: e.clientX, y: e.clientY }; plot();
  };
  cv.onpointerup = () => drag = null;
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const wx = G.cx + (mx - r.width / 2) / G.s, wy = G.cy - (my - r.height / 2) / G.s;
    G.s = Math.min(Math.max(G.s * Math.exp(-e.deltaY * .0015), 2), 5000);
    G.cx = wx - (mx - r.width / 2) / G.s; G.cy = wy + (my - r.height / 2) / G.s; plot();
  }, { passive: false });
  $('#fx').addEventListener('input', compileFns);
  $('#reset').onclick = () => { G.cx = 0; G.cy = 0; G.s = 48; plot(); };
  new ResizeObserver(() => { if (!$('#graph').hidden) plot(); }).observe($('.cvwrap'));
})();

/* ---------- start ---------- */
setTheme(store.get('prismcalc-theme', 'aurora'));
drawHist(); compileFns(); live(); E.focus();
