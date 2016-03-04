'use strict';

require('./index.html');
var Elm = require('./Main');
var Elm2 = require('./Nested/Main');

var left = document.getElementById('left');
var right = document.getElementById('right');
var logs = document.getElementById('logs');

function appendLog(source, log) {
  var node = document.createElement('div');
  node.style.color = 'red';
  node.innerHTML = '[' + source + '] ' + log + ', time = ' + Date.now();
  logs.appendChild(node);
}

var elmLeft = Elm.embed(Elm.Main, left, { swap: false });
elmLeft.ports.logs.subscribe(appendLog.bind(null, 'Elm.Main'));

var elmRight = Elm2.embed(Elm2.Nested.Main, right, { swap: false });
elmRight.ports.logs.subscribe(appendLog.bind(null, 'Elm.Nested.Main'));