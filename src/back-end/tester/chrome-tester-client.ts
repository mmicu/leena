import net = require ('net');

import _ = require ('underscore');


interface ChromeClientParams {
  hostname : string;
  port : number;
}

class ChromeTesterClient {
  // Hostname of the 'Chrome Server'
  private hostname : string;

  // Port of the 'Chrome Server'
  private port : number;


  constructor (params : ChromeClientParams) {
    this.hostname = params.hostname;
    this.port     = params.port;
  }

  private callChromeServer (method, data, cb) {
    var client = new net.Socket ();
    var response;

    if (typeof cb !== 'function') {
      cb = function () {};
    }

    client.connect (this.port, this.hostname, function () {
      var objToWrite = {
        method: method,
        parameters: data
      };

      client.write (JSON.stringify (objToWrite));
    });

    client.on ('data', function (data) {
      response = JSON.parse (data);

      client.destroy ();
    });

    client.on ('close', function () {
      var err = response.error
        ? response.value
        : null;
      var res = response.error
        ? null
        : response.value;

      cb (err, res);
    });

    client.on ('error', function (err) {
      cb (err, null);
    });
  }
  
  public getConfiguration (cb) {
    this.callChromeServer ('getConfiguration', {}, function (err, res) {
      cb (err, res);
    });
  }

  public getCoverageObject (coverageObject, cb) {
    this.callChromeServer ('getCoverageObject', coverageObject, function (err, res) {
      cb (err, res);
    });
  }

  public getFunctionInstance (functionName, cb) {
    this.callChromeServer ('getFunctionInstance', functionName, function (err, res) {
      cb (err, res);
    });
  }

  public getSourceFunction (functionName, cb) {
    this.callChromeServer ('getSourceFunction', functionName, function (err, res) {
      cb (err, res);
    });
  }

  public executeFunction (functionName, params, cb) {
    this.callChromeServer (
      'executeFunction', [functionName, params], function (err, res) {
      cb (err, res);
    });
  }

  public executeFunctionWithDebugger (functionName, params, cb) {
    this.callChromeServer (
      'executeFunctionWithDebugger', [functionName, params], function (err, res) {
      cb (err, res);
    });
  }

  public reloadPage (cb) {
    this.callChromeServer ('reloadPage', {}, function (err, res) {
      cb (err, res);
    });
  }

  public setUrl (url, cb) {
    this.callChromeServer ('setUrl', url, function (err, res) {
      cb (err, res);
    });
  }
}

export = ChromeTesterClient;
