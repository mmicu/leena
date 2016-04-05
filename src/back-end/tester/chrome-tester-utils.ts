import esprima = require ('esprima');
import escodegen = require ('escodegen');
import estraverse = require ('estraverse');
import _ = require ('underscore');

import {BranchType, CoverageBranch} from '../context/coverage/coverage-branch';
import CoverageFunction = require ('../context/coverage/coverage-function');
import CoverageStatement = require ('../context/coverage/coverage-statement');
import utils = require ('../utils');


export
function updateFunctionStatement (oldCoverageObj : any, newCoverageObj : any) : any {
  var oldStatements : any = oldCoverageObj.s;
  var newStatements : any = newCoverageObj.s;
  var retValue : any = {
    'update' : false,
    'statementKey' : undefined
  };

  for (var stmtkey in oldStatements) {
    if (oldStatements.hasOwnProperty (stmtkey) && newStatements.hasOwnProperty (stmtkey)) {
      if (oldStatements[stmtkey] !== newStatements[stmtkey]) {
        retValue.update = true;
        retValue.statementKey = stmtkey;

        // Udate one statement at a time since we execute the function with
        // the debugger
        break;
      }
    }
  }

  return retValue;
}

export
function updateFunctionBranch (oldCoverageObj : any, newCoverageObj : any) : any {
  var oldBranches : any = oldCoverageObj.b;
  var newBranches : any = newCoverageObj.b;
  var oldResultCondition : Array<number>;
  var newResultCondition : Array<number>;
  var substractionCondition : Array<number>;
  var retValue : any = {
    'update' : false,
    'branchesKeys' : [],
    'conditionsResults' : []
  };

  for (var branchKey in oldBranches) {
    if (oldBranches.hasOwnProperty (branchKey) && newBranches.hasOwnProperty (branchKey)) {
      // We have to check if there is a difference between the current value
      // of the condition and the last value of the condition.
      // Conditions are stored based on the type of the branch:
      //   * If : currentValues.length = 2:
      //     - [1, 0] : condition is true;
      //     - [0, 1] : condition is false;
      //   * Switch : currentValues.length => calculated during the parsing of the AST;
      //   * TernaryOperator : currentValues.length = 2:
      //     - [1, 0] : condition is true;
      //     - [0, 1] : condition is false;
      oldResultCondition = _.clone (oldBranches[branchKey]);
      newResultCondition = _.clone (newBranches[branchKey]);

      // Both arrays should be array. We check for safety
      if (_.isArray (oldResultCondition) && _.isArray (newResultCondition)) {
        // Both arrays should be array with same length. We check for safety
        if (oldResultCondition.length === newResultCondition.length) {
          // If arrays are not equal, it means that the branch was executed
          if (!_.isEqual (oldResultCondition, newResultCondition)) {
            try {
              substractionCondition = arraysSubstraction (
                newResultCondition,
                oldResultCondition
              );

              if (!retValue.update) {
                retValue.update = true;
              }

              retValue.branchesKeys.push (branchKey);
              retValue.conditionsResults.push (_.clone (substractionCondition));

              // Udate one branch at a time since we execute the function with
              // the debugger
              //break;
            } catch (e) {
              throw e;
            }
          }
        }
      }
    }
  }

  return retValue;
}

function arraysSubstraction (a : Array<number>, b : Array<number>) : Array<number> {
  // We check length even if it was checked by 'updateFunctionParameters' function
  if (a.length !== b.length) {
    throw new Error ('[arraysSubstraction] Different lengths.');
  }

  var res : Array<number> = [];
  var valueSub : number;

  for (var k = 0; k < a.length; k++) {
    valueSub = a[k] - b[k];

    if (valueSub !== 0 && valueSub !== 1) {
      throw new Error (
        '[arraysSubstraction] Exception. Reason: each element must be 0 or 1 ' +
        'instead of ' + valueSub + ' ([' + a.join (', ') + ']' +
        ' - [' + b.join (', ') + '])'
      );
    }

    res.push (valueSub);
  }

  return res;
}

export
function getLocationOfInstrumentedFunction (functionInstance : CoverageFunction) : any {
  var functionName : string = functionInstance.name;
  var pathFileFunction : string = functionInstance.pathFile;
  var contentFile : string = utils.readFile (pathFileFunction);
  var astFile : any;
  var location : any = null;
  var errorPrefix : string = '[getLocationInstrumentedFunction] Exception. Reason: ';

  // Unable to read file
  if (contentFile === null) {
    throw new Error (errorPrefix + 'content of file is null');
  }

  // Get the AST of the file
  try {
    astFile = esprima.parse (contentFile, { loc: true });
  } catch (e) {
    throw new Error (errorPrefix + 'Unable to parse the AST of the function');
  }

  // Traverse the AST to get the location of the instrumentd function
  estraverse.traverse (astFile, {
    enter: function (node) {
      if (node.type === 'FunctionDeclaration') {
        if (node.id.type === 'Identifier' && node.id.name === functionName) {
          if (node.body.type === 'BlockStatement' && _.isArray (node.body.body) &&
              node.body.body.length > 0) {
            // Set the location
            location = {};
            location.line   = node.body.body[0].loc.start.line;
            location.column = node.body.body[0].loc.start.column;

            // We found the location => we can stop
            this.break ();
          } else { // We found the function but we cannot get the location
            throw new Error (errorPrefix + 'Unable to get the location of the function');
          }
        }
      }
    }
  });

  return location;
}

export
function resolveInjectedVariables (chrome : any, currentScope : any,
                                   injectedVariables : Array<any>,
                                   isMainInjVariable : boolean,
                                   currentObject : any, cb : (err) => void) {
  if (injectedVariables.length === 0) {
    cb (null);
  } else {
    resolveInjectedVariable (chrome, currentScope, 0, injectedVariables, isMainInjVariable, currentObject, function (err) {
      if (err) {
        cb (err);
      } else {
        cb (null);
      }
    });
  }
}

function resolveInjectedVariable (chrome : any, currentScope : any, index : number,
                                  injectedVariables : Array<any>,
                                  isMainInjVariable : boolean,
                                  currentObject : any, cb : (err) => void) {
  if (index < injectedVariables.length) {
    var injVarName : string = injectedVariables[index].name;
    var injVarObjectId : any = injectedVariables[index].objectId;

    currentObject[injVarName] = {};

    chrome.send ('Runtime.getProperties', { 'objectId': injVarObjectId },
      function (err, res) {
        if (err) {
          cb (new Error ('Unable to get objeect var ' + injectedVariables[index].name));
        } else {
          var varName : string;
          var varValue : any;
          var varType : string;
          var newInjectedVariables : Array<any> = [];

          for (var k = 0; k < res.result.length; k++) {
            try {
              varName  = res.result[k].name;
              varValue = res.result[k].value.value;
              varType  = res.result[k].value.type;

              if (varType === 'object') {
                newInjectedVariables.push ({
                  'name' : varName,
                  'objectId' : res.result[k].value.objectId
                });
              } else {
                currentObject[injVarName][varName] = varValue;
              }
            }
            catch (e) {
            }
          }

          resolveInjectedVariables (
            chrome,
            currentScope,
            newInjectedVariables,
            false,
            currentObject[injVarName],
            function (err) {
              if (err) {
                cb (
                  new Error ('second error Runtime.getProperties ' +
                    injectedVariables[index].name)
                );
              } else {
                if (isMainInjVariable) {
                  currentScope[injVarName] = currentObject[injVarName];
                }

                if (index === (injectedVariables.length - 1)) {
                  cb (null);
                } else {
                  resolveInjectedVariable (
                    chrome,
                    currentScope,
                    ++index,
                    injectedVariables,
                    isMainInjVariable,
                    currentObject,
                    cb
                  );
                }
              }
            }
          );
        }
      }
    );
  }
}
