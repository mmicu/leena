import assert = require ('assert');

import esprima = require ('esprima');
import escodegen = require ('escodegen');
import estraverse = require ('estraverse');
import _ = require ('underscore');

import ChromeTesterClient = require ('../../tester/chrome-tester-client');
import ConcreteMemory = require ('../memory/concrete-memory');
import SymbolicMemory = require ('../memory/symbolic-memory');


enum ExpressionType {
  ArrayExpression,
  ArrowExpression,
  AssignmentExpression,
  BinaryExpression,
  CallExpression,
  ComprehensionExpression,
  ConditionalExpression,
  ExpressionStatement,
  FunctionExpression,
  GeneratorExpression,
  GraphExpression,
  GraphIndexExpression,
  Identifier,
  LetExpression,
  Literal,
  LogicalExpression,
  MemberExpression,
  NewExpression,
  ObjectExpression,
  Property,
  SequenceExpression,
  ThisExpression,
  UnaryExpression,
  UpdateExpression,
  YieldExpression
}

interface ExpressionNode {
  type : ExpressionType;
  recursiveNodes : Array<string>;
}

interface Parameter {
  id : string;
  type : string;
  value : any;
  symbolicallyExecute : boolean;
}

interface FunctionCall {
  name : string;
  parameters : Array<string>;
}

class ParserExpression {
  // Path constraints to solve. Every element contains:
  //   * constraint : string, constraint to solve;
  //   * M : ConcreteMemory, concrete memory;
  //   * S : SymbolicMemory, symbolic memory.
  private pathConstraints : Array<any>;
  // Parameters that we want to symbolically execute
  private parameters : Array<Parameter>;
  // Chrome client instance
  private chromeClient : ChromeTesterClient;
  // SMT-Solver that we'll use to solve the expression
  private smtSolverName : string;
  // Parameters of last execution. Example:
  // {
  //   param_name_1: value,
  //   param_name_2: value
  // }
  private parametersLastExecution : any;
  // Identifiers that appear on the path constraint
  private identifiers : Array<string>;
  // Expression translated from JavaScript syntax to S-expression syntax
  private S_Expression : string;
  // Queue of functions to execute
  private queueFunctions : Array<FunctionCall>;
  // Concrete memory for every condition of the path constraint
  private currentM : ConcreteMemory;
  // Symbolic memory for every condition of the path constraint
  private currentS : SymbolicMemory;

  // Enum UnaryOperator
  //   "-" | "+" | "!" | "~" | "typeof" | "void" | "delete"
  private static unaryOperators : Object = {
    '!' : 'not'
  };

  // Enum BinaryOperator
  //   "==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "<<" | ">>" |
  //   ">>>" | "+" | "-" | "*" | "/" | "%" | "|" | "^" | "&" | "in" |
  //   "instanceof" | ".."
  private static binaryOperators : Object = {
    '=='  : '=',
    '===' : '=',
    '!='  : '=', // Add the 'not' inside handleExpression (...) function
    '!==' : '='  // Add the 'not' inside handleExpression (...) function
  };

  // Enum LogicalOperator
  //   && |
  //   ||
  private static logicalOperators : Object = {
    '&&' : 'and',
    '||' : 'or'
  };

  // Enum AssignmentOperator
  //   "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | ">>>=" |
  //   "|=" | "^=" | "&="
  private static assignmentOperators : Object = {
  };

  // Enum UpdateOperator
  //   "++" | "--"
  private static updateOperators : Object = {
    '++' : ' + 1',
    '--' : ' - 1'
  };

  // Every SMT-Solver has different methods for solving string constraints
  private static stringMethods : Object = {
    'z3': {
      'charAt'      : 'CharAt',
      'concat'      : 'Concat',
      'contains'    : 'Contains',
      'endsWith'    : 'EndsWith',
      'indexOf'     : 'Indexof',
      'lastIndexOf' : 'LastIndexof',
      // 'length' is a property for a 'string'. Anyway, we must use it
      // as a method for 'Z3-str'
      'length'      : 'Length',
      'replace'     : 'Replace',
      // regex
      // RegExp
      'startsWith'  : 'StartsWith',
      'substring'   : 'Substring'
    },
    'cvc4': {
      'charAt'      : 'str.at',
      'length'      : 'str.len',
      'substring'   : 'str.substr'
    }
  }

  constructor (pathConstraints : Array<any>, parameters : Array<Parameter>,
               smtSolverName : string, chromeClient : ChromeTesterClient,
               parametersLastExecution : any) {
    this.pathConstraints = pathConstraints;
    this.parameters = parameters;
    this.smtSolverName = smtSolverName;
    this.chromeClient = chromeClient;
    this.parametersLastExecution = parametersLastExecution;
    this.identifiers = [];
    this.queueFunctions = [];
  }

  public parse (cb : (err, res) => void) : any {
    var expAST : any;
    var sExpressions : Array<string> = [];
    var currentPT : any;

    for (var k = 0; k < this.pathConstraints.length; k++) {
      currentPT = this.pathConstraints[k];

      try {
        expAST = esprima.parse (currentPT.constraint);

        if (!_.isArray (expAST.body)) {
          cb (new Error ('Expression body is not an array'), null);
        } else if (expAST.body.length !== 1) {
          cb (
            new Error ('Expression body length should be 1 instead of ' +
              expAST.body.length),
            null
          );
        } else if (expAST.body[0].hasOwnProperty ('type') && expAST.body[0].type !== 'ExpressionStatement') {
          cb (
            new Error ('Expression body type should be "ExpressionStatement"' +
              ' instead of ' + expAST.body[0].type),
            null
          );
        }


        // Update current concrete memory and symbolic memory
        this.currentM = currentPT.M;
        this.currentS = currentPT.S;

        // expAST.body is an array and its length is 1
        this.S_Expression = '';
        this.handleExpression (expAST.body[0]);

        // Add the S-Expression
        sExpressions.push (this.S_Expression);

        // Add the identifiers that appear in the path constraint
        this.updateIdentifiers (expAST);
      } catch (e) {
        cb (new Error ('Unable to parse expression. ' + e.message), null);
      }
    }

    this.getSMTExpression (sExpressions, this.parameters, function (err, res) {
      cb (err, res);
    });
  }

  private handleExpression (node : any) {
    var expNode : ExpressionNode;
    var operator : string;

    try {
      expNode = this.getTypeExpression (node);
    } catch (e) {
      throw e;
    }

    switch (expNode.type) {
      // type: "ArrayExpression";
      // elements: [ Expression | null ];
      case ExpressionType.ArrayExpression:
        break;

      // type: "ArrowExpression";
      // params: [ Pattern ];
      // defaults: [ Expression ];
      // rest: Identifier | null;
      // body: BlockStatement | Expression;
      // generator: boolean;
      // expression: boolean;
      case ExpressionType.ArrowExpression:
        break;

      // type: "AssignmentExpression";
      // operator: AssignmentOperator;
      // left: Pattern;
      // right: Expression;
      case ExpressionType.AssignmentExpression:
        break;

      // type: "BinaryExpression";
      // operator: BinaryOperator;
      // left: Expression;
      // right: Expression;
      case ExpressionType.BinaryExpression:
        assert.equal (
          expNode.recursiveNodes.length,
          2,
          'BinaryExpression nodes != 2'
        );

        operator = ParserExpression.binaryOperators[node.operator];
        if (operator === undefined) {
          operator = node.operator;
        }

        this.updateSExp ('(');
        if (node.operator != '!=') {
          this.updateSExp (operator + ' ');
        } else {
          this.updateSExp ('not (=' + ' ');
        }
        this.handleExpression (node[expNode.recursiveNodes[0]]);
        this.updateSExp (' ');
        this.handleExpression (node[expNode.recursiveNodes[1]]);
        if (node.operator === '!=') {
          this.updateSExp (')');
        }
        this.updateSExp (')');

        break;

      // type: "CallExpression";
      // callee: Expression;
      // arguments: [ Expression ];
      case ExpressionType.CallExpression:
        assert.equal (
          expNode.recursiveNodes.length,
          2,
          'CallExpression nodes != 2'
        );

        var argumentsNode = node[expNode.recursiveNodes[1]];
        if (!_.isArray (argumentsNode)) {
          throw new Error (
            '[CallExpression] Unable to handle property "arguments". Is not an array'
          );
        }

        var calleeNode    = node[expNode.recursiveNodes[0]];
        var calleeNodeExp = this.getTypeExpression (calleeNode);
        if (calleeNodeExp.type === ExpressionType.Identifier) {
          // Handle 'normal' call of a function
          var functionName = calleeNode.name;

          // Try to replace all occurence of identifiers with their value. Example:
          // Suppose you have foo (a, b) and you try to symbolically execute
          // 'a' and 'b'. We can try to replace occurence of this two parameters
          // with the values stored in 'this.parametersLastExecution'.
          // In general, if we found an identifer and this identifier is in
          // 'this.parametersLastExecution', we replace the identifer with its
          // value, else we throw an exception since we cannot know the
          // type of the parameter
          var actualParameters : Array<string> = [];
          var astFunctionCall : any;
          var that = this;

          for (var k = 0; k < argumentsNode.length; k++) {
            // 'argumentsNode[k]' is an AST
            var astFunctionCall = estraverse.replace (argumentsNode[k], {
              enter: function (node) {
                if (node.hasOwnProperty ('type') && node.type === 'Identifier') {
                  if (that.parametersLastExecution.hasOwnProperty (node.name)) {
                    node.name = that.parametersLastExecution[node.name];
                  }
                }
              }
            });

            actualParameters.push (escodegen.generate (astFunctionCall));
          }

          this.queueFunctions.push ({
            name : functionName,
            parameters : actualParameters
          });

          this.updateSExp ('<exec=' + functionName + '>');
        } else {
          this.updateSExp ('(');
          this.handleExpression (node[expNode.recursiveNodes[0]]);

          for (var k = 0; k < argumentsNode.length; k++) {
            this.handleExpression (argumentsNode[k]);

            if (k !== argumentsNode.length - 1) {
              this.updateSExp (' ');
            }
          }
          this.updateSExp (')');
        }

        break;

      // type: "ComprehensionExpression";
      // body: Expression;
      // blocks: [ ComprehensionBlock | ComprehensionIf ];
      // filter: Expression | null;
      case ExpressionType.ComprehensionExpression:
        break;

      // type: "ConditionalExpression";
      // test: Expression;
      // alternate: Expression;
      // consequent: Expression;
      case ExpressionType.ConditionalExpression:
        break;

      // type: "ExpressionStatement";
      // expression: Expression;
      case ExpressionType.ExpressionStatement:
        assert.equal (
          expNode.recursiveNodes.length,
          1,
          'ExpressionStatement nodes != 1'
        );

        this.handleExpression (node[expNode.recursiveNodes[0]]);

        break;

      // type: "FunctionExpression";
      // id: Identifier | null;
      // params: [ Pattern ];
      // defaults: [ Expression ];
      // rest: Identifier | null;
      // body: BlockStatement | Expression;
      // generator: boolean;
      // expression: boolean;
      case ExpressionType.FunctionExpression:
        break;

      // type: "GeneratorExpression";
      // body: Expression;
      // blocks: [ ComprehensionBlock | ComprehensionIf ];
      // filter: Expression | null;
      case ExpressionType.GeneratorExpression:
        break;

      // type: "GraphExpression";
      // index: uint32;
      // expression: Literal;
      case ExpressionType.GraphExpression:
        break;

      // type: "GraphIndexExpression";
      // index: uint32;
      case ExpressionType.GraphIndexExpression:
        break;

      // type: "Identifier";
      // name: string;
      case ExpressionType.Identifier:
        assert.equal (
          expNode.recursiveNodes.length,
          0,
          'Identifier nodes != 0'
        );

        this.updateSExp (node.name + ' ');

        break;

      // type: "LetExpression";
      // head: [ VariableDeclarator ];
      // body: Expression;
      case ExpressionType.LetExpression:
        break;

      // type: "Literal";
      // value: string | boolean | null | number | RegExp;
      case ExpressionType.Literal:
        assert.equal (
          expNode.recursiveNodes.length,
          0,
          'Literal nodes != 0'
        );

        this.updateSExp (
          (typeof node.value === 'string')
            ? '"' + node.value + '"' + ' '
            : node.value + ' '
        );

        break;

      // type: "LogicalExpression";
      // operator: LogicalOperator;
      // left: Expression;
      // right: Expression;
      case ExpressionType.LogicalExpression:
        assert.equal (
          expNode.recursiveNodes.length,
          2,
          'LogicalExpression nodes != 2'
        );

        this.updateSExp ('(');
        this.updateSExp (ParserExpression.logicalOperators[node.operator] + ' ');
        // Handle left 'expression'
        this.handleExpression (node[expNode.recursiveNodes[0]]);
        this.updateSExp (' ');
        // Handle right 'expression'
        this.handleExpression (node[expNode.recursiveNodes[1]]);
        this.updateSExp (')');

        break;

      // type: "MemberExpression";
      // object: Expression;
      // property: Identifier | Expression;
      // computed: boolean;
      // -------
      // If 'computed' is 'true'  => 'property' is an 'Expression'
      // If 'computed' is 'false' => 'property' is an 'Identifier'
      case ExpressionType.MemberExpression:
        assert.equal (
          expNode.recursiveNodes.length,
          2,
          'MemberExpression nodes != 2'
        );

        // We handle property for a 'string'
        if (!node.computed) {
          var objectNode   = node[expNode.recursiveNodes[0]];
          var propertyNode = node[expNode.recursiveNodes[1]];

          var expNodeObject   = this.getTypeExpression (objectNode);
          var expNodeProperty = this.getTypeExpression (propertyNode);

          if (expNodeObject.type === ExpressionType.Identifier) {
            // Search if is a 'string'
            var stringParam : Parameter = null;
            for (var k = 0; k < this.parameters.length; k++) {
              if (objectNode.name === this.parameters[k].id) {
                if (this.parameters[k].type === 'String') {
                  stringParam = this.parameters[k];
                  break;
                }
              }
            }

            if (stringParam === null) {
              throw new Error (
                '[MemberExpression] Unable to handle property of parameter "' + node.name + '". It is not a string'
              );
            } else if (expNodeProperty.type !== ExpressionType.Identifier) {
              throw new Error (
                '[MemberExpression] Unable to handle property of parameter "' + node.name + '". Is not an identifier'
              );
            } else if (!ParserExpression.stringMethods[this.smtSolverName].hasOwnProperty (node.property.name)) {
              throw new Error (
                '[MemberExpression] Unable to handle property "' + node.property.name + '" of parameter "' + node.name
              );
            }

            // 'object' node is an 'Identifier' and it's a 'string'
            // 'property' node is an 'Identifier' and it's value is one among
            // those supported by 'Z3-str'
            if (node.property.name === 'length') {
              this.updateSExp ('(');
            }
            this.updateSExp (ParserExpression.stringMethods[this.smtSolverName][node.property.name] + ' ');
            this.updateSExp (node.object.name + ' ');
            if (node.property.name === 'length') {
              this.updateSExp (')');
            }
          } else {
            throw new Error (
              '[MemberExpression] Unable to handle property "object". It must be an identifier'
            );
          }
        }

        break;

      // type: "NewExpression";
      // callee: Expression;
      // arguments: [ Expression ];
      case ExpressionType.NewExpression:
        break;

      // type: "ObjectExpression";
      // properties: [ Property ];
      case ExpressionType.ObjectExpression:
        break;

      // type: "Property";
      // key: Literal | Identifier;
      // value: Expression;
      // kind: "init" | "get" | "set";
      case ExpressionType.Property:
        break;

      // type: "SequenceExpression";
      // expressions: [ Expression ];
      case ExpressionType.SequenceExpression:
        break;

      // type: "ThisExpression";
      case ExpressionType.ThisExpression:
        break;

      // type: "UnaryExpression";
      // operator: UnaryOperator;
      // prefix: boolean;
      // argument: Expression;
      case ExpressionType.UnaryExpression:
        assert.equal (
          expNode.recursiveNodes.length,
          1,
          'UnaryExpression nodes != 1'
        );

        operator = ParserExpression.unaryOperators[node.operator];
        if (operator === undefined) {
          operator = node.operator;
        }

        this.updateSExp ('(');
        this.updateSExp (operator + ' ');
        this.handleExpression (node[expNode.recursiveNodes[0]]);
        this.updateSExp (')');

        break;

      // type: "UpdateExpression";
      // operator: UpdateOperator;
      // argument: Expression;
      // prefix: boolean;
      case ExpressionType.UpdateExpression:
        assert.equal (
          expNode.recursiveNodes.length,
          1,
          'UpdateExpression nodes != 1'
        );

        /*
        if (!ParserExpression.updateOperators.hasOwnProperty (node.operator)) {
          throw new Error (
            '[UpdateExpression] Unknown update operator ' + node.operator
          );
        }

        // k++ => prefix is 'false'
        // ++k => prefix is 'true'
        if (node.prefix) {
          this.updateSExp ('(');
          this.handleExpression (node[expNode.recursiveNodes[0]]);
          this.updateSExp (ParserExpression.updateOperators[node.operator]);
          this.updateSExp (')');
        }
        */

        break;

      // type: "YieldExpression";
      // argument: Expression | null;
      case ExpressionType.YieldExpression:
        break;
    }
  }

  private updateSExp (s : string) {
    this.S_Expression += s;
  }

  private getTypeExpression (node : any) : ExpressionNode {
    var expNode : ExpressionNode = <ExpressionNode> {};

    if (node.type === 'ArrayExpression') {
      expNode.type = ExpressionType.ArrayExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'ArrowExpression') {
      expNode.type = ExpressionType.ArrowExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'AssignmentExpression') {
      expNode.type = ExpressionType.AssignmentExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'BinaryExpression') {
      expNode.type = ExpressionType.BinaryExpression;
      expNode.recursiveNodes = ['left', 'right'];
    } else if (node.type === 'CallExpression') {
      expNode.type = ExpressionType.CallExpression;
      expNode.recursiveNodes = ['callee', 'arguments'];
    } else if (node.type === 'ComprehensionExpression') {
      expNode.type = ExpressionType.ComprehensionExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'ConditionalExpression') {
      expNode.type = ExpressionType.ConditionalExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'ExpressionStatement') {
      expNode.type = ExpressionType.ExpressionStatement;
      expNode.recursiveNodes = ['expression'];
    } else if (node.type === 'FunctionExpression') {
      expNode.type = ExpressionType.FunctionExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'GeneratorExpression') {
      expNode.type = ExpressionType.GeneratorExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'GraphExpression') {
      expNode.type = ExpressionType.GraphExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'GraphIndexExpression') {
      expNode.type = ExpressionType.GraphIndexExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'Identifier') {
      expNode.type = ExpressionType.Identifier;
      expNode.recursiveNodes = [];
    } else if (node.type === 'LetExpression') {
      expNode.type = ExpressionType.LetExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'Literal') {
      expNode.type = ExpressionType.Literal;
      expNode.recursiveNodes = [];
    } else if (node.type === 'LogicalExpression') {
      expNode.type = ExpressionType.LogicalExpression;
      expNode.recursiveNodes = ['left', 'right'];
    } else if (node.type === 'MemberExpression') {
      expNode.type = ExpressionType.MemberExpression;
      expNode.recursiveNodes = ['object', 'property'];
    } else if (node.type === 'NewExpression') {
      expNode.type = ExpressionType.NewExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'ObjectExpression') {
      expNode.type = ExpressionType.ObjectExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'Property') {
      expNode.type = ExpressionType.Property;
      expNode.recursiveNodes = [];
    } else if (node.type === 'SequenceExpression') {
      expNode.type = ExpressionType.SequenceExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'ThisExpression') {
      expNode.type = ExpressionType.ThisExpression;
      expNode.recursiveNodes = [];
    } else if (node.type === 'UnaryExpression') {
      expNode.type = ExpressionType.UnaryExpression;
      expNode.recursiveNodes = ['argument'];
    } else if (node.type === 'UpdateExpression') {
      expNode.type = ExpressionType.UpdateExpression;
      expNode.recursiveNodes = ['argument'];
    } else if (node.type === 'YieldExpression') {
      expNode.type = ExpressionType.YieldExpression;
      expNode.recursiveNodes = [];
    } else {
      throw new Error ('Unknown expression ' + node.type);
    }

    return expNode;
  }

  private updateIdentifiers (ast : any) : void {
    var that = this;

    estraverse.traverse (ast, {
      enter: function (node, parent) {
        if (node.type === 'Identifier') {
          if (parent !== null && parent.hasOwnProperty ('type')) {
            // Avoid to insert identifiers that apper as arguments of a
            // function call. Example:
            // input -> a = b + b + foo (c)
            //   identifiers -> {a, b, b, foo, c}
            // output -> {a, b}
            if (parent.type !== 'CallExpression') {
              // Avoid duplicates
              if (that.identifiers.indexOf (node.name) === -1) {
                that.identifiers.push (node.name);
              }
            }
          }
        }
      }
    });
  }

  private getSMTExpression (sExpressions : Array<string>, parameters : Array<Parameter>, cb : (err, res) => void) : void {
    var smtExpression : string = '';
    var regExpFuncCall : RegExp;
    var functionName : string;
    var newSExpression : string;
    var functionToExecute : FunctionCall;
    var that = this;

    // Add options part
    smtExpression  = this.getOptionsPart ();
    // Add declaration part
    smtExpression += this.getDeclarationPart (parameters);

    // Add S-Expressions that do not contain functions to execute
    for (var k = 0; k < sExpressions.length; k++) {
      var functions : Array<string> = sExpressions[k].match (/<exec=([a-zA-Z0-9_]+)>/g);

      if (functions === null || functions.length === 0) {
        smtExpression += '(assert ' + sExpressions[k] + ')\n';
      }
    }

    // Check, in the S-Expression, if there are functions to execute to avoid
    // to get stuck
    for (var k = 0; k < sExpressions.length; k++) {
      !function (sExp, isLast) {
        var functions : Array<string> = sExp.match (/<exec=([a-zA-Z0-9_]+)>/g);

        if (functions !== null && functions.length > 0) {
          that.resolveFunctionCalls (0, functions, sExp, function (err, res) {
            if (err) {
              cb (err, null);
            } else {
              smtExpression += '(assert ' + res + ')\n';

              if (isLast) {
                smtExpression += '(check-sat)' + '\n';
                if (that.smtSolverName === 'cvc4') {
                  smtExpression += '(get-value (' + that.getModelPart (parameters) + '))\n';
                } else {
                  smtExpression += '(get-model)';
                }

                cb (null, smtExpression);
              }
            }
          });
        } else if (isLast) {
          smtExpression += '(check-sat)' + '\n';
          if (that.smtSolverName === 'cvc4' || that.smtSolverName === 'z3') {
            smtExpression += '(get-value (' + that.getModelPart (parameters) + '))\n';
          } else {
            smtExpression += '(get-model)';
          }

          cb (null, smtExpression);
        }
      } (sExpressions[k], (k === (sExpressions.length - 1)));
    }
  }

  private resolveFunctionCalls (functionIndex : number, functions : Array<string>,
                                sExpression : string, cb : (res, err) => void) : void {
    var that = this;

    if (functionIndex < functions.length) {
      var functionName = functions[functionIndex].substring (
        6,
        functions[functionIndex].length - 1
      );
      var functionToExecute : FunctionCall;
      var regExpFuncCall : RegExp;
      var newSExpression : string;
      var retValueFunction : any;

      functionToExecute = this.getFunctionToCall (functionName);

      this.chromeClient.executeFunction (
        functionToExecute.name,
        functionToExecute.parameters.join (', '),
        function (err, res) {
          if (err) {
            cb (
              new Error ('Unable to execute function "' + functionToExecute.name + '"'),
              null
            );
          } else {
            // 'res' is an object:
            // {
            //   result: { type: <String>, value: <Any>, description: <String> },
            //   wasThrown: <Boolean>,
            //   function: <Instance of CoverageFunction>
            // }
            // Example:
            // {
            //   result: { type: 'number', value: 112, description: '112' },
            //   wasThrown: false,
            //   function: { ... }
            // }
            retValueFunction = (typeof res.result.value === 'string')
              ? '"' + res.result.value + '"'
              : res.result.value;

            regExpFuncCall = new RegExp ('<exec=' + functionName + '>');
            newSExpression = sExpression.replace (regExpFuncCall, retValueFunction);

            that.resolveFunctionCalls (++functionIndex, functions, newSExpression, cb);
          }
        } // End of callback
      ); // End of executeFunction
    } else {
      cb (null, sExpression);
    }
  }

  private getOptionsPart () : string {
    var options : Array<string>;

    if (this.smtSolverName === 'cvc4') {
      options = [
        '(set-option :produce-models true)',
        '(set-logic QF_S)'
      ];
    } else if (this.smtSolverName === 'z3' || this.smtSolverName === 'z3-str') {
      options = [];
    }

    return options.join ('\n') + '\n';
  }

  private getDeclarationPart (parameters : Array<Parameter>) : string {
    var decPart : Array<string> = [];

    for (var k = 0; k < parameters.length; k++) {
      if (parameters[k].symbolicallyExecute && this.identifiers.indexOf (parameters[k].id) !== -1) {
        decPart.push (
          '(declare-const ' + parameters[k].id + ' ' + parameters[k].type + ')'
        );
      }
    }

    return decPart.join ('\n') + '\n';
  }

  private getModelPart (parameters : Array<Parameter>) : string {
    var parametersIds : Array<string> = [];
    var identifierToSolve : string = '';

    for (var k = 0; k < parameters.length; k++) {
      parametersIds.push (parameters[k].id);
    }

    identifierToSolve = _.filter (this.identifiers, function (id) {
      return parametersIds.indexOf (id) !== -1;
    }).join (' ');

    return identifierToSolve;
  }

  private getFunctionToCall (functionName : string) : FunctionCall {
    var retValue : FunctionCall = null;

    for (var k = 0; k < this.queueFunctions.length; k++) {
      if (this.queueFunctions[k].name === functionName) {
        retValue = this.queueFunctions[k];
        this.queueFunctions.splice (k, 1);
        break;
      }
    }

    return retValue;
  }
}

export = ParserExpression;
