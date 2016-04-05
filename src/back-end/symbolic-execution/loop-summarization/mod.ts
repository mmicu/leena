import ConcreteMemory = require ('../memory/concrete-memory');
import Memory = require ('../memory/memory');
import SymbolicMemory = require ('../memory/symbolic-memory');


enum MODProperty {
  V,
  V_S
}

interface MOD_Attributes {
  // Concrete value when the control reaches the header
  V : any;

  // Symbolic value at the loop entry
  V_S : any;
}

interface MOD_Entry {
  name : string;
  attr : MOD_Attributes;
}

class MOD {
  // Error message prefix
  private static ERROR_PREFIX = '[MOD] Exception. Reason: ';

  // Entries for the MOD table
  private entries : Array<MOD_Entry>;


  constructor () {
    this.entries = [];
  }

  public addEntry (property : string, M : ConcreteMemory, S : SymbolicMemory) : void {
    // Outside the class, we can update only 'V' and 'V_S' properties
    var modEntry : MOD_Entry;
    var concreteEntry : any;
    var symbolicEntry : any;

    //
    modEntry = <MOD_Entry> {};

    //
    concreteEntry = M.hasProperty (property);
    symbolicEntry = S.hasProperty (property);

    // Get the 'property' in the concrete memory
    if (!concreteEntry.hasProperty) {
      throw new Error (
        MOD.ERROR_PREFIX + 'unable to find property "' + property + '" in the concrete memory'
      );
    }
    // Get the 'property' in the symbolic memory
    if (!symbolicEntry.hasProperty) {
      throw new Error (
        MOD.ERROR_PREFIX + 'unable to find property "' + property + '" in the symbolic memory'
      );
    }

    //
    modEntry.name     = property;
    modEntry.attr     = <MOD_Attributes> {};
    modEntry.attr.V   = concreteEntry.content;
    modEntry.attr.V_S = symbolicEntry.content;

    this.entries.push (modEntry);
  }

  public hasProperty (property : string) : boolean {
    for (var k = 0; k < this.entries.length; k++) {
      if (this.entries[k].name === property) {
        return true;
      }
    }

    return false;
  }

  public toString () : string {
    var modToS : string = '';

    return modToS;
  }
}

export = MOD;
