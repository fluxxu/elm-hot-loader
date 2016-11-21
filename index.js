/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Flux Xu @fluxxu
*/

var readFileSync = require('fs').readFileSync;
var path = require('path');

var hmrScript = readFileSync(__dirname + '/hmr.js');
var injectBeforeCode = 'var _elm_lang$html$Html_Events$Options = F2(';
var initBeforeCode = 'if (typeof define === "function" && define[\'amd\'])';

var loaderUtils = require("loader-utils");
module.exports = function(content) {
  this.cacheable && this.cacheable();
  var callback = this.async();

  if (!callback) {
    throw new Error('elm-hot-loader currently only supports async mode.')
  }

  var input = loaderUtils.getRemainingRequest(this);
  process.nextTick(function() {
    wrap(input, content, callback);
  });
};

function wrap(input, content, callback) {
  var injectPos = content.indexOf(injectBeforeCode);
  if (injectPos === -1) {
    return callback(new Error('elm-hot-loader is incompatible with this version of Elm.'));
  } else {
    content = content.slice(0, injectPos) + '\r\n\r\n' +
      hmrScript + '\r\n\r\n' +
      content.slice(injectPos)

    var initPos = content.indexOf(initBeforeCode);
    content = content.slice(0, initPos) + '\r\n\r\n' +
      '_elm_hot_loader_init(Elm)' + '\r\n\r\n' +
      content.slice(initPos)

    return callback(null, content);
  }
}