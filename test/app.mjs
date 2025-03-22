import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from 'express';
import WanyneTemplateEngine from '../src/engine.mjs';

const app = express();
const engine = new WanyneTemplateEngine(path.resolve(__dirname, './views'));

engine.express(app);

app.get('/', (req, res) => {
  res.render('index', {
    page: 'test/test',
    title: '<script>alert("doom")</script>', // * Type of vulnerability suspected: Server-Side Template Injection (SSTI)
    // * Rationale: The line directly processes user input in templates,
    //             which could allow execution of arbitrary code if not properly sanitized.
    // * Example malicious data: An attacker could use a payload like "#{ console.log(global.process) }"
    //                           to attempt to execute code within the server context.
    test: 'bad',
  });
});

app.listen(3000, () => {
  console.log('server start');
});
