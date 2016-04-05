import esprima = require ('esprima');
import estraverse = require ('estraverse');
import escodegen = require ('escodegen');
var Promise = require ('bluebird');
import _ = require ('underscore');

import ChromeTesterClient = require ('../tester/chrome-tester-client');
import ConcreteMemory = require ('./memory/concrete-memory');
import CoverageFunction = require ('../context/coverage/coverage-function');
import {BranchType, CoverageBranch} from '../context/coverage/coverage-branch';
import CoverageStatement = require ('../context/coverage/coverage-statement');
import cUtils = require ('../context/coverage/coverage-utils');
import LeenaConfiguration = require ('../config');
import {LoopRecord, LoopTable} from './loop-summarization/loop-record';
import ParserExpression = require ('./smt-wrapper/parser-expression');
import SMTSolver = require ('./smt-wrapper/smt-solver');
import sUtils = require ('./symbolic-execution-utils');
import SymEval = require ('./symbolic-evaluation');
import SymbolicMemory = require ('./memory/symbolic-memory');


interface ConnectionInformation {
  hostname : string;
  port : number;
}

interface Parameter {
  id : string;
  type : string;
  value : any;
  symbolicallyExecute : boolean;
}

interface Response {
  errors : Array<string>;
  testCases : Array<Object>;
  results : Array<Object>;
}

interface StackBranch {
  branch : number;
  done : boolean;
  M : ConcreteMemory;
  S : SymbolicMemory;
  preOrPostCondition : boolean;
  ignore : boolean;
}

class SymbolicExecution {
  // Name of the function that we want to test
  private functionName : string;

  // Instance of Chrome Tester Client
  private chromeClient : ChromeTesterClient;

  // Parameters that user pass to the 'inspect' functionName
  private uParameters : any;

  // Parsed parameters by adding types and values to 'uParameters'
  private parsedParameters : any;

  // Parameters of last execution
  private lParameters : any;

  // Response object from 'inspectFunction'
  private response : Response;

  // Leena configuration
  private leenaConfig : LeenaConfiguration;

  // SMT Solver used to solve path constraints
  private smtSolver : SMTSolver;

  // Concrete memory
  private M : ConcreteMemory;

  // Symbolic memory
  private S : SymbolicMemory;


  constructor (functionName : string, options : ConnectionInformation) {
    this.functionName = functionName;
    this.chromeClient = new ChromeTesterClient ({
      hostname: options.hostname,
      port: options.port
    });
    this.M = new ConcreteMemory ();
    this.S = new SymbolicMemory ();
  }

  public inspectFunction (uParameters : any, cb : (res : any) => void) : void {
    var that = this;

    // Init response object
    this.response = <Response> {};
    this.response.errors    = [];
    this.response.testCases = [];
    this.response.results   = [];

    // Init uParameters
    this.uParameters = uParameters;

    // Get Leena configuration
    this.chromeClient.getConfiguration (function (err, res) {
      if (err) {
        that.response.errors.push ('Unable to get the global configuration');

        cb (that.response);
      } else {
        that.leenaConfig = res;

        // Init the SMT-solver
        try {
          that.smtSolver = new SMTSolver (
            that.leenaConfig.solver.name,
            that.leenaConfig.solver.path,
            that.leenaConfig.browserSync.webServer.server
          );

          // SMT-solver initialized correctly -> we can initialize the function
          that.initializeFunction (function () {
            // 'response' object is updated by other functions
            cb (that.response);
          });
        } catch (e) {
          that.response.errors.push (e.message);

          cb (that.response);
        }
      }
    });
  }

  private initializeFunction (cb : () => void) : void {
    var that = this;
    var fName = this.functionName;

    // Get the instance of the function
    this.chromeClient.getFunctionInstance (fName, function (err, res) {
      if (err) {
        that.response.errors.push ('Unable to get instance of function "' + fName + '"');
        cb ();
      } else {
        var retParseSignature : any = sUtils.parseFunctionSignature (
          res.name,
          res.parameters,
          that.uParameters
        );

        // Errors during the parsing of the signature of the function
        if (retParseSignature.errors.length > 0) {
          that.response.errors = retParseSignature.errors;
          cb ();
        } else {
          that.parsedParameters = retParseSignature.parameters;

          // No errors between the parameters of the function and the parameters
          // specified by the user -> we can symbolically execute the function
          that.runDART (retParseSignature.parameters, function () {
            cb ();
          });
        }
      }
    });
  }

  // 'parametersFirstExecution' example:
  //   {"param_name" : {"param_type" : TYPE, "param_value" : VALUE}, ...}
  private runDART (parametersFirstExecution : any, cb : () => void) : void {
    var that = this;
    var stackBranch : Array<StackBranch> = [];

    this.instrumentedProgram (stackBranch, parametersFirstExecution, function () {
      cb ();
    });
  }

  private instrumentedProgram (stackBranch : Array<StackBranch>, parameters : any,
                               cb : () => void) : void {
    var that = this;

    //console.log ('call instrumentedProgram');
    //console.log (parameters);
    //console.log (stackBranch);
    //console.log ('****** Execute function with:' + sUtils.getActualParameters (parameters) + ' ******');
    //console.log ('\n\n\n\n\n');

    //
    this.response.testCases.push (sUtils.getTestCase (parameters));

    //
    this.lParameters = _.clone (parameters);

    // Initialize concrete/symbolic memory
    for (var pName in parameters) {
      if (parameters.hasOwnProperty (pName)) {
        this.M.add (pName, parameters[pName].value);
        this.S.add (pName, pName);
      }
    }

    // Execute function concretely
    this.chromeClient.executeFunctionWithDebugger (
      this.functionName,
      sUtils.getActualParameters (parameters),
      function (err, res) {
        if (err) {
          that.response.errors.push ('Unable to execute function with "executeFunctionWithDebugger"');
          cb ();
        } else {
          //
          that.response.results.push (res.result);

          that.analyzeStatements (stackBranch, res, function (err, res) {
            if (err) {
              var errorMessage = (err instanceof Error)
                ? err.message
                : 'Uknown error'

              that.response.errors.push (errorMessage);
              cb ();
            } else {
              var rs = res.directed;

              if (rs === 1) {
                that.instrumentedProgram (res.stackBranch, res.parameters, cb);
              } else {
                if (rs !== 0) {
                  that.response.errors.push ('Uknown directed search value (' + rs + ')');
                }
                cb ();
              }
            }
          });
        }
      }
    );
  }

  private analyzeStatements (stackBranch : Array<StackBranch>, resExecFunction : any,
                             cb : (err, res) => void) : void {
    var functionI : CoverageFunction = resExecFunction.function;
    var execBranches : Array<CoverageBranch>;
    var pathConstraint : Array<string> = [];
    var LR : LoopRecord = new LoopRecord ();
    var statementTable : Array<sUtils.StatementEntry> = [];
    var that = this;

    // Get all executed branches of the function
    execBranches = _.filter (functionI.branches, function (b) {
      return (b.nExecutions > 0);
    });

    //
    this.analyzeStatement (
      // Index of the statement (current statement explored)
      0,
      // Control flow graph for the current execution
      resExecFunction.cfgStatements,
      // Array of all the statements declared inside the function
      functionI.statements,
      // Index of the branch
      0,
      // All executed branches of the function
      execBranches,
      // Number of executed conditions
      0,
      // Stack of executed branches (with their conditions)
      stackBranch,
      // Path constraint
      pathConstraint,
      // Loop record,
      LR,
      // Scope of the current statement
      resExecFunction.scope,
      //
      statementTable,
      function (err, res) {
        if (err) {
          cb (err, null);
        } else {
          var executedConditions : number = res['executedConditions'];

          that.solvePathConstraint (executedConditions, pathConstraint, stackBranch, function (err, res) {
            cb (err, res);
          });
        }
      }
    );
  }

  private analyzeStatement (indexCFG : number, cfgStatements : Array<string>,
                            statements : Array<CoverageStatement>,
                            indexB : number, branches : Array<CoverageBranch>,
                            executedConditions : number, stackBranch : Array<StackBranch>,
                            pathConstraint : Array<string>, LR : LoopRecord,
                            scope : Array<any>,
                            statementTable : Array<sUtils.StatementEntry>,
                            cb : (err, res) => void) : void {
    var s : CoverageStatement;
    var statementAST : any;
    var ptData : Array<SymEval.PathConstraintData> = [];
    // Empty promise
    var promiseUpdateGT : any = Promise.resolve ();
    var that = this;

    if (indexCFG < cfgStatements.length) {
      // Get the statement through its key
      s = _.find (statements, function (s) {
        return (s.key === cfgStatements[indexCFG]);
      });
      if (s === undefined) {
        cb (
          new Error (
            '[analyzeStatement] Exception. Reason: unable to find statement with key "' +
            cfgStatements[indexCFG] + '"'
          ),
          null
        )
      }

      // Check if the statement is a a loop
      try {
        statementAST = sUtils.getAST (s.instruction);

        // Statement is loop
        if (statementAST.hasOwnProperty ('type') && cUtils.nodeIsLoop (statementAST.type)) {
          try {
            // Add the loop in the stack
            LR.addLoop (s.key, statementAST);

            // Create IVT and GT tables
            LR.createTables ();

            // Increment the iteration of the current loop
            LR.incrementIteration ();
          } catch (e) {
            cb (e, null);
          }
        }

        // Set the index of branch based on the 'statementTable'
        var statementKeyInTable : number = -1;

        if ((statementKeyInTable = sUtils.statementInsideTable (s.key, statementTable)) !== -1) {
          indexB = statementTable[statementKeyInTable].branchesIndexes[0];
        }

        // Evaluate the current statement symbolically
        SymEval.evaluateSymbolic (statementAST, indexB, branches, this.M, this.S, ptData, LR, function (err, res) {
          if (err) {
            cb (err, null);
          } else {
            // Evaluate the current statement concretely
            if (indexCFG >= scope.length) {
              cb (
                new Error ('indexCFG >= scope.length'),
                null
              );
            }
            SymEval.evaluateConcrete (scope[indexCFG], that.M);

            // Handle loop summarization
            if (LR.isActive ()) {
              // Loop is active. It means that we encounter a loop previously.
              // Now, we can check if the current statement is declared inside
              // the last encountered loop:
              //   - 'true' : we have to check if the current statement
              //              is the last statement executed during the current
              //              iteration of the loop:
              //                * 'true' : increment the iteration. In this case
              //                           we have to check if it is also the last
              //                           iteration of the current statement
              //                           inside the current loop:
              //                             - 'true' : we can pop the current loop
              //                                        from the stack
              //   - if 'false' : we can pop the current loop from the stack
              if (LR.isStatementDeclaredInsideLoop (s.key)) {
                // Check if the statement is a branch => update the guard table (GT)
                if (statementAST.hasOwnProperty ('type') && cUtils.nodeIsBranch (statementAST.type)) {
                  // Update the GT table
                  if (ptData.length === 0) {
                    cb (
                      new Error ('Unable to update GT table ' +indexB + ', '+ ptData.length + ', ' + s.instruction),
                      null
                    );
                  } else if (sUtils.conditionIsSymbolic (ptData[0].ast, that.S, that.parsedParameters)) {
                    promiseUpdateGT = Promise.promisify (LR.updateGT.bind (LR)) (
                      s.key,
                      ptData[0].ast,
                      ptData[0].resultCondition,
                      pathConstraint,
                      stackBranch,
                      executedConditions,
                      that.M,
                      that.S
                    );
                  }
                }

                // Check if we need to update:
                //   - the loop iteration;
                //   - [the IV table (IVT)] ^ [guess postconditions];

                // Get the next statement key
                var nextStatementKey : string;
                var isLastStatementInsideLoop : boolean;

                nextStatementKey = (indexCFG + 1 < cfgStatements.length)
                  ? cfgStatements[indexCFG + 1]
                  : null;

                isLastStatementInsideLoop = (nextStatementKey === null ||
                  LR.isLastStatementDeclaredInsideLoop (s.key, nextStatementKey));

                // Current statement is the last statement of the loop for the
                // current iteration =>
                //   - Increment the iteration of the loop.
                //   - Update the IV table.
                //   - Guess postconditions.
                if (isLastStatementInsideLoop) {
                  // Update the IVT table
                  try {
                    // Increment the iteration
                    LR.incrementIteration ();

                    // Update the IVT table
                    LR.updateIVT (that.M, that.S);

                    // Guess the postconditions
                    LR.guessPostconditions (that.S);
                  } catch (e) {
                    cb (e, null);
                  }

                  if (LR.isLastIteration (s.key, nextStatementKey)) {
                    try {
                      LR.deleteLoop ();
                    } catch (e) {
                      cb (e, null);
                    }
                  }
                }
              } else {
                // Loop is active but the current statement is not declared
                // inside a loop ==> we have to pop the loop from the stack
                try {
                  LR.deleteLoop ();
                } catch (e) {
                  cb (e, null);
                }
              }
            } // End of 'LR.isActive ()'

            promiseUpdateGT.then (function (newExecutedConditions) {
              // Empty promise
              /*if (newExecutedConditions === undefined) {
                newExecutedConditions = executedConditions;
              }*/
              newExecutedConditions = executedConditions;

              // Update the path constraint with 'ptData':
              //   - 'ptData' contains information about the path constraint
              //   - (ptData.length = [size of executed branches for this statement])
              for (var k = 0; k < ptData.length; k++) {
                // Update the path constraint if and only if the path constraint
                // is symbolic
                if (sUtils.conditionIsSymbolic (ptData[k].ast, that.S, that.parsedParameters)) {
                  try {
                    that.updateStack (
                      ptData[k].condition,
                      ~~ptData[k].resultCondition,
                      newExecutedConditions++,
                      stackBranch
                    );
                  } catch (e) {
                    cb (e, null);
                  }

                  // Update the path constraint
                  pathConstraint.push (ptData[k].condition);
                }

                // Update the table
                if (statementKeyInTable === -1) { // Statement has not yet been inserted
                  sUtils.addStatementInTable (
                    s.key,
                    ptData[k].indexBranch,
                    statementTable
                  );
                }
              }

              // Update the index of the next branch to examine
              if (statementKeyInTable === -1) {
                if (statementTable.length > 0) {
                  indexB = statementTable[statementTable.length - 1].branchesIndexes[0] + 1;
                } else {
                  indexB = 0;
                }
              }

              // We explore all the statements for the current execution
              if (indexCFG === (cfgStatements.length - 1)) {
                cb (null, { 'executedConditions' : newExecutedConditions });

                if (LR.isActive ()) {
                  LR.echoIVT ();
                  LR.echoGT ();
                }
              } else {
                that.analyzeStatement (
                  ++indexCFG,
                  cfgStatements,
                  statements,
                  indexB,
                  branches,
                  newExecutedConditions,
                  stackBranch,
                  pathConstraint,
                  LR,
                  scope,
                  statementTable,
                  cb
                );
              }
            }).catch (function (err) {
              cb (err, null);
            });
          }
        });
      } catch (e) {
        cb (e, null);
      }
    } // End of 'if (indexS < statements.length)'
  }

  private updateStack (condition : string, branch : number, index : number,
                       stackBranch : Array<StackBranch>) : void {
    if (index < stackBranch.length) {
      if (stackBranch[index].branch !== branch) {
        throw new Error ('Unable to update the stack. Condition: "' + condition + '"');
      } else if (index === (stackBranch.length - 1)) {
        stackBranch[index].branch = branch;
        stackBranch[index].done   = true;
      }
    } else {
      var stackE = <StackBranch> {};

      stackE.branch = branch;
      stackE.done = false;
      stackE.M = _.clone (this.M);
      stackE.S = _.clone (this.S);
      stackBranch.push (stackE);
    }
  }

  private solvePathConstraint (kTry : number, pathConstraint : Array<string>,
                               stackBranch : Array<StackBranch>,
                               cb : (err : Error, res : any) => void) : void {
    var that = this;
    var j : number = - 1;

    for (var k = (kTry - 1); k >= 0; k--) {
      if (!stackBranch[k].done) {
        j = k;
        break;
      }
    }

    if (j === -1) { // This directed search is over
      cb (null, {
        'directed' : 0,
        'parameters' : {}
      });
    } else { // This directed search is not over
      pathConstraint[j] = '!(' + pathConstraint[j] + ')';
      stackBranch[j].branch = (stackBranch[j].branch === 0)
        ? 1
        : 0;

      // Update the path constraint
      var newPathConstraint : Array<any> = [];
      for (var k = 0; k <= j; k++) {
        newPathConstraint.push ({
          'constraint' : pathConstraint[k],
          'M' : stackBranch[k].M,
          'S' : stackBranch[k].S
        });
      }

      var s = [];
      for (var k = 0; k < newPathConstraint.length; k++) {
        s.push (newPathConstraint[k].constraint);
      }

      this.getPathConstraintSolution (newPathConstraint, function (err, res) {
        if (err) {
          cb (
            new Error ('Unable to get the solution of the path constraint. Reason: ' + err.message),
            null
          );
        } else {
          // Object with properties: 'isSAT':boolean, 'values':object
          if (res.isSAT) { // Path constraint has a solution
            // Update actual parameters for the next execution
            var newParams = _.clone (that.parsedParameters);
            for (var pName in newParams) {
              if (newParams.hasOwnProperty (pName)) {
                newParams[pName].value = (res.values[pName] !== undefined)
                  ? res.values[pName]
                  : (that.lParameters[pName] !== undefined)
                    ? that.lParameters[pName].value
                    : sUtils.getDefaultValue (that.lParameters[pName].type);
              }
            }

            // Update the stack
            var newStackBranch : Array<StackBranch> = [];
            for (var k = 0; k <= j; k++) {
              newStackBranch.push (stackBranch[k]);
            }

            // Callback
            cb (null, {
              'directed' : 1,
              'parameters' : newParams,
              'stackBranch' : newStackBranch
            });
          } else { // Path constraint has no solution
            that.solvePathConstraint (j, pathConstraint, stackBranch, cb);
          }
        }
      });
    }
  }

  private getPathConstraintSolution (pathConstraint : Array<any>,
                                     cb : (err, res : any) => void) : void {
    var params : Array<any> = [];

    for (var pName in this.uParameters) {
      if (this.uParameters.hasOwnProperty (pName)) {
        params.push ({
          'id' : pName,
          'type' : this.uParameters[pName].type,
          'value' : this.uParameters[pName].value,
          'symbolicallyExecute' : true
        });
      }
    }

    var parserExpression = new ParserExpression (
      pathConstraint,
      params,
      this.smtSolver.getName (),
      this.chromeClient,
      null//this.parametersLastExecution
    );
    var that = this;

    try {
      parserExpression.parse (function (err, smtExpression) {
        if (err) { // Error while parsing the path constraint
          var errorMessage : string;

          //
          // Callback should be removed
          //

          if (err instanceof Error) {
            errorMessage = err.message;
          } else {
            errorMessage = 'Error while parsing expression';
          }
          that.response.errors.push (errorMessage);

          cb (errorMessage, null);
        } else { // Error while run the SMT expression
          that.smtSolver.run (smtExpression, function (err, res) {
            if (err) {
              that.response.errors.push ('Unable to run SMT expression');
              console.log (smtExpression)
              cb (true, null);
            } else {
              // Object with properties: 'isSAT' : boolean, 'values' : object
              var smtResponse = that.smtSolver.parseResponse (res);

              cb (false, smtResponse);
            }
          });
        }
      });
    } catch (e) {
      that.response.errors.push (e.message);
      cb (true, null);
    }
  }
}

export = SymbolicExecution;
