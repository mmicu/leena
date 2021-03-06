import _ = require ('underscore');

import ChromeClient = require ('../../tester/chrome-tester-client');
import CoverageFunction = require ('./coverage-function');
import CoverageBranch = require ('./coverage-branch');
import CoverageStatement = require ('./coverage-statement');
import LeenaConfiguration = require ('../../config');


class CoverageObject {
  // Name of the coverage object generated by Istanbul
  public name : string;

  // Value of the coverage object generated by Istanbul
  public value : any;

  // Temporary path of the file where the coverage object is present
  private pathTempFile : string;

  // AST of the original JavaScript file (before the instrumentation)
  public originalAST : any;

  // Functions declared inside the JavaScript file
  private coverageFunctions : Array<CoverageFunction>;

  // Chrome client
  private chromeClient : ChromeClient;

  // Leena configuration
  private leenaConfig : LeenaConfiguration;


  constructor (name : string, pathTempFile : string, leenaConfig : LeenaConfiguration,
               originalAST : any, cb : (err : Error, res : any) => void) {
    this.name = name;
    this.pathTempFile = pathTempFile;
    this.leenaConfig = leenaConfig;
    this.originalAST = originalAST;
    this.chromeClient = new ChromeClient ({
      hostname: this.leenaConfig.chromeTester.testerServer.hostname,
      port: this.leenaConfig.chromeTester.testerServer.port
    });
    this.coverageFunctions = [];
    this.initializeChrome (cb);
  }

  public update () : void {

  }

  public containsFunction (functionName : string) : boolean {
    return this.getFunctionIndex (functionName) !== -1;
  }

  public executeFunction (functionName : string,
                          cb : (err : Error, res) => void) : void {
    var index : number = this.getFunctionIndex (functionName);
    var error : Error;
    var that = this;

    if (index === -1) {
      throw new Error ('Unable to execute function "' + functionName + '". It does not exist');
    } else if (index < 0 || index >= this.coverageFunctions.length) {
      throw new Error ('Unable to execute function "' + functionName + '". Out of range');
    }

    // Execution is already done by Chrome. Execution of the function in this
    // context means the update of the object 'CoverageFunction' using
    // the value of the coverage object generated by Istanbul
    // We must get the value since the function has been executed
    this.chromeClient.getCoverageObject (this.name, function (err, res) {
      if (err) {
        error = new Error (
          'Unable to establish connection to update the coverage object after function execution'
        );

        cb (error, null);
      } else if (res) {
        try {
          // res -> value of the coverage object
          that.coverageFunctions[index].execute (res, cb);
        } catch (e) {
          error = new Error (
            'Unable to update the coverage object after function execution. Reason: ' + e.message
          );

          cb (error, null);
        }
      }
    });
  }

  public getFunctionInstance (functionName : string) : CoverageFunction {
    var index : number = this.getFunctionIndex (functionName);

    if (index === -1) {
      throw new Error ('Unable to get function instance. Function "' + functionName + '" does not exist');
    } else if (index < 0 || index >= this.coverageFunctions.length) {
      throw new Error ('Unable to get function instance of function "' + functionName + '". Index out of range');
    }

    return this.coverageFunctions[index];
  }

  public updateFunctionInstance (functionName : string, functionI : CoverageFunction) : void {
    var index : number = this.getFunctionIndex (functionName);

    if (index === -1) {
      throw new Error ('Unable to get function instance. Function "' + functionName + '" does not exist');
    } else if (index < 0 || index >= this.coverageFunctions.length) {
      throw new Error ('Unable to get function instance of function "' + functionName + '". Index out of range');
    }

    this.coverageFunctions[index] = functionI;
  }

  private initializeChrome (cb : (err : Error, res : any) => void) {
    var that = this;

    this.chromeClient.getCoverageObject (this.name, function (err, res) {
      if (err) {
        cb (err, null);
      } else if (res) {
        that.value = res;

        try {
          that.parseCoverageObject ();

          // We don't need of the real value of 'res' (coverage object
          // generated by Istanbul). It will be used only here.
          // For the callback, it's important that there is no errors
          cb (null, true);
        } catch (e) {
          cb (e, null);
        }

      }
    });
  }

  private parseCoverageObject () : void {
    var pathCoverageObject : string;
    var functionMapObj : any;

    pathCoverageObject = this.value.path;

    // Check if property 'path' of the coverage object is equal
    // to the 'pathTempFile' attribute
    if (pathCoverageObject !== this.pathTempFile) {
      throw new Error (
        [
          'Property "path" is different from temporary path. (',
          pathCoverageObject,
          ', ',
          this.pathTempFile,
          ')'
        ].join ('')
      );
    }
    // Paths are equal
    functionMapObj = this.value.fnMap;

    for (var function_ in this.value.fnMap) {
      if (this.value.fnMap.hasOwnProperty (function_)) {
        try {
          this.addFunction (parseInt (function_));
        } catch (e) {
          throw e;
        }
      }
    }
  }

  private addFunction (functionKey : number) : void {
    var covFunction : CoverageFunction;

    try {
      covFunction = new CoverageFunction (
        functionKey,
        this.value.fnMap[functionKey].name,
        this.originalAST,
        this.pathTempFile,
        this.name
      );

      covFunction.setStartLocation (
        this.value.fnMap[functionKey].loc.start,
        this.value.fnMap[functionKey].loc.end
      );

      covFunction.setEndLocation (this.originalAST);

      covFunction.addStatements (this.value.s, this.value.statementMap);
      covFunction.addBranches (this.value.b, this.value.branchMap);

      this.coverageFunctions.push (covFunction);
    } catch (e) {
      throw e;
    }
  }

  private getFunctionIndex (functionName : string) : number {
    for (var k = 0; k < this.coverageFunctions.length; k++) {
      if (this.coverageFunctions[k].name === functionName) {
        return k;
      }
    }

    return -1;
  }
}

export = CoverageObject;
