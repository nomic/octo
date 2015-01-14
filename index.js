'use strict';

var _ = require('lodash'),
    assert = require('assert'),
    Promise = require('bluebird'),
    minimatch = require('minimatch');

function existy(val) {
  return (val !== null && val !== undefined);
}

function parseParams(fn) {
  if (!fn) {
    return [];
  }

  var functionExp = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
  var commentsExp = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
  var argExp = /^\s*(\S+?)\s*$/;

  var fnString = fn.toString().replace(commentsExp, '');
  var match = fnString.match(functionExp);
  var params = match && match[1];

  if (!match || !params) {
    return [];
  }

  return _.map(params.split(','), function (param) {
    return param.match(argExp)[1];
  });
}

module.exports = function() {
  var expose = require('exposejs')();
  var curBundle = [];
  var resolved = {
  };
  var resolvedSync = {
  };
  var unresolved = {
  };
  var errorHandler = defaultErrorHandler;


  function defaultErrorHandler(err) {
    throw err;
  }

  function visible(bundle, dependencyVisibility) {
    return (bundle.indexOf(dependencyVisibility) === 0);
  }

  function fullName(nodeDef) {
    var scope = nodeDef.bundle.length ? nodeDef.bundle + '.' : '';
    return scope + nodeDef.name;
  }

  function _resolveNode(nodeDef) {
    var dependencies = _.pick(resolved, nodeDef.params);
    _.each(nodeDef.params, function(depName) {

      //lazily load unloaded nodes
      if (!existy(dependencies[depName])) {
        var depDef = unresolved[depName];
        assert(
          existy(depDef),
          'Dependency not found: *' + depName + '* <-- ' + nodeDef.name);
        dependencies[depName] = _resolveNode(depDef);
      }

    });

    // Get a correctly ordered array of promised arguments
    var depArray = _.map(nodeDef.params, function(param) {
      var depDef = _.find(dependencies, {name:param});
      assert(
        visible(nodeDef.bundle, depDef.visibility),
        'Dependency not visible: *'
        + fullName(depDef) + '* <-- '
        + fullName(nodeDef)
        + '; consider using publish()');
      return depDef.promise;
    });
    nodeDef.promise = Promise.all(depArray)
    .then(function(depVals) {
      return nodeDef.fn.apply(null, depVals);
    });

    resolved[nodeDef.name] = nodeDef;
    return nodeDef;
  }

  function _resolveNodeSync(nodeDef) {
    var dependencies = _.pick(resolvedSync, nodeDef.params);
    _.each(nodeDef.params, function(depName) {

      //lazily load unloaded nodes
      if (!existy(dependencies[depName])) {
        var depDef = unresolved[depName];
        assert(
          existy(depDef),
          'Dependency not found: *' + depName + '* <-- ' + nodeDef.name);
        assert(
          visible(nodeDef.bundle, depDef.visibility),
          'Dependency not visible: *'
          + fullName(depDef) + '* <-- '
          + fullName(nodeDef)
          + '; consider using publish()');
        dependencies[depName] = _resolveNodeSync(depDef);
      }

    });

    // Get a correctly ordered array of arguments
    var depArray = _.map(nodeDef.params, function(param) {
      var depDef = _.find(dependencies, {name:param});
      assert(
        visible(nodeDef.bundle, depDef.visibility),
        'Dependency not visible: *'
        + fullName(depDef) + '* <-- '
        + fullName(nodeDef)
        + '; consider using publish()');
      return depDef.value;
    });

    nodeDef.value = nodeDef.fn.apply(null, depArray);

    resolvedSync[nodeDef.name] = nodeDef;
    return nodeDef;
  }

  function _assertNodeExists(nodeDef, nodeName) {
    assert(
      existy(nodeDef),
      'Not found: *' + nodeName + '*');
  }

  function _assertNodeVisible(nodeDef, bundle) {
    assert(
      visible(bundle, nodeDef.visibility),
      'Not visible: *'
      + fullName(nodeDef) + '* <-- '
      + (bundle === '' ? '[root bundle]' : bundle)
      + '; consider using publish()');
  }

  function _resolveNameSync(nodeName, opts) {
    opts = _.defaults({}, opts, {
      allScopes: false
    });
    var nodeDef = unresolved[nodeName];
    var bundle = curBundle.join('.');
    _assertNodeExists(nodeDef, nodeName);
    if (!opts.allScopes) _assertNodeVisible(nodeDef, bundle);
    return _resolveNodeSync(nodeDef).value;
  }

  function _resolveName(nodeName, opts) {
    opts = _.defaults({}, opts, {
      allScopes: false
    });
    if (resolved[nodeName]) {
      return resolved[nodeName].promise;
    }
    var nodeDef = unresolved[nodeName];
    var bundle = curBundle.join('.');
    _assertNodeExists(nodeDef, nodeName);
    if (!opts.allScopes) _assertNodeVisible(nodeDef, bundle);
    return _resolveNode(nodeDef).promise;
  }

  function _listDependencies(nodeName) {
    var nodeDef = resolved[nodeName] || unresolved[nodeName];
    assert(
      existy(nodeDef),
      'Not found: *' + nodeName + '*');
    var depNames = _.clone(nodeDef.params);
    _.each(nodeDef.params, function(depName) {
      depNames = depNames.concat(_listDependencies(depName));
    });
    return _.unique(depNames);
  }

  function _nodes(type, dict) {
    assert(
      _.isPlainObject(dict),
      'injector.' + type
      + ' expects a plain object, but got: '
      + dict);

    _.each(dict, function(fn, name) {
      assert(
        _.isFunction(fn),
      'expected a function for ' + name + ', but got: ', fn);
      unresolved[name] = {
        name: name,
        params: parseParams(fn),
        fn: fn,
        bundle: curBundle.join('.'),
        visibility: curBundle.join('.')
      };
    });
  }

  expose(values);
  function values(dict) {
    assert(
      _.isPlainObject(dict),
      'injector.values expects a plain object, but got: '
        + dict);
    return factories(_.mapValues(dict, function(val) {
      return function() { return val; };
    }));
  }

  expose(factories);
  function factories(dict) {
    _nodes('factories', dict);
    return expose();
  }

  function bundle(name, fn) {
    curBundle = curBundle.concat([name]);
    fn(expose());
    curBundle = _.clone(curBundle);
    curBundle.pop();
    return expose();
  }

  expose(bundles);
  function bundles(dict) {
    _.each(dict, function(bundleFn, name) {
      bundle(name, bundleFn);
    });
    return expose();
  }

  expose(publish);
  function publish(/*patterns*/) {
    var bundle = curBundle.join('.');
    var parentBundle = curBundle.slice(0, -1).join('.');
    _.each(arguments, function(pattern) {
      var allNodes = _.values(resolved).concat(_.values(unresolved));
      var published = _.filter(allNodes, function(nodeDef) {
        return (
          (bundle === nodeDef.visibility)
          && minimatch(nodeDef.name, pattern));
      });
      assert(
        published.length,
        'attempt to publish non-existant node: ' + pattern + ', ' + bundle);
      _.each(published, function(nodeDef) {
        nodeDef.visibility = parentBundle;
      });
    });
    return expose();
  }

  expose(resolve);
  function resolve(fn) {
    if (!_.isFunction(fn)) {
      throw new TypeError('Expected function, but got: ' + fn);
    }
    return onInject.then(function() {
      var nodeNames = parseParams(fn);
      var nodePromises = _.map(nodeNames, function(nodeName) {
        return _resolveName(nodeName);
      });
      return Promise.all(nodePromises)
      .spread(fn);
    });
  }

  expose(dependsOn);
  function dependsOn(nodeNames, depNames) {
    var dependencies = _.map(nodeNames, function(nodeName) {
      return _listDependencies(nodeName);
    });
    var uniqDeps = _.uniq(_.flatten(nodeNames.concat(dependencies)));
    return _.intersection(depNames, uniqDeps);
  }

  // resolveSync()
  //
  // Some js frameworks or libraries assume code that they are running
  // is run in a single node event loop tick.  For example, mocha
  // makes this assumption to when collecting suites and tests and
  // determining the hierarchy.  To support this, you can use
  // resolveSync, though generally it should be avoided as it won't
  // work for anything that requires a promise to be unwrapped.
  expose(resolveSync);
  function resolveSync(fn) {
    if (!_.isFunction(fn)) {
      throw new TypeError('Expected function, but got: ' + fn);
    }
    var nodeNames = parseParams(fn);
    var values = _.map(nodeNames, function(nodeName) {
      return _resolveNameSync(nodeName);
    });
    return fn.apply(null, values);
  }

  expose(resolveNameSync);
  function resolveNameSync(nodeName) {
    return _resolveNameSync(nodeName);
  }

  expose(resolveName);
  function resolveName(nodeName, opts) {
    return onInject.then(function() {
      return _resolveName(nodeName, opts);
    });
  }

  var injectCalled;
  var onInject = new Promise(function(resolve) {
    injectCalled = resolve;
  });
  expose(inject);
  function inject() {
    injectCalled();
    return expose();
  }

  expose(terminal);
  function terminal(fn) {
    resolve(fn)
    .catch(function(err) {
      setImmediate(function() {
        throw err;
      });
    });
    return expose();
  }

  expose(error);
  function error(fn) {
    errorHandler = fn;
  }

  resolved['injector'] = {
    name: 'injector',
    promise: Promise.resolve(expose()),
    bundle: curBundle.join('.'),
    visibility: curBundle.join('.')
  };

  return expose();

};
