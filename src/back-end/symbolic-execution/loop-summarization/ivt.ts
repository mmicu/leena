var Table = require ('cli-table');

import ConcreteMemory = require ('../memory/concrete-memory');
import SymbolicMemory = require ('../memory/symbolic-memory');


enum IVT_Property {
  V,
  dV,
  V_S,
  dV_S
}

interface IVT_Attributes {
  // Concrete value when the control reaches the header
  V : any;

  // Change in concrete value between the first two iterations
  dV : any;

  // Symbolic value at the loop entry
  V_S : any;

  // Symbolic change in value between the first two iterations
  dV_S : any;
}

interface IVT_Entry {
  name : string;
  attr : IVT_Attributes;
}

class IVT {
  // Error message prefix
  private static ERROR_PREFIX = '[IVT] Exception. Reason: ';

  // Entries for the IVT table
  public entries : Array<IVT_Entry>;

  // Content of the table (for each iteration)
  private table : any;


  constructor () {
    this.entries = [];

    this.initTable ();
  }

  public addEntry (property : string, M : ConcreteMemory, S : SymbolicMemory) : void {
    // Outside the class, we can update only 'V' and 'V_S' properties
    var ivtEntry : IVT_Entry;
    var concreteEntry : any;
    var symbolicEntry : any;

    //
    ivtEntry = <IVT_Entry> {};

    //
    concreteEntry = M.hasProperty (property);
    symbolicEntry = S.hasProperty (property);

    // Get the 'property' in the concrete memory
    if (!concreteEntry.hasProperty) {
      throw new Error (
        IVT.ERROR_PREFIX + 'unable to find property "' + property + '" in the concrete memory'
      );
    }
    // Get the 'property' in the symbolic memory
    if (!symbolicEntry.hasProperty) {
      throw new Error (
        IVT.ERROR_PREFIX + 'unable to find property "' + property + '" in the symbolic memory'
      );
    }

    //
    ivtEntry.name      = property;
    ivtEntry.attr      = <IVT_Attributes> {};
    ivtEntry.attr.V    = concreteEntry.content;
    ivtEntry.attr.V_S  = symbolicEntry.content;

    //
    this.entries.push (ivtEntry);

    //
    this.addEntryToTable (1, ivtEntry);
  }

  public update (iteration : number, M : ConcreteMemory, S : SymbolicMemory) : void {
    var property : string;
    var concreteEntry : any;
    var symbolicEntry : any;

    if (iteration === 2) {
      //
      for (var k = 0; k < this.entries.length; k++) {
        property = this.entries[k].name;

        concreteEntry = M.hasProperty (property);
        symbolicEntry = S.hasProperty (property);

        // Get the 'property' in the concrete memory
        if (!concreteEntry.hasProperty) {
          throw new Error (
            IVT.ERROR_PREFIX + 'unable to find property "' + property + '" in the concrete memory'
          );
        }
        // Get the 'property' in the symbolic memory
        if (!symbolicEntry.hasProperty) {
          throw new Error (
            IVT.ERROR_PREFIX + 'unable to find property "' + property + '" in the symbolic memory'
          );
        }

        // IVT[v].dV = M[v] - IVT[v].V
        this.entries[k].attr.dV = concreteEntry.content - this.entries[k].attr.V;
        // IVT[v].dV_S = S[v] - IVT[v].V_S
        this.entries[k].attr.dV_S = symbolicEntry.content + '-' + this.entries[k].attr.V_S;
        // IVT[v].V = M[v]
        this.entries[k].attr.V = concreteEntry.content;

        //
        this.addEntryToTable (iteration, this.entries[k]);
      }
    } else { // iteration > 2 since the we call this function when iteration >= 2
      var dV : any;
      var k : number;

      k = this.entries.length;

      // Start the iteration on the top since we have to remove elements
      // from the array if some conditions are met
      while (k--) {
        property = this.entries[k].name;

        concreteEntry = M.hasProperty (property);

        // Get the 'property' in the concrete memory
        if (!concreteEntry.hasProperty) {
          throw new Error (
            IVT.ERROR_PREFIX + 'unable to find property "' + property + '" in the concrete memory'
          );
        }

        // dV = M[v] - IVT[v].V
        dV = concreteEntry.content - this.entries[k].attr.V;

        if (dV !== this.entries[k].attr.dV) { // It's not an IV
          this.entries.splice (k, 1);
        } else {
          // IVT[v].V = M[v]
          this.entries[k].attr.V = concreteEntry.content;

          //
          this.addEntryToTable (iteration, this.entries[k]);
        }
      }
    }
  }

  private initTable () : void {
    var headTable : Object;

    headTable = {
      head: ['It.', 'Prop.', 'V', 'dV', 'V_S', 'dV_S'],
      colWidths: [8, 10, 20, 20, 20, 20]
    };

    this.table = new Table (headTable);
  }

  private addEntryToTable (iteration : number, ivtEntry : IVT_Entry) : void {
    this.table.push ([
      iteration,
      ivtEntry.name,
      (ivtEntry.attr.V === undefined)
        ? 'undefined'
        : ivtEntry.attr.V,
      (ivtEntry.attr.dV === undefined)
        ? 'undefined'
        : ivtEntry.attr.dV,
      (ivtEntry.attr.V_S === undefined)
        ? 'undefined'
        : ivtEntry.attr.V_S,
      (ivtEntry.attr.dV_S === undefined)
        ? 'undefined'
        : ivtEntry.attr.dV_S
    ]);
  }

  public toString () : string {
    return this.table.toString ();
  }
}

export = IVT;
