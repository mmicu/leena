import estraverse = require ('estraverse');


var BRANCH_NODES : Array<string> = [
  'ConditionalExpression',
  'IfStatement',
  'SwitchStatement'
];

var LOOP_NODES : Array<string> = [
  'DoWhileStatement',
  'WhileStatement',
  'ForStatement'
];

export
function nodeIsBranch (nodeType : string) : boolean {
  var isBranch : boolean = (BRANCH_NODES.indexOf (nodeType) !== -1);

  return isBranch;
}

export
function nodeIsLoop (nodeType : string) : boolean {
  var isLoop : boolean = (LOOP_NODES.indexOf (nodeType) !== -1);

  return isLoop;
}

export
function getExpressionNodeNameOfBranch (nodeType : string) : string {
  var expressionNodeName : string = (nodeType === 'IfStatement' ||
    nodeType === 'ConditionalExpression')
      ? 'test'
      : (nodeType === 'SwitchStatement')
        ? 'discriminant'
        : null;

  return expressionNodeName;
}

export
function breakInTheLastNode (node : any) : boolean {
  var lastNode : any;
  var thereIsBreak : boolean;

  if (node === null || node.length === 0) {
    return false;
  }

  lastNode = node[node.length - 1];
  thereIsBreak = (lastNode.hasOwnProperty ('type') &&
    lastNode.type === 'BreakStatement');

  return thereIsBreak;
}

export
function getNumberOfStatementsOfLoop (loopNode : any) : number {
  if (!loopNode.hasOwnProperty ('type') || !loopNode.hasOwnProperty ('body') || !nodeIsLoop (loopNode.type)) {
    return -1;
  }

  var nStatements : number = 0;

  estraverse.traverse (loopNode.body, {
    enter: function (node) {
      if (node.hasOwnProperty ('type') && node.type.match (/.*Statement$/g) !== null) {
        if (node.type !== 'BlockStatement') {
          nStatements++;
        }
      }
    }
  });

  return nStatements;
}
