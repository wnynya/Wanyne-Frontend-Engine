'use strict';

import nodefs from 'node:fs';
import nodepath from 'node:path';
import { parse as parseHTML } from 'node-html-parser';
const HTML = {
  parse: parseHTML,
};

class WanyneTemplateEngine {
  #templates = {};
  #scripts = {};
  #styles = {};
  #resources = {};

  constructor(views, options = {}) {
    this.views = views;
    this.options = options;
    if (this.options.cache === undefined) {
      this.options.cache = true;
    }
    if (this.options.minify === undefined) {
      this.options.minify = false;
    }
  }

  render(file, scope = {}) {
    try {
      if (!this.options.cache) {
        this.#templates = {};
        this.#scripts = {};
        this.#styles = {};
        this.#resources = {};
      }
      let ts = Date.now();
      const template = this.getTemplate(file);
      const document = HTML.parse(template);
      this.processTemplate(file, document, scope);
      const parsed = document.toString();
      console.log(
        'render',
        Date.now() - ts + ' ms',
        parsed.length + ' chars',
        file
      );
      return parsed;
    } catch (error) {
      throw error;
    }
  }

  getTemplate(templatePath) {
    const key = Buffer.from(templatePath).toString('base64');
    if (!this.#templates[key]) {
      const data = nodefs.readFileSync(templatePath).toString();
      this.#templates[key] = data;
    }
    return this.#templates[key];
  }

  resolveScript(fromPath, targetPath, inner) {
    const data = {
      key: null,
      path: {},
      content: inner,
    };
    const fromDir = nodepath.parse(fromPath).dir;
    data.path.abs = nodepath.resolve(fromDir, targetPath);
    data.key = Buffer.from(data.path.abs).toString('base64');

    if (!this.#scripts[data.key]) {
      data.path.rel = data.path.abs.substring(this.views.length);

      const content =
        data.content || nodefs.readFileSync(data.path.abs).toString();
      const lines = content.split(';');
      const resolvedLines = [];

      for (let line of lines) {
        let trim = WanyneTemplateEngine.#trim(line);
        if (/^import (.*) from (.*)$/.test(trim)) {
          const m = trim.match(/^import (.*) from (.*)$/);
          const path = m[2].slice(1, -1);
          if (path.startsWith('.')) {
            const sc = this.resolveScript(data.path.abs, path);
            line = line.replace(m[2], `'${sc.path.rel}'`);
          } else {
            line = line.replace(m[2], `'${path}'`);
          }
        }
        resolvedLines.push(line);
      }

      const resolvedContent = resolvedLines.join(';');
      data.content = resolvedContent;
      this.#scripts[data.key] = data;
    }

    return this.#scripts[data.key];
  }
  resolveStyle(fromPath, targetPath, inner) {
    const data = {
      key: null,
      path: {},
      content: inner,
    };
    const fromDir = nodepath.parse(fromPath).dir;
    data.path.abs = nodepath.resolve(fromDir, targetPath);
    data.key = Buffer.from(data.path.abs).toString('base64');

    if (!this.#styles[data.key]) {
      data.path.rel = data.path.abs.substring(this.views.length);

      const content =
        data.content || nodefs.readFileSync(data.path.abs).toString();
      const lines = content.split(';');
      const resolvedLines = [];

      for (let line of lines) {
        let trim = WanyneTemplateEngine.#trim(line);
        if (/url\(?['"]([^'" ]+)['"]\)/.test(trim)) {
          const m = trim.match(/url\(?['"]([^'" ]+)['"]\)/);
          const path = m[1];
          if (path.startsWith('.')) {
            const sc = this.resolveStyle(data.path.abs, path);
            line = line.replace(m[1], `${sc.path.rel}`);
          } else {
            line = line.replace(m[1], `${path}`);
          }
        }
        if (/^@import ['"]([^'" ]+)['"].*$/.test(trim)) {
          const m = trim.match(/^@import ['"]([^'" ]+)['"].*$/);
          const path = m[1];
          if (path.startsWith('.')) {
            const sc = this.resolveStyle(data.path.abs, path);
            line = line.replace(m[1], `${sc.path.rel}`);
          } else {
            line = line.replace(m[1], `${path}`);
          }
        }
        resolvedLines.push(line);
      }

      const resolvedContent = resolvedLines.join(';');
      data.content = resolvedContent;
      this.#styles[data.key] = data;
    }

    return this.#styles[data.key];
  }
  resolveResource(fromPath, targetPath) {
    const data = {
      key: null,
      path: {},
    };
    const fromDir = nodepath.parse(fromPath).dir;
    data.path.abs = nodepath.resolve(fromDir, targetPath);
    data.key = Buffer.from(data.path.abs).toString('base64');

    if (!this.#resources[data.key]) {
      data.path.rel = data.path.abs.substring(this.views.length);
      this.#resources[data.key] = data;
    }

    return this.#resources[data.key];
  }
  getPublicFile(targetPath) {
    if (targetPath.startsWith('/')) {
      targetPath = targetPath.substring(1);
    }
    const path = nodepath.resolve(this.views, targetPath);
    const key = Buffer.from(path).toString('base64');
    if (this.#scripts[key] || this.#styles[key] || this.#resources[key]) {
      if (path.startsWith(this.views)) {
        if (nodefs.existsSync(path)) {
          return path;
        }
      }
    }
    return null;
  }

  processTemplate(path, document, scope = {}) {
    this.processIfTag(path, document, scope);
    this.processRepeatTag(path, document, scope);
    this.processInjection(path, document, scope);
    this.processImportTag(path, document, scope);
    this.processScriptTag(path, document, scope);
    this.processStyleTag(path, document, scope);
    this.processResourceTag(path, document, scope);
  }
  processIfTag(path, document, scope = {}) {
    const elements = document.querySelectorAll('if');

    for (const element of elements) {
      if (this.parentTagNames(element).includes('REPEAT')) {
        continue;
      }

      let conditions = [element];
      let sibling = element;
      while (true) {
        sibling = sibling.nextElementSibling;
        if (!sibling) {
          break;
        } else if (sibling.tagName === 'ELIF') {
          conditions.push(sibling);
        } else if (sibling.tagName === 'ELSE') {
          conditions.push(sibling);
          break;
        } else {
          break;
        }
      }

      let checked = false;
      for (const condition of conditions) {
        if (checked) {
          condition.remove();
        } else if (condition.tagName === 'IF' || condition.tagName === 'ELIF') {
          let code = condition.getAttribute('condition');
          if (this.instantEval(code, scope)) {
            condition.replaceWith(...condition.childNodes);
            checked = true;
          } else {
            condition.remove();
          }
        } else {
          condition.replaceWith(...condition.childNodes);
          checked = true;
        }
      }
    }
  }
  processRepeatTag(path, document, scope = {}) {
    let elements = document.querySelectorAll('repeat');

    for (const element of elements) {
      if (this.parentTagNames(element).includes('IF')) {
        continue;
      }

      let times = this.instantEval(element.getAttribute('times'), scope);
      let from = this.instantEval(element.getAttribute('from'), scope);
      let to = this.instantEval(element.getAttribute('to'), scope);
      if (times) {
        from = 0;
        to = times - 1;
      }

      let content = element.innerHTML;
      let indexKey = element.getAttribute('index');
      let repeatNodes = [];
      for (let i = from; i <= to; i++) {
        if (indexKey) {
          scope[indexKey] = i;
        }
        const contentDocument = HTML.parse(content);
        this.processTemplate(path, contentDocument, scope);
        repeatNodes.push(contentDocument);
      }
      element.replaceWith(...repeatNodes);
    }
  }
  processInjection(path, document, scope = {}) {
    let source = document.innerHTML;
    let target = source;

    let code = '';
    let collect = null;
    let nested = 0;
    for (let i = 0; i < source.length; i++) {
      if (collect === null) {
        if (source.substring(i, i + 2) === '@{') {
          collect = 'injection';
          i++;
        } else if (source.substring(i, i + 2) === '#{') {
          collect = 'instant';
          i++;
        }
      } else {
        if (source.charAt(i) === '}') {
          if (nested > 0) {
            nested--;
          } else {
            if (collect === 'injection') {
              const value = this.eval(code, scope) || '';
              target = target.replace(`@{${code}}`, value);
            } else if (collect === 'instant') {
              const value = this.instantEval(code, scope) || '';
              target = target.replace(`#{${code}}`, value);
            }
            code = '';
            collect = null;
            continue;
          }
        } else if (source.charAt(i) === '{') {
          nested++;
        }
        code += source.charAt(i);
      }
    }

    document.innerHTML = target;
  }
  processImportTag(path, document, scope = {}) {
    let elements = document.querySelectorAll('import');
    for (const element of elements) {
      let src = element.getAttribute('src');
      if (!/^.*\.[^\.]+$/.test(src)) {
        src += '.html';
      }
      let dir = nodepath.parse(path).dir;
      if (src.startsWith('/')) {
        dir = this.views;
        src = src.substring(1);
      }

      const importPath = nodepath.resolve(dir, src);
      const ext = nodepath.parse(importPath).ext;
      let importDocument;

      // templates
      if (['.html', '.htm', '.xml', '.svg'].includes(ext)) {
        const data = this.getTemplate(importPath);
        importDocument = HTML.parse(data);
      }
      // scripts
      else if (['.js', '.mjs'].includes(ext)) {
        const script = this.resolveScript(path, importPath);
        const data = `<script>${script.content}</script>`;
        importDocument = HTML.parse(data);
      }
      // styles
      else if (['.css'].includes(ext)) {
        const style = this.resolveStyle(path, importPath);
        const data = `<style>${style.content}</style>`;
        importDocument = HTML.parse(data);
      }

      this.processTemplate(importPath, importDocument, scope);

      if (importDocument.childNodes.length === 1) {
        const attrs = element.attributes;
        delete attrs.src;
        Object.keys(attrs).forEach((key) => {
          importDocument.childNodes[0].setAttribute(key, attrs[key]);
        });
      }

      element.replaceWith(...importDocument.childNodes);
    }
  }
  processScriptTag(path, document, scope = {}) {
    for (const element of document.querySelectorAll('script[src]')) {
      const target = element.getAttribute('src');
      if (target.startsWith('/')) {
        continue;
      }
      const dir = nodepath.parse(path).dir;
      const targetPath = nodepath.resolve(dir, target);
      const resolve = this.resolveScript(path, targetPath);
      element.setAttribute('src', resolve.path.abs);
    }
    for (const element of document.querySelectorAll('script:not([src])')) {
      const resolve = this.resolveScript(path, path, element.innerHTML);
      element.innerHTML = resolve.content;
    }
  }
  processStyleTag(path, document, scope = {}) {
    for (const element of document.querySelectorAll(
      'link[href][rel="stylesheet"]'
    )) {
      const target = element.getAttribute('href');
      if (target.startsWith('/')) {
        continue;
      }
      const dir = nodepath.parse(path).dir;
      const targetPath = nodepath.resolve(dir, target);
      const resolve = this.resolveStyle(path, targetPath);
      element.setAttribute('src', resolve.path.abs);
    }
    for (const element of document.querySelectorAll('style')) {
      const resolve = this.resolveStyle(path, path, element.innerHTML);
      element.innerHTML = resolve.content;
    }
  }
  processResourceTag(path, document, scope = {}) {
    for (const element of document.querySelectorAll('img[src]')) {
      const target = element.getAttribute('src');
      if (target.startsWith('/')) {
        continue;
      }
      const dir = nodepath.parse(path).dir;
      const targetPath = nodepath.resolve(dir, target);
      const resolve = this.resolveResource(path, targetPath);
      element.setAttribute('src', resolve.path.rel);
    }
  }

  eval(code, scope) {
    return new Function(`with (this) { ${code} }`).call(scope);
  }
  instantEval(code, scope) {
    return this.eval(`return ${code}`, scope);
  }

  nodes(string) {
    return HTML.parse(string).childNodes;
  }
  parentTagNames(element) {
    const list = [];
    while (element.parentNode?.tagName) {
      list.push(element.parentNode.tagName);
      element = element.parentNode;
    }
    return list;
  }

  static #trim(str) {
    return str.replace(/^[\s\r\n]*|[\s\r\n]*$/g, '');
  }
  static #encode(s) {
    s = s.replace(/</g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    s = s.replace(/#/g, '&#35;');
    s = s.replace(/@/g, '&#64;');
    s = s.replace(/\$/g, '&#36;');
    return s;
  }
  static #decode(s) {
    s = s.replace(/&lt;/g, '<');
    s = s.replace(/&gt;/g, '>');
    s = s.replace(/&#35;/g, '#');
    s = s.replace(/&#64;/g, '@');
    s = s.replace(/&#36;/g, '$');
    return s;
  }

  express(app) {
    app.engine(
      'html',
      ((filepath, scope, callback) => {
        try {
          callback(null, this.render(filepath, scope));
        } catch (error) {
          callback(error, null);
        }
      }).bind(this)
    );
    app.set('view engine', 'html');
    app.set('views', this.views);
    app.use(
      ((req, res, next) => {
        const path = this.getPublicFile(req.path);
        if (path) {
          res.sendFile(path);
        } else {
          next();
        }
      }).bind(this)
    );
  }
}

export default WanyneTemplateEngine;
