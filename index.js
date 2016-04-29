(function() {
  var fs = require('fs'),
    path = require('path'),
    _ = require('underscore');

  var SelfReloadJSON = function SelfReloadJSON(options) {
    switch(typeof options) {
      case 'string': options = { fileName: options }; break;
      case 'object': break;
      default: return;
    }

    var updateFile, onFileChange, stop, resume, save;
    var content, updateFileLock, fileName, watcher;

    content = this;

    options = _.defaults(options, {
      fileName: '',
      encoding: 'utf8',
      additive: false,
      method: 'native',
      interval: 5000
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
      if(!opts) opts = {};
      updateFileLock = true;
      try{
        fs.writeFileSync(options.fileName, JSON.stringify(content), _.extend({
          encoding: options.encoding
        }, opts));
      } finally {
        updateFileLock = false;
      }
    };

    onFileChange = function onFileChange(a, b) {
      if(a instanceof fs.Stats) {
        if(a.mtime === b.mtime) return;
        updateFile();
      } else {
        if(b !== fileName) return;
        updateFile();
      }
    };

    updateFile = function updateFile() {
      if(updateFileLock) return;
      updateFileLock = true;
      try {
        var rawFile = fs.readFileSync(options.fileName, {
          encoding: options.encoding
        });
        var newContent = JSON.parse(rawFile);
        if(!options.additive) {
          var removeList = _.keys(content)
          for(var i = 0, l = removeList.length; i < l; i++)
            delete content[removeList[i]];
          if(stop) content.stop = stop;
          if(resume) content.resume = resume;
        }
        _.extendOwn(content, newContent);
      } catch(err) {
        console.log(err.stack ? err.stack : err);
      } finally {
        updateFileLock = false;
      }
    };

    resume();
  };

  module.exports = SelfReloadJSON;
})();
