import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from 'express';
import WanyneTemplateEngine from '../src/engine.mjs';

const app = express();
const engine = new WanyneTemplateEngine(path.resolve(__dirname, './views'), {
  cache: false,
});

engine.express(app);

app.get('/', (req, res) => {
  res.render('index', {
    page: 'test/test',
    title: '#{test}',
    test: 'bad',
  });
});

app.listen(3000, () => {
  console.log('server start');
});
