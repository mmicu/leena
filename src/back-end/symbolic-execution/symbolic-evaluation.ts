import esprima = require ('esprima');
import escodegen = require ('escodegen');

import {BranchType, CoverageBranch} from '../context/coverage/coverage-branch';
import ChromeTesterClient = require ('../tester/chrome-tester-client');
import ConcreteMemory = require ('./memory/concrete-memory');
import {LoopRecord, LoopTable} from './loop-summarization/loop-record';
import SymbolicMemory = require ('./memory/symbolic-memory');
import sUtils = require ('./symbolic-execution-utils');


export
interface PathConstraintData {
  ast : any;
  condition : any;
  resultCondition : boolean;
  indexCondition : number;
  indexBranch : number;
}

export
function evaluateConcrete (currentScope : any, M : ConcreteMemory) : void {
  for (var variable in currentScope) {
    if (currentScope.hasOwnProperty (variable)) {
      M.add (variable, currentScope[variable]);
    }
  }
}

export
function evaluateSymbolic (node : any,
                           indexB : number, branches : Array<CoverageBranch>,
                           M : ConcreteMemory, S : SymbolicMemory,
                           ptData : Array<PathConstraintData>, LR : LoopRecord,
                           cb : (err : Error, res : any) => void) : void {
  handleExpression (node, indexB, branches, M, S, ptData, LR, function (err, res) {
    cb (err, res);
  });
}

function handleExpression (node : any,
                           indexB : number, branches : Array<CoverageBranch>,
                           M : ConcreteMemory, S : SymbolicMemory,
                           ptData : Array<PathConstraintData>, LR : LoopRecord,
                           cb : (err : Error, res : any) => void) : void {
  switch (node.type) {
    // ------------------------------------------------------------------------
    // Branches management ----------------------------------------------------
    case 'ConditionalExpression':
    case 'IfStatement':
      // We handle the 'test' node to get the path constraint of the current branch
      handleExpression (node.test, indexB, branches, M, S, ptData, LR, function (err, res) {
        if (err) {
          cb (err, null);
        } else {
          if (indexB >= branches.length) {
            cb (null, res);
          } else {
            var branch : CoverageBranch = branches[indexB];
            var ptDataElement : PathConstraintData;
            var resultCondition : Array<number>;
            var indexCondition : number;

            // Since we encountered a branch, we have to add a candidate for
            // the path constraint
            ptDataElement = <PathConstraintData> {};

            // Get the result of the current condition
            if (branch.nExecutions > branch.valuesCondition.length) {
              cb (
                new Error (
                  'Unable to get the result of the condition during the symbolic evaluation'
                ),
                null
              );
            } else {
              // Calculate the index of condition to select ^ Decrement the number
              // of executions
              indexCondition = branch.valuesCondition.length - branches[indexB].nExecutions--;

              if (indexCondition < 0 || indexCondition >= branch.valuesCondition.length) {
                cb (
                  new Error ('handleExpression index of the condition out of range (' +
                    indexCondition + ', ' + branch.valuesCondition.length + ')'),
                  null
                );
              }

              // Get the result of the condition
              resultCondition = branch.valuesCondition[indexCondition];

              // Create the ast for the condition
              ptDataElement.ast = esprima.parse (branch.conditions[0]).body[0];
              // Result of the condition
              ptDataElement.resultCondition = (resultCondition[0] === 1);
              // If the condition is 'false' we negate it
              ptDataElement.condition = (ptDataElement.resultCondition)
                ? res.toString ()
                : '!(' + res.toString () + ')';
              // Increment the number of encountered branches
              ptDataElement.indexBranch = indexB++;
              // Finally, push the path constraint candidate to the list
              ptData.push (ptDataElement);

              cb (null, res);
            }
          }
        }
      });

      break;
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // Loops management -------------------------------------------------------
    case 'DoWhileStatement':
    case 'WhileStatement':
    case 'ForStatement':
      // Do nothing. Loops are handled in 'symbolic-execution.ts'
      cb (null, ptData);

      break;
    // ------------------------------------------------------------------------

    case 'ExpressionStatement':
      handleExpression (node.expression, indexB, branches, M, S, ptData, LR, cb);

      break;

    case 'AssignmentExpression':
      var leftNode  = node.left;
      var rightNode = node.right;

      if (leftNode.type === 'Identifier') {
        var varName : string = leftNode.name;
        var operator : string = node.operator;

        if (operator === '=') {
          if (LR.isActive () && !LR.MODhasProperty (varName)) {
            LR.addEntry (LoopTable.MOD, varName, M, S);

            if (LR.getIteration () === 1) {
              LR.addEntry (LoopTable.IV, varName, M, S);
            }
          }

          handleExpression (rightNode, indexB, branches, M, S, ptData, LR, function (err, res) {
            if (err) {
              cb (err, null);
            } else {
              S.add (varName, res);

              cb (null, res);
            }
          });
        } else { // Generate new AST since we have operators like '+=', '-=', ...
          // Possible assignment operators:
          //    "=" | "+=" | "-=" | "*=" | "/=" | "%=" |
          //    "<<=" | ">>=" | ">>>=" | "|=" | "^=" | "&="
          var realOperator : string = operator.substring (0, operator.length - 1);

          handleExpression (leftNode, indexB, branches, M, S, ptData, LR, function (errL, resL) {
            if (errL) {
              cb (errL, null);
            } else {
              handleExpression (rightNode, indexB, branches, M, S, ptData, LR, function (errR, resR) {
                if (errR) {
                  cb (errR, null);
                } else {
                  S.add (varName, '(' + resL + ')' + realOperator + '(' + resR + ')');

                  cb (null, resR);
                }
              });
            }
          });
        }
      } // End of 'if (leftNode.type === 'Identifier)'

      break;

    case 'UnaryExpression':
      handleExpression (node.argument, indexB, branches, M, S, ptData, LR, function (err, res) {
        if (err) {
          cb (err, null);
        } else {
          cb (null, node.operator + res);
        }
      });

      break;

    case 'BinaryExpression':
    case 'LogicalExpression':
      handleExpression (node.left, indexB, branches, M, S, ptData, LR, function (errL, resL) {
        if (errL) {
          cb (errL, null);
        } else {
          handleExpression (node.right, indexB, branches, M, S, ptData, LR, function (errR, resR) {
            if (errR) {
              cb (errR, null);
            } else {
              cb (null, resL + node.operator + resR);
            }
          });
        }
      });

      break;

    case 'VariableDeclarator':
      if (node.id.type === 'Identifier') {
        var varName : string = node.id.name;

        // Expression can be null (var p;)
        if (node.init === null) {
          S.add (varName, undefined);

          cb (null, undefined);
        } else {
          handleExpression (node.init, indexB, branches, M, S, ptData, LR, function (err, res) {
            if (err) {
              cb (err, null);
            } else {
              S.add (varName, res);

              cb (null, res);
            }
          });
        }
      }

      break;

    case 'VariableDeclaration':
      for (var k = 0; k < node.declarations.length; k++) {
        handleExpression (node.declarations[k], indexB, branches, M, S, ptData, LR, cb);
      }

      break;

    case 'Identifier':
      var hasProperty_ : any = S.hasProperty (node.name);
      var content : any;

      if (hasProperty_.hasProperty) {
        content = hasProperty_.content;
      } else {
        hasProperty_ = M.hasProperty (node.name);

        if (!hasProperty_.hasProperty) {
          cb (new Error ('Unknown identifier ' + node.name), null);
        }

        content = hasProperty_.content;
      }

      cb (null, content);

      break;

    case 'Literal':
      var value = (typeof node.value === 'string')
        ? '"' + node.value + '"'
        : node.value;

      cb (null, value);

      break;

    case 'ReturnStatement':
      if (node.argument !== null) {
        handleExpression (node.argument, indexB, branches, M, S, ptData, LR, cb);
      } else {
        cb (null, ptData);
      }

      break;

    case 'BreakStatement':
    case 'ContinueStatement':
      cb (null, ptData);

      break;

    default:
      cb (new Error ('Unknown in symbolic-evaluation => "' + node.type + '"'), null);
  }
}
