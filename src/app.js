(function () {
/**
 * @license almond 0.3.1 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
  var main, req, makeMap, handlers,
    defined = {},
    waiting = {},
    config = {},
    defining = {},
    hasOwn = Object.prototype.hasOwnProperty,
    aps = [].slice,
    jsSuffixRegExp = /\.js$/;

  function hasProp(obj, prop) {
    return hasOwn.call(obj, prop);
  }

  /**
   * Given a relative module name, like ./something, normalize it to
   * a real name that can be mapped to a path.
   * @param {String} name the relative name
   * @param {String} baseName a real name that the name arg is relative
   * to.
   * @returns {String} normalized name
   */
  function normalize(name, baseName) {
    var nameParts, nameSegment, mapValue, foundMap, lastIndex,
      foundI, foundStarMap, starI, i, j, part,
      baseParts = baseName && baseName.split("/"),
      map = config.map,
      starMap = (map && map['*']) || {};

    //Adjust any relative paths.
    if (name && name.charAt(0) === ".") {
      //If have a base name, try to normalize against it,
      //otherwise, assume it is a top-level require that will
      //be relative to baseUrl in the end.
      if (baseName) {
        name = name.split('/');
        lastIndex = name.length - 1;

        // Node .js allowance:
        if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
          name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
        }

        //Lop off the last part of baseParts, so that . matches the
        //"directory" and not name of the baseName's module. For instance,
        //baseName of "one/two/three", maps to "one/two/three.js", but we
        //want the directory, "one/two" for this normalization.
        name = baseParts.slice(0, baseParts.length - 1).concat(name);

        //start trimDots
        for (i = 0; i < name.length; i += 1) {
          part = name[i];
          if (part === ".") {
            name.splice(i, 1);
            i -= 1;
          } else if (part === "..") {
            if (i === 1 && (name[2] === '..' || name[0] === '..')) {
              //End of the line. Keep at least one non-dot
              //path segment at the front so it can be mapped
              //correctly to disk. Otherwise, there is likely
              //no path mapping for a path starting with '..'.
              //This can still fail, but catches the most reasonable
              //uses of ..
              break;
            } else if (i > 0) {
              name.splice(i - 1, 2);
              i -= 2;
            }
          }
        }
        //end trimDots

        name = name.join("/");
      } else if (name.indexOf('./') === 0) {
        // No baseName, so this is ID is resolved relative
        // to baseUrl, pull off the leading dot.
        name = name.substring(2);
      }
    }

    //Apply map config if available.
    if ((baseParts || starMap) && map) {
      nameParts = name.split('/');

      for (i = nameParts.length; i > 0; i -= 1) {
        nameSegment = nameParts.slice(0, i).join("/");

        if (baseParts) {
          //Find the longest baseName segment match in the config.
          //So, do joins on the biggest to smallest lengths of baseParts.
          for (j = baseParts.length; j > 0; j -= 1) {
            mapValue = map[baseParts.slice(0, j).join('/')];

            //baseName segment has  config, find if it has one for
            //this name.
            if (mapValue) {
              mapValue = mapValue[nameSegment];
              if (mapValue) {
                //Match, update name to the new value.
                foundMap = mapValue;
                foundI = i;
                break;
              }
            }
          }
        }

        if (foundMap) {
          break;
        }

        //Check for a star map match, but just hold on to it,
        //if there is a shorter segment match later in a matching
        //config, then favor over this star map.
        if (!foundStarMap && starMap && starMap[nameSegment]) {
          foundStarMap = starMap[nameSegment];
          starI = i;
        }
      }

      if (!foundMap && foundStarMap) {
        foundMap = foundStarMap;
        foundI = starI;
      }

      if (foundMap) {
        nameParts.splice(0, foundI, foundMap);
        name = nameParts.join('/');
      }
    }

    return name;
  }

  function makeRequire(relName, forceSync) {
    return function () {
      //A version of a require function that passes a moduleName
      //value for items that may need to
      //look up paths relative to the moduleName
      var args = aps.call(arguments, 0);

      //If first arg is not require('string'), and there is only
      //one arg, it is the array form without a callback. Insert
      //a null so that the following concat is correct.
      if (typeof args[0] !== 'string' && args.length === 1) {
        args.push(null);
      }
      return req.apply(undef, args.concat([relName, forceSync]));
    };
  }

  function makeNormalize(relName) {
    return function (name) {
      return normalize(name, relName);
    };
  }

  function makeLoad(depName) {
    return function (value) {
      defined[depName] = value;
    };
  }

  function callDep(name) {
    if (hasProp(waiting, name)) {
      var args = waiting[name];
      delete waiting[name];
      defining[name] = true;
      main.apply(undef, args);
    }

    if (!hasProp(defined, name) && !hasProp(defining, name)) {
      throw new Error('No ' + name);
    }
    return defined[name];
  }

  //Turns a plugin!resource to [plugin, resource]
  //with the plugin being undefined if the name
  //did not have a plugin prefix.
  function splitPrefix(name) {
    var prefix,
      index = name ? name.indexOf('!') : -1;
    if (index > -1) {
      prefix = name.substring(0, index);
      name = name.substring(index + 1, name.length);
    }
    return [prefix, name];
  }

  /**
   * Makes a name map, normalizing the name, and using a plugin
   * for normalization if necessary. Grabs a ref to plugin
   * too, as an optimization.
   */
  makeMap = function (name, relName) {
    var plugin,
      parts = splitPrefix(name),
      prefix = parts[0];

    name = parts[1];

    if (prefix) {
      prefix = normalize(prefix, relName);
      plugin = callDep(prefix);
    }

    //Normalize according
    if (prefix) {
      if (plugin && plugin.normalize) {
        name = plugin.normalize(name, makeNormalize(relName));
      } else {
        name = normalize(name, relName);
      }
    } else {
      name = normalize(name, relName);
      parts = splitPrefix(name);
      prefix = parts[0];
      name = parts[1];
      if (prefix) {
        plugin = callDep(prefix);
      }
    }

    //Using ridiculous property names for space reasons
    return {
      f: prefix ? prefix + '!' + name : name, //fullName
      n: name,
      pr: prefix,
      p: plugin
    };
  };

  function makeConfig(name) {
    return function () {
      return (config && config.config && config.config[name]) || {};
    };
  }

  handlers = {
    require: function (name) {
      return makeRequire(name);
    },
    exports: function (name) {
      var e = defined[name];
      if (typeof e !== 'undefined') {
        return e;
      } else {
        return (defined[name] = {});
      }
    },
    module: function (name) {
      return {
        id: name,
        uri: '',
        exports: defined[name],
        config: makeConfig(name)
      };
    }
  };

  main = function (name, deps, callback, relName) {
    var cjsModule, depName, ret, map, i,
      args = [],
      callbackType = typeof callback,
      usingExports;

    //Use name if no relName
    relName = relName || name;

    //Call the callback to define the module, if necessary.
    if (callbackType === 'undefined' || callbackType === 'function') {
      //Pull out the defined dependencies and pass the ordered
      //values to the callback.
      //Default to [require, exports, module] if no deps
      deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
      for (i = 0; i < deps.length; i += 1) {
        map = makeMap(deps[i], relName);
        depName = map.f;

        //Fast path CommonJS standard dependencies.
        if (depName === "require") {
          args[i] = handlers.require(name);
        } else if (depName === "exports") {
          //CommonJS module spec 1.1
          args[i] = handlers.exports(name);
          usingExports = true;
        } else if (depName === "module") {
          //CommonJS module spec 1.1
          cjsModule = args[i] = handlers.module(name);
        } else if (hasProp(defined, depName) ||
          hasProp(waiting, depName) ||
          hasProp(defining, depName)) {
          args[i] = callDep(depName);
        } else if (map.p) {
          map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
          args[i] = defined[depName];
        } else {
          throw new Error(name + ' missing ' + depName);
        }
      }

      ret = callback ? callback.apply(defined[name], args) : undefined;

      if (name) {
        //If setting exports via "module" is in play,
        //favor that over return value and exports. After that,
        //favor a non-undefined return value over exports use.
        if (cjsModule && cjsModule.exports !== undef &&
          cjsModule.exports !== defined[name]) {
          defined[name] = cjsModule.exports;
        } else if (ret !== undef || !usingExports) {
          //Use the return value from the function.
          defined[name] = ret;
        }
      }
    } else if (name) {
      //May just be an object definition for the module. Only
      //worry about defining if have a module name.
      defined[name] = callback;
    }
  };

  requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
    if (typeof deps === "string") {
      if (handlers[deps]) {
        //callback in this case is really relName
        return handlers[deps](callback);
      }
      //Just return the module wanted. In this scenario, the
      //deps arg is the module name, and second arg (if passed)
      //is just the relName.
      //Normalize module name, if it contains . or ..
      return callDep(makeMap(deps, callback).f);
    } else if (!deps.splice) {
      //deps is a config object, not an array.
      config = deps;
      if (config.deps) {
        req(config.deps, config.callback);
      }
      if (!callback) {
        return;
      }

      if (callback.splice) {
        //callback is an array, which means it is a dependency list.
        //Adjust args if there are dependencies
        deps = callback;
        callback = relName;
        relName = null;
      } else {
        deps = undef;
      }
    }

    //Support require(['a'])
    callback = callback || function () {
      };

    //If relName is a function, it is an errback handler,
    //so remove it.
    if (typeof relName === 'function') {
      relName = forceSync;
      forceSync = alt;
    }

    //Simulate async callback;
    if (forceSync) {
      main(undef, deps, callback, relName);
    } else {
      //Using a non-zero value because of concern for what old browsers
      //do, and latest browsers "upgrade" to 4 if lower value is used:
      //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
      //If want a value immediately, use require('id') instead -- something
      //that works in almond on the global level, but not guaranteed and
      //unlikely to work in other AMD implementations.
      setTimeout(function () {
        main(undef, deps, callback, relName);
      }, 4);
    }

    return req;
  };

  /**
   * Just drops the config on the floor, but returns req in case
   * the config return value is used.
   */
  req.config = function (cfg) {
    return req(cfg);
  };

  /**
   * Expose module registry for debugging and tooling
   */
  requirejs._defined = defined;

  define = function (name, deps, callback) {
    if (typeof name !== 'string') {
      throw new Error('See almond README: incorrect module build, no module name');
    }

    //This module may not have dependencies
    if (!deps.splice) {
      //deps is not an array, so probably means
      //an object literal or factory function for
      //the value. Adjust args.
      callback = deps;
      deps = [];
    }

    if (!hasProp(defined, name) && !hasProp(waiting, name)) {
      waiting[name] = [name, deps, callback];
    }
  };

  define.amd = {
    jQuery: true
  };
}());

define("almond", function(){});

define('lib/zepto',['require','exports','module'],function (require, exports, module) {
  // MODULES="zepto event ajax form ie detect fx touch gesture selector" npm run-script dist
  /* Zepto 1.1.6 - zepto event ajax form ie detect fx touch gesture selector - zeptojs.com/license */

  var Zepto = (function() {
    var undefined, key, $, classList, emptyArray = [], slice = emptyArray.slice, filter = emptyArray.filter,
      document = window.document,
      elementDisplay = {}, classCache = {},
      cssNumber = { 'column-count': 1, 'columns': 1, 'font-weight': 1, 'line-height': 1,'opacity': 1, 'z-index': 1, 'zoom': 1 },
      fragmentRE = /^\s*<(\w+|!)[^>]*>/,
      singleTagRE = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,
      tagExpanderRE = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/ig,
      rootNodeRE = /^(?:body|html)$/i,
      capitalRE = /([A-Z])/g,

    // special attributes that should be get/set via method calls
      methodAttributes = ['val', 'css', 'html', 'text', 'data', 'width', 'height', 'offset'],

      adjacencyOperators = [ 'after', 'prepend', 'before', 'append' ],
      table = document.createElement('table'),
      tableRow = document.createElement('tr'),
      containers = {
        'tr': document.createElement('tbody'),
        'tbody': table, 'thead': table, 'tfoot': table,
        'td': tableRow, 'th': tableRow,
        '*': document.createElement('div')
      },
      readyRE = /complete|loaded|interactive/,
      simpleSelectorRE = /^[\w-]*$/,
      class2type = {},
      toString = class2type.toString,
      zepto = {},
      camelize, uniq,
      tempParent = document.createElement('div'),
      propMap = {
        'tabindex': 'tabIndex',
        'readonly': 'readOnly',
        'for': 'htmlFor',
        'class': 'className',
        'maxlength': 'maxLength',
        'cellspacing': 'cellSpacing',
        'cellpadding': 'cellPadding',
        'rowspan': 'rowSpan',
        'colspan': 'colSpan',
        'usemap': 'useMap',
        'frameborder': 'frameBorder',
        'contenteditable': 'contentEditable'
      },
      isArray = Array.isArray ||
        function(object){ return object instanceof Array }

    zepto.matches = function(element, selector) {
      if (!selector || !element || element.nodeType !== 1) return false
      var matchesSelector = element.webkitMatchesSelector || element.mozMatchesSelector ||
        element.oMatchesSelector || element.matchesSelector
      if (matchesSelector) return matchesSelector.call(element, selector)
      // fall back to performing a selector:
      var match, parent = element.parentNode, temp = !parent
      if (temp) (parent = tempParent).appendChild(element)
      match = ~zepto.qsa(parent, selector).indexOf(element)
      temp && tempParent.removeChild(element)
      return match
    }

    function type(obj) {
      return obj == null ? String(obj) :
      class2type[toString.call(obj)] || "object"
    }

    function isFunction(value) { return type(value) == "function" }
    function isWindow(obj)     { return obj != null && obj == obj.window }
    function isDocument(obj)   { return obj != null && obj.nodeType == obj.DOCUMENT_NODE }
    function isObject(obj)     { return type(obj) == "object" }
    function isPlainObject(obj) {
      return isObject(obj) && !isWindow(obj) && Object.getPrototypeOf(obj) == Object.prototype
    }
    function likeArray(obj) { return typeof obj.length == 'number' }

    function compact(array) { return filter.call(array, function(item){ return item != null }) }
    function flatten(array) { return array.length > 0 ? $.fn.concat.apply([], array) : array }
    camelize = function(str){ return str.replace(/-+(.)?/g, function(match, chr){ return chr ? chr.toUpperCase() : '' }) }
    function dasherize(str) {
      return str.replace(/::/g, '/')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .replace(/_/g, '-')
        .toLowerCase()
    }
    uniq = function(array){ return filter.call(array, function(item, idx){ return array.indexOf(item) == idx }) }

    function classRE(name) {
      return name in classCache ?
        classCache[name] : (classCache[name] = new RegExp('(^|\\s)' + name + '(\\s|$)'))
    }

    function maybeAddPx(name, value) {
      return (typeof value == "number" && !cssNumber[dasherize(name)]) ? value + "px" : value
    }

    function defaultDisplay(nodeName) {
      var element, display
      if (!elementDisplay[nodeName]) {
        element = document.createElement(nodeName)
        document.body.appendChild(element)
        display = getComputedStyle(element, '').getPropertyValue("display")
        element.parentNode.removeChild(element)
        display == "none" && (display = "block")
        elementDisplay[nodeName] = display
      }
      return elementDisplay[nodeName]
    }

    function children(element) {
      return 'children' in element ?
        slice.call(element.children) :
        $.map(element.childNodes, function(node){ if (node.nodeType == 1) return node })
    }

    // `$.zepto.fragment` takes a html string and an optional tag name
    // to generate DOM nodes nodes from the given html string.
    // The generated DOM nodes are returned as an array.
    // This function can be overriden in plugins for example to make
    // it compatible with browsers that don't support the DOM fully.
    zepto.fragment = function(html, name, properties) {
      var dom, nodes, container

      // A special case optimization for a single tag
      if (singleTagRE.test(html)) dom = $(document.createElement(RegExp.$1))

      if (!dom) {
        if (html.replace) html = html.replace(tagExpanderRE, "<$1></$2>")
        if (name === undefined) name = fragmentRE.test(html) && RegExp.$1
        if (!(name in containers)) name = '*'

        container = containers[name]
        container.innerHTML = '' + html
        dom = $.each(slice.call(container.childNodes), function(){
          container.removeChild(this)
        })
      }

      if (isPlainObject(properties)) {
        nodes = $(dom)
        $.each(properties, function(key, value) {
          if (methodAttributes.indexOf(key) > -1) nodes[key](value)
          else nodes.attr(key, value)
        })
      }

      return dom
    }

    // `$.zepto.Z` swaps out the prototype of the given `dom` array
    // of nodes with `$.fn` and thus supplying all the Zepto functions
    // to the array. Note that `__proto__` is not supported on Internet
    // Explorer. This method can be overriden in plugins.
    zepto.Z = function(dom, selector) {
      dom = dom || []
      dom.__proto__ = $.fn
      dom.selector = selector || ''
      return dom
    }

    // `$.zepto.isZ` should return `true` if the given object is a Zepto
    // collection. This method can be overriden in plugins.
    zepto.isZ = function(object) {
      return object instanceof zepto.Z
    }

    // `$.zepto.init` is Zepto's counterpart to jQuery's `$.fn.init` and
    // takes a CSS selector and an optional context (and handles various
    // special cases).
    // This method can be overriden in plugins.
    zepto.init = function(selector, context) {
      var dom
      // If nothing given, return an empty Zepto collection
      if (!selector) return zepto.Z()
      // Optimize for string selectors
      else if (typeof selector == 'string') {
        selector = selector.trim()
        // If it's a html fragment, create nodes from it
        // Note: In both Chrome 21 and Firefox 15, DOM error 12
        // is thrown if the fragment doesn't begin with <
        if (selector[0] == '<' && fragmentRE.test(selector))
          dom = zepto.fragment(selector, RegExp.$1, context), selector = null
        // If there's a context, create a collection on that context first, and select
        // nodes from there
        else if (context !== undefined) return $(context).find(selector)
        // If it's a CSS selector, use it to select nodes.
        else dom = zepto.qsa(document, selector)
      }
      // If a function is given, call it when the DOM is ready
      else if (isFunction(selector)) return $(document).ready(selector)
      // If a Zepto collection is given, just return it
      else if (zepto.isZ(selector)) return selector
      else {
        // normalize array if an array of nodes is given
        if (isArray(selector)) dom = compact(selector)
        // Wrap DOM nodes.
        else if (isObject(selector))
          dom = [selector], selector = null
        // If it's a html fragment, create nodes from it
        else if (fragmentRE.test(selector))
          dom = zepto.fragment(selector.trim(), RegExp.$1, context), selector = null
        // If there's a context, create a collection on that context first, and select
        // nodes from there
        else if (context !== undefined) return $(context).find(selector)
        // And last but no least, if it's a CSS selector, use it to select nodes.
        else dom = zepto.qsa(document, selector)
      }
      // create a new Zepto collection from the nodes found
      return zepto.Z(dom, selector)
    }

    // `$` will be the base `Zepto` object. When calling this
    // function just call `$.zepto.init, which makes the implementation
    // details of selecting nodes and creating Zepto collections
    // patchable in plugins.
    $ = function(selector, context){
      return zepto.init(selector, context)
    }

    function extend(target, source, deep) {
      for (key in source)
        if (deep && (isPlainObject(source[key]) || isArray(source[key]))) {
          if (isPlainObject(source[key]) && !isPlainObject(target[key]))
            target[key] = {}
          if (isArray(source[key]) && !isArray(target[key]))
            target[key] = []
          extend(target[key], source[key], deep)
        }
        else if (source[key] !== undefined) target[key] = source[key]
    }

    // Copy all but undefined properties from one or more
    // objects to the `target` object.
    $.extend = function(target){
      var deep, args = slice.call(arguments, 1)
      if (typeof target == 'boolean') {
        deep = target
        target = args.shift()
      }
      args.forEach(function(arg){ extend(target, arg, deep) })
      return target
    }

    // `$.zepto.qsa` is Zepto's CSS selector implementation which
    // uses `document.querySelectorAll` and optimizes for some special cases, like `#id`.
    // This method can be overriden in plugins.
    zepto.qsa = function(element, selector){
      var found,
        maybeID = selector[0] == '#',
        maybeClass = !maybeID && selector[0] == '.',
        nameOnly = maybeID || maybeClass ? selector.slice(1) : selector, // Ensure that a 1 char tag name still gets checked
        isSimple = simpleSelectorRE.test(nameOnly)
      return (isDocument(element) && isSimple && maybeID) ?
        ( (found = element.getElementById(nameOnly)) ? [found] : [] ) :
        (element.nodeType !== 1 && element.nodeType !== 9) ? [] :
          slice.call(
            isSimple && !maybeID ?
              maybeClass ? element.getElementsByClassName(nameOnly) : // If it's simple, it could be a class
                element.getElementsByTagName(selector) : // Or a tag
              element.querySelectorAll(selector) // Or it's not simple, and we need to query all
          )
    }

    function filtered(nodes, selector) {
      return selector == null ? $(nodes) : $(nodes).filter(selector)
    }

    $.contains = document.documentElement.contains ?
      function(parent, node) {
        return parent !== node && parent.contains(node)
      } :
      function(parent, node) {
        while (node && (node = node.parentNode))
          if (node === parent) return true
        return false
      }

    function funcArg(context, arg, idx, payload) {
      return isFunction(arg) ? arg.call(context, idx, payload) : arg
    }

    function setAttribute(node, name, value) {
      value == null ? node.removeAttribute(name) : node.setAttribute(name, value)
    }

    // access className property while respecting SVGAnimatedString
    function className(node, value){
      var klass = node.className || '',
        svg   = klass && klass.baseVal !== undefined

      if (value === undefined) return svg ? klass.baseVal : klass
      svg ? (klass.baseVal = value) : (node.className = value)
    }

    // "true"  => true
    // "false" => false
    // "null"  => null
    // "42"    => 42
    // "42.5"  => 42.5
    // "08"    => "08"
    // JSON    => parse if valid
    // String  => self
    function deserializeValue(value) {
      try {
        return value ?
        value == "true" ||
        ( value == "false" ? false :
          value == "null" ? null :
            +value + "" == value ? +value :
              /^[\[\{]/.test(value) ? $.parseJSON(value) :
                value )
          : value
      } catch(e) {
        return value
      }
    }

    $.type = type
    $.isFunction = isFunction
    $.isWindow = isWindow
    $.isArray = isArray
    $.isPlainObject = isPlainObject

    $.isEmptyObject = function(obj) {
      var name
      for (name in obj) return false
      return true
    }

    $.inArray = function(elem, array, i){
      return emptyArray.indexOf.call(array, elem, i)
    }

    $.camelCase = camelize
    $.trim = function(str) {
      return str == null ? "" : String.prototype.trim.call(str)
    }

    // plugin compatibility
    $.uuid = 0
    $.support = { }
    $.expr = { }

    $.map = function(elements, callback){
      var value, values = [], i, key
      if (likeArray(elements))
        for (i = 0; i < elements.length; i++) {
          value = callback(elements[i], i)
          if (value != null) values.push(value)
        }
      else
        for (key in elements) {
          value = callback(elements[key], key)
          if (value != null) values.push(value)
        }
      return flatten(values)
    }

    $.each = function(elements, callback){
      var i, key
      if (likeArray(elements)) {
        for (i = 0; i < elements.length; i++)
          if (callback.call(elements[i], i, elements[i]) === false) return elements
      } else {
        for (key in elements)
          if (callback.call(elements[key], key, elements[key]) === false) return elements
      }

      return elements
    }

    $.grep = function(elements, callback){
      return filter.call(elements, callback)
    }

    if (window.JSON) $.parseJSON = JSON.parse

    // Populate the class2type map
    $.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
      class2type[ "[object " + name + "]" ] = name.toLowerCase()
    })

    // Define methods that will be available on all
    // Zepto collections
    $.fn = {
      // Because a collection acts like an array
      // copy over these useful array functions.
      forEach: emptyArray.forEach,
      reduce: emptyArray.reduce,
      push: emptyArray.push,
      sort: emptyArray.sort,
      indexOf: emptyArray.indexOf,
      concat: emptyArray.concat,

      // `map` and `slice` in the jQuery API work differently
      // from their array counterparts
      map: function(fn){
        return $($.map(this, function(el, i){ return fn.call(el, i, el) }))
      },
      slice: function(){
        return $(slice.apply(this, arguments))
      },

      ready: function(callback){
        // need to check if document.body exists for IE as that browser reports
        // document ready when it hasn't yet created the body element
        if (readyRE.test(document.readyState) && document.body) callback($)
        else document.addEventListener('DOMContentLoaded', function(){ callback($) }, false)
        return this
      },
      get: function(idx){
        return idx === undefined ? slice.call(this) : this[idx >= 0 ? idx : idx + this.length]
      },
      toArray: function(){ return this.get() },
      size: function(){
        return this.length
      },
      remove: function(){
        return this.each(function(){
          if (this.parentNode != null)
            this.parentNode.removeChild(this)
        })
      },
      each: function(callback){
        emptyArray.every.call(this, function(el, idx){
          return callback.call(el, idx, el) !== false
        })
        return this
      },
      filter: function(selector){
        if (isFunction(selector)) return this.not(this.not(selector))
        return $(filter.call(this, function(element){
          return zepto.matches(element, selector)
        }))
      },
      add: function(selector,context){
        return $(uniq(this.concat($(selector,context))))
      },
      is: function(selector){
        return this.length > 0 && zepto.matches(this[0], selector)
      },
      not: function(selector){
        var nodes=[]
        if (isFunction(selector) && selector.call !== undefined)
          this.each(function(idx){
            if (!selector.call(this,idx)) nodes.push(this)
          })
        else {
          var excludes = typeof selector == 'string' ? this.filter(selector) :
            (likeArray(selector) && isFunction(selector.item)) ? slice.call(selector) : $(selector)
          this.forEach(function(el){
            if (excludes.indexOf(el) < 0) nodes.push(el)
          })
        }
        return $(nodes)
      },
      has: function(selector){
        return this.filter(function(){
          return isObject(selector) ?
            $.contains(this, selector) :
            $(this).find(selector).size()
        })
      },
      eq: function(idx){
        return idx === -1 ? this.slice(idx) : this.slice(idx, + idx + 1)
      },
      first: function(){
        var el = this[0]
        return el && !isObject(el) ? el : $(el)
      },
      last: function(){
        var el = this[this.length - 1]
        return el && !isObject(el) ? el : $(el)
      },
      find: function(selector){
        var result, $this = this
        if (!selector) result = $()
        else if (typeof selector == 'object')
          result = $(selector).filter(function(){
            var node = this
            return emptyArray.some.call($this, function(parent){
              return $.contains(parent, node)
            })
          })
        else if (this.length == 1) result = $(zepto.qsa(this[0], selector))
        else result = this.map(function(){ return zepto.qsa(this, selector) })
        return result
      },
      closest: function(selector, context){
        var node = this[0], collection = false
        if (typeof selector == 'object') collection = $(selector)
        while (node && !(collection ? collection.indexOf(node) >= 0 : zepto.matches(node, selector)))
          node = node !== context && !isDocument(node) && node.parentNode
        return $(node)
      },
      parents: function(selector){
        var ancestors = [], nodes = this
        while (nodes.length > 0)
          nodes = $.map(nodes, function(node){
            if ((node = node.parentNode) && !isDocument(node) && ancestors.indexOf(node) < 0) {
              ancestors.push(node)
              return node
            }
          })
        return filtered(ancestors, selector)
      },
      parent: function(selector){
        return filtered(uniq(this.pluck('parentNode')), selector)
      },
      children: function(selector){
        return filtered(this.map(function(){ return children(this) }), selector)
      },
      contents: function() {
        return this.map(function() { return slice.call(this.childNodes) })
      },
      siblings: function(selector){
        return filtered(this.map(function(i, el){
          return filter.call(children(el.parentNode), function(child){ return child!==el })
        }), selector)
      },
      empty: function(){
        return this.each(function(){ this.innerHTML = '' })
      },
      // `pluck` is borrowed from Prototype.js
      pluck: function(property){
        return $.map(this, function(el){ return el[property] })
      },
      show: function(){
        return this.each(function(){
          this.style.display == "none" && (this.style.display = '')
          if (getComputedStyle(this, '').getPropertyValue("display") == "none")
            this.style.display = defaultDisplay(this.nodeName)
        })
      },
      replaceWith: function(newContent){
        return this.before(newContent).remove()
      },
      wrap: function(structure){
        var func = isFunction(structure)
        if (this[0] && !func)
          var dom   = $(structure).get(0),
            clone = dom.parentNode || this.length > 1

        return this.each(function(index){
          $(this).wrapAll(
            func ? structure.call(this, index) :
              clone ? dom.cloneNode(true) : dom
          )
        })
      },
      wrapAll: function(structure){
        if (this[0]) {
          $(this[0]).before(structure = $(structure))
          var children
          // drill down to the inmost element
          while ((children = structure.children()).length) structure = children.first()
          $(structure).append(this)
        }
        return this
      },
      wrapInner: function(structure){
        var func = isFunction(structure)
        return this.each(function(index){
          var self = $(this), contents = self.contents(),
            dom  = func ? structure.call(this, index) : structure
          contents.length ? contents.wrapAll(dom) : self.append(dom)
        })
      },
      unwrap: function(){
        this.parent().each(function(){
          $(this).replaceWith($(this).children())
        })
        return this
      },
      clone: function(){
        return this.map(function(){ return this.cloneNode(true) })
      },
      hide: function(){
        return this.css("display", "none")
      },
      toggle: function(setting){
        return this.each(function(){
          var el = $(this)
            ;(setting === undefined ? el.css("display") == "none" : setting) ? el.show() : el.hide()
        })
      },
      prev: function(selector){ return $(this.pluck('previousElementSibling')).filter(selector || '*') },
      next: function(selector){ return $(this.pluck('nextElementSibling')).filter(selector || '*') },
      html: function(html){
        return 0 in arguments ?
          this.each(function(idx){
            var originHtml = this.innerHTML
            $(this).empty().append( funcArg(this, html, idx, originHtml) )
          }) :
          (0 in this ? this[0].innerHTML : null)
      },
      text: function(text){
        return 0 in arguments ?
          this.each(function(idx){
            var newText = funcArg(this, text, idx, this.textContent)
            this.textContent = newText == null ? '' : ''+newText
          }) :
          (0 in this ? this[0].textContent : null)
      },
      attr: function(name, value){
        var result
        return (typeof name == 'string' && !(1 in arguments)) ?
          (!this.length || this[0].nodeType !== 1 ? undefined :
              (!(result = this[0].getAttribute(name)) && name in this[0]) ? this[0][name] : result
          ) :
          this.each(function(idx){
            if (this.nodeType !== 1) return
            if (isObject(name)) for (key in name) setAttribute(this, key, name[key])
            else setAttribute(this, name, funcArg(this, value, idx, this.getAttribute(name)))
          })
      },
      removeAttr: function(name){
        return this.each(function(){ this.nodeType === 1 && name.split(' ').forEach(function(attribute){
          setAttribute(this, attribute)
        }, this)})
      },
      prop: function(name, value){
        name = propMap[name] || name
        return (1 in arguments) ?
          this.each(function(idx){
            this[name] = funcArg(this, value, idx, this[name])
          }) :
          (this[0] && this[0][name])
      },
      data: function(name, value){
        var attrName = 'data-' + name.replace(capitalRE, '-$1').toLowerCase()

        var data = (1 in arguments) ?
          this.attr(attrName, value) :
          this.attr(attrName)

        return data !== null ? deserializeValue(data) : undefined
      },
      val: function(value){
        return 0 in arguments ?
          this.each(function(idx){
            this.value = funcArg(this, value, idx, this.value)
          }) :
          (this[0] && (this[0].multiple ?
              $(this[0]).find('option').filter(function(){ return this.selected }).pluck('value') :
              this[0].value)
          )
      },
      offset: function(coordinates){
        if (coordinates) return this.each(function(index){
          var $this = $(this),
            coords = funcArg(this, coordinates, index, $this.offset()),
            parentOffset = $this.offsetParent().offset(),
            props = {
              top:  coords.top  - parentOffset.top,
              left: coords.left - parentOffset.left
            }

          if ($this.css('position') == 'static') props['position'] = 'relative'
          $this.css(props)
        })
        if (!this.length) return null
        var obj = this[0].getBoundingClientRect()
        return {
          left: obj.left + window.pageXOffset,
          top: obj.top + window.pageYOffset,
          width: Math.round(obj.width),
          height: Math.round(obj.height)
        }
      },
      css: function(property, value){
        if (arguments.length < 2) {
          var computedStyle, element = this[0]
          if(!element) return
          computedStyle = getComputedStyle(element, '')
          if (typeof property == 'string')
            return element.style[camelize(property)] || computedStyle.getPropertyValue(property)
          else if (isArray(property)) {
            var props = {}
            $.each(property, function(_, prop){
              props[prop] = (element.style[camelize(prop)] || computedStyle.getPropertyValue(prop))
            })
            return props
          }
        }

        var css = ''
        if (type(property) == 'string') {
          if (!value && value !== 0)
            this.each(function(){ this.style.removeProperty(dasherize(property)) })
          else
            css = dasherize(property) + ":" + maybeAddPx(property, value)
        } else {
          for (key in property)
            if (!property[key] && property[key] !== 0)
              this.each(function(){ this.style.removeProperty(dasherize(key)) })
            else
              css += dasherize(key) + ':' + maybeAddPx(key, property[key]) + ';'
        }

        return this.each(function(){ this.style.cssText += ';' + css })
      },
      index: function(element){
        return element ? this.indexOf($(element)[0]) : this.parent().children().indexOf(this[0])
      },
      hasClass: function(name){
        if (!name) return false
        return emptyArray.some.call(this, function(el){
          return this.test(className(el))
        }, classRE(name))
      },
      addClass: function(name){
        if (!name) return this
        return this.each(function(idx){
          if (!('className' in this)) return
          classList = []
          var cls = className(this), newName = funcArg(this, name, idx, cls)
          newName.split(/\s+/g).forEach(function(klass){
            if (!$(this).hasClass(klass)) classList.push(klass)
          }, this)
          classList.length && className(this, cls + (cls ? " " : "") + classList.join(" "))
        })
      },
      removeClass: function(name){
        return this.each(function(idx){
          if (!('className' in this)) return
          if (name === undefined) return className(this, '')
          classList = className(this)
          funcArg(this, name, idx, classList).split(/\s+/g).forEach(function(klass){
            classList = classList.replace(classRE(klass), " ")
          })
          className(this, classList.trim())
        })
      },
      toggleClass: function(name, when){
        if (!name) return this
        return this.each(function(idx){
          var $this = $(this), names = funcArg(this, name, idx, className(this))
          names.split(/\s+/g).forEach(function(klass){
            (when === undefined ? !$this.hasClass(klass) : when) ?
              $this.addClass(klass) : $this.removeClass(klass)
          })
        })
      },
      scrollTop: function(value){
        if (!this.length) return
        var hasScrollTop = 'scrollTop' in this[0]
        if (value === undefined) return hasScrollTop ? this[0].scrollTop : this[0].pageYOffset
        return this.each(hasScrollTop ?
          function(){ this.scrollTop = value } :
          function(){ this.scrollTo(this.scrollX, value) })
      },
      scrollLeft: function(value){
        if (!this.length) return
        var hasScrollLeft = 'scrollLeft' in this[0]
        if (value === undefined) return hasScrollLeft ? this[0].scrollLeft : this[0].pageXOffset
        return this.each(hasScrollLeft ?
          function(){ this.scrollLeft = value } :
          function(){ this.scrollTo(value, this.scrollY) })
      },
      position: function() {
        if (!this.length) return

        var elem = this[0],
        // Get *real* offsetParent
          offsetParent = this.offsetParent(),
        // Get correct offsets
          offset       = this.offset(),
          parentOffset = rootNodeRE.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset()

        // Subtract element margins
        // note: when an element has margin: auto the offsetLeft and marginLeft
        // are the same in Safari causing offset.left to incorrectly be 0
        offset.top  -= parseFloat( $(elem).css('margin-top') ) || 0
        offset.left -= parseFloat( $(elem).css('margin-left') ) || 0

        // Add offsetParent borders
        parentOffset.top  += parseFloat( $(offsetParent[0]).css('border-top-width') ) || 0
        parentOffset.left += parseFloat( $(offsetParent[0]).css('border-left-width') ) || 0

        // Subtract the two offsets
        return {
          top:  offset.top  - parentOffset.top,
          left: offset.left - parentOffset.left
        }
      },
      offsetParent: function() {
        return this.map(function(){
          var parent = this.offsetParent || document.body
          while (parent && !rootNodeRE.test(parent.nodeName) && $(parent).css("position") == "static")
            parent = parent.offsetParent
          return parent
        })
      }
    }

    // for now
    $.fn.detach = $.fn.remove

      // Generate the `width` and `height` functions
    ;['width', 'height'].forEach(function(dimension){
      var dimensionProperty =
        dimension.replace(/./, function(m){ return m[0].toUpperCase() })

      $.fn[dimension] = function(value){
        var offset, el = this[0]
        if (value === undefined) return isWindow(el) ? el['inner' + dimensionProperty] :
          isDocument(el) ? el.documentElement['scroll' + dimensionProperty] :
          (offset = this.offset()) && offset[dimension]
        else return this.each(function(idx){
          el = $(this)
          el.css(dimension, funcArg(this, value, idx, el[dimension]()))
        })
      }
    })

    function traverseNode(node, fun) {
      fun(node)
      for (var i = 0, len = node.childNodes.length; i < len; i++)
        traverseNode(node.childNodes[i], fun)
    }

    // Generate the `after`, `prepend`, `before`, `append`,
    // `insertAfter`, `insertBefore`, `appendTo`, and `prependTo` methods.
    adjacencyOperators.forEach(function(operator, operatorIndex) {
      var inside = operatorIndex % 2 //=> prepend, append

      $.fn[operator] = function(){
        // arguments can be nodes, arrays of nodes, Zepto objects and HTML strings
        var argType, nodes = $.map(arguments, function(arg) {
            argType = type(arg)
            return argType == "object" || argType == "array" || arg == null ?
              arg : zepto.fragment(arg)
          }),
          parent, copyByClone = this.length > 1
        if (nodes.length < 1) return this

        return this.each(function(_, target){
          parent = inside ? target : target.parentNode

          // convert all methods to a "before" operation
          target = operatorIndex == 0 ? target.nextSibling :
            operatorIndex == 1 ? target.firstChild :
              operatorIndex == 2 ? target :
                null

          var parentInDocument = $.contains(document.documentElement, parent)

          nodes.forEach(function(node){
            if (copyByClone) node = node.cloneNode(true)
            else if (!parent) return $(node).remove()

            parent.insertBefore(node, target)
            if (parentInDocument) traverseNode(node, function(el){
              if (el.nodeName != null && el.nodeName.toUpperCase() === 'SCRIPT' &&
                (!el.type || el.type === 'text/javascript') && !el.src)
                window['eval'].call(window, el.innerHTML)
            })
          })
        })
      }

      // after    => insertAfter
      // prepend  => prependTo
      // before   => insertBefore
      // append   => appendTo
      $.fn[inside ? operator+'To' : 'insert'+(operatorIndex ? 'Before' : 'After')] = function(html){
        $(html)[operator](this)
        return this
      }
    })

    zepto.Z.prototype = $.fn

    // Export internal API functions in the `$.zepto` namespace
    zepto.uniq = uniq
    zepto.deserializeValue = deserializeValue
    $.zepto = zepto

    return $
  })()

  window.Zepto = Zepto
  window.$ === undefined && (window.$ = Zepto)

  ;(function($){
    var _zid = 1, undefined,
      slice = Array.prototype.slice,
      isFunction = $.isFunction,
      isString = function(obj){ return typeof obj == 'string' },
      handlers = {},
      specialEvents={},
      focusinSupported = 'onfocusin' in window,
      focus = { focus: 'focusin', blur: 'focusout' },
      hover = { mouseenter: 'mouseover', mouseleave: 'mouseout' }

    specialEvents.click = specialEvents.mousedown = specialEvents.mouseup = specialEvents.mousemove = 'MouseEvents'

    function zid(element) {
      return element._zid || (element._zid = _zid++)
    }
    function findHandlers(element, event, fn, selector) {
      event = parse(event)
      if (event.ns) var matcher = matcherFor(event.ns)
      return (handlers[zid(element)] || []).filter(function(handler) {
        return handler
          && (!event.e  || handler.e == event.e)
          && (!event.ns || matcher.test(handler.ns))
          && (!fn       || zid(handler.fn) === zid(fn))
          && (!selector || handler.sel == selector)
      })
    }
    function parse(event) {
      var parts = ('' + event).split('.')
      return {e: parts[0], ns: parts.slice(1).sort().join(' ')}
    }
    function matcherFor(ns) {
      return new RegExp('(?:^| )' + ns.replace(' ', ' .* ?') + '(?: |$)')
    }

    function eventCapture(handler, captureSetting) {
      return handler.del &&
        (!focusinSupported && (handler.e in focus)) ||
        !!captureSetting
    }

    function realEvent(type) {
      return hover[type] || (focusinSupported && focus[type]) || type
    }

    function add(element, events, fn, data, selector, delegator, capture){
      var id = zid(element), set = (handlers[id] || (handlers[id] = []))
      events.split(/\s/).forEach(function(event){
        if (event == 'ready') return $(document).ready(fn)
        var handler   = parse(event)
        handler.fn    = fn
        handler.sel   = selector
        // emulate mouseenter, mouseleave
        if (handler.e in hover) fn = function(e){
          var related = e.relatedTarget
          if (!related || (related !== this && !$.contains(this, related)))
            return handler.fn.apply(this, arguments)
        }
        handler.del   = delegator
        var callback  = delegator || fn
        handler.proxy = function(e){
          e = compatible(e)
          if (e.isImmediatePropagationStopped()) return
          e.data = data
          var result = callback.apply(element, e._args == undefined ? [e] : [e].concat(e._args))
          if (result === false) e.preventDefault(), e.stopPropagation()
          return result
        }
        handler.i = set.length
        set.push(handler)
        if ('addEventListener' in element)
          element.addEventListener(realEvent(handler.e), handler.proxy, eventCapture(handler, capture))
      })
    }
    function remove(element, events, fn, selector, capture){
      var id = zid(element)
        ;(events || '').split(/\s/).forEach(function(event){
        findHandlers(element, event, fn, selector).forEach(function(handler){
          delete handlers[id][handler.i]
          if ('removeEventListener' in element)
            element.removeEventListener(realEvent(handler.e), handler.proxy, eventCapture(handler, capture))
        })
      })
    }

    $.event = { add: add, remove: remove }

    $.proxy = function(fn, context) {
      var args = (2 in arguments) && slice.call(arguments, 2)
      if (isFunction(fn)) {
        var proxyFn = function(){ return fn.apply(context, args ? args.concat(slice.call(arguments)) : arguments) }
        proxyFn._zid = zid(fn)
        return proxyFn
      } else if (isString(context)) {
        if (args) {
          args.unshift(fn[context], fn)
          return $.proxy.apply(null, args)
        } else {
          return $.proxy(fn[context], fn)
        }
      } else {
        throw new TypeError("expected function")
      }
    }

    $.fn.bind = function(event, data, callback){
      return this.on(event, data, callback)
    }
    $.fn.unbind = function(event, callback){
      return this.off(event, callback)
    }
    $.fn.one = function(event, selector, data, callback){
      return this.on(event, selector, data, callback, 1)
    }

    var returnTrue = function(){return true},
      returnFalse = function(){return false},
      ignoreProperties = /^([A-Z]|returnValue$|layer[XY]$)/,
      eventMethods = {
        preventDefault: 'isDefaultPrevented',
        stopImmediatePropagation: 'isImmediatePropagationStopped',
        stopPropagation: 'isPropagationStopped'
      }

    function compatible(event, source) {
      if (source || !event.isDefaultPrevented) {
        source || (source = event)

        $.each(eventMethods, function(name, predicate) {
          var sourceMethod = source[name]
          event[name] = function(){
            this[predicate] = returnTrue
            return sourceMethod && sourceMethod.apply(source, arguments)
          }
          event[predicate] = returnFalse
        })

        if (source.defaultPrevented !== undefined ? source.defaultPrevented :
            'returnValue' in source ? source.returnValue === false :
            source.getPreventDefault && source.getPreventDefault())
          event.isDefaultPrevented = returnTrue
      }
      return event
    }

    function createProxy(event) {
      var key, proxy = { originalEvent: event }
      for (key in event)
        if (!ignoreProperties.test(key) && event[key] !== undefined) proxy[key] = event[key]

      return compatible(proxy, event)
    }

    $.fn.delegate = function(selector, event, callback){
      return this.on(event, selector, callback)
    }
    $.fn.undelegate = function(selector, event, callback){
      return this.off(event, selector, callback)
    }

    $.fn.live = function(event, callback){
      $(document.body).delegate(this.selector, event, callback)
      return this
    }
    $.fn.die = function(event, callback){
      $(document.body).undelegate(this.selector, event, callback)
      return this
    }

    $.fn.on = function(event, selector, data, callback, one){
      var autoRemove, delegator, $this = this
      if (event && !isString(event)) {
        $.each(event, function(type, fn){
          $this.on(type, selector, data, fn, one)
        })
        return $this
      }

      if (!isString(selector) && !isFunction(callback) && callback !== false)
        callback = data, data = selector, selector = undefined
      if (isFunction(data) || data === false)
        callback = data, data = undefined

      if (callback === false) callback = returnFalse

      return $this.each(function(_, element){
        if (one) autoRemove = function(e){
          remove(element, e.type, callback)
          return callback.apply(this, arguments)
        }

        if (selector) delegator = function(e){
          var evt, match = $(e.target).closest(selector, element).get(0)
          if (match && match !== element) {
            evt = $.extend(createProxy(e), {currentTarget: match, liveFired: element})
            return (autoRemove || callback).apply(match, [evt].concat(slice.call(arguments, 1)))
          }
        }

        add(element, event, callback, data, selector, delegator || autoRemove)
      })
    }
    $.fn.off = function(event, selector, callback){
      var $this = this
      if (event && !isString(event)) {
        $.each(event, function(type, fn){
          $this.off(type, selector, fn)
        })
        return $this
      }

      if (!isString(selector) && !isFunction(callback) && callback !== false)
        callback = selector, selector = undefined

      if (callback === false) callback = returnFalse

      return $this.each(function(){
        remove(this, event, callback, selector)
      })
    }

    $.fn.trigger = function(event, args){
      event = (isString(event) || $.isPlainObject(event)) ? $.Event(event) : compatible(event)
      event._args = args
      return this.each(function(){
        // handle focus(), blur() by calling them directly
        if (event.type in focus && typeof this[event.type] == "function") this[event.type]()
        // items in the collection might not be DOM elements
        else if ('dispatchEvent' in this) this.dispatchEvent(event)
        else $(this).triggerHandler(event, args)
      })
    }

    // triggers event handlers on current element just as if an event occurred,
    // doesn't trigger an actual event, doesn't bubble
    $.fn.triggerHandler = function(event, args){
      var e, result
      this.each(function(i, element){
        e = createProxy(isString(event) ? $.Event(event) : event)
        e._args = args
        e.target = element
        $.each(findHandlers(element, event.type || event), function(i, handler){
          result = handler.proxy(e)
          if (e.isImmediatePropagationStopped()) return false
        })
      })
      return result
    }

      // shortcut methods for `.bind(event, fn)` for each event type
    ;('focusin focusout focus blur load resize scroll unload click dblclick '+
    'mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave '+
    'change select keydown keypress keyup error').split(' ').forEach(function(event) {
        $.fn[event] = function(callback) {
          return (0 in arguments) ?
            this.bind(event, callback) :
            this.trigger(event)
        }
      })

    $.Event = function(type, props) {
      if (!isString(type)) props = type, type = props.type
      var event = document.createEvent(specialEvents[type] || 'Events'), bubbles = true
      if (props) for (var name in props) (name == 'bubbles') ? (bubbles = !!props[name]) : (event[name] = props[name])
      event.initEvent(type, bubbles, true)
      return compatible(event)
    }

  })(Zepto)

  ;(function($){
    var jsonpID = 0,
      document = window.document,
      key,
      name,
      rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      scriptTypeRE = /^(?:text|application)\/javascript/i,
      xmlTypeRE = /^(?:text|application)\/xml/i,
      jsonType = 'application/json',
      htmlType = 'text/html',
      blankRE = /^\s*$/,
      originAnchor = document.createElement('a')

    originAnchor.href = window.location.href

    // trigger a custom event and return false if it was cancelled
    function triggerAndReturn(context, eventName, data) {
      var event = $.Event(eventName)
      $(context).trigger(event, data)
      return !event.isDefaultPrevented()
    }

    // trigger an Ajax "global" event
    function triggerGlobal(settings, context, eventName, data) {
      if (settings.global) return triggerAndReturn(context || document, eventName, data)
    }

    // Number of active Ajax requests
    $.active = 0

    function ajaxStart(settings) {
      if (settings.global && $.active++ === 0) triggerGlobal(settings, null, 'ajaxStart')
    }
    function ajaxStop(settings) {
      if (settings.global && !(--$.active)) triggerGlobal(settings, null, 'ajaxStop')
    }

    // triggers an extra global event "ajaxBeforeSend" that's like "ajaxSend" but cancelable
    function ajaxBeforeSend(xhr, settings) {
      var context = settings.context
      if (settings.beforeSend.call(context, xhr, settings) === false ||
        triggerGlobal(settings, context, 'ajaxBeforeSend', [xhr, settings]) === false)
        return false

      triggerGlobal(settings, context, 'ajaxSend', [xhr, settings])
    }
    function ajaxSuccess(data, xhr, settings, deferred) {
      var context = settings.context, status = 'success'
      settings.success.call(context, data, status, xhr)
      if (deferred) deferred.resolveWith(context, [data, status, xhr])
      triggerGlobal(settings, context, 'ajaxSuccess', [xhr, settings, data])
      ajaxComplete(status, xhr, settings)
    }
    // type: "timeout", "error", "abort", "parsererror"
    function ajaxError(error, type, xhr, settings, deferred) {
      var context = settings.context
      settings.error.call(context, xhr, type, error)
      if (deferred) deferred.rejectWith(context, [xhr, type, error])
      triggerGlobal(settings, context, 'ajaxError', [xhr, settings, error || type])
      ajaxComplete(type, xhr, settings)
    }
    // status: "success", "notmodified", "error", "timeout", "abort", "parsererror"
    function ajaxComplete(status, xhr, settings) {
      var context = settings.context
      settings.complete.call(context, xhr, status)
      triggerGlobal(settings, context, 'ajaxComplete', [xhr, settings])
      ajaxStop(settings)
    }

    // Empty function, used as default callback
    function empty() {}

    $.ajaxJSONP = function(options, deferred){
      if (!('type' in options)) return $.ajax(options)

      var _callbackName = options.jsonpCallback,
        callbackName = ($.isFunction(_callbackName) ?
            _callbackName() : _callbackName) || ('jsonp' + (++jsonpID)),
        script = document.createElement('script'),
        originalCallback = window[callbackName],
        responseData,
        abort = function(errorType) {
          $(script).triggerHandler('error', errorType || 'abort')
        },
        xhr = { abort: abort }, abortTimeout

      if (deferred) deferred.promise(xhr)

      $(script).on('load error', function(e, errorType){
        clearTimeout(abortTimeout)
        $(script).off().remove()

        if (e.type == 'error' || !responseData) {
          ajaxError(null, errorType || 'error', xhr, options, deferred)
        } else {
          ajaxSuccess(responseData[0], xhr, options, deferred)
        }

        window[callbackName] = originalCallback
        if (responseData && $.isFunction(originalCallback))
          originalCallback(responseData[0])

        originalCallback = responseData = undefined
      })

      if (ajaxBeforeSend(xhr, options) === false) {
        abort('abort')
        return xhr
      }

      window[callbackName] = function(){
        responseData = arguments
      }

      script.src = options.url.replace(/\?(.+)=\?/, '?$1=' + callbackName)
      document.head.appendChild(script)

      if (options.timeout > 0) abortTimeout = setTimeout(function(){
        abort('timeout')
      }, options.timeout)

      return xhr
    }

    $.ajaxSettings = {
      // Default type of request
      type: 'GET',
      // Callback that is executed before request
      beforeSend: empty,
      // Callback that is executed if the request succeeds
      success: empty,
      // Callback that is executed the the server drops error
      error: empty,
      // Callback that is executed on request complete (both: error and success)
      complete: empty,
      // The context for the callbacks
      context: null,
      // Whether to trigger "global" Ajax events
      global: true,
      // Transport
      xhr: function () {
        return new window.XMLHttpRequest()
      },
      // MIME types mapping
      // IIS returns Javascript as "application/x-javascript"
      accepts: {
        script: 'text/javascript, application/javascript, application/x-javascript',
        json:   jsonType,
        xml:    'application/xml, text/xml',
        html:   htmlType,
        text:   'text/plain'
      },
      // Whether the request is to another domain
      crossDomain: false,
      // Default timeout
      timeout: 0,
      // Whether data should be serialized to string
      processData: true,
      // Whether the browser should be allowed to cache GET responses
      cache: true
    }

    function mimeToDataType(mime) {
      if (mime) mime = mime.split(';', 2)[0]
      return mime && ( mime == htmlType ? 'html' :
          mime == jsonType ? 'json' :
            scriptTypeRE.test(mime) ? 'script' :
            xmlTypeRE.test(mime) && 'xml' ) || 'text'
    }

    function appendQuery(url, query) {
      if (query == '') return url
      return (url + '&' + query).replace(/[&?]{1,2}/, '?')
    }

    // serialize payload and append it to the URL for GET requests
    function serializeData(options) {
      if (options.processData && options.data && $.type(options.data) != "string")
        options.data = $.param(options.data, options.traditional)
      if (options.data && (!options.type || options.type.toUpperCase() == 'GET'))
        options.url = appendQuery(options.url, options.data), options.data = undefined
    }

    $.ajax = function(options){
      var settings = $.extend({}, options || {}),
        deferred = $.Deferred && $.Deferred(),
        urlAnchor
      for (key in $.ajaxSettings) if (settings[key] === undefined) settings[key] = $.ajaxSettings[key]

      ajaxStart(settings)

      if (!settings.crossDomain) {
        urlAnchor = document.createElement('a')
        urlAnchor.href = settings.url
        urlAnchor.href = urlAnchor.href
        settings.crossDomain = (originAnchor.protocol + '//' + originAnchor.host) !== (urlAnchor.protocol + '//' + urlAnchor.host)
      }

      if (!settings.url) settings.url = window.location.toString()
      serializeData(settings)

      var dataType = settings.dataType, hasPlaceholder = /\?.+=\?/.test(settings.url)
      if (hasPlaceholder) dataType = 'jsonp'

      if (settings.cache === false || (
          (!options || options.cache !== true) &&
          ('script' == dataType || 'jsonp' == dataType)
        ))
        settings.url = appendQuery(settings.url, '_=' + Date.now())

      if ('jsonp' == dataType) {
        if (!hasPlaceholder)
          settings.url = appendQuery(settings.url,
            settings.jsonp ? (settings.jsonp + '=?') : settings.jsonp === false ? '' : 'callback=?')
        return $.ajaxJSONP(settings, deferred)
      }

      var mime = settings.accepts[dataType],
        headers = { },
        setHeader = function(name, value) { headers[name.toLowerCase()] = [name, value] },
        protocol = /^([\w-]+:)\/\//.test(settings.url) ? RegExp.$1 : window.location.protocol,
        xhr = settings.xhr(),
        nativeSetHeader = xhr.setRequestHeader,
        abortTimeout

      if (deferred) deferred.promise(xhr)

      if (!settings.crossDomain) setHeader('X-Requested-With', 'XMLHttpRequest')
      setHeader('Accept', mime || '*/*')
      if (mime = settings.mimeType || mime) {
        if (mime.indexOf(',') > -1) mime = mime.split(',', 2)[0]
        xhr.overrideMimeType && xhr.overrideMimeType(mime)
      }
      if (settings.contentType || (settings.contentType !== false && settings.data && settings.type.toUpperCase() != 'GET'))
        setHeader('Content-Type', settings.contentType || 'application/x-www-form-urlencoded')

      if (settings.headers) for (name in settings.headers) setHeader(name, settings.headers[name])
      xhr.setRequestHeader = setHeader

      xhr.onreadystatechange = function(){
        if (xhr.readyState == 4) {
          xhr.onreadystatechange = empty
          clearTimeout(abortTimeout)
          var result, error = false
          if ((xhr.status >= 200 && xhr.status < 300) || xhr.status == 304 || (xhr.status == 0 && protocol == 'file:')) {
            dataType = dataType || mimeToDataType(settings.mimeType || xhr.getResponseHeader('content-type'))
            result = xhr.responseText

            try {
              // http://perfectionkills.com/global-eval-what-are-the-options/
              if (dataType == 'script')    (1,eval)(result)
              else if (dataType == 'xml')  result = xhr.responseXML
              else if (dataType == 'json') result = blankRE.test(result) ? null : $.parseJSON(result)
            } catch (e) { error = e }

            if (error) ajaxError(error, 'parsererror', xhr, settings, deferred)
            else ajaxSuccess(result, xhr, settings, deferred)
          } else {
            ajaxError(xhr.statusText || null, xhr.status ? 'error' : 'abort', xhr, settings, deferred)
          }
        }
      }

      if (ajaxBeforeSend(xhr, settings) === false) {
        xhr.abort()
        ajaxError(null, 'abort', xhr, settings, deferred)
        return xhr
      }

      if (settings.xhrFields) for (name in settings.xhrFields) xhr[name] = settings.xhrFields[name]

      var async = 'async' in settings ? settings.async : true
      xhr.open(settings.type, settings.url, async, settings.username, settings.password)

      for (name in headers) nativeSetHeader.apply(xhr, headers[name])

      if (settings.timeout > 0) abortTimeout = setTimeout(function(){
        xhr.onreadystatechange = empty
        xhr.abort()
        ajaxError(null, 'timeout', xhr, settings, deferred)
      }, settings.timeout)

      // avoid sending empty string (#319)
      xhr.send(settings.data ? settings.data : null)
      return xhr
    }

    // handle optional data/success arguments
    function parseArguments(url, data, success, dataType) {
      if ($.isFunction(data)) dataType = success, success = data, data = undefined
      if (!$.isFunction(success)) dataType = success, success = undefined
      return {
        url: url
        , data: data
        , success: success
        , dataType: dataType
      }
    }

    $.get = function(/* url, data, success, dataType */){
      return $.ajax(parseArguments.apply(null, arguments))
    }

    $.post = function(/* url, data, success, dataType */){
      var options = parseArguments.apply(null, arguments)
      options.type = 'POST'
      return $.ajax(options)
    }

    $.getJSON = function(/* url, data, success */){
      var options = parseArguments.apply(null, arguments)
      options.dataType = 'json'
      return $.ajax(options)
    }

    $.fn.load = function(url, data, success){
      if (!this.length) return this
      var self = this, parts = url.split(/\s/), selector,
        options = parseArguments(url, data, success),
        callback = options.success
      if (parts.length > 1) options.url = parts[0], selector = parts[1]
      options.success = function(response){
        self.html(selector ?
          $('<div>').html(response.replace(rscript, "")).find(selector)
          : response)
        callback && callback.apply(self, arguments)
      }
      $.ajax(options)
      return this
    }

    var escape = encodeURIComponent

    function serialize(params, obj, traditional, scope){
      var type, array = $.isArray(obj), hash = $.isPlainObject(obj)
      $.each(obj, function(key, value) {
        type = $.type(value)
        if (scope) key = traditional ? scope :
        scope + '[' + (hash || type == 'object' || type == 'array' ? key : '') + ']'
        // handle data in serializeArray() format
        if (!scope && array) params.add(value.name, value.value)
        // recurse into nested objects
        else if (type == "array" || (!traditional && type == "object"))
          serialize(params, value, traditional, key)
        else params.add(key, value)
      })
    }

    $.param = function(obj, traditional){
      var params = []
      params.add = function(key, value) {
        if ($.isFunction(value)) value = value()
        if (value == null) value = ""
        this.push(escape(key) + '=' + escape(value))
      }
      serialize(params, obj, traditional)
      return params.join('&').replace(/%20/g, '+')
    }
  })(Zepto)

  ;(function($){
    $.fn.serializeArray = function() {
      var name, type, result = [],
        add = function(value) {
          if (value.forEach) return value.forEach(add)
          result.push({ name: name, value: value })
        }
      if (this[0]) $.each(this[0].elements, function(_, field){
        type = field.type, name = field.name
        if (name && field.nodeName.toLowerCase() != 'fieldset' &&
          !field.disabled && type != 'submit' && type != 'reset' && type != 'button' && type != 'file' &&
          ((type != 'radio' && type != 'checkbox') || field.checked))
          add($(field).val())
      })
      return result
    }

    $.fn.serialize = function(){
      var result = []
      this.serializeArray().forEach(function(elm){
        result.push(encodeURIComponent(elm.name) + '=' + encodeURIComponent(elm.value))
      })
      return result.join('&')
    }

    $.fn.submit = function(callback) {
      if (0 in arguments) this.bind('submit', callback)
      else if (this.length) {
        var event = $.Event('submit')
        this.eq(0).trigger(event)
        if (!event.isDefaultPrevented()) this.get(0).submit()
      }
      return this
    }

  })(Zepto)

  ;(function($){
    // __proto__ doesn't exist on IE<11, so redefine
    // the Z function to use object extension instead
    if (!('__proto__' in {})) {
      $.extend($.zepto, {
        Z: function(dom, selector){
          dom = dom || []
          $.extend(dom, $.fn)
          dom.selector = selector || ''
          dom.__Z = true
          return dom
        },
        // this is a kludge but works
        isZ: function(object){
          return $.type(object) === 'array' && '__Z' in object
        }
      })
    }

    // getComputedStyle shouldn't freak out when called
    // without a valid element as argument
    try {
      getComputedStyle(undefined)
    } catch(e) {
      var nativeGetComputedStyle = getComputedStyle;
      window.getComputedStyle = function(element){
        try {
          return nativeGetComputedStyle(element)
        } catch(e) {
          return null
        }
      }
    }
  })(Zepto)

  ;(function($){
    function detect(ua, platform){
      var os = this.os = {}, browser = this.browser = {},
        webkit = ua.match(/Web[kK]it[\/]{0,1}([\d.]+)/),
        android = ua.match(/(Android);?[\s\/]+([\d.]+)?/),
        osx = !!ua.match(/\(Macintosh\; Intel /),
        ipad = ua.match(/(iPad).*OS\s([\d_]+)/),
        ipod = ua.match(/(iPod)(.*OS\s([\d_]+))?/),
        iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/),
        webos = ua.match(/(webOS|hpwOS)[\s\/]([\d.]+)/),
        win = /Win\d{2}|Windows/.test(platform),
        wp = ua.match(/Windows Phone ([\d.]+)/),
        touchpad = webos && ua.match(/TouchPad/),
        kindle = ua.match(/Kindle\/([\d.]+)/),
        silk = ua.match(/Silk\/([\d._]+)/),
        blackberry = ua.match(/(BlackBerry).*Version\/([\d.]+)/),
        bb10 = ua.match(/(BB10).*Version\/([\d.]+)/),
        rimtabletos = ua.match(/(RIM\sTablet\sOS)\s([\d.]+)/),
        playbook = ua.match(/PlayBook/),
        chrome = ua.match(/Chrome\/([\d.]+)/) || ua.match(/CriOS\/([\d.]+)/),
        firefox = ua.match(/Firefox\/([\d.]+)/),
        ie = ua.match(/MSIE\s([\d.]+)/) || ua.match(/Trident\/[\d](?=[^\?]+).*rv:([0-9.].)/),
        webview = !chrome && ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/),
        safari = webview || ua.match(/Version\/([\d.]+)([^S](Safari)|[^M]*(Mobile)[^S]*(Safari))/)

      // Todo: clean this up with a better OS/browser seperation:
      // - discern (more) between multiple browsers on android
      // - decide if kindle fire in silk mode is android or not
      // - Firefox on Android doesn't specify the Android version
      // - possibly devide in os, device and browser hashes

      if (browser.webkit = !!webkit) browser.version = webkit[1]

      if (android) os.android = true, os.version = android[2]
      if (iphone && !ipod) os.ios = os.iphone = true, os.version = iphone[2].replace(/_/g, '.')
      if (ipad) os.ios = os.ipad = true, os.version = ipad[2].replace(/_/g, '.')
      if (ipod) os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].replace(/_/g, '.') : null
      if (wp) os.wp = true, os.version = wp[1]
      if (webos) os.webos = true, os.version = webos[2]
      if (touchpad) os.touchpad = true
      if (blackberry) os.blackberry = true, os.version = blackberry[2]
      if (bb10) os.bb10 = true, os.version = bb10[2]
      if (rimtabletos) os.rimtabletos = true, os.version = rimtabletos[2]
      if (playbook) browser.playbook = true
      if (kindle) os.kindle = true, os.version = kindle[1]
      if (silk) browser.silk = true, browser.version = silk[1]
      if (!silk && os.android && ua.match(/Kindle Fire/)) browser.silk = true
      if (chrome) browser.chrome = true, browser.version = chrome[1]
      if (firefox) browser.firefox = true, browser.version = firefox[1]
      if (ie) browser.ie = true, browser.version = ie[1]
      if (safari && (osx || os.ios || win)) {
        browser.safari = true
        if (!os.ios) browser.version = safari[1]
      }
      if (webview) browser.webview = true

      os.tablet = !!(ipad || playbook || (android && !ua.match(/Mobile/)) ||
      (firefox && ua.match(/Tablet/)) || (ie && !ua.match(/Phone/) && ua.match(/Touch/)))
      os.phone  = !!(!os.tablet && !os.ipod && (android || iphone || webos || blackberry || bb10 ||
      (chrome && ua.match(/Android/)) || (chrome && ua.match(/CriOS\/([\d.]+)/)) ||
      (firefox && ua.match(/Mobile/)) || (ie && ua.match(/Touch/))))
    }

    detect.call($, navigator.userAgent, navigator.platform)
    // make available to unit tests
    $.__detect = detect

  })(Zepto)

  ;(function($, undefined){
    var prefix = '', eventPrefix, endEventName, endAnimationName,
      vendors = { Webkit: 'webkit', Moz: '', O: 'o' },
      document = window.document, testEl = document.createElement('div'),
      supportedTransforms = /^((translate|rotate|scale)(X|Y|Z|3d)?|matrix(3d)?|perspective|skew(X|Y)?)$/i,
      transform,
      transitionProperty, transitionDuration, transitionTiming, transitionDelay,
      animationName, animationDuration, animationTiming, animationDelay,
      cssReset = {}

    function dasherize(str) { return str.replace(/([a-z])([A-Z])/, '$1-$2').toLowerCase() }
    function normalizeEvent(name) { return eventPrefix ? eventPrefix + name : name.toLowerCase() }

    $.each(vendors, function(vendor, event){
      if (testEl.style[vendor + 'TransitionProperty'] !== undefined) {
        prefix = '-' + vendor.toLowerCase() + '-'
        eventPrefix = event
        return false
      }
    })

    transform = prefix + 'transform'
    cssReset[transitionProperty = prefix + 'transition-property'] =
      cssReset[transitionDuration = prefix + 'transition-duration'] =
        cssReset[transitionDelay    = prefix + 'transition-delay'] =
          cssReset[transitionTiming   = prefix + 'transition-timing-function'] =
            cssReset[animationName      = prefix + 'animation-name'] =
              cssReset[animationDuration  = prefix + 'animation-duration'] =
                cssReset[animationDelay     = prefix + 'animation-delay'] =
                  cssReset[animationTiming    = prefix + 'animation-timing-function'] = ''

    $.fx = {
      off: (eventPrefix === undefined && testEl.style.transitionProperty === undefined),
      speeds: { _default: 400, fast: 200, slow: 600 },
      cssPrefix: prefix,
      transitionEnd: normalizeEvent('TransitionEnd'),
      animationEnd: normalizeEvent('AnimationEnd')
    }

    $.fn.animate = function(properties, duration, ease, callback, delay){
      if ($.isFunction(duration))
        callback = duration, ease = undefined, duration = undefined
      if ($.isFunction(ease))
        callback = ease, ease = undefined
      if ($.isPlainObject(duration))
        ease = duration.easing, callback = duration.complete, delay = duration.delay, duration = duration.duration
      if (duration) duration = (typeof duration == 'number' ? duration :
          ($.fx.speeds[duration] || $.fx.speeds._default)) / 1000
      if (delay) delay = parseFloat(delay) / 1000
      return this.anim(properties, duration, ease, callback, delay)
    }

    $.fn.anim = function(properties, duration, ease, callback, delay){
      var key, cssValues = {}, cssProperties, transforms = '',
        that = this, wrappedCallback, endEvent = $.fx.transitionEnd,
        fired = false

      if (duration === undefined) duration = $.fx.speeds._default / 1000
      if (delay === undefined) delay = 0
      if ($.fx.off) duration = 0

      if (typeof properties == 'string') {
        // keyframe animation
        cssValues[animationName] = properties
        cssValues[animationDuration] = duration + 's'
        cssValues[animationDelay] = delay + 's'
        cssValues[animationTiming] = (ease || 'linear')
        endEvent = $.fx.animationEnd
      } else {
        cssProperties = []
        // CSS transitions
        for (key in properties)
          if (supportedTransforms.test(key)) transforms += key + '(' + properties[key] + ') '
          else cssValues[key] = properties[key], cssProperties.push(dasherize(key))

        if (transforms) cssValues[transform] = transforms, cssProperties.push(transform)
        if (duration > 0 && typeof properties === 'object') {
          cssValues[transitionProperty] = cssProperties.join(', ')
          cssValues[transitionDuration] = duration + 's'
          cssValues[transitionDelay] = delay + 's'
          cssValues[transitionTiming] = (ease || 'linear')
        }
      }

      wrappedCallback = function(event){
        if (typeof event !== 'undefined') {
          if (event.target !== event.currentTarget) return // makes sure the event didn't bubble from "below"
          $(event.target).unbind(endEvent, wrappedCallback)
        } else
          $(this).unbind(endEvent, wrappedCallback) // triggered by setTimeout

        fired = true
        $(this).css(cssReset)
        callback && callback.call(this)
      }
      if (duration > 0){
        this.bind(endEvent, wrappedCallback)
        // transitionEnd is not always firing on older Android phones
        // so make sure it gets fired
        setTimeout(function(){
          if (fired) return
          wrappedCallback.call(that)
        }, ((duration + delay) * 1000) + 25)
      }

      // trigger page reflow so new elements can animate
      this.size() && this.get(0).clientLeft

      this.css(cssValues)

      if (duration <= 0) setTimeout(function() {
        that.each(function(){ wrappedCallback.call(this) })
      }, 0)

      return this
    }

    testEl = null
  })(Zepto)

  ;(function($){
    var touch = {},
      touchTimeout, tapTimeout, swipeTimeout, longTapTimeout,
      longTapDelay = 750,
      gesture

    function swipeDirection(x1, x2, y1, y2) {
      return Math.abs(x1 - x2) >=
      Math.abs(y1 - y2) ? (x1 - x2 > 0 ? 'Left' : 'Right') : (y1 - y2 > 0 ? 'Up' : 'Down')
    }

    function longTap() {
      longTapTimeout = null
      if (touch.last) {
        touch.el.trigger('longTap')
        touch = {}
      }
    }

    function cancelLongTap() {
      if (longTapTimeout) clearTimeout(longTapTimeout)
      longTapTimeout = null
    }

    function cancelAll() {
      if (touchTimeout) clearTimeout(touchTimeout)
      if (tapTimeout) clearTimeout(tapTimeout)
      if (swipeTimeout) clearTimeout(swipeTimeout)
      if (longTapTimeout) clearTimeout(longTapTimeout)
      touchTimeout = tapTimeout = swipeTimeout = longTapTimeout = null
      touch = {}
    }

    function isPrimaryTouch(event){
      return (event.pointerType == 'touch' ||
        event.pointerType == event.MSPOINTER_TYPE_TOUCH)
        && event.isPrimary
    }

    function isPointerEventType(e, type){
      return (e.type == 'pointer'+type ||
      e.type.toLowerCase() == 'mspointer'+type)
    }

    $(document).ready(function(){
      var now, delta, deltaX = 0, deltaY = 0, firstTouch, _isPointerType

      if ('MSGesture' in window) {
        gesture = new MSGesture()
        gesture.target = document.body
      }

      $(document)
        .bind('MSGestureEnd', function(e){
          var swipeDirectionFromVelocity =
            e.velocityX > 1 ? 'Right' : e.velocityX < -1 ? 'Left' : e.velocityY > 1 ? 'Down' : e.velocityY < -1 ? 'Up' : null;
          if (swipeDirectionFromVelocity) {
            touch.el.trigger('swipe')
            touch.el.trigger('swipe'+ swipeDirectionFromVelocity)
          }
        })
        .on('touchstart MSPointerDown pointerdown', function(e){
          if((_isPointerType = isPointerEventType(e, 'down')) &&
            !isPrimaryTouch(e)) return
          firstTouch = _isPointerType ? e : e.touches[0]
          if (e.touches && e.touches.length === 1 && touch.x2) {
            // Clear out touch movement data if we have it sticking around
            // This can occur if touchcancel doesn't fire due to preventDefault, etc.
            touch.x2 = undefined
            touch.y2 = undefined
          }
          now = Date.now()
          delta = now - (touch.last || now)
          touch.el = $('tagName' in firstTouch.target ?
            firstTouch.target : firstTouch.target.parentNode)
          touchTimeout && clearTimeout(touchTimeout)
          touch.x1 = firstTouch.pageX
          touch.y1 = firstTouch.pageY
          if (delta > 0 && delta <= 250) touch.isDoubleTap = true
          touch.last = now
          longTapTimeout = setTimeout(longTap, longTapDelay)
          // adds the current touch contact for IE gesture recognition
          if (gesture && _isPointerType) gesture.addPointer(e.pointerId);
        })
        .on('touchmove MSPointerMove pointermove', function(e){
          if((_isPointerType = isPointerEventType(e, 'move')) &&
            !isPrimaryTouch(e)) return
          firstTouch = _isPointerType ? e : e.touches[0]
          cancelLongTap()
          touch.x2 = firstTouch.pageX
          touch.y2 = firstTouch.pageY

          deltaX += Math.abs(touch.x1 - touch.x2)
          deltaY += Math.abs(touch.y1 - touch.y2)
        })
        .on('touchend MSPointerUp pointerup', function(e){
          if((_isPointerType = isPointerEventType(e, 'up')) &&
            !isPrimaryTouch(e)) return
          cancelLongTap()

          // swipe
          if ((touch.x2 && Math.abs(touch.x1 - touch.x2) > 30) ||
            (touch.y2 && Math.abs(touch.y1 - touch.y2) > 30))

            swipeTimeout = setTimeout(function() {
              touch.el.trigger('swipe')
              touch.el.trigger('swipe' + (swipeDirection(touch.x1, touch.x2, touch.y1, touch.y2)))
              touch = {}
            }, 0)

          // normal tap
          else if ('last' in touch)
          // don't fire tap when delta position changed by more than 30 pixels,
          // for instance when moving to a point and back to origin
            if (deltaX < 30 && deltaY < 30) {
              // delay by one tick so we can cancel the 'tap' event if 'scroll' fires
              // ('tap' fires before 'scroll')
              tapTimeout = setTimeout(function() {

                // trigger universal 'tap' with the option to cancelTouch()
                // (cancelTouch cancels processing of single vs double taps for faster 'tap' response)
                var event = $.Event('tap')
                event.cancelTouch = cancelAll
                touch.el.trigger(event)

                // trigger double tap immediately
                if (touch.isDoubleTap) {
                  if (touch.el) touch.el.trigger('doubleTap')
                  touch = {}
                }

                // trigger single tap after 250ms of inactivity
                else {
                  touchTimeout = setTimeout(function(){
                    touchTimeout = null
                    if (touch.el) touch.el.trigger('singleTap')
                    touch = {}
                  }, 250)
                }
              }, 0)
            } else {
              touch = {}
            }
          deltaX = deltaY = 0

        })
        // when the browser window loses focus,
        // for example when a modal dialog is shown,
        // cancel all ongoing events
        .on('touchcancel MSPointerCancel pointercancel', cancelAll)

      // scrolling the window indicates intention of the user
      // to scroll, not tap or swipe, so cancel all ongoing events
      $(window).on('scroll', cancelAll)
    })

    ;['swipe', 'swipeLeft', 'swipeRight', 'swipeUp', 'swipeDown',
      'doubleTap', 'tap', 'singleTap', 'longTap'].forEach(function(eventName){
        $.fn[eventName] = function(callback){ return this.on(eventName, callback) }
      })
  })(Zepto)

  ;(function($){
    if ($.os.ios) {
      var gesture = {}, gestureTimeout

      function parentIfText(node){
        return 'tagName' in node ? node : node.parentNode
      }

      $(document).bind('gesturestart', function(e){
        var now = Date.now(), delta = now - (gesture.last || now)
        gesture.target = parentIfText(e.target)
        gestureTimeout && clearTimeout(gestureTimeout)
        gesture.e1 = e.scale
        gesture.last = now
      }).bind('gesturechange', function(e){
        gesture.e2 = e.scale
      }).bind('gestureend', function(e){
        if (gesture.e2 > 0) {
          Math.abs(gesture.e1 - gesture.e2) != 0 && $(gesture.target).trigger('pinch') &&
          $(gesture.target).trigger('pinch' + (gesture.e1 - gesture.e2 > 0 ? 'In' : 'Out'))
          gesture.e1 = gesture.e2 = gesture.last = 0
        } else if ('last' in gesture) {
          gesture = {}
        }
      })

      ;['pinch', 'pinchIn', 'pinchOut'].forEach(function(m){
        $.fn[m] = function(callback){ return this.bind(m, callback) }
      })
    }
  })(Zepto)

  ;(function($){
    var zepto = $.zepto, oldQsa = zepto.qsa, oldMatches = zepto.matches

    function visible(elem){
      elem = $(elem)
      return !!(elem.width() || elem.height()) && elem.css("display") !== "none"
    }

    // Implements a subset from:
    // http://api.jquery.com/category/selectors/jquery-selector-extensions/
    //
    // Each filter function receives the current index, all nodes in the
    // considered set, and a value if there were parentheses. The value
    // of `this` is the node currently being considered. The function returns the
    // resulting node(s), null, or undefined.
    //
    // Complex selectors are not supported:
    //   li:has(label:contains("foo")) + li:has(label:contains("bar"))
    //   ul.inner:first > li
    var filters = $.expr[':'] = {
      visible:  function(){ if (visible(this)) return this },
      hidden:   function(){ if (!visible(this)) return this },
      selected: function(){ if (this.selected) return this },
      checked:  function(){ if (this.checked) return this },
      parent:   function(){ return this.parentNode },
      first:    function(idx){ if (idx === 0) return this },
      last:     function(idx, nodes){ if (idx === nodes.length - 1) return this },
      eq:       function(idx, _, value){ if (idx === value) return this },
      contains: function(idx, _, text){ if ($(this).text().indexOf(text) > -1) return this },
      has:      function(idx, _, sel){ if (zepto.qsa(this, sel).length) return this }
    }

    var filterRe = new RegExp('(.*):(\\w+)(?:\\(([^)]+)\\))?$\\s*'),
      childRe  = /^\s*>/,
      classTag = 'Zepto' + (+new Date())

    function process(sel, fn) {
      // quote the hash in `a[href^=#]` expression
      sel = sel.replace(/=#\]/g, '="#"]')
      var filter, arg, match = filterRe.exec(sel)
      if (match && match[2] in filters) {
        filter = filters[match[2]], arg = match[3]
        sel = match[1]
        if (arg) {
          var num = Number(arg)
          if (isNaN(num)) arg = arg.replace(/^["']|["']$/g, '')
          else arg = num
        }
      }
      return fn(sel, filter, arg)
    }

    zepto.qsa = function(node, selector) {
      return process(selector, function(sel, filter, arg){
        try {
          var taggedParent
          if (!sel && filter) sel = '*'
          else if (childRe.test(sel))
          // support "> *" child queries by tagging the parent node with a
          // unique class and prepending that classname onto the selector
            taggedParent = $(node).addClass(classTag), sel = '.'+classTag+' '+sel

          var nodes = oldQsa(node, sel)
        } catch(e) {
          console.error('error performing selector: %o', selector)
          throw e
        } finally {
          if (taggedParent) taggedParent.removeClass(classTag)
        }
        return !filter ? nodes :
          zepto.uniq($.map(nodes, function(n, i){ return filter.call(n, i, nodes, arg) }))
      })
    }

    zepto.matches = function(node, selector){
      return process(selector, function(sel, filter, arg){
        return (!sel || oldMatches(node, sel)) &&
          (!filter || filter.call(node, null, arg) === node)
      })
    }
  })(Zepto);
});

define('util/RequestAnimationFrame',['require','exports','module'],function (require, exports, module) {
  //http://notes.jetienne.com/2011/05/18/cancelRequestAnimFrame-for-paul-irish-requestAnimFrame.html
  window.cancelRequestAnimFrame = (function () {
    return window.cancelAnimationFrame ||
      window.webkitCancelRequestAnimationFrame ||
      clearTimeout
  })();
  window.requestAnimFrame = (function () {
    return window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      function (/* function */ callback, /* DOMElement */ element) {
        return window.setTimeout(callback, 1000 / 60);
      };
  })();
});

define('util/Easing',['require','exports','module'],function (require, exports, module) {
  /**
   * http://www.robertpenner.com/easing/
   * http://www.gizma.com/easing/
   *
   * t: current time
   * b: begInnIng value
   * c: change In value
   * d: duration
   **/

    // simple linear tweening - no easing, no acceleration
  Math.linearTween = function (t, b, c, d) {
    return c * t / d + b;
  };

  // quadratic easing in - accelerating from zero velocity
  Math.easeInQuad = function (t, b, c, d) {
    t /= d;
    return c * t * t + b;
  };

  // quadratic easing out - decelerating to zero velocity
  Math.easeOutQuad = function (t, b, c, d) {
    t /= d;
    return -c * t * (t - 2) + b;
  };

  // quadratic easing in/out - acceleration until halfway, then deceleration
  Math.easeInOutQuad = function (t, b, c, d) {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t + b;
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
  };

  // cubic easing in - accelerating from zero velocity
  Math.easeInCubic = function (t, b, c, d) {
    t /= d;
    return c * t * t * t + b;
  };

  // cubic easing out - decelerating to zero velocity
  Math.easeOutCubic = function (t, b, c, d) {
    t /= d;
    t--;
    return c * (t * t * t + 1) + b;
  };

  // cubic easing in/out - acceleration until halfway, then deceleration
  Math.easeInOutCubic = function (t, b, c, d) {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t * t + b;
    t -= 2;
    return c / 2 * (t * t * t + 2) + b;
  };
  // quartic easing in - accelerating from zero velocity
  Math.easeInQuart = function (t, b, c, d) {
    t /= d;
    return c * t * t * t * t + b;
  };

  // quartic easing out - decelerating to zero velocity
  Math.easeOutQuart = function (t, b, c, d) {
    t /= d;
    t--;
    return -c * (t * t * t * t - 1) + b;
  };

  // quartic easing in/out - acceleration until halfway, then deceleration
  Math.easeInOutQuart = function (t, b, c, d) {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t * t * t + b;
    t -= 2;
    return -c / 2 * (t * t * t * t - 2) + b;
  };
  // quintic easing in - accelerating from zero velocity
  Math.easeInQuint = function (t, b, c, d) {
    t /= d;
    return c * t * t * t * t * t + b;
  };

  // quintic easing out - decelerating to zero velocity
  Math.easeOutQuint = function (t, b, c, d) {
    t /= d;
    t--;
    return c * (t * t * t * t * t + 1) + b;
  };

  // quintic easing in/out - acceleration until halfway, then deceleration
  Math.easeInOutQuint = function (t, b, c, d) {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t * t * t * t + b;
    t -= 2;
    return c / 2 * (t * t * t * t * t + 2) + b;
  };
  // sinusoidal easing in - accelerating from zero velocity
  Math.easeInSine = function (t, b, c, d) {
    return -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
  };

  // sinusoidal easing out - decelerating to zero velocity
  Math.easeOutSine = function (t, b, c, d) {
    return c * Math.sin(t / d * (Math.PI / 2)) + b;
  };

  // sinusoidal easing in/out - accelerating until halfway, then decelerating
  Math.easeInOutSine = function (t, b, c, d) {
    return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
  };

  // exponential easing in - accelerating from zero velocity
  Math.easeInExpo = function (t, b, c, d) {
    return c * Math.pow(2, 10 * (t / d - 1)) + b;
  };

  // exponential easing out - decelerating to zero velocity
  Math.easeOutExpo = function (t, b, c, d) {
    return c * ( -Math.pow(2, -10 * t / d) + 1 ) + b;
  };

  // exponential easing in/out - accelerating until halfway, then decelerating
  Math.easeInOutExpo = function (t, b, c, d) {
    t /= d / 2;
    if (t < 1) return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
    t--;
    return c / 2 * ( -Math.pow(2, -10 * t) + 2 ) + b;
  };
  // circular easing in - accelerating from zero velocity
  Math.easeInCirc = function (t, b, c, d) {
    t /= d;
    return -c * (Math.sqrt(1 - t * t) - 1) + b;
  };

  // circular easing out - decelerating to zero velocity
  Math.easeOutCirc = function (t, b, c, d) {
    t /= d;
    t--;
    return c * Math.sqrt(1 - t * t) + b;
  };

  // circular easing in/out - acceleration until halfway, then deceleration
  Math.easeInOutCirc = function (t, b, c, d) {
    t /= d / 2;
    if (t < 1) return -c / 2 * (Math.sqrt(1 - t * t) - 1) + b;
    t -= 2;
    return c / 2 * (Math.sqrt(1 - t * t) + 1) + b;
  };
});

define('util/Unveil',['require','exports','module'],function (require, exports, module) {
  /**
   * jQuery Unveil
   * A very lightweight jQuery plugin to lazy load images
   * http://luis-almeida.github.com/unveil
   *
   * Licensed under the MIT license.
   * Copyright 2013 Luís Almeida
   * https://github.com/luis-almeida
   */
  ;(function ($) {

    $.fn.unveil = function (threshold, callback) {

      var $w = $(window),
        th = threshold || 0,
        retina = window.devicePixelRatio > 1,
        attrib = retina ? "data-src-retina" : "data-src",
        images = this,
        loaded;

      this.one("unveil", function () {
        var source = this.getAttribute(attrib);
        source = source || this.getAttribute("data-src");
        if (source) {
          if (typeof callback === "function") callback.call(this);
          this.setAttribute("src", source);
        }
      });

      function unveil() {
        var inview = images.filter(function () {
          var $e = $(this);
          //if ($e.is(":hidden")) return;

          var wt = $w.scrollTop(),
            wb = wt + $w.height(),
            et = $e.offset().top,
            eb = et + $e.height();

          return eb >= wt - th && et <= wb + th;
        });

        loaded = inview.trigger("unveil");
        images = images.not(loaded);
      }

      $w.on("scroll.unveil resize.unveil lookup.unveil", unveil);

      unveil();

      return this;

    };

  })(window.Zepto);
});

define('lib/diffDOM',['require','exports','module'],function (require, exports, module) {
  

  

  var diffcount;

  var Diff = function(options) {
    var diff = this;
    Object.keys(options).forEach(function(option) {
      diff[option] = options[option];
    });
  };

  Diff.prototype = {
    toString: function() {
      return JSON.stringify(this);
    }

    // TODO: compress diff output by replacing these keys with numbers or alike:
    /*        'addAttribute' = 0,
     'modifyAttribute' = 1,
     'removeAttribute' = 2,
     'modifyTextElement' = 3,
     'relocateGroup' = 4,
     'removeElement' = 5,
     'addElement' = 6,
     'removeTextElement' = 7,
     'addTextElement' = 8,
     'replaceElement' = 9,
     'modifyValue' = 10,
     'modifyChecked' = 11,
     'modifySelected' = 12,
     'modifyComment' = 13,
     'action' = 14,
     'route' = 15,
     'oldValue' = 16,
     'newValue' = 17,
     'element' = 18,
     'group' = 19,
     'from' = 20,
     'to' = 21,
     'name' = 22,
     'value' = 23,
     'data' = 24,
     'attributes' = 25,
     'nodeName' = 26,
     'childNodes' = 27,
     'checked' = 28,
     'selected' = 29;*/
  };

  var SubsetMapping = function SubsetMapping(a, b) {
    this.old = a;
    this.new = b;
  };

  SubsetMapping.prototype = {
    contains: function contains(subset) {
      if (subset.length < this.length) {
        return subset.new >= this.new && subset.new < this.new + this.length;
      }
      return false;
    },
    toString: function toString() {
      return this.length + " element subset, first mapping: old " + this.old + " → new " + this.new;
    }
  };

  var elementDescriptors = function(el) {
    var output = [];
    if (el.nodeName != '#text' && el.nodeName != '#comment') {
      output.push(el.nodeName);
      if (el.attributes) {
        if (el.attributes.class) {
          output.push(el.nodeName + '.' + el.attributes.class.replace(/ /g, '.'));
        }
        if (el.attributes.id) {
          output.push(el.nodeName + '#' + el.attributes.id);
        }
      }

    }
    return output;
  };

  var findUniqueDescriptors = function(li) {
    var uniqueDescriptors = {},
      duplicateDescriptors = {};

    li.forEach(function(node) {
      elementDescriptors(node).forEach(function(descriptor) {
        var inUnique = descriptor in uniqueDescriptors,
          inDupes = descriptor in duplicateDescriptors;
        if (!inUnique && !inDupes) {
          uniqueDescriptors[descriptor] = true;
        } else if (inUnique) {
          delete uniqueDescriptors[descriptor];
          duplicateDescriptors[descriptor] = true;
        }
      });

    });

    return uniqueDescriptors;
  };

  var uniqueInBoth = function(l1, l2) {
    var l1Unique = findUniqueDescriptors(l1),
      l2Unique = findUniqueDescriptors(l2),
      inBoth = {};

    Object.keys(l1Unique).forEach(function(key) {
      if (l2Unique[key]) {
        inBoth[key] = true;
      }
    });

    return inBoth;
  };

  var removeDone = function(tree) {
    delete tree.outerDone;
    delete tree.innerDone;
    delete tree.valueDone;
    if (tree.childNodes) {
      return tree.childNodes.every(removeDone);
    } else {
      return true;
    }
  };

  var isEqual = function(e1, e2) {

    var e1Attributes, e2Attributes;

    if (!['nodeName', 'value', 'checked', 'selected', 'data'].every(function(element) {
        if (e1[element] !== e2[element]) {
          return false;
        }
        return true;
      })) {
      return false;
    }

    if (Boolean(e1.attributes) !== Boolean(e2.attributes)) {
      return false;
    }

    if (Boolean(e1.childNodes) !== Boolean(e2.childNodes)) {
      return false;
    }

    if (e1.attributes) {
      e1Attributes = Object.keys(e1.attributes);
      e2Attributes = Object.keys(e2.attributes);

      if (e1Attributes.length != e2Attributes.length) {
        return false;
      }
      if (!e1Attributes.every(function(attribute) {
          if (e1.attributes[attribute] !== e2.attributes[attribute]) {
            return false;
          }
        })) {
        return false;
      }
    }

    if (e1.childNodes) {
      if (e1.childNodes.length !== e2.childNodes.length) {
        return false;
      }
      if (!e1.childNodes.every(function(childNode, index) {
          return isEqual(childNode, e2.childNodes[index]);
        })) {

        return false;
      }

    }

    return true;

  };


  var roughlyEqual = function(e1, e2, uniqueDescriptors, sameSiblings, preventRecursion) {
    var childUniqueDescriptors, nodeList1, nodeList2;

    if (!e1 || !e2) {
      return false;
    }

    if (e1.nodeName !== e2.nodeName) {
      return false;
    }

    if (e1.nodeName === '#text') {
      // Note that we initially don't care what the text content of a node is,
      // the mere fact that it's the same tag and "has text" means it's roughly
      // equal, and then we can find out the true text difference later.
      return preventRecursion ? true : e1.data === e2.data;
    }


    if (e1.nodeName in uniqueDescriptors) {
      return true;
    }

    if (e1.attributes && e2.attributes) {

      if (e1.attributes.id && e1.attributes.id === e2.attributes.id) {
        var idDescriptor = e1.nodeName + '#' + e1.attributes.id;
        if (idDescriptor in uniqueDescriptors) {
          return true;
        }
      }
      if (e1.attributes.class && e1.attributes.class === e2.attributes.class) {
        var classDescriptor = e1.nodeName + '.' + e1.attributes.class.replace(/ /g, '.');
        if (classDescriptor in uniqueDescriptors) {
          return true;
        }
      }
    }

    if (sameSiblings) {
      return true;
    }

    nodeList1 = e1.childNodes ? e1.childNodes.slice().reverse() : [];
    nodeList2 = e2.childNodes ? e2.childNodes.slice().reverse() : [];

    if (nodeList1.length !== nodeList2.length) {
      return false;
    }

    if (preventRecursion) {
      return nodeList1.every(function(element, index) {
        return element.nodeName === nodeList2[index].nodeName;
      });
    } else {
      // note: we only allow one level of recursion at any depth. If 'preventRecursion'
      // was not set, we must explicitly force it to true for child iterations.
      childUniqueDescriptors = uniqueInBoth(nodeList1, nodeList2);
      return nodeList1.every(function(element, index) {
        return roughlyEqual(element, nodeList2[index], childUniqueDescriptors, true, true);
      });
    }
  };


  var cloneObj = function(obj) {
    //  TODO: Do we really need to clone here? Is it not enough to just return the original object?
    return JSON.parse(JSON.stringify(obj));
    //return obj;
  };

  /**
   * based on https://en.wikibooks.org/wiki/Algorithm_implementation/Strings/Longest_common_substring#JavaScript
   */
  var findCommonSubsets = function(c1, c2, marked1, marked2) {
    var lcsSize = 0,
      index = [],
      matches = Array.apply(null, new Array(c1.length + 1)).map(function() {
        return [];
      }), // set up the matching table
      uniqueDescriptors = uniqueInBoth(c1, c2),
    // If all of the elements are the same tag, id and class, then we can
    // consider them roughly the same even if they have a different number of
    // children. This will reduce removing and re-adding similar elements.
      subsetsSame = c1.length === c2.length,
      origin, ret;

    if (subsetsSame) {

      c1.some(function(element, i) {
        var c1Desc = elementDescriptors(element),
          c2Desc = elementDescriptors(c2[i]);
        if (c1Desc.length !== c2Desc.length) {
          subsetsSame = false;
          return true;
        }
        c1Desc.some(function(description, i) {
          if (description !== c2Desc[i]) {
            subsetsSame = false;
            return true;
          }
        });
        if (!subsetsSame) {
          return true;
        }

      });
    }

    // fill the matches with distance values
    c1.forEach(function(c1Element, c1Index) {
      c2.forEach(function(c2Element, c2Index) {
        if (!marked1[c1Index] && !marked2[c2Index] && roughlyEqual(c1Element, c2Element, uniqueDescriptors, subsetsSame)) {
          matches[c1Index + 1][c2Index + 1] = (matches[c1Index][c2Index] ? matches[c1Index][c2Index] + 1 : 1);
          if (matches[c1Index + 1][c2Index + 1] >= lcsSize) {
            lcsSize = matches[c1Index + 1][c2Index + 1];
            index = [c1Index + 1, c2Index + 1];
          }
        } else {
          matches[c1Index + 1][c2Index + 1] = 0;
        }
      });
    });
    if (lcsSize === 0) {
      return false;
    }
    origin = [index[0] - lcsSize, index[1] - lcsSize];
    ret = new SubsetMapping(origin[0], origin[1]);
    ret.length = lcsSize;

    return ret;
  };

  /**
   * This should really be a predefined function in Array...
   */
  var makeArray = function(n, v) {
    return Array.apply(null, new Array(n)).map(function() {
      return v;
    });
  };

  /**
   * Generate arrays that indicate which node belongs to which subset,
   * or whether it's actually an orphan node, existing in only one
   * of the two trees, rather than somewhere in both.
   *
   * So if t1 = <img><canvas><br>, t2 = <canvas><br><img>.
   * The longest subset is "<canvas><br>" (length 2), so it will group 0.
   * The second longest is "<img>" (length 1), so it will be group 1.
   * gaps1 will therefore be [1,0,0] and gaps2 [0,0,1].
   *
   * If an element is not part of any group, it will stay being 'true', which
   * is the initial value. For example:
   * t1 = <img><p></p><br><canvas>, t2 = <b></b><br><canvas><img>
   *
   * The "<p></p>" and "<b></b>" do only show up in one of the two and will
   * therefore be marked by "true". The remaining parts are parts of the
   * groups 0 and 1:
   * gaps1 = [1, true, 0, 0], gaps2 = [true, 0, 0, 1]
   *
   */
  var getGapInformation = function(t1, t2, stable) {

    var gaps1 = t1.childNodes ? makeArray(t1.childNodes.length, true) : [],
      gaps2 = t2.childNodes ? makeArray(t2.childNodes.length, true) : [],
      group = 0;

    // give elements from the same subset the same group number
    stable.forEach(function(subset) {
      var i, endOld = subset.old + subset.length,
        endNew = subset.new + subset.length;
      for (i = subset.old; i < endOld; i += 1) {
        gaps1[i] = group;
      }
      for (i = subset.new; i < endNew; i += 1) {
        gaps2[i] = group;
      }
      group += 1;
    });

    return {
      gaps1: gaps1,
      gaps2: gaps2
    };
  };

  /**
   * Find all matching subsets, based on immediate child differences only.
   */
  var markSubTrees = function(oldTree, newTree) {
    // note: the child lists are views, and so update as we update old/newTree
    var oldChildren = oldTree.childNodes ? oldTree.childNodes : [],
      newChildren = newTree.childNodes ? newTree.childNodes : [],
      marked1 = makeArray(oldChildren.length, false),
      marked2 = makeArray(newChildren.length, false),
      subsets = [],
      subset = true,
      returnIndex = function() {
        return arguments[1];
      },
      markBoth = function(i) {
        marked1[subset.old + i] = true;
        marked2[subset.new + i] = true;
      };

    while (subset) {
      subset = findCommonSubsets(oldChildren, newChildren, marked1, marked2);
      if (subset) {
        subsets.push(subset);

        Array.apply(null, new Array(subset.length)).map(returnIndex).forEach(markBoth);

      }
    }
    return subsets;
  };


  function swap(obj, p1, p2) {
    (function(_) {
      obj[p1] = obj[p2];
      obj[p2] = _;
    }(obj[p1]));
  }


  var DiffTracker = function() {
    this.list = [];
  };

  DiffTracker.prototype = {
    list: false,
    add: function(diffs) {
      var list = this.list;
      diffs.forEach(function(diff) {
        list.push(diff);
      });
    },
    forEach: function(fn) {
      this.list.forEach(fn);
    }
  };

  var diffDOM = function(options) {

    var defaults = {
        debug: false,
        diffcap: 10, // Limit for how many diffs are accepting when debugging. Inactive when debug is false.
        maxDepth: false, // False or a numeral. If set to a numeral, limits the level of depth that the the diff mechanism looks for differences. If false, goes through the entire tree.
        valueDiffing: true, // Whether to take into consideration the values of forms that differ from auto assigned values (when a user fills out a form).
        // syntax: textDiff: function (node, currentValue, expectedValue, newValue)
        textDiff: function() {
          arguments[0].data = arguments[3];
          return;
        }
      },
      i;

    if (typeof options == "undefined") {
      options = {};
    }

    for (i in defaults) {
      if (typeof options[i] == "undefined") {
        this[i] = defaults[i];
      } else {
        this[i] = options[i];
      }
    }

  };
  diffDOM.prototype = {

    // ===== Create a diff =====

    diff: function(t1Node, t2Node) {

      var t1 = this.nodeToObj(t1Node),
        t2 = this.nodeToObj(t2Node);

      diffcount = 0;

      if (this.debug) {
        this.t1Orig = this.nodeToObj(t1Node);
        this.t2Orig = this.nodeToObj(t2Node);
      }

      this.tracker = new DiffTracker();
      return this.findDiffs(t1, t2);
    },
    findDiffs: function(t1, t2) {
      var diffs;
      do {
        if (this.debug) {
          diffcount += 1;
          if (diffcount > this.diffcap) {
            window.diffError = [this.t1Orig, this.t2Orig];
            throw new Error("surpassed diffcap:" + JSON.stringify(this.t1Orig) + " -> " + JSON.stringify(this.t2Orig));
          }
        }
        diffs = this.findNextDiff(t1, t2, []);
        if (diffs.length === 0) {
          // Last check if the elements really are the same now.
          // If not, remove all info about being done and start over.
          // Somtimes a node can be marked as done, but the creation of subsequent diffs means that it has to be changed anyway.
          if (!isEqual(t1, t2)) {
            removeDone(t1);
            diffs = this.findNextDiff(t1, t2, []);
          }
        }

        if (diffs.length > 0) {
          this.tracker.add(diffs);
          this.applyVirtual(t1, diffs);
        }
      } while (diffs.length > 0);
      return this.tracker.list;
    },
    findNextDiff: function(t1, t2, route) {
      var diffs;

      if (this.maxDepth && route.length > this.maxDepth) {
        return [];
      }
      // outer differences?
      if (!t1.outerDone) {
        diffs = this.findOuterDiff(t1, t2, route);
        if (diffs.length > 0) {
          t1.outerDone = true;
          return diffs;
        } else {
          t1.outerDone = true;
        }
      }
      // inner differences?
      if (!t1.innerDone) {
        diffs = this.findInnerDiff(t1, t2, route);
        if (diffs.length > 0) {
          return diffs;
        } else {
          t1.innerDone = true;
        }
      }

      if (this.valueDiffing && !t1.valueDone) {
        // value differences?
        diffs = this.findValueDiff(t1, t2, route);

        if (diffs.length > 0) {
          t1.valueDone = true;
          return diffs;
        } else {
          t1.valueDone = true;
        }
      }

      // no differences
      return [];
    },
    findOuterDiff: function(t1, t2, route) {

      var diffs = [],
        attr1, attr2;

      if (t1.nodeName !== t2.nodeName) {
        return [new Diff({
          action: 'replaceElement',
          oldValue: cloneObj(t1),
          newValue: cloneObj(t2),
          route: route
        })];
      }

      if (t1.data !== t2.data) {
        // Comment or text node.
        if (t1.nodeName === '#text') {
          return [new Diff({
            action: 'modifyComment',
            route: route,
            oldValue: t1.data,
            newValue: t2.data
          })];
        } else {
          return [new Diff({
            action: 'modifyTextElement',
            route: route,
            oldValue: t1.data,
            newValue: t2.data
          })];
        }

      }


      attr1 = t1.attributes ? Object.keys(t1.attributes).sort() : [];
      attr2 = t2.attributes ? Object.keys(t2.attributes).sort() : [];

      attr1.forEach(function(attr) {
        var pos = attr2.indexOf(attr);
        if (pos === -1) {
          diffs.push(new Diff({
            action: 'removeAttribute',
            route: route,
            name: attr,
            value: t1.attributes[attr]
          }));
        } else {
          attr2.splice(pos, 1);
          if (t1.attributes[attr] !== t2.attributes[attr]) {
            diffs.push(new Diff({
              action: 'modifyAttribute',
              route: route,
              name: attr,
              oldValue: t1.attributes[attr],
              newValue: t2.attributes[attr]
            }));
          }
        }

      });


      attr2.forEach(function(attr) {
        diffs.push(new Diff({
          action: 'addAttribute',
          route: route,
          name: attr,
          value: t2.attributes[attr]
        }));

      });

      return diffs;
    },
    nodeToObj: function(node) {
      var objNode = {}, dobj = this;
      objNode.nodeName = node.nodeName;
      if (objNode.nodeName === '#text' || objNode.nodeName === '#comment') {
        objNode.data = node.data;
      } else {
        if (node.attributes && node.attributes.length > 0) {
          objNode.attributes = {};
          Array.prototype.slice.call(node.attributes).forEach(
            function(attribute) {
              objNode.attributes[attribute.name] = attribute.value;
            }
          );
        }
        if (node.childNodes && node.childNodes.length > 0) {
          objNode.childNodes = [];
          Array.prototype.slice.call(node.childNodes).forEach(
            function(childNode) {
              objNode.childNodes.push(dobj.nodeToObj(childNode));
            }
          );
        }
        if (this.valueDiffing) {
          if (node.value) {
            objNode.value = node.value;
          }
          if (node.checked) {
            objNode.checked = node.checked;
          }
          if (node.selected) {
            objNode.selected = node.selected;
          }
        }
      }

      return objNode;
    },
    objToNode: function(objNode, insideSvg) {
      var node, dobj = this;
      if (objNode.nodeName === '#text') {
        node = document.createTextNode(objNode.data);

      } else if (objNode.nodeName === '#comment') {
        node = document.createComment(objNode.data);
      } else {
        if (objNode.nodeName === 'svg' || insideSvg) {
          node = document.createElementNS('http://www.w3.org/2000/svg', objNode.nodeName);
          insideSvg = true;
        } else {
          node = document.createElement(objNode.nodeName);
        }
        if (objNode.attributes) {
          Object.keys(objNode.attributes).forEach(function(attribute) {
            node.setAttribute(attribute, objNode.attributes[attribute]);
          });
        }
        if (objNode.childNodes) {
          objNode.childNodes.forEach(function(childNode) {
            node.appendChild(dobj.objToNode(childNode, insideSvg));
          });
        }
        if (this.valueDiffing) {
          if (objNode.value) {
            node.value = objNode.value;
          }
          if (objNode.checked) {
            node.checked = objNode.checked;
          }
          if (objNode.selected) {
            node.selected = objNode.selected;
          }
        }
      }
      return node;
    },
    findInnerDiff: function(t1, t2, route) {

      var subtrees = (t1.childNodes && t2.childNodes) ? markSubTrees(t1, t2) : [],
        t1ChildNodes = t1.childNodes ? t1.childNodes : [],
        t2ChildNodes = t2.childNodes ? t2.childNodes : [],
        childNodesLengthDifference, diffs = [],
        index = 0,
        last, e1, e2, i;

      if (subtrees.length > 1) {
        /* Two or more groups have been identified among the childnodes of t1
         * and t2.
         */
        return this.attemptGroupRelocation(t1, t2, subtrees, route);
      }

      /* 0 or 1 groups of similar child nodes have been found
       * for t1 and t2. 1 If there is 1, it could be a sign that the
       * contents are the same. When the number of groups is below 2,
       * t1 and t2 are made to have the same length and each of the
       * pairs of child nodes are diffed.
       */


      last = Math.max(t1ChildNodes.length, t2ChildNodes.length);
      if (t1ChildNodes.length !== t2ChildNodes.length) {
        childNodesLengthDifference = true;
      }

      for (i = 0; i < last; i += 1) {
        e1 = t1ChildNodes[i];
        e2 = t2ChildNodes[i];

        if (childNodesLengthDifference) {
          /* t1 and t2 have different amounts of childNodes. Add
           * and remove as necessary to obtain the same length */
          if (e1 && !e2) {
            if (e1.nodeName === '#text') {
              diffs.push(new Diff({
                action: 'removeTextElement',
                route: route.concat(index),
                value: e1.data
              }));
              index -= 1;
            } else {
              diffs.push(new Diff({
                action: 'removeElement',
                route: route.concat(index),
                element: cloneObj(e1)
              }));
              index -= 1;
            }

          } else if (e2 && !e1) {
            if (e2.nodeName === '#text') {
              diffs.push(new Diff({
                action: 'addTextElement',
                route: route.concat(index),
                value: e2.data
              }));
            } else {
              diffs.push(new Diff({
                action: 'addElement',
                route: route.concat(index),
                element: cloneObj(e2)
              }));
            }
          }
        }
        /* We are now guaranteed that childNodes e1 and e2 exist,
         * and that they can be diffed.
         */
        /* Diffs in child nodes should not affect the parent node,
         * so we let these diffs be submitted together with other
         * diffs.
         */

        if (e1 && e2) {
          diffs = diffs.concat(this.findNextDiff(e1, e2, route.concat(index)));
        }

        index += 1;

      }
      t1.innerDone = true;
      return diffs;

    },

    attemptGroupRelocation: function(t1, t2, subtrees, route) {
      /* Either t1.childNodes and t2.childNodes have the same length, or
       * there are at least two groups of similar elements can be found.
       * attempts are made at equalizing t1 with t2. First all initial
       * elements with no group affiliation (gaps=true) are removed (if
       * only in t1) or added (if only in t2). Then the creation of a group
       * relocation diff is attempted.
       */

      var gapInformation = getGapInformation(t1, t2, subtrees),
        gaps1 = gapInformation.gaps1,
        gaps2 = gapInformation.gaps2,
        shortest = Math.min(gaps1.length, gaps2.length),
        destinationDifferent, toGroup,
        group, node, similarNode, testI, diffs = [],
        index = 0,
        i, j;


      for (i = 0; i < shortest; i += 1) {
        if (gaps1[i] === true) {
          node = t1.childNodes[i];
          if (node.nodeName === '#text') {
            if (t2.childNodes[i].nodeName === '#text' && node.data !== t2.childNodes[i].data) {
              testI = i;
              while (t1.childNodes.length > testI + 1 && t1.childNodes[testI + 1].nodeName === '#text') {
                testI += 1;
                if (t2.childNodes[i].data === t1.childNodes[testI].data) {
                  similarNode = true;
                  break;
                }
              }
              if (!similarNode) {
                diffs.push(new Diff({
                  action: 'modifyTextElement',
                  route: route.concat(index),
                  oldValue: node.data,
                  newValue: t2.childNodes[i].data
                }));
              }
            }
            diffs.push(new Diff({
              action: 'removeTextElement',
              route: route.concat(index),
              value: node.data
            }));
            index -= 1;
          } else {
            diffs.push(new Diff({
              action: 'removeElement',
              route: route.concat(index),
              element: cloneObj(node)
            }));
            index -= 1;
          }

        } else if (gaps2[i] === true) {
          node = t2.childNodes[i];
          if (node.nodeName === '#text') {
            diffs.push(new Diff({
              action: 'addTextElement',
              route: route.concat(index),
              value: node.data
            }));
            index += 1;
          } else {
            diffs.push(new Diff({
              action: 'addElement',
              route: route.concat(index),
              element: cloneObj(node)
            }));
            index += 1;
          }

        } else if (gaps1[i] !== gaps2[i]) {
          if (diffs.length > 0) {
            return diffs;
          }
          // group relocation
          group = subtrees[gaps1[i]];
          toGroup = Math.min(group.new, (t1.childNodes.length - group.length));
          if (toGroup !== group.old) {
            // Check whether destination nodes are different than originating ones.
            destinationDifferent = false;
            for (j = 0; j < group.length; j += 1) {
              if (!roughlyEqual(t1.childNodes[toGroup + j], t1.childNodes[group.old + j], [], false, true)) {
                destinationDifferent = true;
              }
            }
            if (destinationDifferent) {
              return [new Diff({
                action: 'relocateGroup',
                groupLength: group.length,
                from: group.old,
                to: toGroup,
                route: route
              })];
            }
          }
        }
        index += 1;
      }
      return diffs;
    },

    findValueDiff: function(t1, t2, route) {
      // Differences of value. Only useful if the value/selection/checked value
      // differs from what is represented in the DOM. For example in the case
      // of filled out forms, etc.
      var diffs = [];

      if (t1.selected !== t2.selected) {
        diffs.push(new Diff({
          action: 'modifySelected',
          oldValue: t1.selected,
          newValue: t2.selected,
          route: route
        }));
      }

      if ((t1.value || t2.value) && t1.value !== t2.value && t1.nodeName !== 'OPTION') {
        diffs.push(new Diff({
          action: 'modifyValue',
          oldValue: t1.value,
          newValue: t2.value,
          route: route
        }));
      }
      if (t1.checked !== t2.checked) {
        diffs.push(new Diff({
          action: 'modifyChecked',
          oldValue: t1.checked,
          newValue: t2.checked,
          route: route
        }));
      }

      return diffs;
    },

    // ===== Apply a virtual diff =====

    applyVirtual: function(tree, diffs) {
      var dobj = this;
      if (diffs.length === 0) {
        return true;
      }
      diffs.forEach(function(diff) {
        //                              console.log(JSON.stringify(diff));
        //                              console.log(JSON.stringify(tree));
        //                              console.log(this.objToNode(tree).outerHTML);
        dobj.applyVirtualDiff(tree, diff);
        //                                console.log(JSON.stringify(tree));
        //                                console.log(this.objToNode(tree).outerHTML);
      });
      return true;
    },
    getFromVirtualRoute: function(tree, route) {
      var node = tree,
        parentNode, nodeIndex;

      route = route.slice();
      while (route.length > 0) {
        if (!node.childNodes) {
          return false;
        }
        nodeIndex = route.splice(0, 1)[0];
        parentNode = node;
        node = node.childNodes[nodeIndex];
      }
      return {
        node: node,
        parentNode: parentNode,
        nodeIndex: nodeIndex
      };
    },
    applyVirtualDiff: function(tree, diff) {
      var routeInfo = this.getFromVirtualRoute(tree, diff.route),
        node = routeInfo.node,
        parentNode = routeInfo.parentNode,
        nodeIndex = routeInfo.nodeIndex,
        newNode, route, c;

      switch (diff.action) {
        case 'addAttribute':
          if (!node.attributes) {
            node.attributes = {};
          }

          node.attributes[diff.name] = diff.value;

          if (diff.name === 'checked') {
            node.checked = true;
          } else if (diff.name === 'selected') {
            node.selected = true;
          } else if (node.nodeName === 'INPUT' && diff.name === 'value') {
            node.value = diff.value;
          }

          break;
        case 'modifyAttribute':
          node.attributes[diff.name] = diff.newValue;
          if (node.nodeName === 'INPUT' && diff.name === 'value') {
            node.value = diff.value;
          }
          break;
        case 'removeAttribute':

          delete node.attributes[diff.name];

          if (Object.keys(node.attributes).length === 0) {
            delete node.attributes;
          }

          if (diff.name === 'checked') {
            delete node.checked;
          } else if (diff.name === 'selected') {
            delete node.selected;
          } else if (node.nodeName === 'INPUT' && diff.name === 'value') {
            delete node.value;
          }

          break;
        case 'modifyTextElement':
          node.data = diff.newValue;

          if (parentNode.nodeName === 'TEXTAREA') {
            parentNode.value = diff.newValue;
          }
          break;
        case 'modifyValue':
          node.value = diff.newValue;
          break;
        case 'modifyComment':
          node.data = diff.newValue;
          break;
        case 'modifyChecked':
          node.checked = diff.newValue;
          break;
        case 'modifySelected':
          node.selected = diff.newValue;
          break;
        case 'replaceElement':
          newNode = cloneObj(diff.newValue);
          newNode.outerDone = true;
          newNode.innerDone = true;
          newNode.valueDone = true;
          parentNode.childNodes[nodeIndex] = newNode;
          break;
        case 'relocateGroup':
          node.childNodes.splice(diff.from, diff.groupLength).reverse()
            .forEach(function(movedNode) {
              node.childNodes.splice(diff.to, 0, movedNode);
            });
          break;
        case 'removeElement':
          parentNode.childNodes.splice(nodeIndex, 1);
          break;
        case 'addElement':
          route = diff.route.slice();
          c = route.splice(route.length - 1, 1)[0];
          node = this.getFromVirtualRoute(tree, route).node;
          newNode = cloneObj(diff.element);
          newNode.outerDone = true;
          newNode.innerDone = true;
          newNode.valueDone = true;

          if (!node.childNodes) {
            node.childNodes = [];
          }

          if (c >= node.childNodes.length) {
            node.childNodes.push(newNode);
          } else {
            node.childNodes.splice(c, 0, newNode);
          }
          break;
        case 'removeTextElement':
          parentNode.childNodes.splice(nodeIndex, 1);
          if (parentNode.nodeName === 'TEXTAREA') {
            delete parentNode.value;
          }
          break;
        case 'addTextElement':
          route = diff.route.slice();
          c = route.splice(route.length - 1, 1)[0];
          newNode = {};
          newNode.nodeName = '#text';
          newNode.data = diff.value;
          node = this.getFromVirtualRoute(tree, route).node;
          if (!node.childNodes) {
            node.childNodes = [];
          }

          if (c >= node.childNodes.length) {
            node.childNodes.push(newNode);
          } else {
            node.childNodes.splice(c, 0, newNode);
          }
          if (node.nodeName === 'TEXTAREA') {
            node.value = diff.newValue;
          }
          break;
        default:
          console.log('unknown action');
      }

      return;
    },




    // ===== Apply a diff =====

    apply: function(tree, diffs) {
      var dobj = this;

      if (diffs.length === 0) {
        return true;
      }
      diffs.forEach(function(diff) {
        if (!dobj.applyDiff(tree, diff)) {
          return false;
        }
      });
      return true;
    },
    getFromRoute: function(tree, route) {
      route = route.slice();
      var c, node = tree;
      while (route.length > 0) {
        if (!node.childNodes) {
          return false;
        }
        c = route.splice(0, 1)[0];
        node = node.childNodes[c];
      }
      return node;
    },
    applyDiff: function(tree, diff) {
      var node = this.getFromRoute(tree, diff.route),
        newNode, reference, route, c;

      switch (diff.action) {
        case 'addAttribute':
          if (!node || !node.setAttribute) {
            return false;
          }
          node.setAttribute(diff.name, diff.value);
          break;
        case 'modifyAttribute':
          if (!node || !node.setAttribute) {
            return false;
          }
          node.setAttribute(diff.name, diff.newValue);
          break;
        case 'removeAttribute':
          if (!node || !node.removeAttribute) {
            return false;
          }
          node.removeAttribute(diff.name);
          break;
        case 'modifyTextElement':
          if (!node || node.nodeType !== 3) {
            return false;
          }
          this.textDiff(node, node.data, diff.oldValue, diff.newValue);
          break;
        case 'modifyValue':
          if (!node || typeof node.value === 'undefined') {
            return false;
          }
          node.value = diff.newValue;
          break;
        case 'modifyComment':
          if (!node || typeof node.data === 'undefined') {
            return false;
          }
          node.data = diff.newValue;
          break;
        case 'modifyChecked':
          if (!node || typeof node.checked === 'undefined') {
            return false;
          }
          node.checked = diff.newValue;
          break;
        case 'modifySelected':
          if (!node || typeof node.selected === 'undefined') {
            return false;
          }
          node.selected = diff.newValue;
          break;
        case 'replaceElement':
          node.parentNode.replaceChild(this.objToNode(diff.newValue), node);
          break;
        case 'relocateGroup':
          Array.apply(null, new Array(diff.groupLength)).map(function() {
            return node.removeChild(node.childNodes[diff.from]);
          }).forEach(function(childNode, index) {
            if (index === 0) {
              reference = node.childNodes[diff.to];
            }
            node.insertBefore(childNode, reference);
          });
          break;
        case 'removeElement':
          node.parentNode.removeChild(node);
          break;
        case 'addElement':
          route = diff.route.slice();
          c = route.splice(route.length - 1, 1)[0];
          node = this.getFromRoute(tree, route);
          node.insertBefore(this.objToNode(diff.element), node.childNodes[c]);
          break;
        case 'removeTextElement':
          if (!node || node.nodeType !== 3) {
            return false;
          }
          node.parentNode.removeChild(node);
          break;
        case 'addTextElement':
          route = diff.route.slice();
          c = route.splice(route.length - 1, 1)[0];
          newNode = document.createTextNode(diff.value);
          node = this.getFromRoute(tree, route);
          if (!node || !node.childNodes) {
            return false;
          }
          node.insertBefore(newNode, node.childNodes[c]);
          break;
        default:
          console.log('unknown action');
      }

      return true;
    },

    // ===== Undo a diff =====

    undo: function(tree, diffs) {
      diffs = diffs.slice();
      var dobj = this;
      if (!diffs.length) {
        diffs = [diffs];
      }
      diffs.reverse();
      diffs.forEach(function(diff) {
        dobj.undoDiff(tree, diff);
      });
    },
    undoDiff: function(tree, diff) {

      switch (diff.action) {
        case 'addAttribute':
          diff.action = 'removeAttribute';
          this.applyDiff(tree, diff);
          break;
        case 'modifyAttribute':
          swap(diff, 'oldValue', 'newValue');
          this.applyDiff(tree, diff);
          break;
        case 'removeAttribute':
          diff.action = 'addAttribute';
          this.applyDiff(tree, diff);
          break;
        case 'modifyTextElement':
          swap(diff, 'oldValue', 'newValue');
          this.applyDiff(tree, diff);
          break;
        case 'modifyValue':
          swap(diff, 'oldValue', 'newValue');
          this.applyDiff(tree, diff);
          break;
        case 'modifyComment':
          swap(diff, 'oldValue', 'newValue');
          this.applyDiff(tree, diff);
          break;
        case 'modifyChecked':
          swap(diff, 'oldValue', 'newValue');
          this.applyDiff(tree, diff);
          break;
        case 'modifySelected':
          swap(diff, 'oldValue', 'newValue');
          this.applyDiff(tree, diff);
          break;
        case 'replaceElement':
          swap(diff, 'oldValue', 'newValue');
          this.applyDiff(tree, diff);
          break;
        case 'relocateGroup':
          swap(diff, 'from', 'to');
          this.applyDiff(tree, diff);
          break;
        case 'removeElement':
          diff.action = 'addElement';
          this.applyDiff(tree, diff);
          break;
        case 'addElement':
          diff.action = 'removeElement';
          this.applyDiff(tree, diff);
          break;
        case 'removeTextElement':
          diff.action = 'addTextElement';
          this.applyDiff(tree, diff);
          break;
        case 'addTextElement':
          diff.action = 'removeTextElement';
          this.applyDiff(tree, diff);
          break;
        default:
          console.log('unknown action');
      }

    }
  };

  window.diffDOM = diffDOM;
});

define('util/VirtualDOMLite',['require','exports','module','lib/diffDOM'],function (require, exports, module) {
  require('lib/diffDOM');

  //https://github.com/fiduswriter/diffDOM
  ;(function ($) {
    $.fn.superHtml = $.fn.html;
    $.fn.html = diffDOM
      ?function (html,diff) {
      if(diff && this._diffdom){
        var VDOM = this[0].cloneNode(),
          VDD = new diffDOM(diff),
          VDiff;
        VDOM.innerHTML = html;
        VDiff = VDD.diff(this[0], VDOM);
        //fallback
        if(!VDD.apply(this[0], VDiff)){
          this.superHtml.apply(this,arguments);
        }
        this.eq(0).trigger('virtualdomrendered');
        return this;
      }else{
        this._diffdom = 1;
        var res = this.superHtml.apply(this,arguments);
        this.eq(0).trigger('virtualdomrendered');
        return res;
      }
    }
      :$.fn.superHtml;

  })(window.Zepto);
});

define('core/Navigator',['require','exports','module'],function (require, exports, module) {
  var Navigator = (function () {
    var frame,
      androidReg = /Android/gi,
      isAndroid = androidReg.test(navigator.platform) || androidReg.test(navigator.userAgent);
    /**
     * iframe 元素
     *
     * @property {Element} frame
     */
    frame = null;
    /**
     * append iframe
     *
     * @param frame
     */
    function appendFrame(frame){
      frame && document.body.appendChild(frame);
    }
    /**
     * 删除iframe
     *
     * @method removeFrame
     * @param {Element} frame 执行的方法
     */
    function removeFrame(frame) {
      frame && frame.parentNode.removeChild(frame);
    }

    /**
     * 创建iframe,帮助解决iOS的UIWebView没有JS API
     *
     * @method getFrame
     * @return {Element} iframe
     */
    function getFrame(src,name) {
      var _frame = document.createElement("iframe");
      _frame.setAttribute("style", "display:none;width:0;height:0;position: absolute;top:0;left:0;border:0;");
      _frame.setAttribute("height", "0px");
      _frame.setAttribute("width", "0px");
      _frame.setAttribute("frameborder", "0");
      name && _frame.setAttribute("name", name);
      if (src) {
        _frame.setAttribute("src", src);
      } else {
        appendFrame(_frame);
      }
      return _frame;
    }

    /**
     * 执行与客户端交互方法的命令
     *
     * @method excute
     * @param {String} ns 与客户端交互的协议server/类Class
     * @param {String} fn 执行的方法
     * @param {Object} option 参数
     * @param {boolean} single 是否是使用独立的iframe,默认false
     * @param {boolean} noframe 是否不通过iframe,默认false
     */
    function excute(ns, fn, option, single, noframe) {
      var data, command;
      data = option ? JSON.stringify(option) : '';//将JSON转换成字符串
      if (ns && (typeof ns == 'object') && ns[fn]) {//android
        ns[fn](data);
      } else {//iOS
        command = ns;
        if (typeof fn == 'string' && fn.length > 0) {
          command += fn + '/' + data;
        }
        protocol(command, single, noframe);
      }
    }

    /**
     * 执行与客户端交互的协议
     *
     * @method protocol
     * @param {String} command 执行的协议及命令
     * @param {boolean} single 是否是使用独立的iframe,默认false
     * @param {boolean} noframe 是否不通过iframe,默认false
     */
    function protocol(command, single, noframe) {
      var _frame, timer;
      //不通过iframe
      if (noframe) {
        window.location.href = command;
        return;
      }
      //通过iframe
      if (single) {
        if (isAndroid) {
          _frame = getFrame();
          _frame.setAttribute("src", command);
        } else {
          _frame = getFrame(command);
          appendFrame(_frame);
        }
        timer = setTimeout(function () {
          _frame && removeFrame(_frame);
        }, 30000);
        _frame.onload = _frame.onreadystatechange = function () {
          timer && clearTimeout(timer);
          _frame && removeFrame(_frame);
        }
      } else {
        frame = frame || getFrame();
        frame.setAttribute("src", command);
      }
    }

    return {
      protocol: protocol,
      excute: excute,
      getFrame: getFrame,
      appendFrame: appendFrame,
      removeFrame: removeFrame
    }
  })();//end Object Navigator

  return Navigator;
});

define('core/Subject',['require','exports','module'],function (require, exports, module) {
  function Subject(subject) {
    this._subject = subject;
    this.observers = [];
  }

  Subject.prototype = {
    /**
     * @param {Function}|{Boject} observer
     */
    register: function (observer) {
      if (!observer) {
        throw new Error('An observer can not be undefined!');
      } else if (typeof observer === 'object' && typeof observer.update !== 'function') {
        throw {
          name: 'Error',
          method: 'Subject.register',
          message: 'An observer object can not register without an update method!'
        }
      }
      this.unregister(observer);//防止重复注册
      this.observers.push(observer);
      return this;
    },
    /**
     * @param {Function}|{Boject} observer
     */
    unregister: function (observer) {
      this.observers = this.observers.filter(function (obsv) {
        if (obsv !== observer) {
          return obsv;
        }
      });
      return this;
    },
    notify: function () {
      var args = [].slice.call(arguments);
      this.observers.forEach(function (obsv) {
        if (typeof obsv === 'function') {
          obsv.apply(obsv, args);
        } else {
          obsv.update.apply(obsv, args);
        }
      });
      return this;
    }
  }
  return Subject;
});

define('core/MicroTmpl',['require','exports','module'],function (require, exports, module) {
  /**
   * 模板解析
   * 1. 可接收 DOM Element,不支持 DOM Element 模板里嵌套模板
   * 2. 如果 DOM Element 中的元素的属性可加前缀micro-(或ntes-)，如img的src改为micro-src；及内样式style改为micro-style。以避免模板没有使用前生效。最终模板将会替换掉micro-(或ntes-)前缀。
   *
   * e.g.
   * <section>
   *     <script type="text/html">
   *     <h1><%=TITLE%></h1>
   *     <% for(var i=0;i<list.length;i++){ %>
     *         <article><%=list[i]%></article>
     *     <%}%>
   *     </script>
   * </section>
   *
   * 如果 mustache 参数为true,默认为false,可使用{{}},不支持JS表达式
   * e.g
   * <section>
   *     <script type="text/html">
   *     <h1>{{TITLE}}</h1>
   *     </script>
   * </section>
   */
  var microTmpl = function (mustache) {
    var intro = mustache ? '{{' : '<%',
      outro = mustache ? '}}' : '%>',
      tmplAttrs = ['micro-template', 'ntes-template'],
      childTmplAttrs = ['micro-template-child', 'ntes-template-child'];
    //http://stackoverflow.com/questions/384286/javascript-isdom-how-do-you-check-if-a-javascript-object-is-a-dom-object?answertab=votes#tab-top
    function isElement(o) {
      return (
        typeof HTMLElement === "object" ? o instanceof HTMLElement : //DOM2
        o && typeof o === "object" && o !== null && o.nodeType === 1 && typeof o.nodeName === "string"
      );
    }

    function hasChildTmplAttr(el) {
      var i = 0;
      for (; i < childTmplAttrs.length; i++) {
        if (el.hasAttribute(childTmplAttrs[i])) {
          return true;
        }
      }
      return false;
    }

    function removeChildTmplAttrs(el) {
      var i = 0;
      for (; i < childTmplAttrs.length; i++) {
        el.removeAttribute(childTmplAttrs[i]);
      }
    }

    function getTmpl(str) {
      //如果是DOM节点则取outerHTML或者innerHTML
      if (isElement(str)) {
        if (hasChildTmplAttr(str) || str.tagName.toLowerCase() == 'script') {
          var text = str.innerHTML;
          str.innerHTML = '';
          removeChildTmplAttrs(str);
          str = text;
        } else {
          str = str.outerHTML;
        }
      }
      //将模板中所有 micro-(或者micro-template,ntes-,ntes-template)替换为空
      return str && str.toString().replace(/(micro|ntes)-(template)?/g, '');
    }

    //http://ejohn.org/blog/javascript-micro-templating/
    var cache = {};

    function tmpl(str, data) {
      str = getTmpl(str);
      var reg1 = new RegExp('((^|' + outro + ")[^\t]*)'", 'g');
      var reg2 = new RegExp('\t' + (mustache ? '' : '=') + '(.*?)' + outro, 'g');
      var fn = !/\W/.test(str) ? //W大写，可以匹配任何一个字母或者数字或者下划线以外的字符
        cache[str] = cache[str] :
        new Function("obj",
          "var p=[],print=function(){p.push.apply(p,arguments);};"
          + "with(obj){p.push('"
          + str
            .replace(/[\r\t\n]/g, " ") //将"\r\t\n"先替换成" "
            //.split("<%").join("\t") //将模板开始符号"<%"全部替换成"\t"
            .split(intro).join("\t")//--> split("<%").join("\t")
            //.replace(/((^|%>)[^\t]*)'/g, "$1\r") //将将模板结束符号%>全部替换成\r
            .replace(reg1, "$1\r")//--> replace(/((^|%>)[^\t]*)'/g, "$1\r")
            //.replace(/\t=(.*?)%>/g, "',$1,'") //将=与%>之间的变量替换成",变量,"
            .replace(reg2, "',$1,'")//--> replace(/\t=(.*?)%>/g, "',$1,'")
            .split("\t").join("');") //将之前替换的"\t"再替换成");"
            //.split("%>").join("p.push('")
            .split(outro).join("p.push('")//-->split("%>").join("p.push('")
            .split("\r").join("\\'")
          + "');}return p.join('');");
      return data ? fn(data) : fn;
    }

    return tmpl;
  };
  return microTmpl;
});

define('core/Class',['require','exports','module','./Subject'],function (require, exports, module) {
  var Subject = require('./Subject');
  var Class;

  /**
   * @param obj
   * @param config
   * @param promise
   */
  function apply(obj, config, promise) {
    if (config) {
      var attr;
      for (attr in config) {
        obj[attr] = promise ? promise(config[attr]) : config[attr];
      }
    }
  }

  /**
   *
   * @param obj
   * @param config
   * @param promise
   */
  function applyIf(obj, config, promise) {
    if (config) {
      var attr;
      for (attr in config) {
        if (!obj[attr]) {
          obj[attr] = promise ? promise(config[attr]) : config[attr];
        }
      }
    }
  }

  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
  if (!Object.keys) {
    Object.keys = (function() {
      
      var hasOwnProperty = Object.prototype.hasOwnProperty,
        hasDontEnumBug = !({ toString: null }).propertyIsEnumerable('toString'),
        dontEnums = [
          'toString',
          'toLocaleString',
          'valueOf',
          'hasOwnProperty',
          'isPrototypeOf',
          'propertyIsEnumerable',
          'constructor'
        ],
        dontEnumsLength = dontEnums.length;

      return function(obj) {
        if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
          throw new TypeError('Object.keys called on non-object');
        }

        var result = [], prop, i;

        for (prop in obj) {
          if (hasOwnProperty.call(obj, prop)) {
            result.push(prop);
          }
        }

        if (hasDontEnumBug) {
          for (i = 0; i < dontEnumsLength; i++) {
            if (hasOwnProperty.call(obj, dontEnums[i])) {
              result.push(dontEnums[i]);
            }
          }
        }
        return result;
      };
    }());
  }
  //http://stackoverflow.com/a/16788517/479039
  function objectEquals(x, y) {
    if (x === null || x === undefined || y === null || y === undefined) { return x === y; }
    // after this just checking type of one would be enough
    if (x.constructor !== y.constructor) { return false; }
    // if they are functions, they should exactly refer to same one (because of closures)
    if (x instanceof Function) { return x === y; }
    // if they are regexps, they should exactly refer to same one (it is hard to better equality check on current ES)
    if (x instanceof RegExp) { return x === y; }
    if (x === y || x.valueOf() === y.valueOf()) { return true; }
    if (Array.isArray(x) && x.length !== y.length) { return false; }

    // if they are dates, they must had equal valueOf
    if (x instanceof Date) { return false; }

    // if they are strictly equal, they both need to be object at least
    if (!(x instanceof Object)) { return false; }
    if (!(y instanceof Object)) { return false; }

    // recursive object equality check
    var p = Object.keys(x);
    return Object.keys(y).every(function (i) { return p.indexOf(i) !== -1; }) &&
      p.every(function (i) { return objectEquals(x[i], y[i]); });
  }

  /**
   *
   * @param superClass
   * @param subClass
   */
  var extend = (function() {
    var F = function () {
    };
    return function (superClass, subClass) {
      F.prototype = superClass.prototype;
      subClass.prototype = new F();//空函数避免创建超类的新实例(超类可能较庞大或有大量计算)
      subClass.prototype.constructor = subClass;
      subClass.superclass = superClass.prototype;//superclass减少子类与超类之间的偶合
      //http://stackoverflow.com/questions/12691020/why-javascripts-extend-function-has-to-set-objects-prototypes-constructor-pro
      if (superClass.prototype.constructor == Object.prototype.constructor) {
        superClass.prototype.constructor = superClass;
      }
      return subClass;
    }
  })();

  function updateFactory(){
    var lastUpdate = 0,
      _timeout = 1000 * 60 * 5,
      names = {};
    /**
     *
     * @param timeout 时间倍数，默认是1
     * @param name
     * @returns {boolean}
     */
    this.isTimeout = function (timeout,name) {
      timeout = _timeout * (timeout || 1);
      name = name !== undefined?names[name]:lastUpdate;
      return !name || ( (new Date().getTime()) - name > timeout );
    }
    this.update = function (name) {
      var now = new Date().getTime();
      if(name !== undefined){
        if(names[name] === undefined){
          this.reset(name);
        }else{
          names[name] = now;
        }
      }else{
        lastUpdate = now;
      }
    }
    this.reset = function (name) {
      if(name !== undefined){
        names[name] = 0;
      }else{
        lastUpdate = 0;
      }
    }
    this.resetAll = function () {
      names = {};
      lastUpdate = 0;
    }
  }
  /**
   *
   * Model
   *
   *
   * Nested Model:
   * e.g.
   *    var testModel = new Model({
   *           store: new Model({
   *               request: function(){
   *                   console.log('store.request',this);
   *               }
   *           }),
   *           request: function(){
   *               console.log('request',this);
   *           }
   *       });
   *
   *    testModel.updated(function(){
   *           console.log(testModel.get());
   *           testModel.request();
   *       });
   *    testModel.set('1');
   *
   *    testModel.store.updated(function(){
   *           console.log(testModel.store.get());
   *           testModel.store.request();
   *       });
   *    testModel.store.set('2');
   */
  function Model(option) {
    Model.superclass.constructor.call(this);
    this.updated = this.register;
    this.refresh = this.notify;
    this.data;
    apply(this,option);

    //数据缓存更新
    this.updateFactory = updateFactory;
    this.timer = new updateFactory;
  }
  extend(Subject, Model);
  Model.prototype.store = function(storeid,data){
    this._cacheStore = this._cacheStore || {};
    if(data && storeid){
      if(typeof data == 'object' && toString.call(data) != '[object Array]'){
        data.__STORE_ID = storeid;
      }
      this._cacheStore[storeid] = data;
    }
  }
  /**
   *
   * @param data
   * @param storeid ,will cache in store,use getFromStoreById(storeid) to get access it
   * @param diff ,if true,and nothing changed between the new data in the old data,data observers will not got notify
   */
  Model.prototype.set = function (data,storeid,diff) {
    diff = diff && objectEquals(this.data,data);
    this.data = data;
    if(storeid){
      this.store(storeid,data);
    }
    !diff && this.refresh();
    this.timer.update();
  }
  /**
   *
   * @param clone will return a copy of the data
   * @returns {*}
   */
  Model.prototype.get = function (clone) {
    return (clone && typeof this.data=='object')?JSON.parse(JSON.stringify(this.data)):this.data;
  }
  /**
   *
   * @param storeid
   * @param clone ,will return a copy of the data
   * @returns {*|{}}
   */
  Model.prototype.getFromStoreById = function(storeid,clone){
    return storeid
      && this._cacheStore
      && ( (clone && typeof this._cacheStore[storeid]=='object')
        ?JSON.parse(JSON.stringify(this._cacheStore[storeid]))
        :this._cacheStore[storeid]);
  }
  //end Model

  Class = {
    objectEquals: objectEquals,
    apply: apply,
    applyIf: applyIf,
    extend: extend,
    Model: Model
  }
  //end Class

  return Class;
});

define('core/NativeBridge',['require','exports','module','./Navigator'],function (require, exports, module) {
  var Navigator = require('./Navigator');

  /**
   * 与客户端交互
   *
   *    前端与客户端交互的流程主要为前端调用，客户端读取，客户端回调三个步骤：
   *    前端调用客户端规则为：dejafashion://NAME（android 前端调用window.__dejafashion_NAME()）
   *    客户端读取前端的数据规则为 window.__dejafashion_data_NAME，前端返回JSON {default:'',...}
   *    【如果有】客户端处理完逻辑回调前端的方法规则为： window.__dejafashion_after_NAME([json])
   *    拿分享为例:
   *    1 -------> 前端调用dejafashion://share（android 前端调用window.__dejafashion_share()）
   *    2 --------> 客户端接收到请求，向前端读取必要参数window.__dejafashion_data_share
   *    3 ------- >【如果有】 客户端处理完逻辑回调通知前端处理完毕调用window.__dejafashion_after_share([json])
   *    4 ------>前端接收客户端传回来的参数该干嘛干嘛
   *    注意，客户端在调用前端方法之前一定要先做判断，如 window.__dejafashion_after_share && window.__dejafashion_after_share([json])
   *
   */
  function NativeBridge(protocolHandler) {
    var _NB = this,
      global = window,
      emptyFn = function () {
      },
      appUA = (/Deja/ig).test(navigator.userAgent),
      debug = false,
      afterCallbacks = {},
      Protocols = {},
      baseName = 'dejafashion',
      baseProtocol = baseName + '://',
      baseObjName = '__' + baseName,
      baseDataName = baseObjName + '_data_',
      baseBeforeName = baseObjName + '_before_',
      baseAfterName = baseObjName + '_after_',
      baseUpdateDataName = 'set_data_for_',
      baseUpdateBeforeName = 'set_before_for_';

    afterCallbacks = {};
    Protocols = {};


    function enableDebug() {
      debug = true;
    }

    function isApp() {
      return appUA || debug;
    }

    function protocol(action, callback) {
      protocolHandler(action, true);
      //开启调试
      if (debug && callback) {
        var _data = action.match(/[\w]:\/\/(.*)/);
        if(typeof callback=='function'){callback(_data && _data[1]);}
      }
    }

    function afterCallback(rs, callback) {
      callback = callback || emptyFn;
      if(typeof callback=='function'){callback(rs);}
      callback = emptyFn;
    }

    function updateData(name, data) {
      if (data != null && data != undefined) {
        if ( !/object/i.test(typeof data) ) {
          data = {default: data};
        }

        global[baseDataName + name] = data;
      }
    }
    function updateBefore(name, fn) {
      if(/function/i.test(typeof fn) ){
        global[baseBeforeName + name] = fn;
      }else{
        delete global[baseBeforeName + name];
      }
    }

    /**
     * set_data_for_NAME = function(data)
     * @param name
     * @param fn
     */
    function registerUpdateDataFn(name, fn) {
      var updateName = baseUpdateDataName + name;
      _NB[updateName] = fn || function (data) {
          updateData(name, data);
        }
    }

    /**
     * set_before_for_NAME = function(callback)
     * @param name
     */
    function registerBeforeFn(name) {
      var beforeName = baseUpdateBeforeName + name;
      _NB[beforeName] = function (fn) {
        updateBefore(name, fn);
      }
    }

    /**
     * register a native API
     *
     * @param name
     * @param fn
     * @returns {*}
     */
    function registerFn(name, fn) {
      Protocols[name] = baseProtocol + name;
      afterCallbacks[name] = emptyFn;
      global[baseAfterName + name] = function (rs) {
        afterCallback(rs, afterCallbacks[name]);
      }
      registerUpdateDataFn(name);
      _NB[name] = fn
        || function (data, callback, subProtocol) {
          updateData(name, data);
          afterCallbacks[name] = callback;
          if (isApp()) {
            if (global[baseObjName] && global[baseObjName][name]) {
              global[baseObjName][name]();
            } else {
              protocol(Protocols[name] + (subProtocol ? ('/' + subProtocol) : ''), callback);
            }
          }
        };

      return _NB[name];
    }

    /**
     *
     * execute a native API  by it's name
     * if it's not exist then register it and execute it
     *
     * @param name
     */
    function trigger(name){
      var fn = _NB[name],
        args = [].slice.call(arguments,1);
      if(!fn){
        fn = registerFn(name);
      }
      fn.apply(_NB,args);
    }

    this.isApp = isApp;
    this.enableDebug = enableDebug;
    this.trigger = trigger;

    ['userInfo', 'login', 'share', 'modifytitle', 'updateBarButton', 'setBgColor', 'copy','closeweb'].forEach(function (key, index) {
      registerFn(key);
    });

    ['facebook', 'twitter', 'instagram'].forEach(function (key, index) {
      _NB['share_' + key] = function (data, callback) {
        _NB['share'](data, callback, key);
      }
      _NB[baseUpdateDataName + 'share_' + key] = _NB[baseUpdateDataName + 'share'];
    });

    ['unload'].forEach(function (key, index) {
      registerBeforeFn(key);
    });

  }

  return new NativeBridge(Navigator.protocol);
});

define('core/Pubsub',['require','exports','module'],function (require, exports, module) {
  function Pubsub(Subject) {
    var topics = {};

    function subscribe(topic, observer) {
      var subject;
      for (var key in topics) {
        if (key === topic) {
          subject = topics[key];
          break;
        }
      }
      if (!subject) {
        subject = new Subject();
        addTopic(topic, subject);
      }
      subject.register(observer);
      return this;
    }

    function unsubscribe(topic) {
      removeTopic(topic);
      return this;
    }

    function publish(topic) {
      var args = [].slice.call(arguments);
      topics[topic] && topics[topic].notify.apply(topics[topic], args.slice(1));
      return this;
    }

    function addTopic(topic, subject) {
      topics[topic] = subject;
    }

    function removeTopic(topic) {
      delete topics[topic];
    }

    function getTopics() {
      var _topics = [];
      for (var key in topics) {
        (typeof key === 'string') && _topics.push(key);
      }
      return _topics;
    }

    this.getTopics = getTopics;
    this.subscribe = subscribe;
    this.unsubscribe = unsubscribe;
    this.publish = publish;
  }

  return Pubsub;
});

define('core/HashHandler',['require','exports','module'],function (require, exports, module) {
  var HashHandler = (function () {
    var lc = window.location;

    function getByURL(url) {
      var hash;
      url && decodeURIComponent(url).replace(new RegExp('#(.*)', 'g'), function ($1, $2) {
        hash = $2;
      });
      return hash;
    }

    function get() {
      return getByURL(lc.hash);
    }

    function set(hash) {
      lc.hash = hash;
    }

    return {
      get: get,
      set: set,
      getByURL: getByURL
    }
  })();
  return HashHandler;
});

define('core/Router',['require','exports','module','./Pubsub','./Subject','./HashHandler'],function (require, exports, module) {
  var Pubsub = require('./Pubsub');
  var Subject = require('./Subject');
  var HashHandler = require('./HashHandler');

  /**
   *
   * Router 初始化流程：
   * init(withAction) --> onReady 是否注册有 Callback  --> (是)执行所有 Callback (在关键Callback里，手动执行 run 来强制刷新是推荐的）
   *                                                  --> (否)执行 run
   *
   *
   * Hash 变化事件执行流程：
   * Hash变化（或者显示调用 run,forward,back方法） --> 执行 onChanged 注册的所有事件 --> 执行 subscribe 注册的与 Hash 关联的所有事件
   *
   * subscribe 注册的事件回调方法传递参数:
   * actionValue - 当前 action 之后的字符串，如/user/id=1&name=test 对应 action 是 /user/ ，actionValue 是 id=1&name=test
   * request - { action: 当前action字符串,
                   valeu: actionValue,
                   hash: {
                    curHash: String,
                    newHash: String,
                    oldHash: String
                   },
                   query: actionValue的键值对，如 {id:1,name:test}
                 }
   *
   * 本 Router 暂不支持正则表达式
   */
  function Router(Pubsub, HashHandler) {
    var _Router = this,
      subscribe = Pubsub.subscribe,
      android = /Android/gi.test(navigator.userAgent),
      iOS = /(iPad|iPhone|iPod)/gi.test(navigator.userAgent) && !android,
      UN_SUB_NAME = '__UN_SUBSCRIBED_ACTION',
      INIT_HASH_STR = formatHash(HashHandler.get()),
      currentHash,
      currentHashStr = INIT_HASH_STR || UN_SUB_NAME,
      currentQureyStr = '',
      lastActionKey,
      leavePrefix = '__',
      _isFroward = true,
      actionsHistory = [INIT_HASH_STR],
      isReady = false,
      initCallback,
      readyCallbacks = [],
      changedCallbacks = [],
      historyPositions = {},
      historyTitles = {},
      anchorEl;

    //iOS使用pushstate,解决iOS7没有历史的问题
    if (iOS) {
      window.addEventListener('popstate', locationHashChanged, false);
    } else {
      window.addEventListener('hashchange', locationHashChanged, false);
    }

    function getQuery(search) {
      search = search || currentQureyStr || '';
      var fn = function (str, reg) {
        if (str) {
          var data = {};
          str.replace(reg, function ($0, $1, $2, $3) {
            data[$1] = $3;
          });
          return data;
        }
      }
      return fn(search, new RegExp("([^?=&]+)(=([^&]*))?", "g")) || {};
    }

    function formatHash(hash) {
      if (hash) {
        //hash后不能带search值
        hash = hash.replace(/\?.*/g, '');
      }
      return hash;
    }

    function locationHashChanged(e) {
      e && e.preventDefault();
      var args = arguments[0] || {},
        hash;
      hash = {
        curHash: formatHash(HashHandler.get()),
        newHash: formatHash(HashHandler.getByURL(args.newURL)),
        oldHash: formatHash(HashHandler.getByURL(args.oldURL))
      }
      setHistoryPosition();
      setHistoryTitle();
      currentHash = hash;
      currentHashStr = hash.curHash || UN_SUB_NAME;
      setLastAction(hash.curHash);
      initCallback && initCallback(hash.curHash, hash);
      if (isReady) {
        doChanged(hash.curHash, hash);
        dispatch(hash);
      }
      hash.curHash && addAnchor(hash.curHash);
      return false;
    }

    function dispatch(hash) {
      var topics = Pubsub.getTopics(),
        published = false;
      if (hash.curHash !== undefined) {
        for (var i = 0; i < topics.length; i++) {
          var key = topics[i];
          if (key !== UN_SUB_NAME) {
            hash.curHash.replace(new RegExp('^'+key + '(.*)', 'g'), function ($1, $2) {
              if ($1) {
                currentQureyStr = $2;
                published = true;
                lastActionKey = key;
                restoreHistoryTitle();

                Pubsub.publish(key, {
                  action: key,
                  param: $2,
                  hash: hash,
                  query: getQuery($2)
                });
              }
            });
          }
        }
      }
      if (!published) {
        lastActionKey = UN_SUB_NAME;
        currentQureyStr = hash.curHash;
        restoreHistoryTitle();

        Pubsub.publish(UN_SUB_NAME, {
          action: hash.curHash,
          param: hash.curHash,
          hash: hash,
          query: getQuery(hash.curHash)
        });
      }
    }

    /**
     * 手动初始化
     * 如在onReady里注册了很多的callback，可以通过此方法手动初始化它们
     * 如果带上 withAction 可实现：
     *      在所有主题被订阅之前，在页面首次加载之初，初始化一个与源hash不同且暂未被订阅的主题,最终仍然跳转到源hash
     *
     * 此方法并不是必要的
     * @param {String} withAction 初始化的action
     */
    function init(withAction) {
      if ((withAction === null) || (withAction === undefined) || (withAction === '' )) {
        ready();
      } else {
        //注意原初始化的action不应该包含在将初始化的hash里
        var reg = new RegExp('^' + withAction + '(.*)', 'i');
        if (INIT_HASH_STR && !reg.test(INIT_HASH_STR)) {
          initCallback = function (curHash) {
            if (curHash === INIT_HASH_STR) {
              initCallback = null;
              setTimeout(function () {
                ready();
              },0);
            } else if (curHash === withAction) {
              forward(INIT_HASH_STR);
            }
          };
          forward(withAction);
        } else {
          ready();
        }
      }
      return Pubsub;
    }

    /**
     * 强制刷新
     * 在无需引起 hash 变化情况下，强制执行与当前 hash 关联的所有主题一次
     * 流程：
     * 执行 onChanged 注册的所有事件 --> 执行 subscribe 注册的与 Hash 关联的所有事件
     * 如果：action 不为空，则仅执行 subscribe 注册的与 action 关联的所有事件
     * @param action {Array}|{String}
     * @returns {Pubsub}
     */
    function run(action) {
      action?
        Pubsub.publish(action, {
          action: action,
          param: currentQureyStr,
          hash: currentHash,
          query: getQuery()
        })
        :locationHashChanged();
      return Pubsub;
    }

    /**
     * 订阅所有没有被注册的主题
     * @param {Object} observer
     */
    function onUnsubscribed(enterObserver,leaveObserver) {
      onSubscribe(UN_SUB_NAME,enterObserver,leaveObserver);
      return Pubsub;
    }
    /**
     * 订阅所有没有被注册的主题
     * @param action {Array}|{String}
     * @param {Object} observer
     * @param {Object} observer
     */
    function onSubscribe(action,enterObserver,leaveObserver) {
      subscribe.call(Pubsub,action, enterObserver);
      leaveObserver && subscribe.call(Pubsub,leavePrefix+action, leaveObserver);
      return Pubsub;
    }

    /**
     * 当hash发生变化时触发,会先于所有订阅的主题触发
     */
    function onChanged(callback) {
      if (typeof callback === 'function') {
        changedCallbacks.push(callback);
      }
      return Pubsub;
    }

    /**
     * 手动执行init方法会执行通过此方法注册的所有callback方法
     * @param callback
     */
    function onReady(callback) {
      if (typeof callback === 'function') {
        readyCallbacks.push(callback);
      }
      return Pubsub;
    }

    function ready() {
      isReady = true;
      //如果 onReady 方法中有回调则执行回调
      //注意，onReady 的回调里需要有且仅有一个要显示调用 run 来强制执行所有主题的调回
      if (readyCallbacks.length) {
        while (readyCallbacks.length) {
          readyCallbacks.shift().call(_Router, Pubsub)
        }
      }
      //否则自动强制执行所有主题
      else {
        run();
      }
    }

    function doChanged() {
      var i = 0,
        l = changedCallbacks.length;
      for (; i < l; i++) {
        changedCallbacks[i].apply(undefined, arguments);
      }
      lastActionKey && Pubsub.publish(leavePrefix+lastActionKey);
    }

    /**
     * 跳转到一个指定的主题
     * @param {String}|{Number} action
     */
    function forward(action) {
      _isFroward = true;
      if (action === null) {
        window.history.forward();
      } else if (typeof action === 'number') {
        if (action == -1) {
          _isFroward = false;
        }
        window.history.go(action);
      } else if (typeof action === 'string') {
        if (iOS) {
          window.history.pushState(null, null, '#' + action);
          run();
        } else {
          HashHandler.set(action);
        }
      }
      return Pubsub;
    }

    /**
     * 返回上一主题
     * action仅在解决当不确实是否有浏览历史，并且又需要跳转到一个指定的hash值时
     * 优先级是： 浏览器历史 > actionsHistory > action
     * @param {String}|{Number} action
     */
    function back(action) {
      var ac = getLastAction() || action || -1;
      //如果浏览器有历史则走历史
      if (window.history.length > 1) {
        ac = -1;
      }
      forward(ac);
      return Pubsub;
    }

    function setLastAction(action) {
      var ac = [].concat.call(actionsHistory).pop();
      if (ac != action) {
        actionsHistory.push(action);
      }
    }

    function getLastAction() {
      //pop两次是因为最后一次是当前的
      actionsHistory.pop();
      return actionsHistory.pop();
    }

    function setFirstAction(action) {
      var ac = [].concat.call(actionsHistory).shift();
      if (ac != action) {
        actionsHistory.unshift(action);
      }
    }

    function getFirstAction() {
      return actionsHistory.shift();
    }

    function isFroward() {
      return _isFroward;
    }

    /**
     * 解决历史滚动位置记录的问题，保证视图切换总在最顶部
     * @param id
     */
    function addAnchor(id) {
      return;//暂停使用

      if(!anchorEl){
        var st = document.createElement('style');
        anchorEl = document.createElement('div');
        st.innerText = '.Router-anchor{position: fixed; top: 0; left: 0;}';
        anchorEl.className = 'Router-anchor';
        document.body.appendChild(st);
        document.body.appendChild(anchorEl);
      }

      var cd = document.createElement('div'),
        od = document.getElementById(id);
      cd.id = id;
      anchorEl.appendChild(cd);
      if (od) {
        anchorEl.removeChild(od);
      }
    }

    /**
     * 校验是否存在与当前的 action 匹配的 action
     * @param action {Array}|{String}
     * @returns {boolean}
     */
    function actionMatch(expected, actual) {
      var ac = [], i = 0, l;
      if (typeof expected === 'string') {
        ac.push(expected)
      } else if (toString.call(expected) == '[object Array]') {
        ac = ac.concat(expected)
      }
      l = ac.length;
      for (; i < l; i++) {
        if ((new RegExp('^' + ac[i] + '(.*)', 'i')).test(actual)) {
          return true;
        }
      }
      return false;
    }
    /**
     * 校验是否存在与当前的 action 匹配的 action
     * @param action {Array}|{String}
     * @returns {boolean}
     */
    function currentMatch(action) {
      return actionMatch(action,currentHashStr || UN_SUB_NAME);
    }
    /**
     * 校验是否存在与上一个 action 匹配的 action
     * @param action {Array}|{String}
     * @returns {boolean}
     */
    function lastMatch(action) {
      var last = [].concat.call(actionsHistory);
      last.pop();
      return actionMatch(action,last.pop() || UN_SUB_NAME);
    }

    function setHistoryPosition(id,position){
      id = id || currentHashStr;
      if(id){
        historyPositions[id] = position || window.pageYOffset || window.scrollY || document.body.scrollTop;
      }
    }

    function getHistoryPosition(id){
      id = id || currentHashStr;
      return id && historyPositions[id];
    }

    function scrollToHistoryPosition(id){
      window.scrollTo(0,getHistoryPosition(id)||1);
      setHistoryPosition(id,0);
    }

    function setHistoryTitle(id,title){
      id = id || currentHashStr;
      if(id){
        historyTitles[id] = title || document.title;
      }
    }

    function getHistoryTitle(id){
      id = id || currentHashStr;
      return id && historyTitles[id];
    }

    function restoreHistoryTitle(id){
      var title = getHistoryTitle(id);
      if(title){
        document.title = title;
      }
    }

    Pubsub.initHash = INIT_HASH_STR;
    Pubsub.init = init;
    Pubsub.run = run;
    Pubsub.forward = forward;
    Pubsub.back = back;
    Pubsub.isFroward = isFroward;
    Pubsub.currentMatch = currentMatch;
    Pubsub.lastMatch = lastMatch;
    Pubsub.onReady = onReady;
    Pubsub.onChanged = onChanged;
    Pubsub.subscribe = onSubscribe;
    Pubsub.onUnsubscribed = onUnsubscribed;
    Pubsub.getQuery = getQuery;
    Pubsub.getHistoryPosition = getHistoryPosition;
    Pubsub.scrollToHistoryPosition = scrollToHistoryPosition;
    Pubsub.getHistoryTitle = getHistoryTitle;
    Pubsub.getUnsubscribedAction = function () {
      return UN_SUB_NAME;
    };


    return Pubsub;
  }

  return Router(new Pubsub(Subject), HashHandler);
});

define('core/Event',['require','exports','module','./Class','./Pubsub','./Subject'],function (require, exports, module) {
  var Class = require('./Class');
  var Pubsub = require('./Pubsub');
  var Subject = require('./Subject');


  function Event(Subject) {
    Event.superclass.constructor.call(this, Subject);
    this.on = this.subscribe;
    this.off = this.unsubscribe;
    this.trigger = this.publish;
  }

  Class.extend(Pubsub, Event);
  return new Event(Subject);
});

define('util/LocalStorage',['require','exports','module'],function (require, exports, module) {

  function localStorage() {
    var lcst = window.localStorage;

    /**
     * 读取
     *
     * @method getLocalValue
     * @param {String} id item id
     * @return {String} value
     */
    function getLocalValue(id) {
      if (lcst) {
        return lcst[id];
      } else {
        return null;
      }
    }

    /**
     * 保存/更新
     *
     * @method setLocalValue
     * @param {String}|{Object} id item id
     * @param {String} val value
     */
    function setLocalValue(id, val) {
      if (lcst) {
        if (typeof id === 'object') {
          for (var key in id) {
            try{id[key] && lcst.setItem(key, id[key]);}catch(err){}
          }
        } else {
          try{lcst.setItem(id, val);}catch(err){}
        }
      }
      return this;
    }

    /**
     * 删除
     * @param {Array}||{String} id
     */
    function removeLocalValue(id) {
      if (lcst) {
        if (typeof id === 'object') {
          for (var key in id) {
            try{lcst.removeItem(id[key]);}catch(err){}
          }
        } else {
          try{lcst.removeItem(id);}catch(err){}
        }
      }
      return this;
    }

    this.set = setLocalValue;
    this.get = getLocalValue;
    this.del = removeLocalValue;
  }

  return new localStorage;
});

define('util/LocalHost',['require','exports','module'],function (require, exports, module) {
  if (!window.location.origin) {
    window.location.origin = window.location.protocol
      + "//" + window.location.hostname
      + (window.location.port ? ':' + window.location.port : '');
  }
  return window.location.origin;
});

define('util/LocalParam',['require','exports','module'],function (require, exports, module) {
  /**
   * window.location.search
   * window.location.hash
   */
  function localParam(search, hash) {
    search = search || window.location.search;
    hash = hash || window.location.hash;
    var fn = function (str, reg) {
      if (str) {
        var data = {};
        str.replace(reg, function ($0, $1, $2, $3) {
          data[$1] = $3;
        });
        return data;
      }
    }
    return {
      search: fn(search, new RegExp("([^?=&]+)(=([^&]*))?", "g")) || {},
      hash: fn(hash, new RegExp("([^#=&]+)(=([^&]*))?", "g")) || {}
    };
  }

  return localParam;
});

define('util/MetaHandler',['require','exports','module'],function(require, exports, module) {

  var ua = navigator.userAgent,
    android = ua.match(/(Android);?[\s\/]+([\d.]+)?/),
    ipad = ua.match(/(iPad).*OS\s([\d_]+)/),
    ipod = ua.match(/(iPod)(.*OS\s([\d_]+))?/),
    iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/),
    os = {};

  if (android) os.android = true, os.version = android[2];
  if (iphone && !ipod) os.ios = os.iphone = true, os.version = iphone[2].replace(/_/g, '.')
  if (ipad) os.ios = os.ipad = true, os.version = ipad[2].replace(/_/g, '.')
  if (ipod) os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].replace(/_/g, '.') : null;

  var MetaHandler = function(){
    //MONOSTATE
    if(MetaHandler.prototype.instance){
      return MetaHandler.prototype.instance;
    }
    var me = this;
    var meta = {},_els;

    /**
     * _els
     * meta = {name:{content:String,seriation:Array,store:{property:String},...},...}
     * @method init
     */
    function init(){
      _els = document.getElementsByTagName('meta');
      for(var i=0;i<_els.length;i++){
        var name = _els[i].name;
        if(name){
          meta[name] = {};
          meta[name].el = _els[i];
          meta[name].content = _els[i].content;
          meta[name].seriation = meta[name].content.split(',');
          meta[name].store = getContentStore(name);
        }
      }
      return me;
    }
    function getContentStore(name){
      var content = meta[name].seriation,store = {};
      for(var i=0;i<content.length;i++){
        if(content[i].length<1){
          content[i] = null;
          delete content[i];
          content.length--;
        }else{
          var ct = content[i].split('='),
            pp = ct[0];
          if(pp){
            store[pp] = ct[1];
          }
        }
      }
      return store;
    }
    this.hasMeta = function(name){
      return meta[name]?1:0;
    }
    this.createMeta = function(name){
      if(!this.hasMeta(name)){
        var el = document.createElement('meta');
        el.name = name;
        document.head.appendChild(el);
        meta[name] = {};
        meta[name].el = el;
        meta[name].content = '';
        meta[name].seriation = [];
        meta[name].store = {};
      }
      return me;
    }
    this.setContent = function(name,value){
      meta[name].content = value;
      meta[name].el.content = value;
      return me;
    }
    this.getContent = function(name){
      return meta[name] && meta[name].content;
    }
    function updateContent(name){
      meta[name].content = meta[name].seriation.join(',');
      me.setContent(name,meta[name].content);
      return me;
    }
    this.removeContentProperty = function(name,property){
      var _property = property;
      if(meta[name]){
        if(meta[name].store[_property]!=null){
          for(var i = 0;i<meta[name].seriation.length;i++){
            if(meta[name].seriation[i].indexOf(property+'=')!=-1){
              meta[name].seriation[i] = null;
              delete meta[name].seriation[i];
              break;
            }
          }
        }
        updateContent(name);
      }
      return me;
    }
    this.getContentProperty = function(name,property){
      return meta[name] && meta[name].store[property];
    }
    this.setContentProperty = function(name,property,value){
      var _property = property,
        pv = property+'='+value;
      if(meta[name]){
        if(meta[name].store[_property]!=null){
          meta[name].store[_property] = value;
          for(var i = 0;i<meta[name].seriation.length;i++){
            if(meta[name].seriation[i].indexOf(property+'=')!=-1){
              meta[name].seriation[i] = pv;
              break;
            }
          }
        }else{
          meta[name].store[_property] = value;
          meta[name].seriation.push(pv);
        }
        updateContent(name);
      }
      return me;
    }

    /**
     * Automatically adjusts according to a device’s screen size.
     * Base on [theory](https://www.icloud.com/keynote/AwBWCAESEJd5uucfBPGt6KPotb3tNfsaKm-Q7fqs2-4ojmPoPJuWZCvjYgKl5jEf1URdRgdgNHe38BTzeF3DK7q1ewMCUCAQEEIJ85mw21ii_AwybOqxoF-V02v51Vdg855ED4qVA_8bXr)
     *
     * Note:
     *  For iOS it just works perfectly,if it's not,try to use "webView.scalesPageToFit = YES" in the webview.
     *  For android it works in all of build-in broswers,it might be break in some third-part ROM's build-in broswers(webview).
     *  That's because they don't do a good job for the webview,such as they should not use "webview.setBuiltInZoomControls(false)".
     *
     *  This is a painless solution.For more extra work,checkout the [REM solution](http://gregrickaby.com/using-the-golden-ratio-and-rems/).
     *
     * e.g.
     *     <head>
     *      ....
     *      <!-- defind the viewport meta -->
     *      <meta content="target-densitydpi=device-dpi,width=640" name="viewport">
     *      <!-- set the body's width to be the same as the viewport's width -->
     *      <style type="text/css">
     *           body{width: 640px;}
     *      </style>
     *      <!-- magic happens here -->
     *      <script> (new MetaHandler()).fixViewportWidth(); </script>
     *     </head>
     *
     * Demo:
     * [NetEase newsapp member club](http://c.3g.163.com/CreditMarket/default.html)
     * [Deja Fashion topic](http://m.deja.me/topics/#/special/9)
     *
     * @param width {number} the size of the viewport
     * @param fixBody {boolean} force to set body's width as same as the size of the viewport
     */
    this.fixViewportWidth = function(width,fixBody){
      width = width || me.getContentProperty('viewport','width');
      if(width != 'device-width'){
        var iw = window.innerWidth || width,
          ow = window.outerWidth || iw,
          sw = window.screen.width || iw,
          saw = window.screen.availWidth || iw,
          ih = window.innerHeight || width,
          oh = window.outerHeight || ih,
          sh = window.screen.height || ih,
          sah = window.screen.availHeight || ih,
          w = Math.min(iw,ow,sw,saw,ih,oh,sh,sah),
          ratio = w/width,
          dpr = window.devicePixelRatio;
        ratio = Math.min(ratio,dpr);

        //fixBody may trigger a reflow,you should not use it if you could do it in your css
        if(fixBody){
          document.body.style.width = width+'px';
        }

        if(os.android){
          me.removeContentProperty('viewport','user-scalable')
            .setContentProperty('viewport','target-densitydpi','device-dpi')
            .setContentProperty('viewport','initial-scale',ratio)
            .setContentProperty('viewport','maximum-scale',ratio);
        }else if(os.ios && !os.android){
          me.setContentProperty('viewport','user-scalable','no');
          if(os.ios && parseInt(os.version)<7){
            me.setContentProperty('viewport','initial-scale',ratio);
          }
        }
      }
    }
    init();
    //MONOSTATE
    MetaHandler.prototype.instance = this;
  };

  return new MetaHandler;
});

define('util/RequestHandler',['require','exports','module'],function (require, exports, module) {
  var RequestHandler = (function () {
    /**
     * AJAX管理器
     *
     * @param Object option
     * option:{
         *  type : String 请求类型POST/GET
         *  dataType : String 数据解析类型
         *  action :String 请求action
         *  data : Object 请求参数
         *  complete :Function 完毕回调方法
         * }
     * @method AJAXHandler
     */
    function AJAXHandler(option) {
      if (!option) {
        return;
      }
      var conf = {};
      for(var name in option) conf[name]=option[name];
      conf.url = conf.action || conf.url;
      conf.data = conf.data || null;
      delete conf.complete;
      delete conf.action;
      conf.success = function (data, status, xhr) {
        if (option.complete && typeof option.complete === 'function') {
          option.complete({
            data: data,
            success: true
          });
        }
      };
      conf.error = function (xhr, errorType, error) {
        if (option.complete && typeof option.complete === 'function') {
          option.complete({
            success: false
          });
        }
      };
      $.ajax(conf);
    }//end AJAXHandler
    function JSONP(option) {
      if (!option) {
        return;
      }
      $.ajax({
        type: 'GET',
        url: option.action||option.url,
        dataType: 'jsonp',
        jsonp: false,
        jsonpCallback: false,
        contentType: "application/json",
        data: option.data || null//空值设置null避免向后端发送undefined无用参数
      });
    }

    function getJSON(option) {
      if (!option) {
        return;
      }
      option.type = 'GET';
      option.dataType = 'json';
      AJAXHandler(option);
    }//end getJSON

    function postJSON(option) {
      if (!option) {
        return;
      }
      option.type = 'POST';
      option.dataType = 'json';
      AJAXHandler(option);
    }//end postJSON
    return {
      getJSON: getJSON,
      postJSON: postJSON,
      JSONP: JSONP
    }
  })();
  return RequestHandler;
});

define('util/versionCompare',['require','exports','module'],function (require, exports, module) {
  /**
   * Simply compares two string version values.
   * https://gist.github.com/alexey-bass/1115557
   *
   * Example:
   * versionCompare('1.1', '1.2') => -1
   * versionCompare('1.1', '1.1') =>  0
   * versionCompare('1.2', '1.1') =>  1
   * versionCompare('2.23.3', '2.22.3') => 1
   *
   * Returns:
   * -1 = left is LOWER than right
   *  0 = they are equal
   *  1 = left is GREATER = right is LOWER
   *  And FALSE if one of input versions are not valid
   *
   * @function
   * @param {String} left  Version #1
   * @param {String} right Version #2
   * @return {Integer|Boolean}
   * @author Alexey Bass (albass)
   * @since 2011-07-14
   */
  var versionCompare = function (left, right) {
    if (typeof left + typeof right != 'stringstring')
      return false;

    var a = left.split('.')
      , b = right.split('.')
      , i = 0, len = Math.max(a.length, b.length);

    for (; i < len; i++) {
      if ((a[i] && !b[i] && parseInt(a[i]) > 0) || (parseInt(a[i]) > parseInt(b[i]))) {
        return 1;
      } else if ((b[i] && !a[i] && parseInt(b[i]) > 0) || (parseInt(a[i]) < parseInt(b[i]))) {
        return -1;
      }
    }

    return 0;
  }

  return versionCompare;
});

define('util/FormHandler',['require','exports','module','core/Navigator'],function(require, exports, module) {

  var Navigator = require('core/Navigator');

  var FormHandler = function(){
    //MONOSTATE
    if(FormHandler.prototype.instance){
      return FormHandler.prototype.instance;
    }
    var _this = this;

    function getForm(method){
      var _form = document.createElement('form');
      _form.setAttribute("style", "display:none;width:0;height:0;position: absolute;top:0;left:0;border:0;");
      _form.setAttribute("method",method || 'POST');
      return _form;
    }

    this.asyncSubmit = function(action,data){
      this.submit(action,data,true);
    }

    this.submit = function(action,data,async){
      var target,
        frame,
        form = getForm(),
        inputs = [],
        itpl = '<input type="text" name="{N}" value="{V}" />';

      if(async){
        target = '__formhandler_'+new Date().getTime();
        frame = Navigator.getFrame(null,target);
        form.setAttribute('target', target);
        setTimeout(function(){
          Navigator.removeFrame(frame);
        },120000);
      }

      form.setAttribute('action', action);
      data = data || {};
      for(var key in data){
        inputs.push( itpl.replace('{N}',key).replace('{V}',data[key]) );
      }
      form.innerHTML = inputs.join('');
      action && setTimeout(function(){
        form.submit();
      },100);
    }

    //MONOSTATE
    FormHandler.prototype.instance = this;
  };

  return new FormHandler;
});

define('util/RandomList',['require','exports','module'],function (require, exports, module) {
  /**
   * 随机数组
   */
  function randomList(list, len, verify, ratio) {
    var rs = [], _list = list.slice(0);
    len = len || _list.length;
    ratio = ratio ? ratio : 0;
    function rd(_array) {
      _array = _array.sort(function () {
        return (0.5 - Math.random());
      });
    }

    while (ratio) {
      rd(_list);
      ratio--;
    }
    if (_list.length <= len) {
      rs = _list;
    } else {
      while (rs.length < len) {
        var index = Math.floor(Math.random() * _list.length),
          item = _list[index];
        if (( verify && verify.call(this, item, _list) ) || !verify) {
          rs.push(item);
          _list.splice(index, 1);
        }
      }
    }
    return rs;
  }

  return randomList;
});

define('util/Number',['require','exports','module'],function (require, exports, module) {
  function formatMoney(num) {
    return (num).toFixed(2).replace(/./g, function (c, i, a) {
      return i && c !== "." && !((a.length - i) % 3) ? ',' + c : c;
    });
  }

  /**
   * count down and increase number
   * @param option = {
   *  el,dest,rate,duration
   * }
   */
  function countNum(option){
    option = option || {};
    if(!option.el){return ;}

    var total = option.dest || 0,
      rate = option.rate || 50,
      duration = option.duration || 1500,
      totalEl = option.el,
      curNum = parseInt(totalEl.innerHTML)||0,
      increase = Math.round(Math.abs(curNum-total)/(duration/rate))||1,
      countDown = curNum>total;
    function fn(){
      if( (!countDown && curNum>=total) || (countDown && curNum<=total) ){
        totalEl.innerHTML = total;
      }else{
        totalEl.innerHTML = curNum;
        curNum += countDown?(-increase):increase;
        setTimeout(fn,rate);
      }
    }
    fn();
  }

  return {
    formatMoney: formatMoney,
    countNum: countNum
  }
});

define('util/DateHandler',['require','exports','module'],function (require, exports, module) {
  var DateHandler = (function () {
    function getStrDate(str) {
      var date;
      if (typeof str === 'string') {
        var arr = str.split(/[- :]/);
        date = new Date(arr[0], arr[1] - 1, arr[2], arr[3] || 00, arr[4] || 00, arr[5] || 00);
      }
      return date;
    }

    function dbl00(num) {
      return num < 10 ? '0' + num : num;
    }

    function getMeta(date) {
      if (!date) {
        return null;
      }
      var YYYY = date.getFullYear(),
        MM = date.getMonth(),
        DD = date.getDate(),
        hh = date.getHours(),
        mm = date.getMinutes(),
        ss = date.getSeconds();
      return {
        year: YYYY,
        month: dbl00(MM + 1),
        day: dbl00(DD),
        hour: dbl00(hh),
        minute: dbl00(mm),
        second: dbl00(ss)
      }
    }

    function formatStr(str) {
      var date = getStrDate(str);
      return getMeta(date);
    }

    function fromNowTo(date) {
      if (!date) {
        return null;
      }
      var _date;
      if (typeof date === 'string') {
        _date = getStrDate(date);
      } else if (typeof date === 'number') {
        _date = new Date(date);
      } else if (date.getTime) {
        _date = date;
      }
      if (!_date) {
        return null;
      }
      var old = _date.getTime(),
        cur = new Date().getTime(),
        diff = Math.abs(cur - old),
        day = Math.floor(diff / (24 * 60 * 60 * 1000)),
        hour = Math.floor((diff - (day * 24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
        minute = Math.floor((diff - (hour * 60 * 60 * 1000) - (day * 24 * 60 * 60 * 1000)) / (60 * 1000)),
        second = Math.floor((diff - (hour * 60 * 60 * 1000) - (day * 24 * 60 * 60 * 1000) - (minute * 60 * 1000)) / 1000);
      return {
        day: dbl00(day),
        hour: dbl00(hour),
        minute: dbl00(minute),
        second: dbl00(second)
      }
    }

    function timeLogFromNowTo(date) {
      var _date = fromNowTo(date);
      if (!_date) {
        return null
      }
      var day = parseInt(_date.day),
        hou = parseInt(_date.hour),
        min = parseInt(_date.minute);
      if (day > 0) {
        return day + ' days ago';
      } else if (hou > 0) {
        return hou + ' hours ago';
      } else if (min >= 3) {
        return min + ' mins ago';
      } else {
        return 'just now';
      }
    }

    function getDaysInMonth(y, m) {
      return /8|3|5|10/.test(--m) ? 30 : m == 1 ? (!(y % 4) && y % 100) || !(y % 400) ? 29 : 28 : 31;
    }

    return {
      getStrDate: getStrDate,
      getMeta: getMeta,
      formatStr: formatStr,
      fromNowTo: fromNowTo,
      timeLogFromNowTo: timeLogFromNowTo,
      getDaysInMonth: getDaysInMonth
    }
  }());

  return DateHandler;
});

define('lib/Core',['require','exports','module','util/RequestAnimationFrame','util/Easing','util/Unveil','util/VirtualDOMLite','core/Navigator','core/Subject','core/MicroTmpl','core/Class','core/NativeBridge','core/Router','core/HashHandler','core/Event','util/LocalStorage','util/LocalHost','util/LocalParam','util/MetaHandler','util/RequestHandler','util/versionCompare','util/FormHandler','util/RandomList','util/Number','util/DateHandler'],function (require, exports, module) {
  require('util/RequestAnimationFrame');
  require('util/Easing');
  require('util/Unveil');
  require('util/VirtualDOMLite');

  var Navigator = require('core/Navigator');
  var Subject = require('core/Subject');
  var MicroTmpl = require('core/MicroTmpl');
  var Class = require('core/Class');
  var NativeBridge = require('core/NativeBridge');
  var Router = require('core/Router');
  var HashHandler = require('core/HashHandler');
  var Event = require('core/Event');

  var localStorage = require('util/LocalStorage');
  var LocalHost = require('util/LocalHost');
  var localParam = require('util/LocalParam');
  var MetaHandler = require('util/MetaHandler');
  var RequestHandler = require('util/RequestHandler');
  var versionCompare = require('util/versionCompare');
  var FormHandler = require('util/FormHandler');

  var randomList = require('util/RandomList');
  var Num = require('util/Number');
  var DateHandler = require('util/DateHandler');

  var Core = {
    localStorage: localStorage,
    localHost: LocalHost,
    localParam: localParam,
    Navigator: Navigator,
    MetaHandler: MetaHandler,
    Subject: Subject,
    microTmpl: MicroTmpl(),
    Class: Class,
    extend: Class.extend,
    HashHandler: HashHandler,
    RequestHandler: RequestHandler,
    NativeBridge: NativeBridge,
    versionCompare: versionCompare,
    FormHandler: FormHandler,
    Event: Event,
    Router: Router,

    Num: Num,
    randomList: randomList,
    DateHandler: DateHandler
  };

  //enable debug model
  if (localParam().search['debug'] == 1) {
    Core.NativeBridge.enableDebug();
  }
  window.Core = Core;
  return Core;
});

define('app/resources/Actions',['require','exports','module'],function (require, exports, module) {
  var thisPage = window.location.href
    //注意，保留search 是为了避免微信自动追加的应用检测状态值
    //.replace(window.location.search,'')
    .replace(window.location.hash, '');
  var thisPath = thisPage.substring(0, thisPage.lastIndexOf('/') + 1);

  ///*official
  var Actions = {
    login: Core.localHost + '/account/login_third?pf={PF}&success={SURL}&fail={FURL}',
    profile: Core.localHost + '/account/h5_info?tags=followers,product_likes,creation_likes,user_info',
    follow: Core.localHost + '/follow/sync',

    homeBanner: Core.localHost +'/config/banner',

    eventlist: Core.localHost + '/event/list/',
    eventinfo: Core.localHost + '/event/infos/',

    vote: Core.localHost + '/vote/get_random_single?limit=20',
    doVote: Core.localHost + '/vote/single_vote',

    getBFC: Core.localHost + '/j4u/get_bfc',
    updateBFC: Core.localHost + '/j4u/update_bfc',
    faceResult: Core.localHost + '/face/result',

    fashionista: Core.localHost + '/fashionista/get_list',
    ambassador: Core.localHost + '/fashionista/get_ambassador_detail',

    creation: Core.localHost + '/creation/h5_get_multi',
    likeCreation: Core.localHost + '/creation/h5_like',
    delCreation: Core.localHost + '/creation/h5_delete',

    product: Core.localHost + '/products/get_product_display_info',
    likeProduct: Core.localHost + '/favorite/sync',
    specialProducts: Core.localHost + '/products/get_special',

    checkout: Core.localHost + '/order/direct_checkout',
    checkoutFromCart: Core.localHost + '/cart/checkout',
    updateDeliverInfo: Core.localHost + '/order/update_deliver_info',
    promotionCode: Core.localHost + '/order/apply_code',

    placeOrder: Core.localHost + '/order/place_order',
    rePlaceOrder: Core.localHost + '/order/try_again_place_order',
    orderHistory: Core.localHost + '/order/get_order_history',
    orderDetail: Core.localHost + '/order/get_order_detail_info',
    reOrderPlaceOrder: Core.localHost + '/order/reorder_place_order',

    cartInfo: Core.localHost + '/cart/get_cart_info',
    addToCart: Core.localHost + '/cart/add_item',
    deleteCartItem: Core.localHost + '/cart/delete_item',
    updateCartItem: Core.localHost + '/cart/update_item',

    addressBook: Core.localHost + '/order/address/get',
    addAddress: Core.localHost + '/order/address/add',
    updateAddress: Core.localHost + '/order/address/update',
    delAddress: Core.localHost + '/order/address/delete',

    sceneCategory: Core.localHost +'/config/get',
    sceneDetail: Core.localHost + '/style/get_fp_scenedetail',
    sceneProducts: Core.localHost + '/style/get_fp_product',

    myStyle: Core.localHost + '',
    likedItemProducts: Core.localHost + '',

    userProfile: '',
    userStyle: '',



    dejame: 'http://deja.me/u/XPKab9',
    main: thisPath,
    analytics: thisPath + 'analytics.html',
    dejaAppAndroid: 'http://deja.me/u/XPKab9',
    dejaAppIos: 'http://deja.me/u/fzb1KO',
    dejaDwonloadBridge: 'http://m.deja.me/bridge/',
    dejaShareLogo: thisPath + 'resources/images/deja_icon_ios_228.png',
    dejaUserAvatar: thisPath + 'resources/images/pic_avatar_setting_default_2x.png',
    dejafashionSchema: 'dejafashion://'
  }
  //*/

  ///_DEBUG_*Todo: debug actions
  var Actions = {
    login: Core.localHost + '/account/login_third?success={SURL}&fail={FURL}&pf={PF}',
    profile: 'data/profile.json',
    follow: 'data/follow.json',

    homeBanner: 'data/homebanner.json',

    eventlist: 'data/eventlist.json',
    eventinfo: 'data/eventinfo.json',

    vote: 'data/vote.json',
    doVote: 'data/vote.json',

    getBFC: 'data/getbfc.json',
    updateBFC: 'data/updatebfc.json',
    faceResult: 'data/faceresult.json',

    fashionista: 'data/fashionista.json',
    ambassador: 'data/ambassador.json',

    creation: 'data/creation.json',
    likeCreation: 'data/likecreation.json',
    delCreation: 'data/delcreation.json',

    product: 'data/product.json',
    likeProduct: 'data/likeproduct.json',
    specialProducts: 'data/specialproduct.json',

    checkout: 'data/checkout.json',
    checkoutFromCart: 'data/checkoutfromcart.json',
    updateDeliverInfo: 'data/updatedeliverinfo.json',
    promotionCode: 'data/promotioncode.json',

    placeOrder: thisPath+'placeorder.html',
    rePlaceOrder: thisPath+'placeorder.html',
    orderHistory: 'data/orderhistory.json',
    orderDetail: 'data/orderdetail.json',
    reOrderPlaceOrder: 'data/reorderplaceorder.json',

    cartInfo: 'data/cart.json',
    addToCart: 'data/addtocart.json',
    deleteCartItem: 'data/deletecartitem.json',
    updateCartItem: 'data/updatecartitem.json',

    addressBook: 'data/addressbook.json',
    addAddress: 'data/addaddress.json',
    updateAddress: 'data/updateaddress.json',
    delAddress: 'data/deladdress.json',

    sceneCategory: 'data/scenecategory.json',
    sceneDetail: 'data/scenedetail.json',
    sceneProducts: 'data/sceneproducts.json',

    myStyle: 'data/mystyle.json',
    likedItemProducts: 'data/sceneproducts.json',

    userInfo: 'data/user.json',//User info:http://api.dejafashion.com/account/infos?ids=10401&invoker_uid=10070
    userStyle: 'data/userstyle.json',//User detail:http://api.dejafashion.com/account/detail?id=10401


    dejame: 'http://deja.me/u/XPKab9',
    main: thisPath,
    analytics: thisPath + 'analytics.html',
    dejaAppAndroid: 'http://deja.me/u/XPKab9',
    dejaAppIos: 'http://deja.me/u/fzb1KO',
    dejaDwonloadBridge: 'http://m.deja.me/bridge/',
    dejaShareLogo: thisPath + 'resources/images/deja_icon_ios_228.png',
    dejaUserAvatar: thisPath + 'resources/images/pic_avatar_setting_default_2x.png',
    dejafashionSchema: 'dejafashion://'
  }
  //*/
  return Actions;
});


define('util/ThirdVendor',['require','exports','module'],function (require, exports, module) {
  /**
   * 第三方平台
   */
  var ua = window.navigator.userAgent;
  var vendor = null;

  function isUA(name) {
    var reg = new RegExp(name, 'gi');
    return reg.test(ua);
  }

  if (isUA('Deja')) {
    vendor = {
      code: 'Deja',
      name: 'DejaFashion'
    }
  }
  else if (isUA('FBAN')) {
    vendor = {
      code: 'Facebook',
      name: 'Facebook'
    }
  }
  else if (isUA('Twitter')) {
    vendor = {
      code: 'Twitter',
      name: 'Twitter'
    }
  }
  else if (isUA('Instagram')) {
    vendor = {
      code: 'Instagram',
      name: 'Instagram'
    }
  }
  else if (isUA('weibo')) {
    vendor = {
      code: 'Weibo',
      name: '微博'
    }
  }
  else if (isUA('MicroMessenger')) {
    vendor = {
      code: 'WX',
      name: '微信'
    }
  }
  else if (isUA('QQ')) {
    vendor = {
      code: 'QQ',
      name: 'QQ'
    }
  }
  else if (isUA('YiXin')) {
    vendor = {
      code: 'YX',
      name: '易信'
    }
  }

  return vendor;
});

define('app/model/RequestHelper',['require','exports','module'],function (require, exports, module) {
  var getJSON = Core.RequestHandler.getJSON,
    postJSON = Core.RequestHandler.postJSON,
    JSONP = Core.RequestHandler.JSONP;

  function request(action,data,callback,scope,options) {
    options = options || {};
    var __STORE_ID,conf;
    data = data || {};
    data._t = new Date().getTime();
    __STORE_ID = data.__STORE_ID;
    delete data.__STORE_ID;
    conf = {
      action: action,
      data: data,
      complete: function (data) {
        if (data.success) {
          scope && scope.set && scope.set(data.data,__STORE_ID);
        }
        callback && callback(data.success);
      }
    };
    for(var name in options) conf[name]=options[name];
    conf.action = action;
    conf.data = data;
    getJSON(conf);
  }
  function post(action,data,callback,scope,options) {
    options = options || {};
    var conf = {
      action: action,
      data: data,
      contentType: options.contentType||"application/json;charset=utf-8",
      complete: function (data) {
        if (data.success) {
          scope && scope.set && scope.set(data.data);
        }
        callback && callback(data.success);
      }
    };
    for(var name in options) conf[name]=options[name];
    conf.action = action;
    conf.data = data;
    postJSON(conf);
  }

  return {
    getJSON: getJSON,
    postJSON: postJSON,
    JSONP: JSONP,
    request: request,
    post: post
  };
});

define('app/model/Model',['require','exports','module','app/model/RequestHelper','app/resources/Actions'],function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');

  var Mdl = Core.Class.Model,
    lcStorage = Core.localStorage;

  function Model() {
    var MODEL = this,
      userId, udid, appUserMeta,
      loginCookieTimerPrefix = 'loginCookieTimer_';

    this.getCookie = function (sKey) {
      return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
    }
    this.setCookie = function (name, value, days) {
      if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        var expires = "; expires=" + date.toGMTString();
      }
      else var expires = "";
      document.cookie = name + "=" + value + expires + "; path=/";
    }
    //校验登录 cookies
    this.verifyLoginCookie = function () {
      var uid = this.getCookie('uid'),
        sig = this.getCookie('sig');

      this.setUserId(uid);

      return uid && sig;
    }
    this.saveLoginCookieTimeout = function () {
      var key = loginCookieTimerPrefix + this.getUserId();
      lcStorage.set(key, new Date().getTime());
    }
    //校验 cookies 有效期，这里用 1 天
    this.verifyLoginCookieTimeout = function (minutes) {
      var key = loginCookieTimerPrefix + this.getUserId(),
        last = lcStorage.get(key) || 0;
      minutes = minutes || 1 * 60 * 24 * 1;
      return ( (new Date().getTime()) - last ) < minutes * 60 * 1000;
    }
    this.setUdId = function (id) {
      udid = id;
    }
    this.getUdId = function () {
      return udid;
    }
    this.setUserId = function (id) {
      userId = id || userId;
    }
    this.getUserId = function () {
      return userId || (appUserMeta && appUserMeta.userid) || this.getCookie('uid');
    }
    this.getAppUserMeta = function () {
      return appUserMeta;
    }
    this.setAppUserMeta = function (data) {
      appUserMeta = data;
    }
    this.isLogined = function () {
      return !!this.getUserId();
    }

    //数据缓存更新
    this.modelUpdate = new Mdl();

  }
  return new Model;
});

define('widget/Msgbox',['require','exports','module'],function (require, exports, module) {
  function Msgbox(option) {
    //MONOSTATE
    if (Msgbox.prototype.instance) {
      return Msgbox.prototype.instance;
    }
    option = option || {};
    var _this = this,
      bEl,
      readyToHide = true,
      isLoading,
      emptyFn = function () {},
      onBD = emptyFn,
      themeCls = option.themeCls || ($.os.android?'android':''),
      box = $('.msgbox');
    bEl = {
      box: box,
      mask: box.find('.box-mask'),
      bd: box.find('.msgbox-bd'),
      dialog: box.find('.box-ct.dialog'),
      menu: box.find('.box-ct.menu'),
      loading: box.find('.box-ct.loading'),
      signin: box.find('.box-ct.signin')
    }
    bEl.dialog.hide();
    bEl.menu.hide();
    bEl.loading.hide();
    bEl.signin.hide();

    bEl.box.on('click',function(e){
      if(/msgbox-bd/i.test(e.target.className ) ) {
        onBD();
        onBD = emptyFn;
      }
    });

    //dialog
    bEl.dialog.nbt = bEl.dialog.find('.no');
    bEl.dialog.ybt = bEl.dialog.find('.yes');
    bEl.dialog.title = bEl.dialog.find('.title');
    bEl.dialog.msg = bEl.dialog.find('.msg');
    bEl.dialog.nbt.on('click', function () {
      _this.hideDialog(bEl.dialog.noCallback);
    });
    bEl.dialog.ybt.on('click', function () {
      _this.hideDialog(bEl.dialog.yesCallback);
    });
    /**
     * option = {
     *     title,
     *     msg,
     *     yesText,
     *     noText,
     *     yesCallback,
     *     noCallback
     * }
     */
    this.showDialog = function (option) {
      option = option || {};
      readyToHide = false;
      bEl.dialog.yesCallback = option.yesCallback;
      bEl.dialog.noCallback = option.noCallback;
      bEl.dialog.ybt[option.yesText ? 'show' : 'hide']().html(option.yesText);
      bEl.dialog.nbt[option.noText ? 'show' : 'hide']().html(option.noText);
      bEl.dialog.title[option.title ? 'show' : 'hide']().html(option.title || '');
      bEl.dialog.msg[option.msg ? 'show' : 'hide']().html(option.msg || '');
      setTimeout(function () {
        bEl.dialog.show();
        _this.show();
      }, 400);
    }
    this.hideDialog = function (callback) {
      readyToHide = true;
      bEl.dialog.hide();
      _this.hide();
      callbackHandler(callback);
    }
    //menu
    bEl.menu.nbt = bEl.menu.find('.no');
    bEl.menu.options = bEl.menu.find('.options');
    bEl.menu.nbt.on('click', function () {
      _this.hideMenu(bEl.menu.noCallback);
    });
    /**
     * option = {
     *     msg,
     *     noText,
     *     noCallback,
     *     noCls,
     *     options: {
     *      text,cls,callback
     *     }
     * }
     */
    this.showMenu = function (option) {
      //bEl.menu.css({bottom: (document.body.scrollHeight-window.screen.height) + 'px'});
      option = option || {};
      readyToHide = false;
      bEl.menu.noCallback = option.noCallback;
      bEl.menu.nbt.html(option.noText || 'Cancel').addClass(option.noCls);
      bEl.menu.options.html('');
      if(option.msg){
        bEl.menu.options.append('<div class="opt msg">'+option.msg+'</div>');
      }
      if(option.options){
        var tpl = '<div class="opt"></div>';
        option.options.forEach(function(k){
          var el = $(tpl);
          el.html(k.text);
          el.addClass(k.cls);//highlight
          k.callback && el.on('click', function(){
            _this.hideMenu(k.callback);
          });
          bEl.menu.options.append(el);
        });
      }
      setTimeout(function () {
        bEl.menu.show();
        _this.show();
        onBD = function(){
          _this.hideMenu( bEl.menu.noCallback );
        }
      }, 400);
    }
    this.hideMenu = function (callback) {
      readyToHide = true;
      bEl.menu.addClass('close');
      setTimeout(function(){
        bEl.menu.hide().removeClass('close');
        _this.hide();
        callbackHandler(callback);
      },350)
    }
    /**
     * option = {
     *     title,
     *     msg,
     *     yesText,
     *     yesCallback
     * }
     */
    this.showFailed = function (option) {
      option = option || {};
      var _option = {
        title: option.title || 'Sorry~',
        msg: option.msg || 'Unable to connect to the Internet',
        yesText: option.yesText || 'OK',
        yesCallback: option.yesCallback
      }
      _this.showDialog(_option);
    }
    /**
     * option = {
     *     msg,
     *     hideCallback
     * }
     */
    this.showError = function (option) {
      option = option || {};
      var _option = {
        msg: option.msg || ''
      }
      _this.showDialog(_option);
      setTimeout(function () {
        _this.hideDialog(option.hideCallback);
      }, 2500);
    }
    /**
     * option = {
     *     yesCallback
     * }
     */
    this.showDownload = function (option) {
      option = option || {};
      var _option = {
        msg: 'Please download the latest app!',
        noText: 'Cancel',
        yesText: 'OK',
        yesCallback: option.yesCallback
      }
      _this.showDialog(_option);
    }
    //signin
    bEl.signin.nbt = bEl.signin.find('.no');
    bEl.signin.ybt = bEl.signin.find('.plf');
    bEl.signin.msg = bEl.signin.find('.msg');
    bEl.signin.nbt.on('click', function () {
      _this.hideSignin(bEl.signin.noCallback);
    });
    bEl.signin.ybt.on('click', '.b', function () {
      _this.hideSignin(bEl.signin.yesCallback, this.getAttribute('data-plf'));
    });
    /**
     * option = {
     *     msg,
     *     yesCallback,
     *     noCallback
     * }
     */
    this.showSignin = function (option) {
      option = option || {};
      readyToHide = false;

      bEl.signin.noCallback = option.noCallback;
      bEl.signin.yesCallback = option.yesCallback;

      bEl.signin.msg.html(option.msg || 'Please sign in');


      bEl.signin.show();
      this.show();
    }
    this.hideSignin = function (callback, data) {
      readyToHide = true;
      bEl.signin.hide();
      _this.hide();
      callbackHandler(callback, data);
    }

    this.show = function (el) {
      el = el || bEl.box;
      //setTimeout(function () {
        //bEl.box.css({height: document.body.scrollHeight + 'px'});
      //}, 500);
      if (el == bEl.box) {
        el.addClass('show');
      } else {
        el.css({'display': '-webkit-box'});
      }
    }
    this.hide = function (el) {
      el = el || bEl.box;
      isLoading = false;
      if (readyToHide) {
        if (el == bEl.box) {
          el.removeClass('show');
        } else {
          el.css({'display': 'none'});
        }
      }
    }
    this.showLoading = function (msg) {
      bEl.loading.msg = bEl.loading.msg || bEl.loading.find('.msg');
      bEl.loading.msg.html(msg || 'Loading...');
      if (!isLoading) {
        isLoading = true;
        bEl.loading.show();
        this.show();
      }
    }
    this.hideLoading = function () {
      if (isLoading) {
        isLoading = false;
        bEl.loading.hide();
        _this.hide();
      }
    }
    function callbackHandler(callback, data) {
      if (callback) {
        callback(data);
        callback = null;
      }
    }
    this.setTheme = function(cls){
      bEl.bd.removeClass([cls,'android'].join(' ')).addClass(cls);
    }
    this.setTheme(themeCls);

    //MONOSTATE
    Msgbox.prototype.instance = this;
  }//end Msgbox
  return Msgbox;
});

define('util/WechatShare',['require','exports','module'],function (require, exports, module) {
  function WechatShare() {
    var meta = {
      "appid": "",
      "img_url": null,
      "img_width": "200",
      "img_height": "200",
      "link": window.location,
      "url": window.location,
      "desc": document.title,
      "content": document.title,
      "title": document.title
    }, dirtyTimer = 0, dirtyCount = 0;

    function setMeta(data) {
      meta = data || meta;
    }

    function command(name) {
      window.WeixinJSBridge.invoke(name, meta, function (res) {
      });
    }

    function weixinJSBridgeListener() {
      if (window.WeixinJSBridge && !window.WeixinJSBridge.__ListenerRegistered) {
        window.WeixinJSBridge.__ListenerRegistered = true;
        window.WeixinJSBridge.on('menu:share:appmessage', function (argv) {
          command('sendAppMessage');
        });
        window.WeixinJSBridge.on('menu:share:timeline', function (argv) {
          command('shareTimeline');
        });
        window.WeixinJSBridge.on('menu:share:weibo', function (argv) {
          command('shareWeibo');
        });
        return;
      }
      dirtyTimer && clearTimeout(dirtyTimer);
      if (dirtyCount < 60) {
        dirtyCount++;
        dirtyTimer = setTimeout(weixinJSBridgeListener, 1000);
      }
    }

    if (/MicroMessenger/i.test(window.navigator.userAgent)) {
      weixinJSBridgeListener();
      document.addEventListener('WeixinJSBridgeReady', weixinJSBridgeListener, false);
    }

    return setMeta;
  }

  return WechatShare();
});

define('util/YiXinShare',['require','exports','module','util/MetaHandler'],function (require, exports, module) {
  var MetaHandler = require('util/MetaHandler');

  /**
   * 易信分享
   * @param data = {
     *  conetnt,img
     * }
   */
  function share(data) {
    data = data || {};
    MetaHandler.createMeta('yixin-share-desc').setContent('yixin-share-desc', data.content);
    MetaHandler.createMeta('yixin-share-image').setContent('yixin-share-image', data.img);
  }

  return share;
});

define('app/view/View',['require','exports','module','app/resources/Actions','widget/Msgbox','util/WechatShare','util/YiXinShare','app/model/Model'],function(require, exports, module) {
  var Actions = require('app/resources/Actions');
  var Msgbox = require('widget/Msgbox');
  var WechatShare = require('util/WechatShare');
  var YiXinShare = require('util/YiXinShare');

  var BasicModel = require('app/model/Model');

  function View(){
    this.models = {
      Basic: BasicModel
    }

    var VIEW = this,
      els,
      params = Core.localParam(),
      isApp = Core.NativeBridge.isApp();
    //click事件
    this.tapEvent = $.os.ios || $.os.android?'tap':'click';

    function init(){
      Core.MetaHandler.fixViewportWidth();
      initEls();
      bindEvent();
      VIEW.hide();
      els.body.css({'visibility': 'visible'});
    };//end init

    function initEls(){
      var body = $('body');
      els = {
        body: body,
        views: body.children('.view')
      }
      VIEW.GlobalTouch = {
        preventMove: false,
        touched: false
      }
      window.GlobalTouch = VIEW.GlobalTouch;
      VIEW.msgbox = new Msgbox({
        GlobalTouch : VIEW.GlobalTouch
      });
    }
    this.getEls = function(){
      return els;
    }
    this.getView = function(viewCls){
      return els.views.filter('.'+viewCls);
    }
    this.getTemplates = function(viewCls){
      var el = this.getView(viewCls);
      if(el.$Templates){return el.$Templates;}
      var Templates = {};
      el.find('*[data-template]').each(function(){
        var key = $(this),
          name = key.attr('data-template');
        if(name){
          Templates[name] = Core.microTmpl(key.text());
        }
      });
      el.$Templates = Templates;
      return Templates;
    }

    function bindEvent(){
      document.addEventListener('touchmove', function (e) {
        VIEW.GlobalTouch.preventMove && e.preventDefault();
      },false);
      document.addEventListener('touchstart', function (e) {
        VIEW.GlobalTouch.touched = true;
      },false);
      document.addEventListener('touchend', function (e) {
        VIEW.GlobalTouch.touched = false;
      },false);
      //data-prevent-move="start" prevent document to move ontouchstart and cancel ontouchend,
      //data-prevent-move="all" will always prevent the whole document to move
      els.body.on('touchstart','* [data-prevent-move]',function(){
        VIEW._BasicView.GlobalTouch.preventMove = true;
      });
      els.body.on('touchend','* [data-prevent-move="start"]',function(){
        VIEW._BasicView.GlobalTouch.preventMove = false;
      });
      if(VIEW.tapEvent=='tap'){
        els.body.on('click','a',function(e){
          e.preventDefault();
          return false;
        });
        els.body.on('tap','a',function(){
          Core.Event.trigger('redirect',this.href);
        });
      }
      //fix chrome for android active effect remain issue
      $.os.android && /Chrome/i.test(window.navigator.userAgent) && els.body.on('touchstart','* [data-fix-active]',function(e){
        e.preventDefault();
      });
      els.body.on(VIEW.tapEvent,'* [data-fake-link]',function(){
        Core.Event.trigger('redirect',this.getAttribute('data-fake-link'));
      });
      els.body.on(VIEW.tapEvent=='tap'?'touchstart':VIEW.tapEvent,'* [data-analytics]',function(){
        Core.Event.trigger(this.getAttribute('data-analytics-global')?'analytics':'analyticsCurView',this.getAttribute('data-analytics'));
      });
      els.body.on(VIEW.tapEvent,'* [data-eventname]',function(){
        var ename = this.getAttribute('data-eventname'),
          eparam = this.getAttribute('data-eventparam')||'',
          eparams = this.getAttribute('data-eventparams')||'';

        if(ename){
          var params = [];
          params.push(ename);
          if(eparams){
            Array.prototype.push.apply(params,eparams.split(','));
          }else if(eparam){
            params.push(eparam);
          }
          Core.Event.trigger.apply(null,params);
        }
      });
    }
    this.show = function(viewCls,autoRevert){
      this.hide(viewCls);

      var view = this.getView(viewCls);
      !view.hasClass('show') && view.addClass('show');
      //auto scroll to history position,and restore title
      if(autoRevert==undefined || autoRevert){
        setTimeout(Core.Router.scrollToHistoryPosition,100);
        Core.Event.trigger('appModifyTitle');
      }
      return this;
    }
    this.hide = function(notCls){
      (notCls?els.views.not('.'+notCls):els.views).removeClass('show');
      return this;
    }

    /**
     *
     * option = {
             title String 'share title',
             text String 'share text',
             summary String 'share summary',
             imageurl String 'share image url',
             thumburl String 'share image thumb url',
             link String 'share link'
             }
     */
    this.renderShare = function(option){
      option = option || {};
      option.link = option.link || window.location.href;
      option.title = option.title || document.title;
      option.summary = option.summary || option.title;
      option.text = option.text || option.summary;
      option.thumburl = option.thumburl || Actions.dejaShareLogo;
      option.imageurl = option.imageurl || option.thumburl;


      Core.NativeBridge.set_data_for_share(option);

      updateWechatShareMeta(option.title,option.summary,option.thumburl || option.imageurl);
      updateYiXinShareMeta(option.summary,option.thumburl || option.imageurl);
      return this;
    }

    function updateWechatShareMeta(title,content,link,img){
      WechatShare({
        "appid": "",
        "img_url": img || Actions.dejaShareLogo,
        "img_width": "200",
        "img_height": "200",
        "link": link || window.location.href,
        "url": link || window.location.href,
        "desc": content || document.title,
        "content": content || document.title,
        "title": title || document.title
      });
    }
    function updateYiXinShareMeta(content,img){
      YiXinShare({
        content: content||document.title,
        img: img||Actions.dejaShareLogo
      });
    }

    this.lazyLoadImg = function (el){
      el && setTimeout(function(){
        el.find("img").unveil( 200,function() {
          this.onload = function() {
            if(/lazy/.test(this.className)){
              this.style.opacity = 1;
            }
          }
        } );
      },0);
    }

    init();
  }//end View
  return new View;
});

define('app/Controller/Controller',['require','exports','module','app/resources/Actions','util/ThirdVendor','app/model/Model','app/view/View'],function (require, exports, module) {
  var Actions = require('app/resources/Actions');
  var ThirdVendor = require('util/ThirdVendor');
  var BasicModel = require('app/model/Model');
  var BasicView = require('app/view/View');

  function Controller() {
    this.models = {
      Basic: BasicModel
    };
    this.views = {
      Basic: BasicView
    };
    //所有视图初始化前，需要获得客户端的用户登录信息
    //Core.Router.onReady(onUserinfo);

    Core.Router.onChanged(onViewChanged);

    var CTRL = this,
      isApp = Core.NativeBridge.isApp(),
      params = Core.localParam(),
      _userid = params.search['userid'];
    ///*Todo: debug user
    _userid && CTRL.models.Basic.setUserId(_userid);
    //*/

    //更新数据缓存时间
    Core.Event.on('resetModelUpdateTimeout', CTRL.models.Basic.modelUpdate.timer.resetAll);
    //通过API名称，调用客户API
    Core.Event.on('appAPI', appAPI);
    //分享
    Core.Event.on('share', appShare);
    //去下载
    Core.Event.on('appDownload', redirectToDownload);
    //去更新
    Core.Event.on('appUpdate', appUpdate);
    //去deja.me
    Core.Event.on('redirectToDejame', redirectToDejame);
    //跳转出商城
    Core.Event.on('redirect', redirectToPage);
    //去登录
    Core.Event.on('login', onLogin);
    //去WEB登录
    Core.Event.on('webLogin', webLogin);
    //去App登录
    Core.Event.on('appLogin', appLogin);
    //从App获取用户信息
    Core.Event.on('appUserinfo', onUserinfo);
    //去反馈
    Core.Event.on('feedback', onFeedback);
    //复制文本
    Core.Event.on('appCopyText', appCopyText);
    //更新标题
    Core.Event.on('appModifyTitle', appModifyTitle);
    //修改右上角功能菜单
    Core.Event.on('appActionbutton', appActionButton);
    //修改右上角功能菜单成默认
    Core.Event.on('appActionDefaultButton', appActionDefaultButton);
    //修改右上角功能菜单成分享
    Core.Event.on('appActionShareButton', appActionShareButton);
    //注册webview关闭事件
    Core.Event.on('appOnUnload', appOnUnload);
    //关闭webview
    Core.Event.on('appCloseWebView', appCloseWebView);
    //Update Profile
    Core.Event.on('appUpdateProfile', appUpdateProfile);
    //tab 切换
    Core.Event.on('switchTab', switchTab);
    //触发暂时性动画
    Core.Event.on('trigerAnimate', trigerAnimate);
    //text 收展
    Core.Event.on('toggleTextSectionExpand', toggleTextSectionExpand);
    //统计
    Core.Event.on('analytics', analytics);

    //滚动到顶部
    Core.Event.on('scrollTop', scrollTop);
    //back
    Core.Event.on('back', function (action) {
      Core.Router.back(action || -1);
    });
    function analytics(params, title) {
      setTimeout(function () {
        var url = Actions.analytics + '?devevent=1' + (params ? ('&' + params) : '');
        //android和iOS
        if ($.os.ios && !$.os.android) {
          url += '&ios';
        } else if ($.os.android) {
          url += '&android';
        }
        if (ThirdVendor) {
          url += '&plf=' + ThirdVendor.code;
        }
        if(CTRL.models.Basic.isLogined()){
          url += '&logined';
        }
        url += '&t='+(new Date().getTime());

        Core.Navigator.protocol(url, true);
      }, 0);
    }

    function scrollTop() {
      var top = Math.min(Math.min(window.pageYOffset, document.documentElement.scrollTop || document.body.scrollTop), window.scrollY),
        start = top,
        to = 0,
        timer = 0,
        change = to - start,
        currentTime = 0,
        increment = 20,
        duration = 500;
      (function animloop() {
        // increment the time
        currentTime += increment;
        if (start < 2 || CTRL.views.Basic.GlobalTouch.touched || currentTime > duration) {
          if (start < 2) {
            window.scrollTo(0, 1);
          }
          cancelRequestAnimFrame(timer);
          return;
        }
        window.scrollTo(0, Math.easeInOutQuad(currentTime, start, change, duration));
        timer = requestAnimFrame(animloop);
      })();
    }

    function onViewChanged() {
      appModifyTitle();
      CTRL.views.Basic.msgbox.hideLoading();
    }

    function onUserinfo() {
      if (isApp) {
        Core.NativeBridge.userInfo(null, function (rs) {
          CTRL.models.Basic.setAppUserMeta(rs);
          if (rs && !!rs.userid) {
            if (CTRL.models.Basic.verifyLoginCookie() && CTRL.models.Basic.verifyLoginCookieTimeout(30)) {
              Core.Router.run();
            } else {
              onLogin();
            }
          } else {
            Core.Router.run();
          }
        });
        //Core.NativeBridge.device(function(rs){
        //    if(rs){
        //        CTRL.models.Basic.setNativeBridgeDeviceMeta(rs);
        //    }
        //});
      } else {
        Core.Router.run();
      }
    }

    function onLogin(arg,msg,callback) {
      if (isApp) {
        appLogin(callback);
      } else {
        CTRL.views.Basic.msgbox.showSignin({
          msg: msg,
          yesCallback: function (plf) {
            webLogin( Actions.main + (arg || ''), null, plf );
          }
        });
        //CTRL.views.Basic.msgbox.showDownload({
        //  yesCallback: function () {
        //    redirectToDownload(Actions.main + (arg || ''));
        //  }
        //});
      }
    }

    function onFeedback(email) {
      Core.Navigator.protocol('mailto:'+(email||'mozat@mozat.com?subject=Suggestion'), true);
    }

    function switchTab(el, tabs, tabContents) {
      if (!tabs || !tabContents) {
        return;
      }
      var isClicked = !!el;
      el = el || tabs[0];
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i] == el) {
          tabs[i].classList.add('on');
          trigerAnimate(tabContents.eq(i));
          tabContents[i] && tabContents[i].classList.add('show');
          isClicked && Core.Event.trigger('analyticsCurView', 'tab=' + i);
        } else {
          tabs[i].classList.remove('on');
          tabContents[i] && tabContents[i].classList.remove('show');
        }
      }
      Core.Event.trigger('analyticsCurView');
    }

    function trigerAnimate(el, classname, timeout) {
      if (!el) {
        return;
      }
      classname = classname || 'animated';
      timeout = timeout || 1200;
      el.animTimer && clearTimeout(el.animTimer);
      el.addClass(classname);
      el.animTimer = setTimeout(function () {
        el.removeClass(classname);
      }, timeout);
    }

    function toggleTextSectionExpand(el) {
      el && el.classList.toggle('expand');
    }

    function webLogin(surl, furl, pf) {
      var murl = window.location.href;
      surl = surl || murl;
      furl = furl || murl;
      pf = pf || 'fb';

      redirectToPage(Actions.login
        .replace('{SURL}', encodeURIComponent(surl))
        .replace('{FURL}', encodeURIComponent(furl))
        .replace('{PF}', pf));
    }

    function appLogin(callback){
      Core.NativeBridge.login(null, function (rs) {
        if (rs) {
          CTRL.models.Basic.saveLoginCookieTimeout();
          CTRL.models.Basic.modelUpdate.timer.resetAll();
          CTRL.models.Basic.setAppUserMeta(rs);
          if(callback){
            callback();
          }else{
            Core.Router.run();
          }
        }
      });
    }

    function appUpdate(msg,force) {
      redirectToApp(function () {
        CTRL.views.Basic.msgbox.showDialog({
          msg: msg || 'Please up to date your App',
          noText: force?null:'Close',
          yesText: 'Update',
          yesCallback: function () {
            downloadDejaInApp();
          }
        });
      });
    }

    function appShare(callback, plf) {
      redirectToApp(function () {
        var fn = Core.NativeBridge['share' + (plf ? ('_' + plf) : '')];
        fn && fn(null, callback);
      });
    }

    function appCopyText(text) {
      if (isApp) {
        Core.NativeBridge.copy(text);
      }
    }

    function appModifyTitle(title) {
      title = title || document.title;
      document.title = title;
      if (isApp) {
        Core.NativeBridge.modifytitle(title);
      }
    }

    function appActionButton(name, callback) {
      if (isApp) {
        Core.NativeBridge.updateBarButton(name, callback);
      }
    }

    function appActionShareButton() {
      appActionButton('share');
    }

    function appActionDefaultButton() {
      appActionButton('', function () {
      });
    }
    function appOnUnload(callback){
      if (isApp) {
        Core.NativeBridge.set_before_for_unload(callback);
      }
    }
    function appCloseWebView(){
      if (isApp) {
        Core.NativeBridge.closeweb();
      }
    }

    /**
     * @param subProtocol String creationLike,creationDelete,productLike,follow
     */
    function appUpdateProfile(subProtocol){
      appAPI('updateProfile',null,null,subProtocol);
    }

    /**
     * dejafashion://name/subProtocol
     * window.__dejafashion_data_name = data;
     * window.__dejafashion_after_name = callback;
     */
    function appAPI(name, data, callback, subProtocol,redirect){
      if (isApp) {
        Core.NativeBridge.trigger.apply(null,arguments);
      }else if(redirect){
        var proto = [name];
        subProtocol && proto.push(subProtocol);
        redirectToDownload(null,true,Actions.dejafashionSchema+proto.join('/'));
      }
    }
    function downloadDejaInApp() {
      var url = Actions.dejaAppAndroid;
      if ($.os.ios && !$.os.android) {
        url = Actions.dejaAppIos;
      }
      window.location = url;
    }

    function redirectToDejame() {
      redirectToPage(Actions.dejame);
    }

    //打开客户端原生视图
    function redirectToApp(callback, link) {
      if (isApp) {
        callback && callback();
      } else {
        CTRL.views.Basic.msgbox.showDownload({
          yesCallback: function () {
            redirectToDownload(link || window.location.href);
          }
        });
      }
    }

    /**
     * open a web site in app,or just op
     * @param link
     * @param autoopen
     * @param schema
     */
    function redirectToDownload(link, autoopen, schema) {
      link = !!link && link!='0'? ('#url=dejafashion://web/' + link) : '';
      link = !!schema?('#url='+schema): link;
      redirectToPage(Actions.dejaDwonloadBridge + (autoopen ? '?autoopen=1' : '') + link);
    }

    function redirectToPage(link) {
      if (link) {
        !(/__NativeBridge_target/g.test(link)) && appActionDefaultButton();
        window.location = link;
      }
    }

  }//end Controller
  return new Controller;
});

define('app/model/UserModel',['require','exports','module','app/model/RequestHelper','app/resources/Actions','app/model/Model'],function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');
  var Basic = require('app/model/Model');

  var Mdl = Core.Class.Model,
    lcStorage = Core.localStorage;

  function User() {

  }

  //profile
  User.prototype.profile = new Mdl({
    isExist: function (id, name) {
      return this.data && this.data[name] && ((this.data[name].indexOf(id) != -1) || (this.data[name].indexOf(id + '') != -1));
    },
    addId: function (id, name) {
      if (this.data && this.data[name]) {
        this.removeId(id, name);
        this.data[name].push(id);
      }
    },
    removeId: function (id, name) {
      if (this.data && this.data[name] && ((this.data[name].indexOf(id) != -1) || (this.data[name].indexOf(id + '') != -1))) {
        this.data[name].splice(this.data[name].indexOf(id), 1);
        this.data[name].splice(this.data[name].indexOf(id + ''), 1);
      }
    },
    isCreationLiked: function (id) {
      return this.isExist(id, 'creation_likes');
    },
    isProductLiked: function (id) {
      return this.isExist(id, 'product_likes');
    },
    isFollowed: function (id) {
      return this.isExist(id, 'followers');
    },
    addCreationLiked: function (id) {
      this.addId(id, 'creation_likes');
    },
    addProductLiked: function (id) {
      this.addId(id, 'product_likes');
    },
    addFollowed: function (id) {
      this.addId(id, 'followers');
    },
    removeCreationLiked: function (id) {
      this.removeId(id, 'creation_likes');
    },
    removeProductLiked: function (id) {
      this.removeId(id, 'product_likes');
    },
    removeFollowed: function (id) {
      this.removeId(id, 'followers');
    },
    isMe: function (id) {
      return this.data && this.data.user_info && this.data.user_info.id == id;
    },
    request: function (data, callback) {
      RequestHelper.request(Actions.profile,data,callback,this);
    }
  });

  //follow
  User.prototype.follow = new Mdl({
    post: function (data, callback) {
      RequestHelper.post(Actions.follow,data,callback,this);
    }
  });

  User.prototype.userStyle = new Mdl({
    request: function (data, callback) {
      RequestHelper.request(Actions.userStyle,data,callback,this);
    }
  });


  User.prototype.userInfo = new Mdl({
    request: function (data, callback) {
      RequestHelper.request(Actions.userInfo,data,callback,this);
    }
  });


  return new User;
});

define('app/view/HomeView',['require','exports','module','app/view/View','app/model/Model','app/model/UserModel'],function (require, exports, module) {
  var BasicView = require('app/view/View');
  var BasicModel = require('app/model/Model');
  var UserModel = require('app/model/UserModel');


  function HomeView() {
    this.models = {
      Basic: BasicModel,
      User: UserModel
    }
    this.viewCls = 'view-home';
    this._BasicView = BasicView;

    var VIEW = this,
      isApp = Core.NativeBridge.isApp(),
      Tpl, els,
      tap = VIEW._BasicView.tapEvent;

    //model listeners
    VIEW.models.User.userList.updated(render);


    function initEls() {
      if(els){return;}
      var main = VIEW._BasicView.getView(VIEW.viewCls);
      els = {
        main: main,
        userList: main.find('.user-list')
      }
      bindEvent();
    }//end initEls
    function initTpls(){
      if(Tpl){return;}
      Tpl = Tpl || VIEW._BasicView.getTemplates(VIEW.viewCls);
    }
    function initResources() {
      initEls();
      initTpls();
    }
    this.getEls = function () {
      initEls();
      return els;
    }
    this.getTpls = function(){
      initTpls();
      return Tpl;
    }
    function bindEvent() {

    }//end bindEvent

    this.show = function () {
      initResources();

      if (!els.main.hasClass('show')) {
        Core.Event.trigger('trigerAnimate', els.main);
        VIEW._BasicView.show(VIEW.viewCls);
      }
    }
    this.hide = function () {
      if (!els) {
        return;
      }
    }
    function render(data) {
      initResources();
      data = data || VIEW.models.User.userList.get();

      var list = [];
      //var d = {name: 1,age: 2,tel: 3,company: 4};
      data = data.data;
      data = data.schemata;
      console.log(Tpl);
      data.forEach(function(key, idx){
        var d = {};


        key.child.forEach(function(key){
          d[key.name] = key.title;//name:name    title:value
        });
        list.push(Tpl.userList(d));
      });
      els.userList.html( list.join('') );


    }//end render

  }//end View
  return new HomeView();
});

define('app/Controller/HomeController',['require','exports','module','../resources/Actions','app/model/Model','app/model/UserModel','app/view/View','app/view/HomeView'],function (require, exports, module) {
  var Actions = require('../resources/Actions');
  var BasicModel = require('app/model/Model');
  var UserModel = require('app/model/UserModel');
  var BasicView = require('app/view/View');
  var HomeView = require('app/view/HomeView');

  function HomeController() {
    this.models = {
      Basic: BasicModel,
      User: UserModel
    }
    this.views = {
      Basic: BasicView,
      Home: HomeView
    };

    var CTRL = this,
      viewNames,
      curViewId = '',
      viewHomeQuery = {};

    viewNames = {
      'home': 'Home'
    }
    Core.Router
      .onUnsubscribed(onViewUnnamed)
      .subscribe('/home/', onViewHome, unViewHome);

    //统计视图
    Core.Event.on('analyticsCurView', analyticsCurView);
    //forwardHome
    Core.Event.on('forwardHome', forwardHome);

    function unViewHome() {
      CTRL.views.Home.hide();
    }

    function onViewUnnamed(req) {
      onViewHome(req);
      Core.Event.trigger('analytics');
    }

    function onViewHome(req) {
      curViewId = 'home';
      viewHomeQuery = req.query;
      CTRL.views.Home.show();
      CTRL.models.User.userList.request({id: '5620c5d5cee3c65f0fbdfd2e'});

      //追加统计
      analyticsCurView();
    }
    function forwardHome(arg) {
      Core.Router.forward('/home/' + (arg || ''));
    }

    function analyticsCurView(params, title) {
      if (!Core.Router.currentMatch(['/home/', Core.Router.getUnsubscribedAction()])) {
        return;
      }
      params = params ? ('&' + params) : '';
      title = title || viewNames[curViewId] || document.title;

      Core.Event.trigger('analytics', 'viewid=' + curViewId + params, title);
    }
  }

  return new HomeController;
});

define('app/model/ProductModel',['require','exports','module','app/model/RequestHelper','app/resources/Actions','app/model/Model','app/model/UserModel'],function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');
  var Basic = require('app/model/Model');
  var User = require('app/model/UserModel');

  var Mdl = Core.Class.Model,
    lcStorage = Core.localStorage,
    MODEL;

  function Product() {

  }
  Product.prototype.formatHelper = {
    normal: function(data){
      if(data){
        data.price = data.price || 0;
        data.discount_price = data.discount_price || 0;
        data.deja_price = data.deja_price || 0;
        data.discount_percent = data.discount_percent || 0;
        data._price = Core.Num.formatMoney(data.price / 100);
        data._deja_price = Core.Num.formatMoney(data.deja_price / 100);
        data._discount_price = Core.Num.formatMoney(data.discount_price / 100);
        data.description = data.description || '';

        data.liked = User.profile.isProductLiked(data.id);
      }
      return data;
    },
    order: function(data,brand){
      if(data){
        data.brand_name = brand || '';
        data.deja_price = data.deja_price || 0;
        data.total_price = data.unit_price*data.quantity;
        data.total_discount_price = data.deja_price*data.quantity;
        data._total_price = Core.Num.formatMoney(data.total_price / 100);
        data._total_discount_price = Core.Num.formatMoney(data.total_discount_price / 100);
        data.size = data.size || '';
        data.color = data.color || '';
      }
      return data;
    }
  }

  //editing cart product constructor
  Product.prototype.editingCartProduct = function(data){
    var product = JSON.parse(JSON.stringify(data)),
      sku = {},
      quantity = 1;
    this.data = data;
    this.getAttrs = function(){
      return {
        product_id: product.id,
        order_sku: sku,
        quantity: quantity
      }
    }
    this.setSize = function(v){
      sku.size = v;
    }
    this.getSize = function(){
      return sku.size;
    }
    this.setColor = function(v){
      sku.color = v;
    }
    this.getColor = function(){
      return sku.color;
    }
    this.setQuantity = function(v){
      quantity = v;
    }
    this.getQuantity = function(){
      return quantity;
    }
  }
  //editing order product constructor
  Product.prototype.editingOrderProduct = function(data){
    var product = JSON.parse(JSON.stringify(data)),
      selected = product.status==1000,
      updated = false;

    this.getAttrs = function(){
      return {
        order_item_id: product.id,
        quantity: product.quantity
      }
    }
    this.setSize = function(v){
      updated = true;
      product.size = v;
    }
    this.getSize = function(){
      return product.size;
    }
    this.setColor = function(v){
      updated = true;
      product.color = v;
    }
    this.getColor = function(){
      return product.color;
    }
    this.setQuantity = function(v){
      updated = true;
      product.quantity = v;
    }
    this.getQuantity = function(){
      return product.quantity;
    }
    this.sumPrice = function(){
      return product.quantity*product.unit_price;
    }
    this.sumDiscountPrice = function(){
      return product.quantity*(product.deja_price||0);
    }
    this.setSelected = function(v){
      selected = v;
    }
    this.getSelected = function(){
      return selected;
    }
    this.isUpdated = function(){
      return updated;
    }
  }

  //product info
  Product.prototype.product = new Mdl({
    request: function (data, callback) {
      RequestHelper.request(Actions.product, data, callback, this);
    }
  });

  function products(){
    return new Mdl({
      request: function (data, callback) {
        var _this = this;
        RequestHelper.request(Actions.product, data, function(success){
          var listData = _this.get();
          listData.data && listData.data.forEach(function(key,idx){
            MODEL.product.store(key.id,{ret: 0,data: [key]});
          });
          callback && callback(success);
        }, this);
      }
    });
  }

  // products similar
  Product.prototype.productSimilars = products();

  //product like
  Product.prototype.likeProduct = new Mdl({
    post: function (data, callback) {
      RequestHelper.post(Actions.likeProduct,data,callback,this);
    }
  });

  //scene detail products
  Product.prototype.sceneProducts = new Mdl({
    page: 0,
    page_size: 20,
    resetPage: function(){
      this.page = 0;
    },
    request: function (data,callback) {
      var _this = this;
      RequestHelper.getJSON({
        data: {page: _this.page, page_size: _this.page_size, scene_id: data.scene_id},
        action: Actions.sceneProducts,
        complete: function (data) {
          if (data.success) {
            _this.set(data.data);
            _this.page++;
          }
          callback && callback(data.success);
        }
      });
    }
  });
  //best deals
  Product.prototype.specialProducts = new Mdl({
    page: 0,
    page_size: 20,
    resetPage: function(){
      this.page = 0;
    },
    request: function (data,callback) {
      var _this = this;
      RequestHelper.getJSON({
        data: {page: _this.page, page_size: _this.page_size, price_max:2000,price_min:0,sort:1,status:0,tryon:0},
        action: Actions.specialProducts,
        complete: function (data) {
          if (data.success) {
            _this.set(data.data);
            _this.page++;
          }
          callback && callback(data.success);
        }
      });
    }
  });

  Product.prototype.mirrorProducts = products();

  //likedItem products
  Product.prototype.likedItemProducts = new Mdl({
    page: 0,
    page_size: 20,
    resetPage: function(){
      this.page = 0;
    },
    request: function (data,callback) {
      var _this = this;
      RequestHelper.getJSON({
        data: {page: _this.page, page_size: _this.page_size, like_id: data.like_id},
        action: Actions.likedItemProducts,
        complete: function (data) {
          if (data.success) {
            _this.set(data.data);
            _this.page++;
          }
          callback && callback(data.success);
        }
      });
    }
  });


  MODEL = new Product;

  return MODEL;
});

define('app/Controller/UserController',['require','exports','module','app/view/View','app/model/Model','app/model/UserModel','app/model/ProductModel'],function (require, exports, module) {
  var BasicView = require('app/view/View');
  var BasicModel = require('app/model/Model');
  var UserModel = require('app/model/UserModel');
  var ProductModel = require('app/model/ProductModel');


  function UserView(){
    this.models = {
      Basic: BasicModel,
      User: UserModel,
      Product: ProductModel
    }
    this.viewCls = 'view-user';
    this._BasicView = BasicView;

    var VIEW = this,
      isApp = Core.NativeBridge.isApp(),
      Tpl, els,
      tap = VIEW._BasicView.tapEvent;

    //model listeners
    VIEW.models.User.userInfo.updated(render);
    VIEW.models.User.userStyle.updated(renderUserStyle);


    Core.Router.subscribe('/user/', function(req){
      //console.log(req);
    });

    function initEls() {
      if(els){return;}
      var main = VIEW._BasicView.getView(VIEW.viewCls);
      els = {
        //body: $('body'),
        main: main,

        tab: main.find('.tabs'),
        tabs: main.find('.tabs>div'),
        tabContents: main.find('.tab-content'),

        myStyle: main.find('.user-styles .my-style .list'),
        likedStyle: main.find('.user-styles .liked-style .list'),
        likedItem: main.find('.user-styles .liked-item'),

        userProfile: main.find('.profile'),

        back: main.find('.back')
      }
      bindEvent();
    }//end initEls
    function initTpls(){
      if(Tpl){return;}
      Tpl = Tpl || VIEW._BasicView.getTemplates(VIEW.viewCls);
    }
    function initResources() {
      initEls();
      initTpls();
    }
    this.getEls = function () {
      initEls();
      return els;
    }
    this.getTpls = function(){
      initTpls();
      return Tpl;
    }
    function bindEvent() {
      els.tab.on(tap,'div',function(){
        Core.Event.trigger('switchTab',this,els.tabs,els.tabContents);
      });
      els.back.on(tap, Core.Router.back);

      els.userProfile.on(tap, '.user .avatar,.user .meta .name',function(){
        Core.Event.trigger('appAPI','profile',null,null,this.getAttribute('data-id'));
      });
      els.userProfile.on(tap, '.user .follow i',renderFollow);

    }//end bindEvent

    this.show = function () {
      initResources();

      VIEW._BasicView.show(VIEW.viewCls);
    }
    this.hide = function () {
      if (!els) {
        return;
      }
    }


    function render(data) {
      initResources();
      data = data || VIEW.models.User.userInfo.get();

      if(!data || data.ret != 0 || !data.data){
        return;
      }
      var user = data.data[0],
        userStyle = VIEW.models.User.userStyle.get();

      user.followed = VIEW.models.User.profile.isFollowed(user.id);

      user.creations_count = 0;
      if(userStyle && userStyle.ret == 0 && userStyle.data && userStyle.data.creations){
        user.creations_count = userStyle.data.creations.length;
      }
      els.userProfile.html(Tpl.userProfile(user));

    }//end render
    function renderUserStyle(data){
      data = data || VIEW.models.User.userStyle.get();

      if(!data || data.ret != 0 || !data.data){
        return;
      }

      var mystyle = data.data.creations;
      var likedstyle = data.data.liked_creations;
      //data.id = viewLikedItemsQuery.id;

      renderMyStyles(mystyle);
      renderLikedStyles(likedstyle);
      renderLikedItems();

    }
    function renderMyStyles(data) {
      if(!data || data.length<1){
        els.myStyle.parent().addClass('hide');
        return;
      }
      var list = [];
      data.forEach(function(key,idx){
        list.push( Tpl.myStyle(key) );
      });

      els.myStyle.parent().removeClass('hide');
      els.myStyle.one('virtualdomrendered',function(){
        VIEW._BasicView.lazyLoadImg($(this));
      }).html(list.join(''),true);

    }
    function renderLikedStyles(data) {
      if(!data || data.length<1){
        els.likedStyle.parent().addClass('hide');
        return;
      }
      var list = [];
      data.forEach(function(key,idx){
        list.push( Tpl.likedStyle(key) );
      });

      els.likedStyle.parent().removeClass('hide');
      els.likedStyle.one('virtualdomrendered',function(){
        VIEW._BasicView.lazyLoadImg($(this));
      }).html(list.join(''),true);
    }

    function renderLikedItems(data) {
      data = data || VIEW.models.User.userStyle.get();

      if(!data || data.ret != 0 || !data.data){
        return;
      }
      var llist = [],rlist = [],dd = data.data.liked_items.slice(0);
      dd.forEach(function(key,idx){
        var _list = idx%2?rlist:llist;
        key = VIEW.models.Product.formatHelper.normal(key);

        _list.push( Tpl.likedItem(key) );
      });
      var sec = els.likedItem.find('.list');
      if(sec[0]){
        var fn = VIEW.models.User.userStyle.page?'append': 'html';
        sec.find('.loading').remove();
        sec.find('.list-row.left')[fn](llist.join(''));
        sec.find('.list-row.right')[fn](rlist.join(''));
        VIEW._BasicView.lazyLoadImg(sec);
      }
    }

    function renderFollow(){
      if (!VIEW.models.Basic.isLogined()) {
        Core.Event.trigger('login', window.location.hash);
        return;
      }
      var el = $(this),
        isInvoker = el.attr('data-invoker'),
        isFollow = el.hasClass('unfollow');

      if (isFollow){
        if(isInvoker == 0){
          el.siblings('.followed').removeClass('hide');
        }else{
          el.siblings('.each').removeClass('hide');
        }
        el.addClass('hide');
        Core.Event.trigger('UserController.beforeFollow',el.attr('data-id'),isFollow);
      }else{
        VIEW._BasicView.msgbox.showMenu({
          msg:'',
          noCls: 'highlight',
          options: [
            {
              text:'Unfollow',
              callback: function () {
                el.siblings('.followed,.each').addClass('hide');
                el.siblings('.unfollow').removeClass('hide');
                el.addClass('hide');
                Core.Event.trigger('UserController.beforeFollow',el.attr('data-id'),isFollow);
              }
            }
          ]
        });
      }
    }
  }//end View
  return new UserView();
});

define('app/model/MovieModel',['require','exports','module','app/model/RequestHelper','app/resources/Actions','app/model/Model'],function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');
  var Basic = require('app/model/Model');

  var Movie,
    Mdl = Core.Class.Model,
    lcStorage = Core.localStorage;

  function Movie() {
  }

  Movie.prototype.movieList = new Mdl({
    request: function(data,callback){
      RequestHelper.request(Actions.movieList,data,callback,this);//从.json file里面拿数据
    }
  });
  //Movie.prototype.movieList = new Mdl({ //create movieList
  //  request: function (data){
  //    RequestHelper.JSONP({                    //JSONP  request data 这是JSONP 拿数据的写法
  //      action: Actions.movieList+'?id='+data.id+'&callback=afterRequestMovieList'
  //    });
  //  }
  //});

  window.afterRequestMovieList = function(data){  //invoke(call) mycallback method
    Movie.movieList.set(data);
  }

  Movie = new Movie;

  return Movie;
});

define('app/view/MovieListView',['require','exports','module','app/view/View','app/model/Model','app/model/MovieModel'],function (require, exports, module) {
  var BasicView = require('app/view/View');
  var BasicModel = require('app/model/Model');
  var MovieModel = require('app/model/MovieModel');

  function MovieListView(){
    this.models = {
      Basic: BasicModel,
      Movie: MovieModel
    }
    this.viewCls = 'view-movielist';
    this._BasicView = BasicView;

    var VIEW = this,
      isApp = Core.NativeBridge.isApp(),
      Tpl, els,
      tap = VIEW._BasicView.tapEvent;

    //model listeners
    VIEW.models.Movie.movieList.updated(render);  //add updated method

    function initEls() {
      if(els){return;}
      var main = VIEW._BasicView.getView(VIEW.viewCls);
      els = {
        main: main,
        movieList: main.find('.movie-list')  //find class .movie-list
      }
      bindEvent();
    }//end initEls
    function initTpls(){
      if(Tpl){return;}
      Tpl = Tpl || VIEW._BasicView.getTemplates(VIEW.viewCls);
    }
    function initResources() {
      initEls();
      initTpls();
    }
    this.getEls = function () {
      initEls();
      return els;
    }
    this.getTpls = function(){
      initTpls();
      return Tpl;
    }
    function bindEvent() {
      els.movieList.on(tap, '.item>header', function(){
        Core.Event.trigger('toggleTextSectionExpand',this.parentNode);
      });


    }//end bindEvent

    this.show = function () {
      initResources();

      Core.Event.trigger('trigerAnimate',els.main);
      VIEW._BasicView.show(VIEW.viewCls);
    }
    this.hide = function () {
      if (!els) {
        return;
      }
    }
    function render(data) {
      initResources();
      data = data || VIEW.models.Movie.movieList.get();   // 1. data =  2. get() method.
      var list = [];
      data.data.schemata.forEach(function(val){
        var d = {};
        console.log(val);
        d['title'] = val.name;
        d['desc'] = val.title;
        //console.log(d['title']);
        //console.log(d['desc']);
        val.child.forEach(function(val){
          d[val.name] = val.title;    //name:name    title:value
        });
        list.push(Tpl.movieList(d));
        //console.log(d);
      });
      els.movieList.html( list.join('') );
      //console.log(list);



    }//end render

  }//end View
  return new MovieListView();
});

define('app/Controller/MovieListController',['require','exports','module','../resources/Actions','app/model/Model','app/model/MovieModel','app/view/View','app/view/MovieListView'],function (require, exports, module) {
  var Actions = require('../resources/Actions');
  var BasicModel = require('app/model/Model');
  var MovieModel = require('app/model/MovieModel');
  var BasicView = require('app/view/View');
  var MovieListView = require('app/view/MovieListView');

  function MovieListController(){
    this.models = {
      Basic: BasicModel,
      Movie: MovieModel
    }
    this.views = {
      Basic: BasicView,
      MovieList: MovieListView
    }

    var CTRL = this,
      viewNames,
      curViewId = '',
      viewMovieListQuery = {};

    viewNames = {
      'movielist': 'MovieList'
    }
    Core.Router.subscribe('/movielist/', onViewMovieList, unViewMovieList);

    //统计视图
    Core.Event.on('analyticsCurView', analyticsCurView);
    //forwardMovieList
    Core.Event.on('forwardMovieList', forwardMovieList);


    function unViewMovieList() {
      CTRL.views.MovieList.hide();
    }

    function onViewMovieList(req){
      curViewId = 'movielist';
      viewMovieListQuery = req.query;
      CTRL.views.MovieList.show();
      //CTRL.models.Movie.movieList.request({id:'5622309ccee3c65f0fbdfd45'});// get this ID from DDMS
      CTRL.models.Movie.movieList.request(null,afterRequestMovieList());


      //追加统计
      analyticsCurView();
    }
    function afterRequestMovieList(success){

    }

    function forwardMovieList(arg){
      Core.Router.forward('/movielist/' + (arg || ''));
    }

    function analyticsCurView(params, title) {
      if (!Core.Router.currentMatch(['/movielist/'])) {
        return;
      }
      params = params ? ('&' + params) : '';
      title = title || viewNames[curViewId] || document.title;

      Core.Event.trigger('analytics', 'viewid=' + curViewId + params, title);
    }
  }
  return new MovieListController;
});

define('app/App.js',['require','exports','module','lib/zepto','lib/Core','./Controller/Controller','./Controller/HomeController','./Controller/UserController','./Controller/MovieListController'],function (require, exports, module) {
  require('lib/zepto');
  require('lib/Core');

  var BasicController = require('./Controller/Controller');
  var HomeController = require('./Controller/HomeController');
  var UserController = require('./Controller/UserController');
  var MovieListController = require('./Controller/MovieListController');
  //__INSERT_POINT__ Don't delete!!

  function App() {
    this.HomeController = HomeController;
    var params = Core.localParam(),
      standalone = params.search['standalone'];//如果带此参数，初始页非首页的浏览器历史返回将不会回首页
    setTimeout(function () {
      //Core.Router.init(standalone?'':'/home/');
      Core.Router.init();
    }, 250);
  }

  window.App = new App;
});

require(["app/App.js"]);
}());