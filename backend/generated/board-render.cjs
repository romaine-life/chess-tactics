"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "node_modules/react/cjs/react.production.js"(exports2) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result;
        ctor = ctor();
        ctor.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject;
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error;
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = ctor);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports2.Activity = REACT_ACTIVITY_TYPE;
    exports2.Children = Children;
    exports2.Component = Component;
    exports2.Fragment = REACT_FRAGMENT_TYPE;
    exports2.Profiler = REACT_PROFILER_TYPE;
    exports2.PureComponent = PureComponent;
    exports2.StrictMode = REACT_STRICT_MODE_TYPE;
    exports2.Suspense = REACT_SUSPENSE_TYPE;
    exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports2.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports2.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports2.cacheSignal = function() {
      return null;
    };
    exports2.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, props);
    };
    exports2.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports2.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, props);
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports2.isValidElement = isValidElement;
    exports2.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports2.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports2.startTransition = function(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    };
    exports2.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports2.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports2.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports2.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports2.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports2.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports2.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports2.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports2.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports2.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports2.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports2.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports2.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports2.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports2.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports2.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports2.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports2.version = "19.2.7";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                null != _ioInfo && (_ioInfo.end = performance.now());
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now());
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            ioInfo.value = thenable;
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module2 && module2[requireString]).call(
              module2,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports2.Activity = REACT_ACTIVITY_TYPE;
      exports2.Children = fnName;
      exports2.Component = Component;
      exports2.Fragment = REACT_FRAGMENT_TYPE;
      exports2.Profiler = REACT_PROFILER_TYPE;
      exports2.PureComponent = PureComponent;
      exports2.StrictMode = REACT_STRICT_MODE_TYPE;
      exports2.Suspense = REACT_SUSPENSE_TYPE;
      exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports2.__COMPILER_RUNTIME = deprecatedAPIs;
      exports2.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports2.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports2.cacheSignal = function() {
        return null;
      };
      exports2.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports2.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          validateChildKeys(arguments[key]);
        return props;
      };
      exports2.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports2.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        i = {};
        var key = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return ReactElement(
          type,
          key,
          i,
          getOwner(),
          propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports2.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports2.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports2.isValidElement = isValidElement;
      exports2.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports2.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports2.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      };
      exports2.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports2.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports2.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports2.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports2.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports2.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports2.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports2.useEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create, deps);
      };
      exports2.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports2.useId = function() {
        return resolveDispatcher().useId();
      };
      exports2.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports2.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports2.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports2.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports2.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports2.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports2.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports2.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports2.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports2.version = "19.2.7";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// node_modules/react/cjs/react-jsx-runtime.production.js
var require_react_jsx_runtime_production = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.production.js"(exports2) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    function jsxProd(type, config, maybeKey) {
      var key = null;
      void 0 !== maybeKey && (key = "" + maybeKey);
      void 0 !== config.key && (key = "" + config.key);
      if ("key" in config) {
        maybeKey = {};
        for (var propName in config)
          "key" !== propName && (maybeKey[propName] = config[propName]);
      } else maybeKey = config;
      config = maybeKey.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== config ? config : null,
        props: maybeKey
      };
    }
    exports2.Fragment = REACT_FRAGMENT_TYPE;
    exports2.jsx = jsxProd;
    exports2.jsxs = jsxProd;
  }
});

// node_modules/react/cjs/react-jsx-runtime.development.js
var require_react_jsx_runtime_development = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.development.js"(exports2) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children)
          if (isStaticChildren)
            if (isArrayImpl(children)) {
              for (isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)
                validateChildKeys(children[isStaticChildren]);
              Object.freeze && Object.freeze(children);
            } else
              console.error(
                "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
              );
          else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
          children = getComponentNameFromType(type);
          var keys = Object.keys(config).filter(function(k) {
            return "key" !== k;
          });
          isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
          didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error(
            'A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />',
            isStaticChildren,
            children,
            keys,
            children
          ), didWarnAboutKeySpread[children + isStaticChildren] = true);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
          maybeKey = {};
          for (var propName in config)
            "key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(
          maybeKey,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        return ReactElement(
          type,
          children,
          maybeKey,
          getOwner(),
          debugStack,
          debugTask
        );
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      var React = require_react(), REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      React = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(
        React,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutKeySpread = {};
      exports2.Fragment = REACT_FRAGMENT_TYPE;
      exports2.jsx = function(type, config, maybeKey) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          false,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports2.jsxs = function(type, config, maybeKey) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          true,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
    })();
  }
});

// node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "node_modules/react/jsx-runtime.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_jsx_runtime_production();
    } else {
      module2.exports = require_react_jsx_runtime_development();
    }
  }
});

// src/render/serverBoardRender.ts
var serverBoardRender_exports = {};
__export(serverBoardRender_exports, {
  boardHashForLevel: () => boardHashForLevel,
  levelRenderPlan: () => levelRenderPlan
});
module.exports = __toCommonJS(serverBoardRender_exports);

// src/core/pieces.ts
var DEFAULT_PALETTE = "navy-blue";
var pieceSpritePath = (type, palette = DEFAULT_PALETTE, direction = "south") => `/assets/units/${type}/${palette}/${direction}.png`;

// src/core/level.ts
var BOARD_COLS = { min: 1, max: 16 };
var BOARD_ROWS = { min: 1, max: 20 };

// src/ui/boardCode.ts
var dec = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
function decodeBoard(code) {
  try {
    const w = JSON.parse(dec(code));
    const cols = w.c | 0, rows = w.r | 0;
    if (cols < 1 || rows < 1 || cols > 64 || rows > 64) return null;
    const cells = {};
    if (w.f) for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) cells[`${x},${y}`] = w.f;
    if (w.t) Object.assign(cells, w.t);
    if (Array.isArray(w.h)) for (const key of w.h) delete cells[String(key)];
    const units = {};
    if (w.u) for (const [k, a] of Object.entries(w.u)) units[k] = { unitId: a[0], direction: a[1], faction: a[2] };
    const doodads = {};
    if (w.d) for (const [k, id] of Object.entries(w.d)) doodads[k] = { doodadId: id };
    const props = {};
    if (w.p) for (const [k, id] of Object.entries(w.p)) props[k] = { propId: id };
    const featureCuts = {};
    if (Array.isArray(w.rc)) for (const e of w.rc) featureCuts[e] = true;
    const featureExits = {};
    if (Array.isArray(w.rx)) for (const e of w.rx) featureExits[e] = true;
    const features = {};
    if (w.rd) for (const [k, m] of Object.entries(w.rd)) features[k] = { kind: "road", material: m };
    if (w.rv) for (const [k, m] of Object.entries(w.rv)) features[k] = { kind: "river", material: m };
    if (w.fn) for (const [k, m] of Object.entries(w.fn)) features[k] = { kind: "fence", material: m };
    const zones = {};
    if (w.z) for (const [k, type] of Object.entries(w.z)) zones[k] = type;
    return {
      cols,
      rows,
      playerFaction: typeof w.pf === "string" ? w.pf : void 0,
      cells,
      units,
      doodads,
      props,
      cover: w.v ?? {},
      features,
      featureCuts,
      featureExits,
      zones
    };
  } catch {
    return null;
  }
}

// src/ui/studioBoard.tsx
var import_react = __toESM(require_react(), 1);

// src/core/tileSockets.ts
var terrainLabels = {
  grass: "Grass",
  stone: "Stone",
  water: "Water",
  dirt: "Dirt",
  pebble: "Pebble",
  sand: "Sand"
};

// src/art/tileset.ts
var FAMILIES = ["grass", "dirt", "stone", "pebble", "sand", "water"];
var PRODUCTION_VARIANTS = Array.from({ length: 8 }, (_, n) => ({
  key: `${n}`,
  label: `Surface ${n + 1}`,
  role: n === 0 ? "base" : "variant",
  probability: n === 0 ? 1 : 0.8
}));
var WATER_TOP_ANIM_FRAMES = 8;
var surfaceTile = (family, variant) => ({
  id: `${family}-surf-${variant.key}`,
  label: `${terrainLabels[family]} \xB7 ${variant.label}`,
  src: `/assets/tiles/surface/${family}-${variant.key}.png`,
  role: variant.role,
  kind: "tile",
  source: "pixel:surface",
  method: "Surface (Blender edge + PixelLab top)",
  probability: variant.probability,
  notes: `${terrainLabels[family]} \u2014 ${variant.label}: Blender-derived iso edge with a generated pixel-art top (production).`,
  ...family === "water" ? { topAnimFrames: WATER_TOP_ANIM_FRAMES } : {}
});
var familyTiles = (family) => PRODUCTION_VARIANTS.map((variant) => surfaceTile(family, variant));
var tileFamilies = {
  grass: familyTiles("grass"),
  dirt: familyTiles("dirt"),
  stone: familyTiles("stone"),
  pebble: familyTiles("pebble"),
  sand: familyTiles("sand"),
  water: familyTiles("water")
};
var EDGE_VARIANTS = 3;
var edgeVariant = (family, v) => ({
  id: `${family}-edge-${v}`,
  label: `${terrainLabels[family]} \xB7 Edge ${v + 1}`,
  src: `/assets/tiles/surface/${family}-edge-${v}.png`,
  role: "edge",
  kind: "tile",
  source: "pixel:surface",
  method: "Edge (rich cliff)",
  probability: v === 0 ? 1 : 0.7,
  // variant 0 slightly commoner; rest punctuate the run
  notes: `${terrainLabels[family]} \u2014 rich perimeter cliff (variant ${v + 1}).`,
  terrains: [family]
});
var EDGE_FAMILIES = ["grass", "dirt", "stone", "pebble", "sand"];
var edgeTiles = Object.fromEntries(
  EDGE_FAMILIES.map((family) => [family, Array.from({ length: EDGE_VARIANTS }, (_, v) => edgeVariant(family, v))])
);
var MURAL_WINDOWS = 48;
var muralVariant = (family, i) => ({
  id: `${family}-mural-${i}`,
  label: `${terrainLabels[family]} \xB7 Mural ${i + 1}`,
  src: `/assets/tiles/surface/${family}-mural-${i}.png`,
  role: "edge",
  kind: "tile",
  source: "pixel:surface",
  method: "Edge mural (continuous cliff)",
  probability: 1,
  notes: `${terrainLabels[family]} \u2014 continuous cliff mural, window ${i + 1} of ${MURAL_WINDOWS}.`,
  terrains: [family]
});
var MURAL_FAMILIES = ["grass", "dirt", "stone", "sand", "pebble"];
var muralTiles = Object.fromEntries(
  MURAL_FAMILIES.map((family) => [family, Array.from({ length: MURAL_WINDOWS }, (_, i) => muralVariant(family, i))])
);
var FEATURE_FAMILIES = ["grass", "dirt"];
var featurePiece = (feature, key) => ({
  id: `${feature}-${key}`,
  label: `${feature} \xB7 ${key}`,
  src: `/assets/tiles/surface/${feature}-${key}.png`,
  role: "edge",
  kind: "tile",
  source: "pixel:surface",
  method: "Edge feature (story set-piece)",
  probability: 1,
  notes: `${feature} story feature (${key}).`,
  terrains: [...FEATURE_FAMILIES]
});
var FEATURE_PIECE_COUNT = { fossil: 6, ruins: 5 };
var edgeFeatures = Object.entries(FEATURE_PIECE_COUNT).map(([feature, count]) => ({
  id: feature,
  pieces: Array.from({ length: count }, (_, i) => featurePiece(feature, String(i))),
  cap: featurePiece(feature, "cap"),
  families: [...FEATURE_FAMILIES]
}));
var tileAssets = FAMILIES.flatMap((family) => tileFamilies[family]);
var featureFrameSrc = (kind, material, mask) => `/assets/tiles/feature/${kind}-${material}-${mask}.png`;

// src/ui/unitCatalog.ts
var SQUARE_EQUAL_AREA_FACTOR = Math.sqrt(Math.PI) / 2;
var circleFootprint = (sourceCanvasPx, sourceFootprintPx = sourceCanvasPx) => ({
  shape: "circle",
  sourceCanvasPx,
  sourceFootprintPx
});
var squareFootprint = (sourceCanvasPx, sourceFootprintPx = sourceCanvasPx) => ({
  shape: "square",
  sourceCanvasPx,
  sourceFootprintPx
});
var ROOK_KEEP_CANVAS_PX = 512;
var ROOK_KEEP_CONTACT_FOOTPRINT_PX = 428;
var ROOK_KEEP_CONTACT_ANCHOR_X = "50%";
var ROOK_KEEP_CONTACT_ANCHOR_Y = "80.241%";
var KNIGHT_FUR_CANVAS_PX = 512;
var KNIGHT_FUR_CONTACT_FOOTPRINT_PX = 178;
var KNIGHT_FUR_CONTACT_ANCHOR_X = "50%";
var KNIGHT_FUR_CONTACT_ANCHOR_Y = "80.241%";
var BISHOP_MITRE_CANVAS_PX = 512;
var BISHOP_MITRE_CONTACT_FOOTPRINT_PX = 126;
var BISHOP_MITRE_CONTACT_ANCHOR_X = "50%";
var BISHOP_MITRE_CONTACT_ANCHOR_Y = "80.241%";
var QUEEN_TIARA_CANVAS_PX = 512;
var QUEEN_TIARA_CONTACT_FOOTPRINT_PX = 150;
var QUEEN_TIARA_CONTACT_ANCHOR_X = "50%";
var QUEEN_TIARA_CONTACT_ANCHOR_Y = "80.241%";
var KING_CROWN_CANVAS_PX = 512;
var KING_CROWN_CONTACT_FOOTPRINT_PX = 148;
var KING_CROWN_CONTACT_ANCHOR_X = "50%";
var KING_CROWN_CONTACT_ANCHOR_Y = "80.241%";
var familyLabels = {
  pawn: "Pawn",
  rook: "Rook",
  knight: "Knight",
  bishop: "Bishop",
  queen: "Queen",
  king: "King"
};
var rookDirections = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
var paletteSprite = (piece) => (faction, direction) => pieceSpritePath(piece, faction, direction);
var MISSING_DIRECTION_SPRITE = "data:image/svg+xml;utf8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><path d='M80 26 L144 80 L80 134 L16 80 Z' fill='none' stroke='#8fb8ff' stroke-width='3' stroke-dasharray='6 6' opacity='0.4'/><text x='80' y='96' font-size='42' text-anchor='middle' fill='#8fb8ff' opacity='0.5' font-family='sans-serif'>?</text></svg>"
);
var hasDirectionSprite = (unit, dir) => unit.directions ? unit.directions.includes(dir) : dir === "south";
var productionUnits = [
  {
    id: "rook-blender-v4-calibrated",
    family: "rook",
    label: "Rook",
    badge: "8 directions \xB7 calibrated",
    preview: pieceSpritePath("rook"),
    read: "Board-calibrated castle rook with exact eight-direction rotations",
    status: "active production unit",
    directions: rookDirections,
    factionMode: "palette",
    defaultScale: 100,
    footprint: squareFootprint(ROOK_KEEP_CANVAS_PX, ROOK_KEEP_CONTACT_FOOTPRINT_PX),
    unitAnchorX: ROOK_KEEP_CONTACT_ANCHOR_X,
    unitAnchorY: ROOK_KEEP_CONTACT_ANCHOR_Y,
    sprite: paletteSprite("rook")
  },
  {
    id: "knight-fur",
    family: "knight",
    label: "Knight",
    badge: "8 directions \xB7 calibrated",
    preview: pieceSpritePath("knight"),
    read: "Carved warhorse with a procedural navy fur coat; true-isometric Blender render",
    status: "active production unit",
    directions: rookDirections,
    factionMode: "palette",
    defaultScale: 100,
    footprint: circleFootprint(KNIGHT_FUR_CANVAS_PX, KNIGHT_FUR_CONTACT_FOOTPRINT_PX),
    unitAnchorX: KNIGHT_FUR_CONTACT_ANCHOR_X,
    unitAnchorY: KNIGHT_FUR_CONTACT_ANCHOR_Y,
    sprite: paletteSprite("knight")
  },
  {
    id: "bishop-mitre",
    family: "bishop",
    label: "Bishop",
    badge: "8 directions \xB7 calibrated",
    preview: pieceSpritePath("bishop"),
    read: "Mitre bishop rendered as a true-isometric eight-direction production unit",
    status: "active production unit",
    directions: rookDirections,
    factionMode: "palette",
    defaultScale: 100,
    footprint: circleFootprint(BISHOP_MITRE_CANVAS_PX, BISHOP_MITRE_CONTACT_FOOTPRINT_PX),
    unitAnchorX: BISHOP_MITRE_CONTACT_ANCHOR_X,
    unitAnchorY: BISHOP_MITRE_CONTACT_ANCHOR_Y,
    sprite: paletteSprite("bishop")
  },
  {
    id: "queen-tiara",
    family: "queen",
    label: "Queen",
    badge: "8 directions \xB7 calibrated",
    preview: pieceSpritePath("queen"),
    read: "Coronet queen rendered as a true-isometric eight-direction production unit",
    status: "active production unit",
    directions: rookDirections,
    factionMode: "palette",
    defaultScale: 100,
    footprint: circleFootprint(QUEEN_TIARA_CANVAS_PX, QUEEN_TIARA_CONTACT_FOOTPRINT_PX),
    unitAnchorX: QUEEN_TIARA_CONTACT_ANCHOR_X,
    unitAnchorY: QUEEN_TIARA_CONTACT_ANCHOR_Y,
    sprite: paletteSprite("queen")
  },
  {
    id: "king-crown",
    family: "king",
    label: "King",
    badge: "8 directions \xB7 calibrated",
    preview: pieceSpritePath("king"),
    read: "Crowned king rendered as a true-isometric eight-direction production unit",
    status: "active production unit",
    directions: rookDirections,
    factionMode: "palette",
    defaultScale: 100,
    footprint: circleFootprint(KING_CROWN_CANVAS_PX, KING_CROWN_CONTACT_FOOTPRINT_PX),
    unitAnchorX: KING_CROWN_CONTACT_ANCHOR_X,
    unitAnchorY: KING_CROWN_CONTACT_ANCHOR_Y,
    sprite: paletteSprite("king")
  },
  {
    id: "pawn-codexsheet",
    family: "pawn",
    label: "Pawn",
    badge: "8 directions \xB7 pixel art",
    preview: pieceSpritePath("pawn"),
    read: "Helmeted pawn \u2014 Codex Sheet pixel-art production unit (true-isometric, 8 directions).",
    status: "active production unit",
    directions: rookDirections,
    factionMode: "palette",
    defaultScale: 100,
    footprint: circleFootprint(512, 150),
    unitAnchorX: "50%",
    unitAnchorY: "80.241%",
    sprite: paletteSprite("pawn")
  }
];
var PIXEL_LIBRARIES = [
  { key: "codexfilter", label: "Codex\u2192Filter", dirs: rookDirections },
  { key: "filter2", label: "Filter \xD72", dirs: rookDirections },
  { key: "filter3", label: "Filter \xD73", dirs: rookDirections }
];
var PIXEL_PIECE_FOOTPRINT = {
  rook: { footprint: squareFootprint(ROOK_KEEP_CANVAS_PX, ROOK_KEEP_CONTACT_FOOTPRINT_PX), anchorX: ROOK_KEEP_CONTACT_ANCHOR_X, anchorY: ROOK_KEEP_CONTACT_ANCHOR_Y },
  knight: { footprint: circleFootprint(KNIGHT_FUR_CANVAS_PX, KNIGHT_FUR_CONTACT_FOOTPRINT_PX), anchorX: KNIGHT_FUR_CONTACT_ANCHOR_X, anchorY: KNIGHT_FUR_CONTACT_ANCHOR_Y },
  bishop: { footprint: circleFootprint(BISHOP_MITRE_CANVAS_PX, BISHOP_MITRE_CONTACT_FOOTPRINT_PX), anchorX: BISHOP_MITRE_CONTACT_ANCHOR_X, anchorY: BISHOP_MITRE_CONTACT_ANCHOR_Y },
  queen: { footprint: circleFootprint(QUEEN_TIARA_CANVAS_PX, QUEEN_TIARA_CONTACT_FOOTPRINT_PX), anchorX: QUEEN_TIARA_CONTACT_ANCHOR_X, anchorY: QUEEN_TIARA_CONTACT_ANCHOR_Y },
  king: { footprint: circleFootprint(KING_CROWN_CANVAS_PX, KING_CROWN_CONTACT_FOOTPRINT_PX), anchorX: KING_CROWN_CONTACT_ANCHOR_X, anchorY: KING_CROWN_CONTACT_ANCHOR_Y },
  pawn: { footprint: circleFootprint(512, 150), anchorX: "50%", anchorY: "80.241%" }
};
var PIXEL_PIECES = ["pawn", "rook", "knight", "bishop", "queen", "king"];
var pixelLibrarySprite = (key, piece) => (_faction, direction) => `/assets/units-pixel/${key}/${piece}/navy-blue/${direction}.png`;
var pixelLibraryUnits = PIXEL_PIECES.flatMap(
  (piece) => PIXEL_LIBRARIES.map((lib) => {
    const fp = PIXEL_PIECE_FOOTPRINT[piece];
    return {
      id: `${piece}-${lib.key}`,
      family: piece,
      label: `${familyLabels[piece]} \xB7 ${lib.label}`,
      badge: lib.label,
      preview: `/assets/units-pixel/${lib.key}/${piece}/navy-blue/south.png`,
      read: `${familyLabels[piece]} \u2014 ${lib.label} pixel-art candidate (speculative; navy only).`,
      status: "speculative candidate",
      directions: lib.dirs,
      factionMode: "fixed",
      defaultScale: 100,
      footprint: fp.footprint,
      unitAnchorX: fp.anchorX,
      unitAnchorY: fp.anchorY,
      method: lib.label,
      speculative: true,
      sprite: pixelLibrarySprite(lib.key, piece)
    };
  })
);
var unitAssets = [
  ...productionUnits.map((unit) => ({ ...unit, method: unit.method ?? "Production" })),
  ...pixelLibraryUnits
];
var productionUnitAssets = unitAssets.filter((unit) => unit.factionMode === "palette" && !unit.speculative);
var UNIT_METHOD_OPTIONS = [
  { id: "Production", label: "Production", sub: "shipped" },
  ...PIXEL_LIBRARIES.map((lib) => ({ id: lib.label, label: lib.label, sub: "Speculative" }))
];
var activeUnitFamilies = [...new Set(unitAssets.map((unit) => unit.family))];

// src/ui/studioBoard.tsx
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var assetFrameSrc = (asset, animationFrame) => asset.animation ? asset.animation.frames[animationFrame % asset.animation.frames.length] ?? asset.src : asset.src;
var STUDIO_FAMILY_META = {
  grass: { purpose: "High-volume base terrain for most playable cells.", status: "Production", review: "Variation + same-footprint repetition." },
  dirt: { purpose: "Bare-earth ground.", status: "Production", review: "Variation across the patch." },
  stone: { purpose: "Stone / cobble footing.", status: "Production", review: "Variation + readability." },
  pebble: { purpose: "Loose pebble ground.", status: "Production", review: "Variation." },
  sand: { purpose: "Sandy ground.", status: "Production", review: "Variation." },
  water: { purpose: "Open water (impassable to land units).", status: "Production", review: "Variation + surface read." }
};
var studioFamilies = Object.keys(tileFamilies).map((id) => ({
  id,
  label: terrainLabels[id],
  ...STUDIO_FAMILY_META[id],
  assets: tileFamilies[id].map((asset) => ({ ...asset }))
}));

// src/core/levelBoard.ts
var FAMILY_TO_TERRAIN = {
  grass: "grass",
  stone: "stone",
  water: "water",
  dirt: "dirt",
  pebble: "pebble",
  sand: "sand"
};
var EDITOR_EXPRESSIBLE_TERRAIN = /* @__PURE__ */ new Set([...Object.values(FAMILY_TO_TERRAIN), "road", "void"]);
var SIDE_TO_FACTION = { player: "navy-blue", enemy: "crimson" };
function zonesFromLayers(zones, cols, rows) {
  const channel = {};
  for (const zone of zones ?? []) {
    for (const [x, y] of zone.tiles) {
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      channel[`${x},${y}`] = zone.type;
    }
  }
  return channel;
}
var defaultTileOfFamily = (family) => {
  const fam = studioFamilies.find((f) => f.id === family);
  const tile = fam?.assets.find((asset) => asset.kind === "tile") ?? fam?.assets[0];
  return tile?.id;
};
var TERRAIN_TO_FAMILY = Object.entries(FAMILY_TO_TERRAIN).reduce(
  (acc, [family, terrain]) => {
    acc[terrain] = family;
    return acc;
  },
  {}
);
var tileIdForTerrain = (terrain) => {
  if (terrain === "void") return void 0;
  const family = TERRAIN_TO_FAMILY[terrain] ?? "grass";
  return defaultTileOfFamily(family);
};
var unitIdForType = (type) => {
  const asset = unitAssets.find((u) => u.family === type && !u.speculative) ?? unitAssets.find((u) => u.family === type);
  return asset?.id;
};
var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function levelToEditorBoard(level) {
  if (level.boardCode) {
    const decoded = decodeBoard(level.boardCode);
    if (decoded) return decoded;
  }
  const cols = clamp(level.board.cols, BOARD_COLS.min, BOARD_COLS.max);
  const rows = clamp(level.board.rows, BOARD_ROWS.min, BOARD_ROWS.max);
  const cells = {};
  const cover = {};
  const features = {};
  const voidCells = /* @__PURE__ */ new Set();
  const fallbackTile = defaultTileOfFamily("grass");
  for (const cell of level.layers.terrain) {
    if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rows) continue;
    const key = `${cell.x},${cell.y}`;
    if (cell.terrain === "void") {
      voidCells.add(key);
      continue;
    }
    cells[key] = tileIdForTerrain(cell.terrain) ?? fallbackTile ?? "";
    if (cell.cover) cover[key] = cell.cover.density;
    if (cell.terrain === "road") features[key] = { kind: "road", material: "cobble" };
  }
  if (fallbackTile) for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
    const key = `${x},${y}`;
    if (!(key in cells) && !voidCells.has(key)) cells[key] = fallbackTile;
  }
  const units = {};
  for (const unit of level.layers.units) {
    if (unit.x < 0 || unit.x >= cols || unit.y < 0 || unit.y >= rows) continue;
    const unitId = unitIdForType(unit.type);
    if (!unitId) continue;
    units[`${unit.x},${unit.y}`] = {
      unitId,
      direction: unit.facing ?? "south",
      faction: SIDE_TO_FACTION[unit.side === "enemy" ? "enemy" : "player"]
    };
  }
  const props = {};
  for (const p of level.layers.props ?? []) {
    if (p.x < 0 || p.x >= cols || p.y < 0 || p.y >= rows) continue;
    props[`${p.x},${p.y}`] = { propId: p.propId };
  }
  const zones = zonesFromLayers(level.layers.zones, cols, rows);
  const hasAuthoredPlayer = level.layers.units.some((unit) => unit.side === "player");
  return {
    cols,
    rows,
    playerFaction: hasAuthoredPlayer ? SIDE_TO_FACTION.player : void 0,
    cells,
    units,
    doodads: {},
    props,
    cover,
    features,
    featureCuts: {},
    featureExits: {},
    zones
  };
}

// src/art/projectionContract.ts
var TRUE_ISOMETRIC_SCREEN_EDGE_DEGREES = 30;
var TILE_CANVAS_WIDTH = 96;
var TILE_CANVAS_HEIGHT = 140;
var TILE_FRAME_HEIGHT = 180;
var TILE_TOP_WIDTH = TILE_CANVAS_WIDTH;
var TILE_TOP_HEIGHT = TILE_TOP_WIDTH * Math.tan(TRUE_ISOMETRIC_SCREEN_EDGE_DEGREES * Math.PI / 180);
var TILE_STEP_X = TILE_TOP_WIDTH / 2;
var TILE_STEP_Y = TILE_TOP_HEIGHT / 2;
var LEGACY_TILE_TOP_HEIGHT = 54;
var LEGACY_TILE_SCREEN_EDGE_DEGREES = Math.atan(LEGACY_TILE_TOP_HEIGHT / 2 / (TILE_TOP_WIDTH / 2)) * (180 / Math.PI);

// src/art/tileTemplate.ts
var TILE_TEMPLATE = {
  topWidth: TILE_TOP_WIDTH,
  topHeight: TILE_TOP_HEIGHT,
  sideHeight: TILE_CANVAS_HEIGHT - TILE_TOP_HEIGHT,
  stepX: TILE_STEP_X,
  stepY: TILE_STEP_Y,
  originX: 438,
  originY: 62,
  selectionOffsetX: -TILE_STEP_X,
  selectionOffsetY: -TILE_STEP_Y
};

// src/render/boardProjection.ts
function boardLabCellPosition(cell) {
  return {
    left: (cell.x - cell.y) * TILE_TEMPLATE.stepX,
    top: (cell.x + cell.y) * TILE_TEMPLATE.stepY,
    zIndex: cell.x + cell.y
  };
}

// src/ui/doodadCatalog.ts
var sprite = (id, half) => `/assets/doodads/${id}/${half}.png`;
var DOODAD_ASSETS = [
  { id: "boulder", label: "Boulder", status: "render", terrains: ["stone"], back: sprite("boulder", "back"), front: sprite("boulder", "front") },
  { id: "stump", label: "Tree stump", status: "render", terrains: ["dirt"], back: sprite("stump", "back"), front: sprite("stump", "front") },
  { id: "fern", label: "Fern", status: "render", terrains: ["water"], back: sprite("fern", "back"), front: sprite("fern", "front") },
  { id: "flower", label: "Flower", status: "render", terrains: ["grass"], back: sprite("flower", "back"), front: sprite("flower", "front") }
];

// src/core/featureAutotile.ts
var FEATURE_DIRS = [
  { edge: "N", dx: 0, dy: -1, bit: 1 },
  { edge: "E", dx: 1, dy: 0, bit: 2 },
  { edge: "S", dx: 0, dy: 1, bit: 4 },
  { edge: "W", dx: -1, dy: 0, bit: 8 }
];
var featureKey = (x, y) => `${x},${y}`;
var roadEdgeKey = (ax, ay, bx, by) => {
  const a = featureKey(ax, ay);
  const b = featureKey(bx, by);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};
function featureMaskAt(present, x, y, isSevered, isExit) {
  let mask = 0;
  for (const dir of FEATURE_DIRS) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    const edgeKey = roadEdgeKey(x, y, nx, ny);
    if (present.has(featureKey(nx, ny))) {
      if (isSevered?.(edgeKey)) continue;
      mask |= dir.bit;
    } else if (isExit?.(edgeKey)) {
      mask |= dir.bit;
    }
  }
  return mask;
}

// src/core/props.ts
var PROP_DEFS = [
  {
    id: "oak",
    label: "Oak tree",
    kind: "tree",
    w: 2,
    h: 2,
    blocking: true,
    terrains: ["grass", "dirt"],
    sprite: { w: 192, h: 300, anchorX: 96, anchorY: 255 }
  },
  {
    id: "cottage",
    label: "Cottage",
    kind: "house",
    w: 2,
    h: 2,
    blocking: true,
    terrains: ["grass", "dirt", "stone"],
    sprite: { w: 177, h: 184, anchorX: 88, anchorY: 172 }
  },
  // Houses — the stylized keeper set. `cottage` above is the low-poly mesh render; these two are
  // gated Codex img2img RESTYLES of real Blender captures (photoreal meshes read "too realistic"
  // raw, so the cabin/green-roof shapes are kept but re-skinned to pixel-art). Method-verified via
  // imageGenVerdict (rollout image_generation_call), NOT code-drawn.
  { id: "cabin", label: "Log cabin", kind: "house", w: 2, h: 2, blocking: true, terrains: ["grass", "dirt", "stone"], sprite: { w: 220, h: 176, anchorX: 119, anchorY: 156 } },
  { id: "lodge", label: "Green-roof house", kind: "house", w: 2, h: 2, blocking: true, terrains: ["grass", "dirt", "stone"], sprite: { w: 210, h: 177, anchorX: 105, anchorY: 175 } }
];
function propDef(id) {
  return PROP_DEFS.find((def) => def.id === id);
}

// src/render/BoardStructure.tsx
var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
function propZBracket(ax, ay, w, h) {
  const base = ax + w - 1 + (ay + h - 1) + 2e4;
  return { base, back: base - 1, front: base + 1 };
}
function structureSeatPoint(anchor, w, h) {
  const base0 = boardLabCellPosition(anchor);
  return {
    left: base0.left + (w - 1 - (h - 1)) / 2 * TILE_TEMPLATE.stepX,
    top: base0.top + (w - 1 + (h - 1)) / 2 * TILE_TEMPLATE.stepY
  };
}
function propHalfSrc(propId, half) {
  return `/assets/props/${propId}/${half}.png`;
}

// src/render/bakeBoardThumbnail.ts
var TILE_FRAME_W = TILE_STEP_X * 2;
var TILE_FRAME_H = TILE_FRAME_HEIGHT;
var TILE_EQUATOR = 69;
var DOODAD_FRAME_W = TILE_FRAME_W;
var DOODAD_FRAME_H = TILE_FRAME_H;
var UNIT_SEAT_W = 72;
var UNIT_SEAT_H = 86;
var UNIT_SEAT_OFFSET_X = -0.5;
var UNIT_SEAT_OFFSET_Y = -0.78;
var studioTiles = studioFamilies.flatMap((family) => family.assets);
var resolveTile = (id) => studioTiles.find((asset) => asset.id === id);
var resolveUnit = (id) => unitAssets.find((unit) => unit.id === id);
var resolveDoodad = (id) => DOODAD_ASSETS.find((d) => d.id === id);
function boardDrawOps(board) {
  const ops = [];
  const presentByKind = { road: /* @__PURE__ */ new Set(), river: /* @__PURE__ */ new Set(), fence: /* @__PURE__ */ new Set() };
  for (const [key, f] of Object.entries(board.features)) presentByKind[f.kind].add(key);
  const isSevered = (edge) => board.featureCuts[edge] === true;
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const { left, top, zIndex } = boardLabCellPosition({ x, y });
      const frameX = left - TILE_STEP_X;
      const frameY = top - TILE_EQUATOR;
      const tile = board.cells[key] ? resolveTile(board.cells[key]) : void 0;
      if (tile) {
        ops.push({ src: assetFrameSrc(tile, 0), dx: frameX, dy: frameY, dw: TILE_FRAME_W, dh: TILE_FRAME_H, z: zIndex });
      }
      const feature = board.features[key];
      if (feature) {
        const mask = featureMaskAt(presentByKind[feature.kind], x, y, isSevered);
        ops.push({
          src: featureFrameSrc(feature.kind, feature.material, mask),
          dx: frameX,
          dy: frameY,
          dw: TILE_FRAME_W,
          dh: TILE_FRAME_H,
          // Feature rides OVER its own tile but stays within the cell band (DOM: same cell div).
          z: zIndex + 0.5
        });
      }
    }
  }
  for (const key of /* @__PURE__ */ new Set([...Object.keys(board.units), ...Object.keys(board.doodads)])) {
    const [x, y] = key.split(",").map(Number);
    const { left, top, zIndex } = boardLabCellPosition({ x, y });
    const base = zIndex + 2e4;
    const doodadPlacement = board.doodads[key];
    const doodad = doodadPlacement ? resolveDoodad(doodadPlacement.doodadId) : void 0;
    if (doodad) {
      const frameX = left - TILE_STEP_X;
      const frameY = top - TILE_EQUATOR;
      ops.push({ src: doodad.back, dx: frameX, dy: frameY, dw: DOODAD_FRAME_W, dh: DOODAD_FRAME_H, z: base - 1 });
      ops.push({ src: doodad.front, dx: frameX, dy: frameY, dw: DOODAD_FRAME_W, dh: DOODAD_FRAME_H, z: base + 1 });
    }
    const placement = board.units[key];
    const unit = placement ? resolveUnit(placement.unitId) : void 0;
    if (unit && placement) {
      const direction = placement.direction;
      const src = hasDirectionSprite(unit, direction) ? unit.sprite(placement.faction, direction) : MISSING_DIRECTION_SPRITE;
      const seatX = left + UNIT_SEAT_OFFSET_X * UNIT_SEAT_W;
      const seatY = top + UNIT_SEAT_OFFSET_Y * UNIT_SEAT_H;
      ops.push({ src, dx: seatX, dy: seatY, dw: UNIT_SEAT_W, dh: UNIT_SEAT_H, z: base, contain: true });
    }
  }
  for (const [key, placement] of Object.entries(board.props ?? {})) {
    const def = propDef(placement.propId);
    if (!def) continue;
    const [ax, ay] = key.split(",").map(Number);
    const { left, top } = structureSeatPoint({ x: ax, y: ay }, def.w, def.h);
    const dx = left - def.sprite.anchorX;
    const dy = top - def.sprite.anchorY;
    const { back, front } = propZBracket(ax, ay, def.w, def.h);
    ops.push({ src: propHalfSrc(placement.propId, "back"), dx, dy, dw: def.sprite.w, dh: def.sprite.h, z: back });
    ops.push({ src: propHalfSrc(placement.propId, "front"), dx, dy, dw: def.sprite.w, dh: def.sprite.h, z: front });
  }
  ops.sort((a, b) => a.z - b.z);
  return ops;
}
function boardContentHash(board) {
  const sortedEntries = (record) => Object.keys(record).sort().map((key) => `${key}=${JSON.stringify(record[key])}`).join(";");
  const parts = [
    `c${board.cols}`,
    `r${board.rows}`,
    `t:${sortedEntries(board.cells)}`,
    `u:${sortedEntries(board.units)}`,
    `d:${sortedEntries(board.doodads)}`,
    `p:${sortedEntries(board.props ?? {})}`,
    `v:${sortedEntries(board.cover)}`,
    `f:${sortedEntries(board.features)}`,
    `x:${Object.keys(board.featureCuts).sort().join(",")}`
  ];
  return fnv1a(parts.join("|"));
}
function fnv1a(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function boardBounds(board) {
  const ops = boardDrawOps(board);
  if (ops.length === 0) {
    return { minX: -TILE_STEP_X, minY: -TILE_EQUATOR, width: TILE_FRAME_W, height: TILE_FRAME_H };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    minX = Math.min(minX, op.dx);
    minY = Math.min(minY, op.dy);
    maxX = Math.max(maxX, op.dx + op.dw);
    maxY = Math.max(maxY, op.dy + op.dh);
  }
  return { minX, minY, width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) };
}

// src/render/serverBoardRender.ts
function levelRenderPlan(level) {
  const board = levelToEditorBoard(level);
  return {
    ops: boardDrawOps(board),
    bounds: boardBounds(board),
    contentHash: boardContentHash(board)
  };
}
function boardHashForLevel(level) {
  return boardContentHash(levelToEditorBoard(level));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  boardHashForLevel,
  levelRenderPlan
});
