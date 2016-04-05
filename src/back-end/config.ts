import path = require ('path');

import _ = require ('underscore');

import utils = require ('./utils');


interface ConnectionInformation {
  hostname : string;
  port : number;
}

interface ConnectionInformationBS {
  server : string;
  port : number;
}

interface BrowserSyncEntry extends ConnectionInformationBS {
  uiPort : number;
}

interface BrowserSync {
  watcher : BrowserSyncEntry;
  webServer : BrowserSyncEntry;
}

interface ChromeTester {
  debuggingProtocol : ConnectionInformation;
  testerServer: ConnectionInformation;
}

interface SMTSolver {
  name : string;
  path : string;
}

interface FileToTest {
  originalPath : string;
  tempPath: string;
}

class LeenaConfiguration {
  // BrowserSync parameters for:
  //   * watcher:
  //      - server : path of the application that we want to test
  //   * webServer:
  //      - server : path of the temporary application that we want to test
  public browserSync : BrowserSync;

  // Chrome tester parameters
  public chromeTester : ChromeTester;

  // Instance of the SMT solver used to solve the path constraint
  public solver : SMTSolver;

  // Array of JavaScript files that we want to test
  public files : Array<FileToTest>;

  // Array of possible errors that we encounter during the parsing
  // of the configuration file. Used to collect all possible errors
  // instead of return immediately
  private errors : Array<string>;

  // Final configuration object that we return after the parsing
  private jsonOBJ : any;


  constructor (jsonOBJ : any) {
    this.jsonOBJ = jsonOBJ;
    this.errors = [];
  }

  public parseJSONObject (solverToUse : string) : Array<string> {
    this.initBrowserSync ();
    this.initChromeTester ();
    this.initSMTSolvers (solverToUse);
    this.initFilesToTest ();

    return this.errors;
  }

  public getContentFile () : string {
    return JSON.stringify (this.jsonOBJ, null, 2);
  }

  private initBrowserSync () : void {
    var Wobj = this.jsonOBJ.browserSync.watcher || {};
    var WBobj = this.jsonOBJ.browserSync.webServer || {};
    var watcher = <BrowserSyncEntry> {};
    var webServer = <BrowserSyncEntry> {};
    var errorsLength = this.errors.length;
    var prop;

    // Watcher
    watcher.server = path.normalize (Wobj.server);
    watcher.port   = Wobj.port;
    watcher.uiPort = Wobj.ui.port;

    // Web Server
    webServer.server = path.normalize (WBobj.server);
    webServer.port   = WBobj.port;
    webServer.uiPort = WBobj.ui.port;

    // Initialize interface
    this.browserSync = <BrowserSync> {};
    this.browserSync.watcher = <BrowserSyncEntry> {};
    this.browserSync.webServer = <BrowserSyncEntry> {};

    // Check for errors in 'watcher'
    for (prop in watcher) {
      if (watcher.hasOwnProperty (prop)) {
        if (watcher[prop] === undefined) {
          this.errors.push (this.getErrorMessage (prop, 'browserSync.watcher'));
        }
      }
    }
    // 'server' {string} is a path. It must exist
    if (!utils.pathExists (watcher.server)) {
      this.errors.push (this.getErrorMessage (
        'server',
        'browserSync.watcher',
        'must be an existing path'
      ));
    }
    // 'port' {number} range is checked by 'init' method of browser-sync
    // 'ui.port' {number} range is checked by 'init' method of browser-sync


    // Check for errors in 'webServer'
    for (prop in webServer) {
      if (webServer.hasOwnProperty (prop)) {
        if (webServer[prop] === undefined) {
          this.errors.push (this.getErrorMessage (prop, 'browserSync.webServer'));
        }
      }
    }
    // 'server' {string} is a path. It must Not exist
    if (utils.pathExists (webServer.server)) {
      this.errors.push (this.getErrorMessage (
        'server',
        'browserSync.webServer',
        'must not exist'
      ));
    }
    // 'port' {number} range is checked by 'init' method of browser-sync
    // 'ui.port' {number} range is checked by 'init' method of browser-sync

    // Update values if and only if there are no errors
    if (errorsLength === this.errors.length) {
      this.browserSync.watcher = watcher;
      this.browserSync.webServer = webServer;
    }
  }

  private initChromeTester () : void {
    var DPobj = this.jsonOBJ.chrome.debuggingProtocol || {};
    var TSobj = this.jsonOBJ.chrome.testerServer || {};
    var debuggingProtocol = <ConnectionInformation> {};
    var testerServer = <ConnectionInformation> {};
    var errorsLength = this.errors.length;
    var prop;

    // Initialize interface
    this.chromeTester = <ChromeTester> {};
    this.chromeTester.debuggingProtocol = <ConnectionInformation> {};
    this.chromeTester.testerServer = <ConnectionInformation> {};

    // Debugging protocol
    debuggingProtocol.hostname = DPobj.hostname;
    debuggingProtocol.port = DPobj.port;

    // Tester server
    testerServer.hostname = TSobj.hostname;
    testerServer.port = TSobj.port;

    // Check for errors in 'debuggingProtocol'
    for (prop in debuggingProtocol) {
      if (debuggingProtocol.hasOwnProperty (prop)) {
        if (debuggingProtocol[prop] === undefined) {
          this.errors.push (this.getErrorMessage (prop, 'chrome.debuggingProtocol'));
        }
      }
    }
    // Check 'port' {number}
    if (!utils.isCorrectPort (debuggingProtocol.port)) {
      this.errors.push (this.getErrorMessage (
        'port',
        'debuggingProtocol.port',
        'has an incorrect value'
      ));
    }

    // Check for errors in 'testerServer'
    for (prop in testerServer) {
      if (testerServer.hasOwnProperty (prop)) {
        if (testerServer[prop] === undefined) {
          this.errors.push (this.getErrorMessage (prop, 'chrome.testerServer'));
        }
      }
    }
    // Check 'port' {number}
    if (!utils.isCorrectPort (testerServer.port)) {
      this.errors.push (this.getErrorMessage (
        'port',
        'testerServer.port',
        'has an incorrect value'
      ));
    }

    // Update values if and only if there are no errors
    if (errorsLength === this.errors.length) {
      this.chromeTester.debuggingProtocol = debuggingProtocol;
      this.chromeTester.testerServer = testerServer;
    }
  }

  private initSMTSolvers (solverToUse : string) : void {
    if (this.jsonOBJ['smt-solvers'] === undefined) {
      this.errors.push (this.getErrorMessage ('smt-solvers'));
    } else {
      var solvers = this.jsonOBJ['smt-solvers'];
      var solver = solvers[solverToUse];

      if (solver === undefined) {
        this.errors.push (this.getErrorMessage (solverToUse, 'smt-solvers'));
      } else if (!utils.fileExists (solver)) {
        this.errors.push ('Path of "' + solverToUse + '" does not exist');
      } else {
        this.solver = <SMTSolver> {};

        this.solver.name = solverToUse;
        this.solver.path = solver;
      }
    }
  }

  private initFilesToTest () : void {
    var appFile = [];
    this.files = [];

    if (this.jsonOBJ.files === undefined) {
      this.errors.push (this.getErrorMessage ('files'));
    } else {
      appFile = (_.isArray (this.jsonOBJ.files))
        ? this.jsonOBJ.files
        : (_.isString (this.jsonOBJ.files))
          ? [this.jsonOBJ.files]
          : undefined;

      if (appFile === undefined && !_.isArray (this.jsonOBJ.files)) {
        this.errors.push (this.getErrorMessage (
          'files',
          '',
          'can be a string or an array of strings'
        ));
      } else {
        // Remove spaces
        appFile = _.map (appFile, function (s) {
          return s.replace (/\s/g, '');
        });

        // Remove duplicates
        appFile = _.uniq (appFile);

        // Check if files exist <=> watcher.server exists
        if (this.browserSync.watcher.server) {
          for (var k = 0, lengthF = appFile.length; k < lengthF; k++) {
            var fileToTest = <FileToTest> {};

            // Update file with the entire path (original path)
            fileToTest.originalPath = path.normalize (([
              this.browserSync.watcher.server,
              appFile[k]
            ].join (path.sep)));

            // Update file with the entire path (temp path)
            fileToTest.tempPath = path.normalize (([
              this.browserSync.webServer.server,
              appFile[k]
            ].join (path.sep)));

            // Check if files exist
            if (!utils.fileExists (fileToTest.originalPath)) {
              this.errors.push (this.getErrorMessage (
                'files',
                '',
                '- path "' + fileToTest.originalPath + '" does not exist'
              ));
            }

            this.files.push (fileToTest);
          }
        }
      }
    }
  }

  private getErrorMessage (property : string, rootObject? :
                           string, message? : string) : string {
    var errorMessage : string;

    errorMessage  = 'Property "' + property + '"';
    errorMessage += (rootObject && rootObject !== '')
      ? ' of node "' + rootObject + '" '
      : ' ';
    errorMessage += (message)
      ? message
      : 'is undefined';

    return errorMessage;
  }
}

export = LeenaConfiguration;
