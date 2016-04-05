import chalk = require ('chalk');
import escodegen = require ('escodegen');
import _ = require ('underscore');

import Leena = require ('../../../src/back-end/leena');
import ChromeClient = require('../../../src/back-end/tester/chrome-tester-client');
import u = require ('../../test-utils');


var leena = new Leena ({
  hostname: 'localhost',
  port: 4004
});

var chromeClient = new ChromeClient ({
  hostname: 'localhost',
  port: 4004
});

export
function testFunction (indexFunction : number, functionsToTest : Array<any>,
                       leenaResponseObject : Array<any>,
                       cb : () => void) : void {
  if (indexFunction < functionsToTest.length) {
    var fName : string      = functionsToTest[indexFunction].functionName;
    var pFunc : any         = functionsToTest[indexFunction].parameters;
    var nTestCases : number = functionsToTest[indexFunction].nTestCases;

    u.desc ('    Testing ' + chalk.bgWhite.black (fName), function () {
      leena.inspect (fName, pFunc, function (res) {
        // 'res' is an object with these properties:
        // interface Response {
        //   errors : Array<string>;
        //   testCases : Array<Object>;
        //   results : Array<Object>;
        // }
        //console.log (res);
        u.assert (res.hasOwnProperty ('errors'), 'res must have property "errors"');
        u.assert (res.hasOwnProperty ('testCases'), 'res must have property "testCases"');
        u.assert (res.hasOwnProperty ('results'), 'res must have property "results"');

        u.assert (_.isArray (res.errors), '"res.errors" must be an array');
        u.assert (_.isArray (res.testCases), '"res.testCases" must be an array');
        u.assert (_.isArray (res.results), '"res.results" must be an array');

        if (res.errors.length !== 0) {
          u.printError ('"res.errors" must be an array with length equals to 0');
          console.log (res.errors);
          process.exit (1);
        }

        if (nTestCases !== undefined) {
          u.assert (nTestCases === res.testCases.length,
            'nTestCases !== res.testCases.length, (' + nTestCases + ' !== ' +
            res.testCases.length + ')'
          );
        } else {
          console.log (res.testCases.length)
        }
        /*
        u.assert (res.testCases.length === res.results.length,
          'res.testCases.length !== res.results.length, (' + res.testCases.length
           + ' !== ' + res.results.length + ')'
        );*/

        leenaResponseObject.push (JSON.stringify (res, null, 2));

        if (indexFunction < (functionsToTest.length - 1)) {
          testFunction (++indexFunction, functionsToTest, leenaResponseObject, cb);
        } else {
          cb ();
        }
      });
    });
  }
}

export
function getSourceFunction (indexFunction : number, functions : Array<any>,
                            fSources : Array<string>,
                            cb : () => void) : void {
  if (indexFunction < functions.length) {
    var fName : string = functions[indexFunction].functionName;

    u.desc ('    Get source of function ' + chalk.bgWhite.black (fName), function () {
      chromeClient.getFunctionInstance (fName, function (err, res) {
        if (err) {
          u.printError (err.message);
          cb ();
        } else {
          fSources.push (escodegen.generate (res.functionAST));

          if (indexFunction < (functions.length - 1)) {
            getSourceFunction (++indexFunction, functions, fSources, cb);
          } else {
            cb ();
          }
        }
      });
    });
  }
}
