import path = require ('path');

import chalk = require ('chalk');
import mkdirp = require ('mkdirp');
import _ = require ('underscore');

import BShandler = require ('../browser-sync-handler');
import ChromeTesterServer = require ('../tester/chrome-tester-server');
import CoverageFunction = require ('./coverage/coverage-function');
import CoverageBranch = require ('./coverage/coverage-branch');
import CoverageStatement = require ('./coverage/coverage-statement');
import JSFile = require ('./js-file');
import LeenaConfiguration = require ('../config');
import logger = require ('../logger');
import utils = require ('../utils');


class LeenaContext {
  // Leena configuration
  private leenaConfig : LeenaConfiguration;

  // Instance of the 'Chrome Tester Server'
  private chromeServer : ChromeTesterServer;

  // Array of JavaScript files that we want to test
  public jsFiles : Array<JSFile>;


  constructor (leenaConfig : LeenaConfiguration) {
    this.leenaConfig = leenaConfig;
    this.jsFiles = [];
  }

  public setChromeServer (chromeServer : ChromeTesterServer) : void {
    this.chromeServer = chromeServer;
  }

  public handleProperty (event : string, fileInfo : BShandler.PropertyReturnValue) : void {
    // Handle events
    switch (event) {
      // Handle 'add' event
      case 'add':
        try {
          if (fileInfo.fileToTest) {
            this.add (fileInfo);
          }
        } catch (e) {
          throw e;
        }

        break;

      // Handle 'change' event
      case 'change':
        try {
          if (fileInfo.fileToTest) {
            this.update (fileInfo);
            logger.info ('Updating instance of "' + fileInfo.pathFile + '"');
          }
        } catch (e) {
          throw e;
        }

        break;

      // Handle 'unlink' event
      case 'unlink':
        try {
          if (fileInfo.fileToTest) {
            this.delete (fileInfo);
            logger.info ('Deleting instance of "' + fileInfo.pathFile + '"');
          }
        } catch (e) {
          throw e;
        }

        break;

      // Handle 'unlinkDir' event
      case 'unlinkDir':

        break;
    }
  }

  public executeFunction (functionName : string,
                          cb : (err : Error, res) => void) : void {
    var found : boolean = false;

    for (var k = 0; k < this.jsFiles.length; k++) {
      if (this.jsFiles[k].containsFunction (functionName)) {
        this.jsFiles[k].executeFunction (functionName, cb);
        found = true;

        break;
      }
    }

    if (!found) {
      cb (
        new Error (
          'Unable to execute function "' + functionName + '". It does not exist'
        ),
        null
      );
    }
  }

  public updateFunctionInstance (functionName : string, functionI : CoverageFunction) : void {
    var found : boolean = false;

    for (var k = 0; k < this.jsFiles.length; k++) {
      if (this.jsFiles[k].containsFunction (functionName)) {
        this.jsFiles[k].updateFunctionInstance (functionName, functionI);
        found = true;

        break;
      }
    }

    if (!found) {
      throw new Error ('Unable to update function "' + functionName + '". It does not exist');
    }
  }

  public getFunction (functionName : string) : CoverageFunction {
    var index : number = this.getFunctionIndex (functionName);

    if (index === -1) {
      throw new Error ('Unable to get function instance. Function "' + functionName + '" does not exist');
    } else if (index < 0 || index >= this.jsFiles.length) {
      throw new Error ('Unable to get function instance of function "' + functionName + '". Index out of range');
    }

    return this.jsFiles[index].getFunctionInstance (functionName);
  }

  private getFunctionIndex (functionName : string) : number {
    for (var k = 0; k < this.jsFiles.length; k++) {
      if (this.jsFiles[k].containsFunction (functionName)) {
        return k;
      }
    }

    return -1;
  }

  private add (fileInfo : BShandler.PropertyReturnValue) : void {
    var index = this.get (fileInfo.pathTempFile);

    if (index === -1) {
      var jsFile : JSFile;
      var that = this;

      jsFile = new JSFile (fileInfo, this.leenaConfig, function (err, res) {
        if (err) {
          throw err;
        } else if (res) {
          that.jsFiles.push (jsFile);
          // Update the context in the server
          that.chromeServer.updateContext (that);
        }
      });
    }
    else {
      throw new
        Error ('Unable to add file "' + fileInfo.pathTempFile + '" in the context. It already exists');
    }
  }

  private delete (fileInfo : BShandler.PropertyReturnValue) : void {
    var index : number = this.get (fileInfo.pathTempFile);

    if (index !== -1 && index <= this.jsFiles.length) {
      this.jsFiles.splice (index, 1);
    }
    else {
      throw new
        Error ('Unable to delete file "' + fileInfo.pathTempFile + '" in the context');
    }
  }

  private update (fileInfo : BShandler.PropertyReturnValue) : void {
    var index : number = this.get (fileInfo.pathTempFile);

    if (index !== -1 && index <= this.jsFiles.length) {
      this.jsFiles[index].update ();
    }
    else {
      throw new
        Error ('Unable to update file "' + fileInfo.pathTempFile + '" in the context');
    }
  }

  private get (pathTempFile : string) : number {
    if (!_.isArray (this.jsFiles)) {
      return -1;
    }

    for (var k = 0, lengthJF = this.jsFiles.length; k < lengthJF; k++) {
      if (this.jsFiles[k].pathTempFile === pathTempFile) {
        return k;
      }
    }

    return -1;
  }
}

export = LeenaContext;
