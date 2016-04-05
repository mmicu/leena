import chalk = require ('chalk');
import _ = require ('underscore');

import Leena = require ('../../../../src/back-end/leena');
import u = require ('../../../test-utils');


var leena = new Leena ({
  hostname: 'localhost',
  port: 4004
});

var fName = 'f_0';
var pFunc = {
  x: {
    type: 'Int',
    value: 0
  },
  y: {
    type: 'Int',
    value: 2
  }
};

console.log ('exec');
leena.inspect (fName, pFunc, function (res) {
  console.log (res);
  console.log ('END');
});
console.log ('END - 2');
