import esprima = require ('esprima');
import estraverse = require ('estraverse');

import SymbolicMemory = require ('./memory/symbolic-memory');


interface SupportedType {
  type : string;
  defaultValue : any;
}

export
interface StatementEntry {
  statementKey : string;
  branchesIndexes : Array<number>;
}

// Supported types of parameters that we want to symbolically execute
var supportedTypes : Array<SupportedType> = [
  {
    type : 'Int',
    defaultValue : 0
  },
  {
    type : 'Real',
    defaultValue : 0.0
  },
  {
    type : 'Boolean',
    defaultValue : false
  },
  {
    type : 'String',
    defaultValue : ''
  }
];


// fParameters: signature of the function. Array of objects. Example:
//   [{"type" : "Identifier", "name" : "param_name"}, {...}, ...]

// uParameters: parameters of the function specified by the user:
//   {"param_name": {"type" : TYPE, "value" : VALUE}}
export
function parseFunctionSignature (fName : string, fParameters : Array<any>, uParameters : any) : Object {
  var sizeF : number = fParameters.length;
  var sizeU : number = Object.keys (uParameters).length;
  var ret : any = {
    errors: [],
    parameters: {}
  };
  var errorPrefix : string = 'Error while parsing signature of function "' + fName + '": ';

  // Different sizes
  if (sizeF !== sizeU) {
    ret.errors.push (
      errorPrefix + 'different signatures of the function'
    );

    return ret;
  }

  // Sizes are equal
  var paramName : string;
  var paramValue : any;

  for (var k = 0; k < sizeF; k++) {
    paramName = (fParameters[k].name !== undefined)
      ? fParameters[k].name
      : 'unknown';

    if (fParameters[k].type !== 'Identifier') {
      ret.errors.push (
        errorPrefix + 'parameter "' + paramName + '" must be an "Identifier"'
      );

      continue;
    }

    // Parameter 'paramName' is an 'Identifier'. It must be specified by the user
    if (uParameters[paramName] === undefined) {
      ret.errors.push (
        errorPrefix + 'parameter "' + paramName + '" is not specified'
      );

      continue;
    }

    // User specifies the parameter 'paramName'. It must have 'type' property
    if (!uParameters[paramName].hasOwnProperty ('type')) {
      ret.errors.push (
        errorPrefix + 'parameter "' + paramName + '" has no type property'
      );

      continue;
    } else if (!typeIsSupported (uParameters[paramName].type)) { // Type specified by the user must be supported by Leena
      ret.errors.push (
        errorPrefix + 'parameter "' + paramName + '" has a type not supported by Leena'
      );

      continue;
    }

    // User specifies the parameter 'paramName' and its type. If the user specifies
    // the value, it must be conformed to its type
    if (uParameters[paramName].hasOwnProperty ('value')) {
      // Typeof of the value specified by the user
      var typeofValueParam : string = typeof uParameters[paramName].value;
      // Type exists since we check 'type' property above
      var typeofTypeParam : string = typeof getDefaultValue (uParameters[paramName].type);

      if (typeofValueParam !== typeofTypeParam) {
        ret.errors.push (
          errorPrefix + 'parameter "' + paramName + '" has different type from its value'
        );

        continue;
      }

      paramValue = uParameters[paramName].hasOwnProperty ('value');
    }

    // No errors found. We can add the parameter to the 'return object'
    ret.parameters[paramName] = {
      'type'  : uParameters[paramName].type,
      'value' : (uParameters[paramName].hasOwnProperty ('value'))
        ? uParameters[paramName].value
        : getDefaultValue (uParameters[paramName].type)
    }
  }

  return ret;
}

export
function getTestCase (parameters : any) : any {
  var params : any = {};

  for (var pName in parameters) {
    if (parameters.hasOwnProperty (pName)) {
      params[pName] = parameters[pName].value;
    }
  }

  return params;
}

export
function getActualParameters (parameters : any) : any {
  var parametersValues : Array<any> = [];

  for (var pName in parameters) {
    if (parameters.hasOwnProperty (pName)) {
      parametersValues.push (parameters[pName].value);
    }
  }

  return parametersValues.join (', ');
}

export
function getDefaultValue (type : string) : any {
  for (var k = 0; k < supportedTypes.length; k++) {
    if (type === supportedTypes[k].type) {
      return supportedTypes[k].defaultValue;
    }
  }

  return null;
}

function typeIsSupported (type : string) : boolean {
  for (var k = 0; k < supportedTypes.length; k++) {
    if (type === supportedTypes[k].type) {
      return true;
    }
  }

  return false;
}

export
function getAST (instruction : string) : any {
  var instructionAST : any;
  var illegalStatement : boolean = false;

  try {
    instructionAST = esprima.parse (instruction);
  } catch (e) {
    var statementInstruction = 'function leenaFunc(){for(;;){' + instruction + '}}';

    try {
      instructionAST = esprima.parse (statementInstruction);
      illegalStatement = true;
    } catch (e) {
      throw e;
    }
  }

  try {
    instructionAST = (!illegalStatement)
      ? instructionAST.body[0]
      : instructionAST.body[0].body.body[0].body.body[0];
  } catch (e) {
    throw e;
  }

  return instructionAST;
}

export
function isBranch (node : any) : boolean {
  if (!node.hasOwnProperty ('type')) {
    return false;
  }

  return (node.type === 'IfStatement' || node.type === 'ConditionalExpression'
    || node.type === 'SwitchStatement');
}

export
function statementInsideTable (statementKey : string,
                               table : Array<StatementEntry>) : number {
  // 'table' has properties:
  //   - statementKey : string;
  //   - branchesKeys : Array<string>;
  for (var k = 0; k < table.length; k++) {
    if (table[k].statementKey === statementKey) {
      return k;
    }
  }

  return -1;
}

export
function addStatementInTable (statementKey : string, branchIndex : number,
                              table : Array<StatementEntry>) : void {
  // 'table' has properties:
  //   - statementKey : string;
  //   - branchesKeys : Array<string>;
  var index : number;

  if ((index = statementInsideTable (statementKey, table)) !== -1) {
    table[index].branchesIndexes.push (branchIndex);
  } else {
    // Statement was not inserted in the table
    var newEntry : StatementEntry;

    newEntry = <StatementEntry> {};
    newEntry.statementKey = statementKey;
    newEntry.branchesIndexes = [branchIndex];

    table.push (newEntry);
  }
}

export
function conditionIsSymbolic (conditionAST : any, S : SymbolicMemory, parameters : any) : boolean {
  var isSymbolic : boolean = false;

  // Condition is binary and operator is supported.
  // (check 'conditionsForUpdateAreSatisfied')
  estraverse.traverse (conditionAST, {
    enter: function (node) {
      if (node.type === 'CallExpression') {
        this.skip ();
      }
    },
    leave: function (node, parent) {
      if (node.type === 'Identifier') {
        if (parameters[node.name] !== undefined) {
          isSymbolic = true;

          this.break ();
        } else {
          var prop : any;
          var symbolicContent : any;

          prop = S.hasProperty (node.name);
          if (prop.hasProperty) {
            symbolicContent = prop.content;

            if (symbolicContent !== undefined) {
              var astSymbolicContent : any;

              try {
                astSymbolicContent = esprima.parse (symbolicContent);

                estraverse.traverse (astSymbolicContent, {
                  enter: function (node) {
                    if (node.type === 'CallExpression') {
                      this.skip ();
                    }
                  },
                  leave: function (node, parent) {
                    if (node.type === 'Identifier') {
                      if (parameters[node.name] !== undefined) {
                        isSymbolic = true;

                        this.break ();
                      }
                    }
                  }
                });

                if (isSymbolic) {
                  this.break ();
                }
              } catch (e) { }
            }
          }
        } // End of 'else' => 'parameters[node.name] === undefined'
      }
    }
  });

  return isSymbolic;
}
