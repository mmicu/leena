import chalk = require ('chalk');
import Promise = require ('bluebird');
import escodegen = require ('escodegen');
import _ = require ('underscore');

import ChromeClient = require ('../../../src/back-end/tester/chrome-tester-client');

import u = require ('../../test-utils');


var chromeClient = new ChromeClient ({
  hostname: 'localhost',
  port: 4004
});

u.desc ('    Testing ' + chalk.bgWhite.black ('executeFunctionWithDebugger'), function () {
  var functionsToTest = [
    {
      'functioName' : 'f_6',
      'parameters' : '5, 2',
      'scope' : [
          {  },
          {  }
      ],
      'function' : {
        'name' : 'f_6'
      },
      'cfgStatements' : ['2', '3']
    }
  ];

  testFunction (0, functionsToTest, function (err : boolean) {
    if (!err) {
      u.printSuccess ('All tests passed');
    }
  });
});

function testFunction (index : number, functionsToTest : Array<any>, cb : (err : boolean) => void) : void {
  if (index < functionsToTest.length) {
    var f : any = functionsToTest[index];
    var fName : string = f.functioName;
    var parameters : string = f.parameters;

    u.desc ('        Testing ' + chalk.bgWhite.black (fName), function () {
      chromeClient.executeFunctionWithDebugger (fName, parameters, function (err, res) {
        if (err) {
          u.printError ('Unable to run \'executeFunctionWithDebugger\' on function "' + fName + '"');
          cb (true);
        } else {
          var branches = res.function.branches;
          var b;
          for (var k = 0;k<branches.length;k++) {
            b = branches[k];
            console.log ('key : ' + b.key);
            console.log ('n exec : ' + b.nExecutions);
            console.log ('n value conditions : ' + b.valuesCondition.length);
            for (var j = 0;j<b.valuesCondition.length;j++) {
              console.log ('  ' + b.valuesCondition[j])
            }
            console.log ();
          }









          // 'res' is an object with:
          //   - function;
          //   - scope;
          //   - cfgStatements.
          //   - result

          // test 'function' property
          u.assert (res.hasOwnProperty ('function'), 'res must have property "function"');
          u.assert (res.function.name === fName, 'res.function.name !== functionsToTest.fName');

          // test 'scope' property
          u.assert (res.hasOwnProperty ('scope'), 'res must have property "scope"');
          u.assert (_.isArray (res.scope), '"res.scope" must be an array');
          u.assert (
            res.scope.length === f.scope.length,
            'res.scope.length must be equal to "' + f.scope.length +
            '" instead of ' + res.scope.length
          );
          /*
          for (var k = 0; k < res.scope.length; k++) {
            u.assert (
              _.isEqual (res.scope[k], f.scope[k]),
              'Different scopes : \n' + JSON.stringify (res.scope[k], null, 2) +
              '\n' + JSON.stringify (f.scope[k], null, 2)
            );
          }
          */

          // test 'cfgStatements' property
          u.assert (
            res.cfgStatements.length === f.cfgStatements.length,
            'res.cfgStatements.length must be equal to "' + f.cfgStatements.length +
            '" instead of ' + res.cfgStatements.length
          );
          u.assert (
            _.isEqual (res.cfgStatements, f.cfgStatements),
            'res.cfgStatements must be equal to "' + f.cfgStatements.join (', ') +
            '" instead of ' + res.cfgStatements.join (', ')
          );

          // test 'result' property
          u.assert (res.hasOwnProperty ('result'), 'res must have property "result"');





          /*
          console.log ('nExecutions')
          for (var k = 0; k < res.function.statements.length; k++) {
            console.log (res.function.statements[k].nExecutions)
          }
          console.log ('res.cfgStatements=[' + res.cfgStatements.join (', ')+']')
          */
          if (index !== (functionsToTest.length - 1)) {
            testFunction (++index, functionsToTest, cb);
          } else {
            cb (false);
          }
        }
      });
    });
  }
}
