import _ = require ('underscore');

import IV_Table = require ('./ivt');
import G_Table = require ('./gt');
import MOD_Table = require ('./mod');
import cUtils = require ('../../context/coverage/coverage-utils');
import lpUtils = require ('./loop-record-utils');
import ConcreteMemory = require ('../memory/concrete-memory');
import SymbolicMemory = require ('../memory/symbolic-memory');


export
enum LoopTable {
  IV,
  GT,
  MOD
}

interface LoopProperties {
  // Key of the loop is equal to the key of the statement
  loopKey : string;

  // Iteration of the loop
  iteration : number;

  // Number of statements declared inside the loop
  nStatements : number;

  // Array of statements declared inside the loop (this array is calculated
  // based on the value of 'nStatements')
  statementsKeys : Array<string>;

  // Induction Variable candidates Table (IVT)
  IVT : IV_Table;

  // Guard candidates Table (GT)
  GT : G_Table;

  // Table used for nested loops
  MOD : MOD_Table;
}

// We implement this concept thanks to the work of P. Godefroid and D. Luchaup
// Link: http://research.microsoft.com/en-us/um/people/pg/public_psfiles/issta2011.pdf
export
class LoopRecord {
  // Error message prefix
  private static ERROR_PREFIX = '[LoopRecord] Exception. Reason: ';

  // Array of loops encountered during the parsing of the AST
  public activeLoops : Array<LoopProperties>;


  constructor () {
    this.activeLoops = [];
  }

  public addLoop (loopKey : string, loopAST : any) : void {
    var currentLoop : LoopProperties = <LoopProperties> {};
    var loopKeyInt : number = parseInt (loopKey);

    currentLoop.loopKey   = loopKey;
    currentLoop.iteration = 0;
    //
    currentLoop.nStatements = cUtils.getNumberOfStatementsOfLoop (loopAST);
    if (currentLoop.nStatements === -1) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to get the number of statements of the loop'
      );
    }
    // The loop is also a statement
    currentLoop.statementsKeys = [loopKey];
    for (var k = 0; k < currentLoop.nStatements; k++) {
      currentLoop.statementsKeys.push ((loopKeyInt + k + 1).toString ());
    }

    this.activeLoops.push (currentLoop);
  }

  public isActive () : boolean {
    return (this.activeLoops.length > 0);
  }

  public addEntry (table : LoopTable, property : string,
                   M : ConcreteMemory, S : SymbolicMemory) : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to add property "' + property + '" when no one loop is active'
      );
    }

    if (table === LoopTable.IV) {
      // Update the 'IV table'
      this.activeLoops[this.activeLoops.length - 1].IVT.addEntry (property, M, S);
    } else if (table === LoopTable.MOD) {
      // Update the 'Guard table'
      this.activeLoops[this.activeLoops.length - 1].MOD.addEntry (property, M, S);
    } else {
      // Unknown table
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to add property "' + property + '" on unknown table'
      );
    }
  }

  public isStatementDeclaredInsideLoop (statementKey : string) : boolean {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      return false;
    }

    // 'this.activeLoops.length > 0' since 'this.isActive' is 'true'
    var lastLoop : LoopProperties = this.activeLoops[this.activeLoops.length - 1];
    var isStatementDeclaredInsideLoop_ : boolean =
      (lastLoop.statementsKeys.indexOf (statementKey) !== -1);

    return isStatementDeclaredInsideLoop_;
  }

  public isLastStatementDeclaredInsideLoop (statementKey : string,
                                            nextStatementKey : string) : boolean {
    // Check if there is at least one loop active
    if (!this.isActive () || nextStatementKey === null) {
      return false;
    }

    // 'this.activeLoops.length > 0' since 'this.isActive' is 'true'
    var lastLoop : LoopProperties;
    var isLastStatement : boolean = false;

    // Get the current loop
    lastLoop = this.activeLoops[this.activeLoops.length - 1];

    // Check if the next statement is declared inside the current loop
    if (this.isStatementDeclaredInsideLoop (nextStatementKey)) {
      isLastStatement = (parseInt (statementKey) >= parseInt (nextStatementKey));
    }

    return isLastStatement;
  }

  public isLastIteration (statementKey : string, nextStatementKey : string) : boolean {
    // Check if there is at least one loop active
    if (!this.isActive () || nextStatementKey === null) {
      return false;
    }

    // 'this.activeLoops.length > 0' since 'this.isActive' is 'true'
    var lastLoop : LoopProperties;
    var isLastIteration : boolean = false;

    // Get the current loop
    lastLoop = this.activeLoops[this.activeLoops.length - 1];

    // Check if the next statement is declared inside the current loop
    isLastIteration = !(this.isStatementDeclaredInsideLoop (nextStatementKey));

    return isLastIteration;
  }

  public incrementIteration () : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to increment the iteration of the loop when no one loop is active'
      );
    }

    this.activeLoops[this.activeLoops.length - 1].iteration++;
  }

  public getIteration () : number {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to increment the iteration of the loop when no one loop is active'
      );
    }

    return this.activeLoops[this.activeLoops.length - 1].iteration;
  }

  public deleteLoop () : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to delete the loop when no one loop is active'
      );
    }

    // 'this.activeLoops.length > 0' since 'this.isActive' is 'true'
    this.activeLoops.pop ();
  }

  public createTables () : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to create tables when no one loop is active'
      );
    }

    // Create IVT table
    this.activeLoops[this.activeLoops.length - 1].IVT = new IV_Table ();

    // Create GT table
    this.activeLoops[this.activeLoops.length - 1].GT = new G_Table ();

    // Create MOD table
    this.activeLoops[this.activeLoops.length - 1].MOD = new MOD_Table ();
  }

  public MODhasProperty (property : string) : boolean {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      return false;
    }

    var lastLoop : LoopProperties;
    var modHasProperty : boolean;

    // Get the current loop
    lastLoop = this.activeLoops[this.activeLoops.length - 1];
    modHasProperty = lastLoop.MOD.hasProperty (property);

    return modHasProperty;
  }

  public echoIVT () : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to print IV table when no one loop is active'
      );
    }

    console.log (this.activeLoops[this.activeLoops.length - 1].IVT.toString ());
  }

  public echoGT () : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to print guard table when no one loop is active'
      );
    }

    console.log (this.activeLoops[this.activeLoops.length - 1].GT.toString ());
  }

  public updateIVT (M : ConcreteMemory, S : SymbolicMemory) : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to update the IV table when no one loop is active'
      );
    }

    // 'this.activeLoops.length > 0' since 'this.isActive' is 'true'
    var lastLoop : LoopProperties;

    // Get the current loop
    lastLoop = this.activeLoops[this.activeLoops.length - 1];

    // Update the IV table
    this.activeLoops[this.activeLoops.length - 1].IVT.update (lastLoop.iteration, M, S);
  }

  public updateGT (pc : string, conditionAST : any, valueCondition : boolean,
                   pathConstraint : Array<string>,
                   stackBranch : Array<any>, executedConditions : number,
                   M : ConcreteMemory, S : SymbolicMemory,
                   cb : (err : Error, res : any) => void) : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      cb (
        new Error (
          LoopRecord.ERROR_PREFIX + 'unable to update the guard table when no one loop is active'
        ),
        null
      );
    }

    // 'this.activeLoops.length > 0' since 'this.isActive' is 'true'
    var lastLoop : LoopProperties;

    // Get the current loop
    lastLoop = this.activeLoops[this.activeLoops.length - 1];

    // Update the IV table
    this.activeLoops[this.activeLoops.length - 1].GT.update (
      pc,
      conditionAST,
      valueCondition,
      lastLoop.iteration,
      pathConstraint,
      stackBranch,
      executedConditions,
      M,
      S,
      function (err, res) {
        if (err) {
          cb (err, null);
        } else {
          cb (null, res);
        }
      }
    );
  }

  public guessPostconditions (S : SymbolicMemory) : void {
    // Check if there is at least one loop active
    if (!this.isActive ()) {
      throw new Error (
        LoopRecord.ERROR_PREFIX + 'unable to guess postconditions table when no one loop is active'
      );
    }

    // 'this.activeLoops.length > 0' since 'this.isActive' is 'true'
    var lastLoop : LoopProperties;

    // Get the current loop
    lastLoop = this.activeLoops[this.activeLoops.length - 1];

    try {
      lpUtils.guessPostconditions (lastLoop.iteration, lastLoop.IVT, lastLoop.GT, S);
    } catch (e) {
      throw e;
    }
  }
}
