//////////////////// HMR BEGIN ////////////////////
if (module.hot) {
  (function(Elm) {
    "use strict";

    var programWithFlags;
    
    try {
      programWithFlags = _elm_lang$virtual_dom$VirtualDom$programWithFlags;
    } catch (_) {
      console.warn('[elm-hot] Hot-swapping disabled because VirtualDom module was not found.')
      return;
    }

    var instances = module.hot.data
      ? module.hot.data.instances || {}
      : {};
    var uid = module.hot.data
      ? module.hot.uid || 0
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

    function getPublicModule(path) {
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
      return instances[id] = {
        id: id,
        path: path,
        domNode: domNode,
        flags: flags,
        portSubscribes: portSubscribes,
        elmProxy: null
      };
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
          ports: elm.ports
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
          ports: elm.ports
        };
        initializingInstance = null;
        return elm;
      }
    }

    function swap(instance) {
      console.log('[elm-hot] Hot-swapping module: ' + instance.path)

      swappingInstance = instance;

      var domNode = instance.domNode;

      while (domNode.lastChild) {
        domNode.removeChild(domNode.lastChild);
      }

      var m = getPublicModule(instance.path)
      var elm;
      if (m) {
        if (instance.isFullscreen) {
          elm = m.fullscreen(instance.flags);
        } else {
          elm = m.embed(domNode, instance.flags);
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
    _elm_lang$virtual_dom$VirtualDom$programWithFlags = function () {
      var instance = initializingInstance;
      var swapping = swappingInstance;
      var tryFirstRender = !!swappingInstance;
      var isInitialRender = true;
      var program = programWithFlags.apply(this, arguments);

      //var makeRenderer = program.renderer;
      var init = program.init;
      var view = program.view;
      program.init = function () {
        var result = init.apply(this, arguments);
        if (swapping) {
          result._0 = swapping.lastState;
        }
        return result;
      };
      program.view = function(model) {
        var result;
        // first render may fail if shape of model changed too much
        if (tryFirstRender) {
          tryFirstRender = false;
          try {
            result = view(model);
          } catch (e) {
            throw new Error('[elm-hot] Hot-swapping is not possible, please reload page.');
          }
        } else {
          result = view(model);
        }
        if (instance) {
          instance.lastState = model;
        } else {
          instance = swapping;
        }
        isInitialRender = false;
        return result;
      };
      return program;
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

    // swap instances
    var removedInstances = [];
    for (var id in instances) {
      var instance = instances[id]
      if (instance.domNode.parentNode) {
        swap(instance);
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
  })(Elm);
}
//////////////////// HMR END ////////////////////
