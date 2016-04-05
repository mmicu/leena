import esprima = require ('esprima');
import escodegen = require ('escodegen');
import estraverse = require ('estraverse');
import _ = require ('underscore');

import cUtils = require ('./coverage-utils');


export
enum BranchType {
  If,
  Switch,
  TernaryOperator,
  Unknown
}

interface Location {
  line : number;
  column : number;
}

export
class CoverageBranch {
  // Key of the branch
  public key : string;

  // Starting location ({line : number, column : number} of the branch
  public start : Location;

  // Ending location ({line : number, column : number} of the branch
  public end : Location;

  // Type of the branch ({If, Switch, TernaryOperator, Unknown})
  public branchType : BranchType;

  // Node type based on Esprima
  public branchTypeToS : string;

  // Conditions of the branch:
  //   * If : conditions.length = 1;
  //   * Switch : conditions.length => calculated during the parsing of the AST;
  //   * TernaryOperator : conditions.length = 1.
  public conditions : Array<string>;

  // Used if and only if 'branchType = Switch'. This array is used to map
  // the k-th condition to the right 'currentValues'
  public mapInstructionsToValues : Array<number>;

  // Number of times of executions after function call
  public nExecutions : number;

  // Result of conditions after function call. Every element is of the form:
  //   * If : currentValues.length = 2:
  //     - [1, 0] : condition is true;
  //     - [0, 1] : condition is false;
  //   * Switch : currentValues.length => calculated during the parsing of the AST;
  //   * TernaryOperator : currentValues.length = 2:
  //     - [1, 0] : condition is true;
  //     - [0, 1] : condition is false;
  // Length depends on 'nExecutions' attribute
  public valuesCondition : Array<Array<number>>;

  // Store the value of the condition during the last execution
  public lastValueCondition : Array<number>;


  constructor (key : string, start : Location, end : Location, functionAST : any) {
    this.key = key;
    this.start = start;
    this.end = end;
    try {
      this.setBranchValue (functionAST);
    } catch (e) {
      throw e;
    }
  }

  private setBranchValue (functionAST : any) : void {
    var that = this;

    estraverse.traverse (functionAST, {
      enter: function (node, parent) {
        var loc = node.loc;
        var isThisLoc : boolean;

        isThisLoc = loc.start.line === that.start.line
          && loc.start.column === that.start.column;

        if (isThisLoc) {
          try {
            var branchType : string = null;
            var node_ : any = node;

            branchType = cUtils.getExpressionNodeNameOfBranch (node.type || '');
            if (branchType === null && (parent !== null || parent !== undefined)) {
              branchType = cUtils.getExpressionNodeNameOfBranch (parent.type || '');
              node_ = parent;
            }
            if (branchType === null) {
              throw new Error ('Unable to get condition of branch. Type of both nodes is unknown');
            }
            // Branch found
            if ((that.branchType = that.setBranchType (node_.type)) === BranchType.Unknown) {
              throw new Error ('Unknown branch type');
            }
            that.branchTypeToS = that.getBranchTypeToString ();
            that.conditions = [];

            if (node_.type === 'SwitchStatement') {
              var discriminant : string = escodegen.generate (node_[branchType]);
              var indexDefaultMap : number = -1;
              var indexDefault : number = -1;
              var breakBeforeDefault : boolean = false;
              var numInstructionMap : number = 0;
              var entireCondition : string = null;
              var pushCondition : boolean;

              that.mapInstructionsToValues = [];

              if (!_.isArray (node_.cases)) {
                throw new Error (
                  'Unable to get conditions of switch. "cases" node is not an array'
                );
              }

              for (var k = 0; k < node_.cases.length; k++) {
                // When 'test' property is =  'null' => 'default'
                // When 'test' property is != 'null' => 'case'
                pushCondition = false;

                // 'case'
                if (node_.cases[k].test !== null) {
                  var caseCondition : string = [
                    discriminant,
                    escodegen.generate (node_.cases[k].test)
                  ].join (' === ');

                  if (entireCondition === null) {
                    entireCondition = caseCondition;
                  } else {
                    entireCondition = [
                      entireCondition,
                      caseCondition
                    ].join (' || ');
                  }
                  numInstructionMap++;

                  // Update variable if and only if we did not found the 'default'
                  if (indexDefaultMap === -1) {
                    breakBeforeDefault = cUtils.breakInTheLastNode (node_.cases[k].consequent);
                  }

                  if (cUtils.breakInTheLastNode (node_.cases[k].consequent)
                    || k === (node_.cases.length - 1)) {
                    pushCondition = true;
                  }
                } else { // 'default'
                  indexDefaultMap = that.mapInstructionsToValues.length;
                  indexDefault = that.conditions.length;

                  if (cUtils.breakInTheLastNode (node_.cases[k].consequent) ||
                      (k === (node_.cases.length - 1))) { // Last node of the switch

                    // 'default' is declared without 'empty cases' before/after
                    if (entireCondition === null) {
                      that.conditions.push ('<empty>');
                      that.mapInstructionsToValues.push (0);
                      numInstructionMap = 0;
                      entireCondition = null;
                    } else {
                      pushCondition = true;
                    }
                  }
                  /*
                  // 'default' could be insert as 'first condition'
                  // in this case, we must set 'breakBeforeDefault'

                  if (k >= 0) {
                    breakBeforeDefault = that.thereIsBreak (node_.cases[k].consequent);
                  } else if (k === (node_.cases.length - 1)) { // Last node of the switch
                    breakBeforeDefault = true;
                  }
                  indexDefaultMap = that.mapInstructionsToValues.length;



                  if (!breakBeforeDefault && k === (node_.cases.length - 1)) {
                    pushCondition = true;
                  }
                  */
                }

                if (pushCondition) {
                  that.conditions.push (entireCondition);
                  that.mapInstructionsToValues.push (numInstructionMap);
                  numInstructionMap = 0;
                  entireCondition = null;
                }
              } // End of loop for 'node_.cases'

              // There is a 'default'
              if (indexDefault !== -1) {
                var defaultCondition = '!(' +
                  _.filter (that.conditions, function (i) {
                    return (i !== '<empty>');
                  }).join (' || ') +
                  ')';

                if (that.mapInstructionsToValues[indexDefaultMap] === 0) {
                  that.conditions[indexDefault] = defaultCondition;
                  that.mapInstructionsToValues[indexDefaultMap] = 1;
                } else if (that.mapInstructionsToValues[indexDefaultMap] >= 1) {
                  var instruction = that.conditions[indexDefaultMap];
                  var mapValue = that.mapInstructionsToValues[indexDefaultMap];

                  that.conditions[indexDefault] = [
                    instruction,
                    defaultCondition
                  ].join (' || ');

                  that.mapInstructionsToValues[indexDefaultMap] = mapValue + 1;
                }
              }
              /*
              if (indexDefaultMap !== -1) {
                var defaultCondition = '!(' + that.instructions.join (' || ') + ')';

                if (breakBeforeDefault) {
                  that.instructions.push (defaultCondition);

                  that.mapInstructionsToValues[indexDefaultMap] = mapValue + 1;
                } else {
                  var instruction = that.instructions[indexDefaultMap];
                  var mapValue = that.mapInstructionsToValues[indexDefaultMap];

                  that.instructions[indexDefaultMap] = [
                    instruction,
                    defaultCondition
                  ].join (' || ');

                  that.mapInstructionsToValues[indexDefaultMap] = mapValue + 1;
                }
              }
              */
              // end of 'node_.type === 'SwitchStatement''
            } else {
              that.conditions.push (escodegen.generate (node_[branchType]));
            }
          } catch (e) {
            throw new Error ('Unable to get condition of branch');
          }
        }
      }
    });
  }

  public initializeValues (branch : any) : void {
    var values : Array<number> = branch[this.key];

    this.nExecutions = 0;
    this.lastValueCondition = [];
    this.valuesCondition = [];

    for (var k = 0; k < values.length; k++) {
      this.lastValueCondition[k] = values[k];
    }
  }

  public updateValues (branch : any) : void {
    var values : Array<number> = branch[this.key];

    this.nExecutions = this.valuesCondition.length;

    // 'this.lastValueCondition' and 'this.valuesCondition' have been updated
    // during the execution of the function
  }

  public getBranchTypeToString () : string {
    var branchTypeToS : string = (this.branchType === BranchType.If)
      ? 'IfStatement'
      : (this.branchType === BranchType.Switch)
        ? 'SwitchStatement'
        : (this.branchType === BranchType.TernaryOperator)
          ? 'ConditionalExpression'
          : 'Unknown';

    return branchTypeToS;
  }

  private setBranchType (branchType : string) : BranchType {
    var branchType_ : BranchType = (branchType === 'IfStatement')
      ? BranchType.If
      : (branchType === 'SwitchStatement')
        ? BranchType.Switch
        : (branchType === 'ConditionalExpression')
          ? BranchType.TernaryOperator
          : BranchType.Unknown;

    return branchType_;
  }
}
