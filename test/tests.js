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

  test('Resolve sync', function() {
    var octo = octojs()
    .factories({
      someValue: function() {
        return 'value';
      }
    })
    .inject();

    expect(octo.resolveNameSync('someValue')).to.equal('value');
    expect(octo.resolveSync(function(someValue) {
      expect(someValue).to.equal('value');
    }));
  });

  test('Resolve dependencies sync', function() {
    var octo = octojs()
    .values({
      someValue: 'value'
    })
    .factories({
      someOtherValue: function(someValue) {
        return 'other' + someValue;
      },
      dependant: function(someValue, someOtherValue) {
        return someValue + ' ' + someOtherValue;
      }
    })
    .inject();

    expect(octo.resolveNameSync('dependant'))
    .to.equal('value othervalue');
  });

});