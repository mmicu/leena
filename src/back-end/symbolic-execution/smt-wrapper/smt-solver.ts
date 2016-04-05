import childProcess = require ('child_process');
import path = require ('path');

import _ = require ('underscore');

import utils = require ('../../utils');


class SMTSolver {
  private name : string;
  private path : string;
  private tempPath : string;
  private pathFile : string;
  private pathExpression : string;
  private contentExpression : string;
  private tokenExpression : Array<string>;

  private static availableSolvers : Array<string> = [
    'z3',
    'z3-str',
    'cvc4'
  ];

  private static SMTSatisfiabilityResponses : Array<string> = [
    'sat',
    'unsat',
    'unknown'
  ];

  constructor (name : string, path : string, tempPath : string) {
    if (SMTSolver.availableSolvers.indexOf (name) === -1) {
      throw new Error ('Unknown solver "' + name + '"');
    }
    this.name = name;
    this.path = path;
    this.tempPath = tempPath;
    try {
      this.setPathFile ();
    } catch (e) {
      throw e;
    }
  }

  public run (expression : string, cb : (err : Error, res) => void) {
    utils.writeOnFile (this.pathFile, expression);

    this.executeExpression (this.pathFile, function (err, res) {
      if (err) {
        cb (err, null);
      } else {
        cb (null, res);
      }
    });
  }

  private executeExpression (pathFile : string, cb : (err : Error, res) => void) : void {
    var exec;
    var args : Array<string>;
    var res : string = '';
    var appPath : string = this.path;

    if (this.name === 'cvc4') {
      args = [
        '-L',
        'smt2',
        pathFile
      ];
    } else if (this.name === 'z3') {
      args = [
        '-smt2',
        pathFile
      ];
    } else if (this.name === 'z3-str') {
      args = [
        this.path,
        '-f',
        pathFile
      ];

      appPath = 'python';
    }

    exec = childProcess.spawn (appPath, args);

    exec.stdout.setEncoding ('utf8');
    exec.stdout.on ('data', function (data) {
      res += data.toString ().trim () + '\n';
    });

    exec.on ('close', function (code) {
      if (code === 0) {
        cb (null, res);
      } else {
        cb (new Error ('Exit code different from 0'), null);
      }
    });
  }

  public parseResponse (response : string) : any {
    var ret = {
      isSAT: false,
      values: {}
    };
    var tokensResponse : Array<string> = response.match (/\"(.+)\"|\S+/g);

    ret.isSAT = this.isSAT (tokensResponse);
    if (ret.isSAT) {
      ret.values = this.getValues (tokensResponse);
    }

    return ret;
  }

  private isSAT (tokens : Array<string>) : boolean {
    var index : number;

    if (!_.isArray (tokens)) {
      return false;
    }

    for (var k = 0; k < tokens.length; k++) {
      index = SMTSolver.SMTSatisfiabilityResponses.indexOf (tokens[k].toLowerCase ());

      if (index !== -1) {
        return (index === 0);
      }
    }

    return false;
  }

  private getValues (tokens : Array<string>) : any {
    var obj = {};
    var t : Array<string> = tokens.slice (0);
    var identifier : string;
    var value : any;

    if (this.name === 'cvc4' || this.name === 'z3') {
      // Start from 1 since first token represents satisfiability
      for (var k = 1; k < t.length; k++) {
        t[k] = t[k].replace (/\(/g, '').replace (/\)/g, '');
      }

      // Start from 1 since first token represents satisfiability
      for (var k = 1; k < t.length; k++) {
        if (t[k].match (/[a-zA-Z0-9_]/) !== null) {
          identifier = t[k];

          if (++k < t.length) {
            if (t[k] === '-') {
              if (++k < t.length) {
                obj[identifier] = parseInt ('-' + t[k]);
              }
            } else if (t[k].length > 0 && t[k].charAt (0) === '"' &&
                       t[k].charAt (t[k].length - 1) === '"') {
                t[k] = t[k].substring (1, t[k].length - 1);
                obj[identifier] = t[k];
            } else {
              obj[identifier] = parseInt (t[k]);
            }
          }
        }
      }
    } else if (this.name === 'z3-str') {
      for (var k = 0; k < t.length; k++) {
        // param_name ':' param_type '->' param_value
        // s,:,string,->,"aa,"
        if (t[k] === ':') {
          if (k - 1 >= 0 && k + 3 < t.length) {
            identifier = t[k - 1];
            value = t[k + 3];

            if (value.length > 0 && value.charAt (0) === '"' &&
              value.charAt (value.length - 1) === '"') {
              value = value.substring (1, value.length - 1);
              obj[identifier] = value;
            } else {
              obj[identifier] = parseInt (value);
            }
          }

          k += 4;
        }
      }
    }

    return obj;
  }

  private setPathFile () : void {
    var maxIterations : number = 100;
    var pathFile : string;
    var randomName : string;

    for (var k = 0; k < maxIterations; k++) {
      randomName = Math.random ().toString (36).substring (10);
      pathFile   = path.join (this.tempPath, randomName + '.smt2');

      if (!utils.fileExists (pathFile)) {
        this.pathFile = pathFile;
        return;
      }
    }

    throw new Error ('Unable to set filename of SMT file');
  }

  public getName () : string {
    return this.name;
  }
}

export = SMTSolver;
