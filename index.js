(() => {
  'use strict';
  const fs = require('fs');
  const path = require('path');
  const util = require('util');
  const { EventEmitter } = require('events');

  const privateProps = Symbol('private');
  const fileChanged = Symbol('onFileChange');

  const omitKeys = Object.keys(SelfReloadJSON.prototype);

  function deleteAll(obj, keys) {
    for(const key in keys)
      if(key in obj)
        delete obj[key];
    return obj;
  }

  function parseFile(fileName, encoding, reviver) {
    let content = JSON.parse(fs.readFileSync(fileName, { encoding }), reviver);

    if(typeof content !== 'object')
      content = { value: content };

    deleteAll(content, omitKeys);

    return content;
  }

  class SelfReloadJSON extends EventEmitter {
    constructor(options) {
      super();
      switch(typeof options) {
        case 'string': options = { fileName: options }; break;
        case 'object': case 'undefined': break;
        default: throw new Error('Invalid options type.');
      }

      const internals = {
        keys: [],
        fileName: '',
        watcher: null,
        options: Object.assign({
          fileName: '',
          encoding: 'utf8',
          additive: false,
          method: 'native',
          interval: 5000,
          reviver: null,
          replacer: null
        }, options || {})
      };

      Object.defineProperty(this, privateProps, {
        value: internals
      });

      this.resume();
    }

    stop() {
      const internals = this[privateProps];
      const { watcher } = internals;
      if(watcher) {
        if(typeof watcher === 'string')
          fs.unwatchFile(watcher, this[fileChanged]);
        else
          watcher.close();
        internals.watcher = null;
      }
    }

    resume() {
      this.stop();
      const internals = this[privateProps];
      const { fileName, interval, encoding } = internals.options;

      options.fileName = path.resolve(fileName);
      internals.fileName = path.basename(fileName);

      switch(options.method) {
        case 'native':
          internals.watcher = fs.watch(fileName, { encoding }, this[fileChanged]);
          break;

        case 'polling':
          internals.watcher = fileName;
          fs.watchFile(fileName, { interval }, this[fileChanged]);
          break;
      }
      this.forceUpdate();
    }

    [fileChanged](a, b) {
      try {
        const internals = this[privateProps];
        if(a instanceof fs.Stats) {
          if(a.mtime === b.mtime) return;
          this.forceUpdate();
        } else {
          if(b !== internals.fileName) return;
          this.forceUpdate();
        }
      } catch(err) {
        console.log(err.stack || err);
      }
    }

    save(options) {
      const internals = this[privateProps];
      options = Object.assign({ space: null }, internals.options, options || {});
      internals.updateFileLock = true;
      try {
        fs.writeFileSync(
          internals.options.fileName,
          JSON.stringify(this, options.replacer, options.space),
          options
        );
      } finally {
        internals.updateFileLock = false;
      }
    }

    forceUpdate() {
      const internals = this[privateProps];
      const { fileName, encoding, reviver, additive } = internals.options;
      if(internals.updateFileLock) return;
      internals.updateFileLock = true;
      try {
        const newContent = parseFile(fileName, encoding, reviver);
        if(additive) {
          Object.assign(this, newContent);
          Object.assign(internals.newContent, newContent);
        } else {
          deleteAll(this, internals.keys);
          Object.assign(this, newContent);
          internals.newContent = newContent;
        }
        internals.keys = Object.keys(internals.newContent);
        this.emit('updated');
      } catch(err) {
        console.log(err.stack || err);
        this.emit('error', err);
      } finally {
        internals.updateFileLock = false;
      }
    }
  }

  module.exports = SelfReloadJSON;
})();
