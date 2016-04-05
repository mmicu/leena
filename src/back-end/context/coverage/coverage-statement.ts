import esprima = require ('esprima');
import escodegen = require ('escodegen');
import estraverse = require ('estraverse');

import cUtils = require ('./coverage-utils');


interface Location {
  line : number;
  column : number;
}

class CoverageStatement {
  // Key of the statement
  public key : string;

  // Starting location ({line : number, column : number} of the statement
  public start : Location;

  // Ending location ({line : number, column : number} of the statement
  public end : Location;

  // Instruction of the statement
  public instruction : string;

  // Type of the statement
  public type : string;

  // Number of times of executions after function call
  //   * 1 : statement was executed during last function call
  //   * 0 : statement was not executed during last function call
  public nExecutions : number;

  // Number of times of executions after 'k' function call
  // (see 'currentValues' above)
  public totalExecutions : number;


  constructor (key : string, start : Location, end : Location, functionAST : any) {
    this.key = key;
    this.start = start;
    this.end = end;
    try {
      this.setStatementeValue (functionAST);
    } catch (e) {
      throw e;
    }
  }

  private setStatementeValue (functionAST : any) : void {
    var that = this;

    this.instruction = null;
    this.type = undefined;

    estraverse.traverse (functionAST, {
      enter: function (node) {
        var loc = node.loc;
        var isThisLoc : boolean;

        isThisLoc = loc.start.line === that.start.line
          && loc.start.column === that.start.column
          && loc.end.line === that.end.line
          && loc.end.column === that.end.column;

        if (isThisLoc) {
          that.instruction = escodegen.generate (node);
          that.type = node.type || null;

          this.break ();
        }
      }
    });

    if (this.instruction === null || this.type === null) {
      throw new Error ('Unable to get instruction of statement ' + this.key);
    }
  }

  public initializeValues (statement : any) : void {
    this.nExecutions     = statement[this.key];
    this.totalExecutions = statement[this.key];
  }

  public updateValues (statement : any) : void {
    this.nExecutions     = statement[this.key] - this.totalExecutions;
    this.totalExecutions = statement[this.key];
  }
}

export = CoverageStatement;
