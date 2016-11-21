//////////////////// HMR BEGIN ////////////////////
var _elm_hot_loader_init = function () {}
if (module.hot) {
  (function(Elm) {
    "use strict";

    var version = detectElmVersion()
    console.log('[elm-hot] Elm version:', version)

    if (version === '0.17') {
      throw new Error('[elm-hot] Please use elm-hot-loader@0.4.x')
    } else if (version !== '0.18') {
      throw new Error('[elm-hot] Elm version not supported.')
    }
        
    //polyfill for IE: https://github.com/fluxxu/elm-hot-loader/issues/16
    if (typeof Object.assign != 'function') {
      Object.assign = function(target) {
        'use strict';
        if (target == null) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
    
        target = Object(target);
        for (var index = 1; index < arguments.length; index++) {
          var source = arguments[index];
          if (source != null) {
            for (var key in source) {
              if (Object.prototype.hasOwnProperty.call(source, key)) {
                target[key] = source[key];
              }
            }
          }
        }
        return target;
      };
    }

    var instances = module.hot.data
      ? module.hot.data.instances || {}
      : {};
    var uid = module.hot.data
      ? module.hot.data.uid || 0
      : 0;

    var cancellers = [];

    var initializingInstance = null, swappingInstance = null;

    module.hot.accept();
    module.hot.dispose(function(data) {
      data.instances = instances;
      data.uid = uid;

      // disable current instance
      _elm_lang$core$Native_Scheduler.nativeBinding = function() {
        return _elm_lang$core$Native_Scheduler.fail(new Error('[elm-hot] Inactive Elm instance.'))
      }

      if (cancellers.length) {
        console.log('[elm-hot] Killing ' + cancellers.length + ' running processes...');
        try {
          cancellers.forEach(function (cancel) {
            cancel();
          });
        } catch (e) {
          console.warn('[elm-hot] Kill process error: ' + e.message);
        }
      }
    });

    function getId() {
      return ++uid;
    }

    function detectElmVersion() {
      try {
        if (_elm_lang$core$Native_Platform.initialize) {
          return '0.18'
        }
      } catch (_) {}

      try {
        // 0.17 function programWithFlags(details)
        if (_elm_lang$virtual_dom$VirtualDom$programWithFlags.length === 1) {
          return '0.17'
        }
      } catch (_) {}

      return 'unknown'
    }

    function findPublicModules(parent, path) {
      var modules = [];
      for (var key in parent) {
        var child = parent[key];
        var currentPath = path ? path + '.' + key : key;
        if ('fullscreen' in child) {
          modules.push({
            path: currentPath,
            module: child
          });
        } else {
          modules = modules.concat(findPublicModules(child, currentPath));
        }
      }
      return modules;
    }

    function getPublicModule(Elm, path) {
      var parts = path.split('.');
      var parent = Elm;
      for (var i = 0; i < parts.length; ++i) {
        var part = parts[i];
        if (part in parent) {
          parent = parent[part]
        }
        if (!parent) {
          return null;
        }
      }
      return parent
    }

    function registerInstance(domNode, flags, path, portSubscribes) {
      var id = getId();

      var instance = {
        id: id,
        path: path,
        domNode: domNode,
        flags: flags,
        portSubscribes: portSubscribes,
        elmProxy: null,
        lastState: null, // last elm app state
        callbacks: []
      }

      instance.subscribe = function (cb) {
        instance.callbacks.push(cb)
        return function () {
          instance.callbacks.splice(instance.callbacks.indexOf(cb), 1)
        }
      }

      instance.dispatch = function (event) {
        instance.callbacks.forEach(function (cb) {
          cb(event, {
            flags: instance.flags,
            state: instance.lastState._0
          })
        })
      }

      return instances[id] = instance
    }

    function wrapPublicModule(path, module) {
      var embed = module.embed;
      var fullscreen = module.fullscreen;
      module.embed = function(domNode, flags) {
        var elm;
        var portSubscribes = {};
        initializingInstance = registerInstance(domNode, flags, path, portSubscribes)        
        elm = embed(domNode, flags);
        wrapPorts(elm, portSubscribes)
        elm = initializingInstance.elmProxy = {
          ports: elm.ports,
          hot: {
            subscribe: initializingInstance.subscribe
          }
        };
        initializingInstance = null;
        return elm;
      };

      module.fullscreen = function (flags) {
        var elm
        var portSubscribes = {};
        initializingInstance = registerInstance(document.body, flags, path, portSubscribes)        
        elm = fullscreen(flags);
        wrapPorts(elm, portSubscribes)
        elm = initializingInstance.elmProxy = {
          ports: elm.ports,
          hot: {
            subscribe: initializingInstance.subscribe
          }
        };
        initializingInstance = null;
        return elm;
      }
    }

    function swap(Elm, instance) {
      console.log('[elm-hot] Hot-swapping module: ' + instance.path)

      swappingInstance = instance;

      var domNode = instance.domNode;

      while (domNode.lastChild) {
        domNode.removeChild(domNode.lastChild);
      }

      var m = getPublicModule(Elm, instance.path)
      var elm;
      if (m) {
        instance.dispatch('swap')

        var flags = instance.flags
        if (instance.isFullscreen) {
          elm = m.fullscreen(flags);
        } else {
          elm = m.embed(domNode, flags);
        }

        instance.elmProxy.ports = elm.ports;

        Object.keys(instance.portSubscribes).forEach(function(portName) {
          if (portName in elm.ports && 'subscribe' in elm.ports[portName]) {
            var handlers = instance.portSubscribes[portName];
            if (!handlers.length) {
              return;
            }
            console.log('[elm-hot] Reconnect ' + handlers.length + ' handler(s) to port \'' + portName + '\' (' + instance.path + ').');
            handlers.forEach(function(handler) {
              elm.ports[portName].subscribe(handler);
            });
          } else {
            delete instance.portSubscribes[portName];
            console.log('[elm-hot] Port was removed: ' + portName);
          }
        });
      } else {
        console.log('[elm-hot] Module was removed: ' + instance.path);
      }

      swappingInstance = null;
    }

    function wrapPorts(elm, portSubscribes) {
      var portNames = Object.keys(elm.ports || {});
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
                  //TODO handle subscribing to single handler more than once?
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

    // hook program creation
    var initialize = _elm_lang$core$Native_Platform.initialize
    _elm_lang$core$Native_Platform.initialize = function (stateTuple, update, view, renderer) {
      var instance = initializingInstance
      var swapping = swappingInstance
      var tryFirstRender = !!swappingInstance
      var isInitialRender = true


      var debuggerEnabled = isDebuggerState(stateTuple._0)
      if (swappingInstance) {
        if (debuggerEnabled) {
          stateTuple._0.state = swappingInstance.lastState
        } else {
          stateTuple._0 = swappingInstance.lastState
        }
      }
      return initialize(stateTuple, update, function (model) {
        var result;
        // first render may fail if shape of model changed too much
        if (tryFirstRender) {
          tryFirstRender = false
          try {
            result = view(model)
          } catch (e) {
            throw new Error('[elm-hot] Hot-swapping is not possible, please reload page. Error: ' + e.message)
          }
        } else {
          result = view(model)
        }
        if (instance) {
          if (isDebuggerState(model)) {
            instance.lastState = model.state
          } else {
            instance.lastState = model
          }
        } else {
          instance = swapping
        }
        isInitialRender = false
        return result
      }, renderer)

      function isDebuggerState(state) {
        return state && typeof state === 'object' && typeof state.isDebuggerOpen === 'boolean' && 'state' in state
      }
    }

    // hook process creation
    var nativeBinding = _elm_lang$core$Native_Scheduler.nativeBinding
    _elm_lang$core$Native_Scheduler.nativeBinding = function() {
      var def = nativeBinding.apply(this, arguments);
      var callback = def.callback
      def.callback = function() {
        var result = callback.apply(this, arguments)
        if (result) {
          cancellers.push(result);
          return function() {
            cancellers.splice(cancellers.indexOf(result), 1);
            return result();
          };
        }
        return result;
      };
      return def;
    };

    _elm_hot_loader_init = function (Elm) {
      // swap instances
      var removedInstances = [];
      for (var id in instances) {
        var instance = instances[id]
        if (instance.domNode.parentNode) {
          swap(Elm, instance);
        } else {
          removedInstances.push(id);
        }
      }

      removedInstances.forEach(function (id) {
        delete instance[id];
      });

      // wrap all public modules
      var publicModules = findPublicModules(Elm);
      publicModules.forEach(function (m) {
        wrapPublicModule(m.path, m.module);
      });
    }
  })(Elm);
}
//////////////////// HMR END ////////////////////
