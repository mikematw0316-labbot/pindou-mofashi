// Test-only: runs a COPY of audio_v2.js with the closing "})();" replaced to expose internal tables.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const patched = src.replace(/\}\)\(\);\s*$/, 'window.__t={SONGS:SONGS,NOTE_FREQS:NOTE_FREQS,parseNote:parseNote};})();');
if (patched === src) { console.log('FAIL cannot expose tables'); process.exit(1); }
const warns = [];
const sandbox = { window: {}, console: { warn: (m) => warns.push(m), log: console.log } };
sandbox.window.console = sandbox.console;
vm.createContext(sandbox);
vm.runInContext(patched, sandbox);
const T = sandbox.window.__t;
const ids = ['map','r1','r2','r3','r4','r5','boss1','boss2','boss3','boss4','boss5'];
let ok = true; const fail = (m) => { ok = false; console.log('FAIL', m); };
for (const id of ids) {
  const s = T.SONGS[id]; if (!s) { fail('missing song ' + id); continue; }
  for (const part of ['melody','harmony','bass','drums']) {
    if (!Array.isArray(s[part])) { fail(id + '.' + part + ' not array'); continue; }
    if (s[part].length !== 128) fail(id + '.' + part + ' length ' + s[part].length);
  }
  for (const part of ['melody','harmony','bass']) {
    for (const n of (s[part] || [])) {
      if (!n) continue;
      if (typeof n === 'number') continue;
      if (T.NOTE_FREQS[String(n).toUpperCase()] === undefined) fail(id + '.' + part + ' unknown note ' + n);
    }
  }
}
// boss vs region
const sig = (s) => JSON.stringify([s.melody, s.harmony, s.bass]);
for (let i = 1; i <= 5; i++) {
  const b = T.SONGS['boss' + i], r = T.SONGS['r' + i];
  if (!b || !r) continue;
  const melSame = JSON.stringify(b.melody) === JSON.stringify(r.melody);
  const allSame = sig(b) === sig(r);
  console.log('boss' + i + ' vs r' + i + ': melody identical=' + melSame + ', melody+harmony+bass identical=' + allSame + ', bpm ' + b.bpm + ' vs ' + r.bpm);
  if (melSame) fail('boss' + i + ' melody identical to r' + i);
}
// r4 in A major: no C/F/G naturals in melody/harmony/bass
const r4 = T.SONGS['r4'], bad = [];
for (const part of ['melody','harmony','bass']) for (const n of r4[part]) if (n && /^(C|F|G)\d/.test(n)) bad.push(part + ':' + n);
console.log('r4 natural C/F/G notes (should be none in A major):', bad.length ? [...new Set(bad)].join(',') : 'none');
if (bad.length) fail('r4 has natural C/F/G');
// distinct pitches per melody (how many different melodic notes)
for (const id of ids) { const m = T.SONGS[id].melody.filter(Boolean); console.log(id, 'melody notes:', m.length, 'distinct:', new Set(m).size); }
console.log('warnings emitted:', warns.length ? warns.join(' | ') : 'none');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
