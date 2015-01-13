'use strict';
var octojs = require('../index'),
    expect = require('chai').expect;

suite('octojs', function() {


  test('Resolve', function() {
    return octojs()
    .factories({
      someValue: function() {
        return 'value';
      }
    })
    .inject()
    .resolve(function(someValue) {
      return expect(someValue).to.eql('value');
    });
  });

  test('Resolve Sync', function() {
    var octo = octojs()
    .factories({
      someValue: function() {
        return 'value';
      }
    })
    .inject();

    expect(octo.resolveNameSync('someValue')).to.eql('value');
    expect(octo.resolveSync(function(someValue) {
      expect(someValue).to.eql('value');
    }));
  });

});