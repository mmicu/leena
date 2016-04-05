var CQ = require ('coffeequate');
import esprima = require ('esprima');
import escodegen = require ('escodegen');
var Promise = require ('bluebird');
import _ = require ('underscore');

import IV_Table = require ('./ivt');
import G_Table = require ('./gt');
import ConcreteMemory = require ('../memory/concrete-memory');
import SymbolicMemory = require ('../memory/symbolic-memory');


// Object used when 'evaluateConcrete' is called. It resolves math expression
// during the parsing of the AST of the condition
var mathOperations : Object = {
  // Binary operators:
  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Expressions
  '<'  : function (a, b) { return a < b; },
  '<=' : function (a, b) { return a <= b; },
  '>'  : function (a, b) { return a > b; },
  '>=' : function (a, b) { return a >= b; },
  '+'  : function (a, b) { return a + b; },
  '-'  : function (a, b) { return a - b; },
  '*'  : function (a, b) { return a * b; },
  '/'  : function (a, b) { return a / b; }
};

export
function guessPreconditions (pc : string, gt : G_Table,
                             pathConstraint : Array<string>,
                             stackBranch : Array<any>,
                             executedConditions : number,
                             M : ConcreteMemory, S : SymbolicMemory,
                             cb : (err : Error, res : any) => void) : void {
  var ctr : Array<string>;
  var indexPathConstraint : number;
  var g1 : any;
  var pos : number;
  var indexesToRemove : Array<number>;
  var i : number;
  var promisesListMinFunction : Array<any>;
  var nPrePostConditions : number;

  nPrePostConditions = 0;
  for (var k = j; k >= 0; k--) {
    if (stackBranch[k].preOrPostCondition) {
      nPrePostConditions++;
    }
  }

  ctr = [];
  if (gt.entries.length >= 1) {
    g1 = gt.entries[0];
  }

  // Update the 'ctr' and saves indexes of path constraint to remove
  for (var k = 0; k < gt.entries.length; k++) {
    indexesToRemove = [];

    for (var j = 0; j < gt.entries[k].attr.pclocs.length; j++) {
      pos = gt.entries[k].attr.pclocs[j];

      if (pos !== g1.attr.loc) {
        indexesToRemove.push (pos);
      }
    }

    // Delete elements from 'pathConstraint' and 'stackBranch'
    i = indexesToRemove.length;

    while (i--) {
      if (i >= pathConstraint.length || i >= stackBranch.length) {
        cb (
          new Error (
            'Unable to guess preconditions. Index of path constraint to remove is out of range'
          ),
          null
        );
      }

      // Remove entry from the path constraint
      //pathConstraint.splice (indexesToRemove[i], 1);

      // Decrement the number of executed conditions if the entry of the stack contains
      // a precondition or postcondition
      /*if (!stackBranch[indexesToRemove[i]].preOrPostCondition) {
        executedConditions--;
      }*/

      // Remove entry from the stack of branches
      //stackBranch.splice (indexesToRemove[i], 1);
      stackBranch[indexesToRemove[i]].ignore = true;
    }

    // Update 'ctr'
    ctr.push (
      gt.entries[k].attr.Dcond_S,
      gt.entries[k].attr.dDcond_S
    );
  } // End for 'k < gt.entries.length'

  // List of promises used to calculate the 'Min' function
  promisesListMinFunction = [];

  for (var k = 0; k < gt.entries.length; k++) {
    if (gt.entries[k].pc !== pc) {
      promisesListMinFunction.push (Promise.promisify (minPredicate) (
        k, false, gt, M, S
      ));
    } else {
      promisesListMinFunction.push (Promise.promisify (minPredicate) (
        k, true, gt, M, S
      ));

      break;
    }
  }

  //
  Promise.all (promisesListMinFunction).then (function (results) {
    var minPred_k : any;

    for (var k = 0; k < results.length; k++) {
      minPred_k = results[k];

      if (minPred_k.length > 0) {
        process.exit ();
        Array.prototype.push.apply (ctr, minPred_k);
      }
    }

    if (g1 === undefined || g1.attr.loc >= pathConstraint.length) {
      var errorMessageSuffix : string = (g1 === undefined)
        ? ' undefined'
        : ' out of range';

      cb (
        new Error (
          'Unable to guess preconditions. Location of guard "G1"' + errorMessageSuffix
        ),
        null
      );
    } else { // Update the path constraint
      var index : number;
      var nElementsToRemove : number;

      for (var k = 0; k < ctr.length; k++) {
        index = g1.attr.loc + k;
        nElementsToRemove = ~~(k === 0); // replace (path_constraint, loc, ctr)

        if (k === 0) {
          //pathConstraint.splice (index, 1, ctr[k]);
          //stackBranch.splice (index, 1, ctr[k]);
          stackBranch[index].ignore = true;
        }

        pathConstraint.splice (++index, 0, ctr[k]);
        stackBranch.splice (++index, 0, {
          branch : 0,
          done : false,
          M : _.clone (M),
          S : _.clone (S),
          preOrPostCondition : true,
          ignore : false
        });


        // Update the path constraint
        //pathConstraint.splice (index, nElementsToRemove, ctr[k]);

        // Decrement the number of executed conditions if the entry of the stack contains
        // a precondition or postcondition
        /*if (nElementsToRemove === 1 && !stackBranch[index].preOrPostCondition) {
          executedConditions--;
        }*/

        // Update the stack
        /*stackBranch.splice (index, nElementsToRemove, {
          branch : 0,
          done : false,
          M : _.clone (M),
          S : _.clone (S),
          preOrPostCondition : true,
          ignore : false
        });
        */
      }

      cb (null, executedConditions + ctr.length - 1);
    }
  }).catch (function (error) {
    cb (error, null);
  });
}

function minPredicate (indexEntry : number, valueCondition : boolean,
                       gt : G_Table,
                       M : ConcreteMemory, S : SymbolicMemory,
                       cb : (err : Error, res : Array<string>) => void) : void {
  // Min (G) is defined as a conjunction of constraints
  var minEntries : Array<string>;
  var minCandidates : Array<string>;
  var pcG_toInt : number;
  var pcGPrime_toInt : number;
  var opComparison : string;
  var astCondition : any;
  var condition : string;
  var promisesList : Array<any>;

  minEntries    = [];
  minCandidates = [];
  promisesList  = [];

  for (var k = 0; k < gt.entries.length; k++) {
    if (indexEntry !== k) {
      pcG_toInt = parseInt (gt[indexEntry].pc);
      pcGPrime_toInt = parseInt (gt[k].pc);

      opComparison = (pcG_toInt < pcGPrime_toInt)
        ? '<='
        : '<';

      try {
        condition = [
          gt[indexEntry].attr.EC_S,
          gt[k].attr.EC_S
        ].join (opComparison);

        astCondition = esprima.parse (condition);

        promisesList.push (Promise.promisify (evaluateConcrete) (
          astCondition, M, S
        ));

        minCandidates.push (condition);
      } catch (e) {
        cb (new Error ('Unable to get the AST for EC and EC_2'), null);
      }
    }
  }

  Promise.all (promisesList).then (function (results) {
    if (results.length !== gt.entries.length - 1) {
      cb (
        new Error (
          'Unable to calculate "Min" predicate: different lengths between entries and executions'
        ),
        null
      );
    }

    for (var k = 0; k < results.length; k++) {
      if (indexEntry !== k && results[k] === true) {
        minEntries.push (minCandidates[k]);
      }
    }

    cb (null, minEntries);
  }).catch (function (error) {
    cb (new Error ('Unable to calculate "Min" predicate: ' + error.message), null);
  });
}

export
function guessPostconditions (iteration : number, ivt : IV_Table,
                              gt : G_Table, S : SymbolicMemory) : void {

  // If gt[l].pending is 'true' for some l 'in' GT
  //  => Another summarization pending
  for (var k = 0; k < gt.entries.length; k++) {
    if (gt.entries[k].attr.pending) {
      return;
    }
  }

  for (var k = 0; k < gt.entries.length; k++) {
    if (gt.entries[k].attr.EC === iteration) { // Last iteration predicted
      for (var j = 0; j < ivt.entries.length; j++) {
        try {
          symbolicUpdate (
            // Name
            ivt.entries[j].name,
            // V_S
            ivt.entries[j].attr.V_S,
            // dV_S
            ivt.entries[j].attr.dV_S,
            // EC_S
            gt.entries[k].attr.EC_S,
            // Symbolic memory
            S
          );
        } catch (e) {
          throw e;
        }
      }

      gt.entries[k].attr.pending = true;

      break;
    }
  }

  //process.exit()
}

function symbolicUpdate (v : string, V_0_S : any, dV_S : any, EC_S : any,
                         S : SymbolicMemory) : void {
  var V_S : any;
  var hasProperty_ : any;
  var simplifiedExpressions : any;
  var simplifiedExpression : any;

  simplifiedExpressions = [V_0_S, dV_S, EC_S];
  for (var k = 0; k < simplifiedExpressions.length; k++) {
    try {
      simplifiedExpression = CQ (simplifiedExpressions[k]).simplify ().toString ();
      simplifiedExpressions[k] = simplifiedExpression;
    } catch (e) { }
  }

  V_S = '(' + simplifiedExpressions[0] + ') + (' + simplifiedExpressions[1] +
    ') * (' + '((' + simplifiedExpressions[2] + ') - 1))';
  hasProperty_ = S.hasProperty (v);



  if (!hasProperty_.hasProperty) {
    throw new Error (
      'Unable to guess postconditions. Unable to find property "' + v + '" in the symbolic memory'
    );
  }

  // Property 'v' exists so by calling 'add' function there will be an update
  try {
    V_S = CQ (V_S).simplify ().toString ();
  } catch (e) {
  } finally {
    S.add (v, V_S);
  }
}

export
function evaluateConcrete (nodeAST : any, M : ConcreteMemory,
                          S : SymbolicMemory,
                          cb : (err : Error, res : number) => void) : void {
  switch (nodeAST.type) {
    case 'ExpressionStatement':
      evaluateConcrete (nodeAST.expression, M, S, cb);

      break;

    case 'AssignmentExpression':
      var leftNode  = nodeAST.left;
      var rightNode = nodeAST.right;

      if (leftNode.type === 'Identifier') {
        var varName : string = leftNode.name;
        var operator : string = nodeAST.operator;

        if (operator === '=') {
          evaluateConcrete (rightNode, M, S, function (err, res) {
            if (err) {
              cb (err, null);
            } else {
              cb (null, res);
            }
          });
        } else { // Generate new AST since we have operators like '+=', '-=', ...
          // Possible assignment operators:
          //    "=" | "+=" | "-=" | "*=" | "/=" | "%=" |
          //    "<<=" | ">>=" | ">>>=" | "|=" | "^=" | "&="
          var realOperator : string = operator.substring (0, operator.length - 1);

          evaluateConcrete (leftNode, M, S, function (errL, resL) {
            if (errL) {
              cb (errL, null);
            } else {
              evaluateConcrete (rightNode, M, S, function (errR, resR) {
                if (errR) {
                  cb (errR, null);
                } else {
                  //cb (null, '(' + resL + ')' + realOperator + '(' + resR + ')');
                }
              });
            }
          });
        }
      } // End of 'if (leftNode.type === 'Identifier)'

      break;

    case 'UnaryExpression':
      evaluateConcrete (nodeAST.argument, M, S, function (err, res) {
        if (err) {
          cb (err, null);
        } else {
          cb (null, nodeAST.operator + res);
        }
      });

      break;

    case 'BinaryExpression':
    case 'LogicalExpression':
      evaluateConcrete (nodeAST.left, M, S, function (errL, resL) {
        if (errL) {
          cb (errL, null);
        } else {
          evaluateConcrete (nodeAST.right, M, S, function (errR, resR) {
            if (errR) {
              cb (errR, null);
            } else {
              try {
                var resultExpression = op (resL, nodeAST.operator, resR);

                cb (null, resultExpression);
              } catch (e) {
                cb (e, null);
              }
            }
          });
        }
      });

      break;

    case 'Identifier':
      var hasProperty_ : any = M.hasProperty (nodeAST.name);

      if (hasProperty_.hasProperty) {
        cb (null, hasProperty_.content);
      } else {
        cb (new Error ('Unknown identifier in GT' + nodeAST.name), null);
      }

      break;

    case 'Literal':
      var value = (typeof nodeAST.value === 'string')
        ? '"' + nodeAST.value + '"'
        : nodeAST.value;

      cb (null, value);

      break;

    default:
      cb (new Error ('Unknown in GT => "' + nodeAST + '"'), null);
  }
}

export
function op (leftOperand : number, operator : string, rightOperand : number) : number {
  if (mathOperations[operator] === undefined) {
    throw new Error ('unable to apply the operator "' + operator + '" to solve the expression');
  }

  return mathOperations[operator] (leftOperand, rightOperand);
}
