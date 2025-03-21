# 와니네 프론트엔드 엔진

## Express.js 와 함께 사용

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from 'express';
import Engine from '@wanyne/frontend-engine';

const app = express();
const engine = new Engine(path.resolve(__dirname, './views'), {
  cache: false,
});

engine.express(app);

app.get('/', (req, res) => {
  res.render('index', {});
});
```
