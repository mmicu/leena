import esprima = require ('esprima');
import escodegen = require ('escodegen');
import estraverse = require ('estraverse');
var Promise = require ('bluebird');
var Table = require ('cli-table');

import ConcreteMemory = require ('../memory/concrete-memory');
import {LoopRecord, LoopTable} from './loop-record';
import lpUtils = require ('./loop-record-utils');
import SymbolicMemory = require ('../memory/symbolic-memory');
import SymEval = require ('../symbolic-evaluation');


interface GT_Attributes {
  // Concrete boolean value
  B : boolean;

  // D = (LHS - RHS) => the distance between the two operands
  // (LHS : left-hand side, RHS : right-hand side)
  D : number;

  // The first symbolic value for 'D'
  D_S : any;

  // dD = D - old (D) => the change in concrete value between two successive
  // loop iterations
  dD : any;

  // The expected execution count
  EC : number;

  // Symbolic value for 'EC'
  EC_S : any;

  // Number of times the candidate was encountered
  hit : number;

  // Constraint on 'D_S' under which 'EC_S' holds
  Dcond_S : any;

  // Constraint on 'dD_S' under which 'EC_S' holds
  dDcond_S : any;

  // List of locations in the path constraint for constraints generated for this
  // guard candidate
  pclocs : Array<number>;

  // First location in 'pclocs'
  loc : number;

  // Boolean flag used in 'guessPostconditions' method ('LoopRecord' class)
  pending : boolean;
}

interface GT_Entry {
  // Guard candidates are indexed by their program location
  // In our case, we use the key of the statement
  pc : string;
  attr : GT_Attributes;
}

class GT {
  // Error message prefix
  private static ERROR_PREFIX = '[GT] Exception. Reason: ';

  // Entries for the IVT table
  public entries : Array<GT_Entry>;

  // Content of the table (for each iteration)
  private table : any;


  constructor () {
    this.entries = [];

    this.initTable ();
  }

  public update (pc : string, conditionAST : any, valueCondition : boolean,
                 iteration : number, pathConstraint : Array<string>,
                 stackBranch : Array<any>, executedConditions : number,
                 M : ConcreteMemory, S : SymbolicMemory,
                 cb : (err : Error, res : any) => void) : void {
    // Conditions to handle this guard candidate are not met
    if (!this.conditionsForUpdateAreSatisfied (pc, conditionAST, iteration, M, S)) {
      cb (null, executedConditions);
    } else {
      // Conditions are satisfied => we can update the Guard Table (GT)
      var that = this;
      var indexEntry : number;
      var D : any;
      var D_S : any;
      var LHS : any;
      var RHS : any;
      var operator : string;
      var lhs_less_rhs : string;
      var lhs_less_rhs_ast : any;
      var getD : any;
      var getD_S : any;

      // Get the LHS and RHS. We alredy check if:
      //  - the condition is a binary expression;
      //  - the operator of the binary expression is supported
      //    (supported operators: {<, <=, >, >=, !=, =})
      LHS = conditionAST.expression.left;
      RHS = conditionAST.expression.right;
      operator = conditionAST.expression.operator;
      lhs_less_rhs = [
        escodegen.generate (LHS),
        escodegen.generate (RHS)
      ].join ('-');
      lhs_less_rhs_ast = esprima.parse (lhs_less_rhs).body[0];

      // Promises for getting:
      //   - D :   (LHS - RHS) => the distance between the two operands
      //   - D_S : The first symbolic value for 'D'
      getD = Promise.promisify (lpUtils.evaluateConcrete) (
        lhs_less_rhs_ast, M, S
      );
      getD_S = Promise.promisify (SymEval.evaluateSymbolic) (
        lhs_less_rhs_ast, 0, [], M, S, [], new LoopRecord ()
      );

      // Obtain 'D' and 'D_S'
      Promise.all ([getD, getD_S]).then (function (results) {
        D   = results[0];
        D_S = results[1];

        // Handle the current guard candidate
        that.handleEntry (pc, iteration, valueCondition, D, D_S, operator,
                          pathConstraint, stackBranch, executedConditions, M, S,
                          function (err, res) {
          if (err) {
            cb (err, null);
          } else {
            cb (null, res);
          }
        });
      }).catch (function (error) {
        cb (new Error (GT.ERROR_PREFIX + error.message), null);
      });
    }
  }

  private handleEntry (pc : string, iteration : number, B : boolean, D : number,
                       D_S : any, operator : string,
                       pathConstraint : Array<string>,
                       stackBranch : Array<any>,
                       executedConditions : number,
                       M : ConcreteMemory, S : SymbolicMemory,
                       cb : (err : Error, res : any) => void) : void {
    var indexEntry : number;

    if (iteration >= 2) {
      // Get the index of 'pc'
      if ((indexEntry = this.getEntryIndex (pc)) === -1) {
        throw new Error (
          GT.ERROR_PREFIX + 'unable to get property "' + pc + '" in the Guard table'
        );
      }
    }

    if (iteration === 1) {
      var gtEntry : GT_Entry;

      // Create a new entry
      gtEntry = <GT_Entry> {};

      // Set properties for the current entry
      gtEntry.pc   = pc;
      gtEntry.attr = <GT_Attributes> {};
      gtEntry.attr.hit    = 0;
      gtEntry.attr.B      = B;
      gtEntry.attr.D      = D;
      gtEntry.attr.D_S    = D_S;
      gtEntry.attr.pclocs = [];
      gtEntry.attr.loc    = pathConstraint.length - 1;
      if (gtEntry.attr.loc < 0) { // Empty path constraint
        gtEntry.attr.loc = 0;
      }

      // Add the entry to the list and get the index
      indexEntry = this.entries.push (gtEntry) - 1;
    } else if (iteration === 2) {
      var dD : number;
      var dD_S : string;
      var EC : number;
      var EC_S : string;

      // Update 'dD'
      dD = D - this.entries[indexEntry].attr.D;
      this.entries[indexEntry].attr.dD = dD;

      // Calculate 'dD_S'
      dD_S = '(' + D_S + '- (' + this.entries[indexEntry].attr.D_S + '))';

      switch (operator) {
        case '=':
        break;

        case '!=':
        break;

        case '>':
        break;

        case '>=':
        break;

        case '<':
        break;

        case '<=':
        if (D > 0) {
          if (dD < 0) {
            this.entries[indexEntry].attr.Dcond_S  = '((' + D_S  + ') > 0)';
            this.entries[indexEntry].attr.dDcond_S = '((' + dD_S + ') < 0)';

            EC = this.entries[indexEntry].attr.D - this.entries[indexEntry].attr.dD - 1;
            EC /= -(this.entries[indexEntry].attr.dD);

            EC_S = '(' + this.entries[indexEntry].attr.D_S + '- (' + dD_S + ')-1) / (- (' + dD_S + '))';

            this.entries[indexEntry].attr.EC   = EC;
            this.entries[indexEntry].attr.EC_S = EC_S;
          }
        }
        break;
      }
    } // End of 'iteration === 2'

    var guessPreconditionsProm : any = Promise.resolve (); // Empty promise
    var that = this;

    if (++this.entries[indexEntry].attr.hit !== iteration) {
      // Remove this entry from GT
      this.entries.splice (indexEntry, 1);
    }

    // Only for debugging
    that.addEntryToTable (iteration, that.entries[indexEntry], B, D)

    if (this.entries[indexEntry].attr.B !== B &&
        this.entries[indexEntry].attr.pending &&
        this.entries[indexEntry].attr.EC + 1 === iteration) {
      // Guess preconditions => update 'pathConstraint'
      guessPreconditionsProm = Promise.promisify (lpUtils.guessPreconditions) (
        pc, this, pathConstraint, stackBranch, executedConditions, M, S
      );
    }

    guessPreconditionsProm.then (function (newExecutedConditions) {
      if (that.entries[indexEntry].attr.B !== B ||
          (that.entries[indexEntry].attr.dD !== undefined &&
          that.entries[indexEntry].attr.dD !== D - that.entries[indexEntry].attr.D)) {
        // Remove this entry from GT
        that.entries.splice (indexEntry, 1);
      } else {
        that.entries[indexEntry].attr.D = D;

        if (that.entries[indexEntry].attr.pclocs === undefined) {
          that.entries[indexEntry].attr.pclocs = [];
        }

        var loc : number = pathConstraint.length - 1;
        if (loc < 0) {
          loc = 0;
        }
        that.entries[indexEntry].attr.pclocs.push (loc);
      }
      
      cb (null, newExecutedConditions);
    }).catch (function (error) {
      cb (new Error (GT.ERROR_PREFIX + 'unable to handle entry. ' + error.message), null);
    });
  }

  private conditionsForUpdateAreSatisfied (pc : string, conditionAST : any,
                                           iteration : number,
                                           M : ConcreteMemory,
                                           S : SymbolicMemory) : boolean {
    // Check if condition is not symbolic in 'symbolic-execution' after calling
    // the 'update' function of this class

    // Check if condition is not (LSH op RHS) with op in {<, <=, >, >=, !=, =}
    if (!this.conditionHasSupportedOperator (conditionAST)) {
      return false;
    }

    // Last condition : check if (iteration > 1) AND (pc 'not in' GT)
    return !(iteration > 1 && (this.getEntryIndex (pc) === -1));
  }

  private conditionHasSupportedOperator (conditionAST : any) : boolean {
    var supportedOperators : Array<string>;
    var hasSupportedOperator : boolean;

    // Supported binary operators
    supportedOperators = ['<', '<=', '>', '>=', '!=', '='];

    // Check if conditions is of the type 'LHS op RHS'
    if (!conditionAST.hasOwnProperty ('expression') || conditionAST.expression.type !== 'BinaryExpression') {
      return false;
    }

    hasSupportedOperator = (supportedOperators.indexOf (conditionAST.expression.operator) !== -1)

    return hasSupportedOperator;
  }

  private getEntryIndex (pc : string) : number {
    for (var k = 0; k < this.entries.length; k++) {
      if (this.entries[k].pc === pc) {
        return k;
      }
    }

    return -1;
  }

  private initTable () : void {
    var headTable : Object;

    headTable = {
      head: ['Ith.', 'pc', 'oldB', 'oldD', 'B', 'D', 'dD', 'D_S', 'hit', 'EC'],
      colWidths: [8, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    };

    this.table = new Table (headTable);
  }

  private addEntryToTable (iteration : number, modEntry : GT_Entry,
                           B : boolean, D : number) : void {
    this.table.push ([
      iteration,
      modEntry.pc,
      B,
      D,
      modEntry.attr.B,
      modEntry.attr.D,
      (modEntry.attr.dD === undefined) // It's not initialized when iteration = 1
        ? 'undefined'
        : modEntry.attr.dD,
      modEntry.attr.D_S,
      modEntry.attr.hit,
      (modEntry.attr.EC === undefined) // It's not initialized when iteration = 1
        ? 'undefined'
        : modEntry.attr.EC,
    ]);
  }

  public toString () : string {
    return this.table.toString ();
  }
}

export = GT;
