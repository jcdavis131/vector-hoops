// The browser forward pass (assets/replay-model.js) must give the trained torch model's answers.
//
//   node tests/replay_model_parity.mjs <run dir from train_coords.py>   (reads parity.json, weights.json, weights-q8.json)
//
// float16 weights: within 0.05 ft of torch. int8 weights: within 1.5 ft, mean under 0.5 ft
// (the eval measures what the rounding costs against real tracking).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dir = process.argv[2];
if (!dir) throw new Error('usage: node tests/replay_model_parity.mjs <run dir>');
const fx = JSON.parse(fs.readFileSync(path.join(dir, 'parity.json'), 'utf8'));
let bad = 0;
for (const [file, maxFt, meanFt] of [['weights.json', 0.05, 0.05], ['weights-q8.json', 1.5, 0.5]]) {
  delete require.cache[require.resolve('../assets/replay-model.js')];
  const RM = require('../assets/replay-model.js');
  RM._init(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  const sc = RM.meta.scale; let worst = 0, sum = 0, n = 0;
  fx.P.forEach((P, i) => {
    const y = RM.forward(Float32Array.from(P.flat()), Float32Array.from(fx.G[i]));
    fx.pred[i].forEach((xy, k) => {
      const d = Math.hypot((y[2 * k] - xy[0]) * sc[0], (y[2 * k + 1] - xy[1]) * sc[1]);
      worst = Math.max(worst, d); sum += d; n++;
    });
  });
  const mean = sum / n, ok = worst <= maxFt && mean <= meanFt;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: worst ${worst.toFixed(3)} ft, mean ${mean.toFixed(3)} ft over ${n} players`);
}
process.exit(bad ? 1 : 0);
