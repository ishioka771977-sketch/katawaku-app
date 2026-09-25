// ローカル検証: api/extract.js を Vercel なしで叩く
//   node lib/extract-local.js <mode> <pdfDir> <page.jpg ...>
//   例: node lib/extract-local.js standard ./kokoku jpg/fig01_p05.jpg jpg/fig01_p16.jpg
// 環境変数: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           KATACHI_TEST_EMP, KATACHI_TEST_DEVICE（登録済み端末）
const fs = require('fs');
const path = require('path');
const handler = require('../api/extract');

const [mode = 'standard', dir = '.', ...imgs] = process.argv.slice(2);
const textPath = path.join(dir, 'text.txt');
const text = fs.existsSync(textPath) ? fs.readFileSync(textPath, 'utf8') : '';
const images = imgs.map((f) => fs.readFileSync(path.join(dir, f)).toString('base64'));
const body = {
  structure_type: 'deck_slab',
  mode,
  text,
  images,
  image_labels: imgs.map((f) => path.basename(f)),
  filenames: fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')),
  project_hint: process.env.KATACHI_HINT || '',
};

const req = {
  method: 'POST',
  headers: { 'x-employee-number': process.env.KATACHI_TEST_EMP || '', 'x-device-id': process.env.KATACHI_TEST_DEVICE || '' },
  body,
};
const res = {
  _status: 200,
  setHeader() {},
  status(s) { this._status = s; return this; },
  json(obj) {
    console.log('HTTP', this._status);
    const out = { ...obj };
    if (out.json) { fs.writeFileSync(path.join(dir, `out_${mode}.json`), JSON.stringify(out.json, null, 2)); out.json = `(written to out_${mode}.json)`; }
    console.log(JSON.stringify(out, null, 2));
  },
};
const t0 = Date.now();
handler(req, res).then(() => console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1), 's'));
