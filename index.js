(() => {
  'use strict';
  const fs = require('fs');
  const path = require('path');
  const util = require('util');
  const EventEmitter = require('events').EventEmitter;

  const privateProps = Symbol('private');
  const fileChanged = Symbol('onFileChange');

  function deleteAll(obj, keys) {
    for(const key of keys)
      if(key in obj)
        delete obj[key];
    return obj;
  }

  function getAllProperties(obj, output) {
    output = output || [];
    if(!obj) return output;
    Array.prototype.push.apply(output, Object.getOwnPropertyNames(obj));
    return getAllProperties(Object.getPrototypeOf(obj), output);
  }

  class SelfReloadJSON extends EventEmitter {
    constructor(options) {
      super();

      switch(typeof options) {
        case 'string': options = { fileName: options }; break;
        case 'object': case 'undefined': break;
        default: throw new Error('Invalid options type.');
      }

      // Recursive fetch all property names even in prototype
      // which will be omitted from fetched JSON object.
      const localOmitKeys = getAllProperties(this);

      // Convert all internal values to non-enumerable,
      // prevents those values exposed by save function.
      for(let key in this) {
        const value = this[key];
        delete this[key];
        Object.defineProperty(this, key, {
          value,
          enumerable: false,
          configurable: true,
          writable: true
        });
      }

      this[privateProps] = {
        keys: [],
        fileName: '',
        watcher: null,
        content: null,
        fileChanged: this[fileChanged].bind(this),
        omitKeys: localOmitKeys,
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

      this.resume();
    }

    stop() {
      const internals = this[privateProps];
      if(!internals.watcher) return;
      if(typeof internals.watcher === 'string')
        fs.unwatchFile(internals.watcher, internals.fileChanged);
      else
        internals.watcher.close();
      internals.watcher = null;
    }

    resume() {
      this.stop();
      const internals = this[privateProps];
      const options = internals.options;

      if(internals.retryTimer) {
        clearImmediate(internals.retryTimer);
        delete internals.retryTimer;
      }

      options.fileName = path.resolve(options.fileName);
      internals.fileName = path.basename(options.fileName);

      switch(options.method) {
        case 'native':
          internals.watcher = fs.watch(
            options.fileName,
            { encoding: options.encoding },
            internals.fileChanged
          );
          break;

        case 'polling':
          internals.watcher = options.fileName;
          fs.watchFile(
            options.fileName,
            { interval: options.interval },
            internals.fileChanged
          );
          break;
      }
      this.forceUpdate();
    }

    [fileChanged](a, b) {
      try {
        if(a instanceof fs.Stats) {
          if(a.mtime === b.mtime) return;
        } else {
          if(b !== this[privateProps].fileName) return;
        }
        this.forceUpdate();
      } catch(err) {
        console.log(err.stack || err);
      }
    }

    save(options) {
      const internals = this[privateProps];
      options = Object.assign(
        { space: null },
        internals.options,
        options || {}
      );
      internals.updateFileLock = true;
      try {
        const json = JSON.stringify(this, options.replacer, options.space);
        fs.writeFileSync(internals.options.fileName, json, options);
        internals.raw = json;
      } finally {
        internals.updateFileLock = false;
      }
    }

    forceUpdate() {
      const internals = this[privateProps];
      const options = internals.options;
      if(internals.updateFileLock) return;
      internals.updateFileLock = true;

      if(internals.retryTimer) {
        clearImmediate(internals.retryTimer);
        delete internals.retryTimer;
      }

      try {
        const rawContent = fs.readFileSync(options.fileName, { encoding: options.encoding });
        if(internals.raw === rawContent) return;
        internals.raw = rawContent;

        let newContent = JSON.parse(rawContent, options.reviver);
        if(typeof newContent !== 'object')
          newContent = { value: newContent };

        // Ignore all values which defined internally
        const safeContent = deleteAll(Object.assign({}, newContent), internals.omitKeys);

        if(options.additive) {
          Object.assign(this, safeContent);
          Object.assign(internals.newContent, newContent);
        } else {
          deleteAll(this, internals.keys);
          Object.assign(this, safeContent);
          internals.newContent = newContent;
        }

        internals.keys = Object.keys(internals.newContent);
      } catch(err) {
        switch(err && err.code) {
          case 'EBUSY':
          case 'EAGAIN':
            internals.retryTimer = setImmediate(this.forceUpdate.bind(this));
            return;
        }

        console.error(err.stack || err);
        this.emit('error', err);
        return;
      } finally {
        internals.updateFileLock = false;
      }

      this.emit('updated', internals.newContent);
    }
  }

  module.exports = SelfReloadJSON;
})();
