if (module.hot) {
  //Export Elm if not exported
  try {
    if (module.exports !== Elm) {
      module.exports = Elm;
    }
  } catch (e) {
    throw new Error('[elm-hot] Can not find exported Elm.');
  }

  try {
    (function(originalElm) {
      "use strict";
      var instances = module.hot && module.hot.data
        ? module.hot.data.instances || {}
        : {};
      var uid = module.hot && module.hot.data
        ? module.hot.uid || 0
        : 0;

      var Elm = wrapElm(originalElm);

      module.hot.accept();
      module.hot.dispose(function(data) {
        data.instances = instances;
        data.uid = uid;
      });

      Object.keys(instances).forEach(function(id) {
        var instance = instances[id];
        var path = instance.name;
        console.log('[elm-hot] Swapping module: ' + path + '#' + id);
        var oldElm = instance.elm;
        var hookedDispose = oldElm.dispose;
        var newModule = getModule(Elm, path);
        var i;
        if (!newModule) {
          console.error('[elm-hot] module to swap not found, path: ' + path);
          return
        }

        //copy id and class: https://github.com/fluxxu/elm-hot-loader/issues/5
        var container = instance.container;
        var containerParent, containerIndex, containerClass, containerId;
        if (container) {
          containerParent = instance.container.parentNode;
          containerIndex = -1;
          containerClass = container.className;
          containerId = container.id;
          for (i = 0; i < container.parentNode.childNodes.length; i++) {
            if (container.parentNode.childNodes[i] === container) {
              containerIndex = i;
            }
          }
          if (containerIndex === -1) {
            console.error('[elm-hot] Can not find container.');
            return
          }
        }

        var newElm = instance.elm = oldElm.swap(newModule);
        
        if (container) {
          instance.container = containerParent.childNodes[containerIndex];
          instance.container.className = containerClass;
          instance.container.id = containerId;
        }

        hookedDispose.original = newElm.dispose;
        newElm.dispose = hookedDispose;

        //reconnect ports
        var portSubscribes = instance.portSubscribes;
        var portNames;
        if (portSubscribes) {
          portNames = Object.keys(portSubscribes);
          if (portNames.length) {
            portNames.forEach(function(name) {
              var handlers = portSubscribes[name];
              if (!handlers.length) {
                return;
              }
              console.log('[elm-hot] Reconnect ' + handlers.length + ' handler(s) to port \'' + name + '\' (' + path + ').');
              handlers.forEach(function(handler) {
                newElm.ports[name].subscribe(handler);
              });

              wrapPorts(newElm, portSubscribes);
            });
          }
        }

        if ('swap' in newElm.ports) {
          //trigger re-render
          newElm.ports.swap.send(true)
        } else {
          console.error('[elm-hot] \'swap\' port is not defined.');
        }
      });

      module.exports = Elm;

      function getModule(elm, path) {
        var parts = path.split('.');
        var parent = elm;
        var part, prop;
        for (var i = 0; i < parts.length; i++) {
          part = parts[i];
          prop = parent[part];
          if (prop && typeof prop === 'object') {
            parent = prop;
          } else {
            parent = null;
            break;
          }
        }
        return parent;
      }

      function findModulePath(elm, module) {
         var path = find('', elm, module);
         if (!path) {
           throw new Error('[elm-hot] Can not resolve module path inside elm instance.')
         }
         console.log('[elm-hot] module found at Elm.' + path)
         return path;

         function find(path, parent, module) {
          var prop, propPath, nested;
          for (var key in parent) {
            prop = parent[key];
            propPath = path ? (path + '.' + key) : key;
            if (prop === module) {
              return propPath
            } else {
              if (prop && typeof prop === 'object') {
                nested = find(propPath, prop, module)
                if (nested) {
                  return nested
                }
              }
            }
          }
         }
      }

      function wrapElm(Elm) {       
        return Object.assign({}, Elm, {
          embed: function(module, container, config) {
            return wrap(module, container, config);
          },
          fullscreen: function(module, config) {
            return wrap(module, null , config);
          }
        });

        function getUID() {
          return ++uid;
        }

        function wrap(module, container, config) {
          var id = getUID();
          var embed = originalElm.embed;
          var fullscreen = originalElm.fullscreen;

          //find module name
          var name = findModulePath(Elm, module)

          var elm = container 
            ? embed(module, container, config) 
            : fullscreen(module, config);

          //hook dispose
          var dispose = elm.dispose;
          var hookedDispose = function() {
            delete instances[id];
            return dispose();
          };

          hookedDispose.original = dispose;
          elm.dispose = hookedDispose;

          //register
          instances[id] = {
            elm: elm,
            name: name,
            container: container,
            portSubscribes: wrapPorts(elm, {})
          };

          return elm;
        }
      }

      //hook ports to reconnect after swap
      function wrapPorts(elm, portSubscribes) {
        var portNames = Object.keys(elm.ports);
        //hook ports
        if (portNames.length) {
          portNames
            .filter(function(name) {
              return 'subscribe' in elm.ports[name];
            })
            .forEach(function(portName) {
              var port = elm.ports[portName];
              var subscribe = port.subscribe;
              var unsubscribe = port.unsubscribe;
              elm.ports[portName] = Object.assign(port, {
                subscribe: function(handler) {
                  console.log('[elm-hot] ports.' + portName + '.subscribe called.');
                  if (!portSubscribes[portName]) {
                    portSubscribes[portName] = [ handler ];
                  } else {
                    //TODO handle subscribing handler more than once?
                    portSubscribes[portName].push(handler);
                  }
                  return subscribe.call(port, handler);
                },
                unsubscribe: function(handler) {
                  console.log('[elm-hot] ports.' + portName + '.unsubscribe called.');
                  var list = portSubscribes[portName];
                  if (list && list.indexOf(handler) !== -1) {
                    list.splice(list.lastIndexOf(handler), 1);
                  } else {
                    console.warn('[elm-hot] ports.' + portName + '.unsubscribe: handler not subscribed');
                  }
                  return unsubscribe.call(port, handler);
                }
              });
            });
        }
        return portSubscribes;
      }
    })(module.exports);
  } catch (e) {
    console.error('[elm-hot] crashed. Please report this to https://github.com/fluxxu/elm-hot-loader/issues');
    console.error(e);
  }
}
