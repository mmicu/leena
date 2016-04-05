var Chrome = require ('chrome-remote-interface');

import u = require ('../../test-utils');


// Utility to test if you correctly execute Chrome by enabling the
// remote debugging protocol. More info about the protocol:
// https://developer.chrome.com/devtools/docs/protocol/1.1/index
var connectionInfo : Object = {
  'host' : 'localhost',
  'port' : 9222
};

Chrome (connectionInfo, function (chrome) {
  var h : string = connectionInfo['host'];
  var p : number = connectionInfo['port'];

  u.printSuccess ('Chrome running correctly (' + connectionInfo['host'] + ':' + connectionInfo['port'] + ')');
  process.exit (0);
}).on ('error', function (error) {
  u.printError ('Connection error (' + connectionInfo['host'] + ':' + connectionInfo['port'] + ')')
});
