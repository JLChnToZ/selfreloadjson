(function() {
  var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    _ = require('underscore');

  var omitKeys = _.allKeys(new EventEmitter());
  omitKeys.push('stop', 'resume', 'save', 'forceUpdate');

  var SelfReloadJSON = function SelfReloadJSON(options) {
    EventEmitter.call(this);

    switch(typeof options) {
      case 'string': options = { fileName: options }; break;
      case 'object': case 'undefined': break;
      default: throw new Error('Invalid options type.');
    }

    var updateFile, onFileChange, stop, resume, save;
    var content, updateFileLock, fileName, watcher;

    content = this;

    options = _.defaults(options || {}, {
      fileName: '',
      encoding: 'utf8',
      additive: false,
      method: 'native',
      interval: 5000,
      reviver: null,
      replacer: null
    });

    content.stop = stop = function stop() {
      if(watcher) {
        if(typeof watcher === 'string')
          fs.unwatchFile(watcher, onFileChange);
        else
          watcher.close();
        watcher = null;
      }
    };

    content.resume = resume = function resume() {
      stop();
      options.fileName = path.resolve(options.fileName);
      fileName = path.basename(options.fileName);
      switch(options.method) {
        case 'native':
          watcher = fs.watch(options.fileName, {
            encoding: options.encoding
          }, onFileChange);
          break;
        case 'polling':
          watcher = options.fileName;
          fs.watchFile(options.fileName, {
            interval: options.interval
          }, onFileChange);
          break;
      }
      updateFile();
    };

    content.save = save = function save(opts) {
      opts = _.defaults(opts || {}, {
        encoding: options.encoding,
        replacer: options.replacer,
        space: null
      });
      updateFileLock = true;
      try {
        fs.writeFileSync(
          options.fileName,
          JSON.stringify(_.omit(content, function(v, k) {
            return _.contains(omitKeys, k);
          }), opts.replacer, opts.space),
          _.omit(opts, 'replacer', 'space')
        );
      } finally {
        updateFileLock = false;
      }
    };

    onFileChange = function onFileChange(a, b) {
      try {
        if(a instanceof fs.Stats) {
          if(a.mtime === b.mtime) return;
          updateFile();
        } else {
          if(b !== fileName) return;
          updateFile();
        }
      } catch(err) {
        console.log(err.stack ? err.stack : err);
      }
    };

    content.forceUpdate = updateFile = function updateFile() {
      if(updateFileLock) return;
      updateFileLock = true;
      try {
        var rawFile = fs.readFileSync(options.fileName, {
          encoding: options.encoding
        });
        var newContent = _.omit(JSON.parse(rawFile, options.reviver), function(v, k) {
          return _.contains(omitKeys, k);
        });
        if(!options.additive) {
          var removeList = _.chain(content).keys().difference(omitKeys).value();
          for(var i = 0, l = removeList.length; i < l; i++)
            delete content[removeList[i]];
        }
        _.extendOwn(content, newContent);
        content.emit('updated');
      } catch(err) {
        console.log(err.stack ? err.stack : err);
        content.emit('error', err);
      } finally {
        updateFileLock = false;
      }
    };

    resume();
  };

  util.inherits(SelfReloadJSON, EventEmitter);
  module.exports = SelfReloadJSON;
})();
