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
      const template = this.getTemplate(file);
      const document = HTML.parse(template);
      this.processTemplate(file, document, scope);
      const parsed = document.toString();
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

  resolveScript(fromPath, targetPath, content) {
    let key;
    const data = {
      path: {},
      key: null,
      content: null,
    };

    if (this.#isAbsolute(targetPath)) {
      fromPath = this.views;
      targetPath = targetPath.substring(1);
    }

    if (targetPath) {
      data.path.abs = nodepath.resolve(fromPath, targetPath);
      key = Buffer.from(data.path.abs).toString('base64');

      if (!this.#scripts[key]) {
        data.path.rel = data.path.abs.substring(this.views.length);
        data.content = nodefs.readFileSync(data.path.abs).toString();
        const dir = nodepath.parse(data.path.abs).dir;
        data.content = this.resolveScriptContent(dir, data.content);
        this.#scripts[key] = data;
      }
    } else if (content !== undefined) {
      data.content = content;
      key = Buffer.from(data.content).toString('base64');

      if (!this.#scripts[key]) {
        data.content = this.resorlveStyleContent(fromPath, data.content);
        this.#scripts[key] = data;
      }
    }

    return this.#scripts[key];
  }
  resolveScriptContent(fromPath, content) {
    const lines = content.split(';');
    const resolvedLines = [];

    for (let line of lines) {
      let trim = this.#trim(line);
      if (/^import (?:.*) from (.*)$/.test(trim)) {
        let path = trim.match(/^import (?:.*) from (.*)$/)[1];
        if (!this.#isHTTP(path)) {
          const resolve = this.resolveScript(fromPath, path);
          line = line.replace(path, resolve.path.rel);
        }
      }
      resolvedLines.push(line);
    }

    return resolvedLines.join(';');
  }
  resolveStyle(fromPath, targetPath, content) {
    let key;
    const data = {
      path: {},
      key: null,
      content: null,
    };

    if (this.#isAbsolute(targetPath)) {
      fromPath = this.views;
      targetPath = targetPath.substring(1);
    }

    if (targetPath) {
      data.path.abs = nodepath.resolve(fromPath, targetPath);
      key = Buffer.from(data.path.abs).toString('base64');

      if (!this.#styles[key]) {
        data.path.rel = data.path.abs.substring(this.views.length);
        data.content = nodefs.readFileSync(data.path.abs).toString();
        const dir = nodepath.parse(data.path.abs).dir;
        data.content = this.resolveStyleContent(dir, data.content);
        this.#styles[key] = data;
      }
    } else if (content !== undefined) {
      data.content = content;
      key = Buffer.from(data.content).toString('base64');

      if (!this.#styles[key]) {
        data.content = this.resorlveStyleContent(fromPath, data.content);
        this.#styles[key] = data;
      }
    }

    return this.#styles[key];
  }
  resolveStyleContent(fromPath, content) {
    const lines = content.split(';');
    const resolvedLines = [];

    for (let line of lines) {
      let trim = this.#trim(line);
      if (/url\(['"]?([^'")]+)['"]?\)/.test(trim)) {
        let path = trim.match(/url\(['"]?([^'")]+)['"]?\)/)[1];
        if (!this.#isHTTP(path)) {
          const ext = nodepath.parse(path).ext;
          if (ext === '.css') {
            const resolve = this.resolveStyle(fromPath, path);
            line = line.replace(path, resolve.path.rel);
          } else {
            const resolve = this.resolveResource(fromPath, path);
            line = line.replace(path, resolve.path.rel);
          }
        }
      } else if (/^@import ['"]([^'" ]+)['"].*$/.test(trim)) {
        let path = trim.match(/^@import ['"]([^'" ]+)['"].*$/)[1];
        if (!this.#isHTTP(path)) {
          const resolve = this.resolveStyle(fromPath, path);
          line = line.replace(path, resolve.path.rel);
        }
      }
      resolvedLines.push(line);
    }

    return resolvedLines.join(';');
  }
  resolveResource(fromPath, targetPath) {
    let key;
    const data = {
      key: null,
      path: {},
    };

    if (this.#isAbsolute(targetPath)) {
      fromPath = this.views;
      targetPath = targetPath.substring(1);
    }

    data.path.abs = nodepath.resolve(fromPath, targetPath);
    data.path.absq = data.path.abs.replace(/\?(.*)/, '');
    key = Buffer.from(data.path.absq).toString('base64');

    if (!this.#resources[key]) {
      data.path.rel = data.path.abs.substring(this.views.length);
      this.#resources[key] = data;
    }

    return this.#resources[key];
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

      const target = nodepath.resolve(dir, src);
      const ext = nodepath.parse(target).ext;
      let importDocument;

      // templates
      if (['.html', '.htm', '.xml', '.svg'].includes(ext)) {
        const data = this.getTemplate(target);
        importDocument = HTML.parse(data);
      }
      // scripts
      else if (['.js', '.mjs'].includes(ext)) {
        const script = this.resolveScript(dir, src);
        const data = `<script>${script.content}</script>`;
        importDocument = HTML.parse(data);
      }
      // styles
      else if (['.css'].includes(ext)) {
        const style = this.resolveStyle(dir, src);
        const data = `<style>${style.content}</style>`;
        importDocument = HTML.parse(data);
      }

      this.processTemplate(target, importDocument, scope);

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
    for (const element of document.querySelectorAll('script:not([src])')) {
      //const resolve = this.resolveScript(path, path, element.innerHTML);
      //element.innerHTML = resolve.content;
    }
    for (const element of document.querySelectorAll('script[src]')) {
      let target = element.getAttribute('src');
      if (!this.#isHTTP(target)) {
        const dir = nodepath.parse(path).dir;
        const resolve = this.resolveScript(dir, target);
        element.setAttribute('src', resolve.path.rel);
      }
    }
  }
  processStyleTag(path, document, scope = {}) {
    for (const element of document.querySelectorAll('style')) {
      //const resolve = this.resolveStyle(path, null, element.innerHTML);
      //element.innerHTML = resolve.content;
    }
    for (const element of document.querySelectorAll(
      'link[href][rel="stylesheet"]'
    )) {
      let target = element.getAttribute('href');
      if (!this.#isHTTP(target)) {
        const dir = nodepath.parse(path).dir;
        const resolve = this.resolveStyle(dir, target);
        element.setAttribute('href', resolve.path.rel);
      }
    }
  }
  processResourceTag(path, document, scope = {}) {
    for (const element of document.querySelectorAll('img[src]')) {
      const target = element.getAttribute('src');
      if (this.#isHTTP(target)) {
        continue;
      }
      const dir = nodepath.parse(path).dir;
      const resolve = this.resolveResource(dir, target);
      element.setAttribute('src', resolve.path.rel);
    }
    for (const element of document.querySelectorAll(
      'link[href]:not([rel="stylesheet"])'
    )) {
      const target = element.getAttribute('href');
      if (this.#isHTTP(target)) {
        continue;
      }
      const dir = nodepath.parse(path).dir;
      const resolve = this.resolveResource(dir, target);
      element.setAttribute('href', resolve.path.rel);
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

  #isHTTP(url) {
    return Boolean(
      url.substring(0, 6) === 'https:' || url.substring(0, 5) === 'http:'
    );
  }
  #isAbsolute(url) {
    return Boolean(url.substring(0, 1) === '/');
  }
  #trim(str) {
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
