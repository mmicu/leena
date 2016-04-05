import net = require ('net');
import path = require ('path')

import chalk = require ('chalk');
var Chrome = require ('chrome-remote-interface');
import escodegen = require ('escodegen');
import estraverse = require ('estraverse');
var Promise = require ('bluebird');
import _ = require ('underscore');

import CoverageFunction = require ('../context/coverage/coverage-function');
import {BranchType, CoverageBranch} from '../context/coverage/coverage-branch';
import CoverageStatement = require ('../context/coverage/coverage-statement');
import ctUtils = require ('./chrome-tester-utils');
import LeenaConfiguration = require ('../config');
import LeenaContext = require ('../context/context');
import logger = require ('../logger');
import utils = require ('../utils');


interface ConnectionInformation {
  hostname : string;
  port : number;
}

interface ChromeTester {
  debuggingProtocol : ConnectionInformation;
  testerServer: ConnectionInformation;
}

interface ServerResponse {
  error : boolean;
  value : string;
}

interface ScriptInfo {
  url : string;
  id : number;
}

interface Variable {
  name : string;
  value : any;
}

class ChromeTesterServer {
  // Error message prefix
  private static ERROR_PREFIX = '[ChromeTesterServer] Exception. Reason: ';

  // Connection parameters for the debugging protocol
  private debuggingProtocol : ConnectionInformation;

  // Connection parameters for the 'tester server'
  private testerServer: ConnectionInformation;

  // Leena context
  private leenaContext : LeenaContext;

  // Leena configuration
  private leenaConfig : LeenaConfiguration;

  // --------------------------------------------------------------------------
  // ---- Parameters for the debugger ~ Start

  // Scripts information. Every 'script' tag has:
  //   * url : url of the script
  //   * id : id of the script
  private scriptsInfo : Array<ScriptInfo>;

  // Array of the type [{'param_1' : 'value_param_1'}, 'param_2' : 'value_param_2']
  // used to store the scope of every executed statement
  private statementsScope : Array<any>;

  // Instance of the function that we want to test
  private functionI : CoverageFunction;

  // Variable used to check if we have to add the scope in stack
  private updateScope : boolean;

  // Control flow graph
  private cfgStatements : Array<string>;

  // Last value for the coverage object
  private lastCoverageObjectValue : any;
  // ---- Parameters for the debugger ~ End
  // --------------------------------------------------------------------------


  constructor (params : ConnectionInformation) {
    this.debuggingProtocol = <ConnectionInformation> {};
    this.debuggingProtocol.hostname = params.hostname;
    this.debuggingProtocol.port = params.port;
    this.scriptsInfo = [];
    this.statementsScope = [];
  }

  public listen (params : ConnectionInformation, cb : (err : Error) => void) {
    var that = this;

    this.testerServer = <ConnectionInformation> {};
    this.testerServer.hostname = params.hostname;
    this.testerServer.port = params.port;

    // Start the TCP/IP server
    Chrome ({
      host: this.debuggingProtocol.hostname,
      port: this.debuggingProtocol.port
    }, function (chrome) {
      // Initialize the server
      net.createServer (function (sock) {
        sock.on ('data', function (data) {
          var response : ServerResponse = <ServerResponse> {};

          data = JSON.parse (data);

          logger.info ('Client connected');
          logger.info (chalk.gray ('(' + data.method + ')').toString ());

          that.handleData (data.method, data.parameters, chrome).then (
            function handleResponse (res) {
              response.error = false;
              response.value = res;

              sock.write (JSON.stringify (response));
            },
            function handleError (err) {
              response.error = true;
              response.value = err;

              sock.write (JSON.stringify (response));
            }
          );
        });

        sock.on ('close', function () {
          logger.info ('Client terminates connection');
        });

        sock.on ('error', function (err) {
          cb (err);
        });
      }).listen ({
        host: that.testerServer.hostname,
        port: that.testerServer.port
      }, function (err) {
        cb ((err) ? err : null);
      });

      // Save urls/id of JavaScript files
      // Fired when we call 'Debugger.enable'
      chrome.on ('Debugger.scriptParsed', function (params) {
        if (params.hasOwnProperty ('url') && params.url !== undefined) {
          if (params.url.length > 0) {
            that.scriptsInfo.push ({
              'url' : params.url,
              'id'  : params.scriptId || undefined
            });
          }
        }
      });

      // Handle 'Debugger.paused' event to get the current scope
      chrome.on ('Debugger.paused', function (params) {
        // Check if the current instruction is:
        //  - a user instruction;
        //  - an instruction generated by Istanbul.
        var coverageObjInfo : any = that.getEvalParameters (that.functionI.coverageObjectName);

        // Get the coverage object to check if the statement was executed
        // => The statement can contain n branches (where n >= 0)
        chrome.Runtime.evaluate (coverageObjInfo, function (err, res) {
          if (err) {
            logger.error (
              chalk.gray ('(Debugger.paused) ').toString () +
              ' Unable to get the coverage object'
            );
            process.exit (-1);
          } else {
            var coverageObjValue : any;
            var updateStatement : any;
            var updateBranch : any;

            coverageObjValue = res.result.value;
            // Check if the statement is updated
            updateStatement = ctUtils.updateFunctionStatement (
              that.lastCoverageObjectValue,
              coverageObjValue
            );
            // Check if the branch is updated
            updateBranch = ctUtils.updateFunctionBranch (
              that.lastCoverageObjectValue,
              coverageObjValue
            );

            // Add the modified statement in the 'cfg' (Control Flow Graph) list
            if (updateStatement.update) {
              that.cfgStatements.push (updateStatement.statementKey);
            }

            // Add the condition resulf of the branch to the corresponding
            // branch of the function
            if (updateBranch.update) {
              var bKey : string;

              for (var k = 0; k < updateBranch.branchesKeys.length; k++) {
                bKey = updateBranch.branchesKeys[k];

                for (var j = 0; j < that.functionI.branches.length; j++) {
                  if (bKey == that.functionI.branches[j].key) {
                    that.functionI.branches[j].valuesCondition.push (updateBranch.conditionsResults[k]);
                  }
                }
              }
            }

            // Update the value of the last coverage object
            that.lastCoverageObjectValue = _.clone (coverageObjValue);

            // Statement changes but we need to score the next statement since
            // we have an update when the coverage object changes. Example:
            //   (Row)                    (Instruction)
            //     n            __cov_R4BzyLAFqYZGZo4qJNWh$g.s['3']++; (1)
            //  (n + 1)                      a = a+1;                  (2)
            // Where:
            //   - statement (1) is generated by Istanbul. After executing it,
            //     'updateParams' will be 'true' but we don't care about
            //     the current scope;
            //   - statement (2) is written by the used and statement (1) refers
            //     to it. We have to store its scope.
            if (that.updateScope) {
              var scopeChainOfFoo = params.callFrames[0].scopeChain;

              chrome.send ('Runtime.getProperties',
                {
                  'objectId': scopeChainOfFoo[0].object.objectId
                },
                function (err, res) {
                  if (err) {
                    logger.error (
                      chalk.gray ('(Debugger.paused) ').toString () +
                      ' Unable to get properties of the current scope'
                    );
                    process.exit (-1);
                  } else {
                    var currentScope : any = {};
                    var injectedVariables : Array<any> = [];
                    var varName : string;
                    var varValue : any;
                    var varType : string;

                    for (var k = 0; k < res.result.length; k++) {
                      try {
                        varName  = res.result[k].name;
                        varValue = res.result[k].value.value;
                        varType  = res.result[k].value.type;

                        if (varType === 'object') {
                          injectedVariables.push ({
                            'name' : varName,
                            'objectId' : res.result[k].value.objectId
                          });
                        } else {
                          currentScope[varName] = varValue;
                        }
                      }
                      catch (e) {
                      }
                    }

                    ctUtils.resolveInjectedVariables (
                      chrome,
                      currentScope,
                      injectedVariables,
                      true,
                      {},
                      function (err) {
                        if (err) {
                          logger.error (
                            chalk.gray ('(Debugger.paused) ').toString () +
                            ' Unable to get values of objects'
                          );
                          process.exit (-1);
                        }

                        that.statementsScope.push (currentScope);

                        chrome.send ('Debugger.stepOver', function (err, res) {
                          if (err) {
                            logger.error (
                              chalk.gray ('(Debugger.stepOver) ~ 1').toString ()
                            );
                            process.exit (-1);
                          } else {
                            that.updateScope = false;
                          }
                        });
                      }
                    );
                  }
                }
              ); // End of 'Runtime.getProperties'
            } else {
              that.updateScope = updateStatement.update;

              // Execute another statement
              chrome.send ('Debugger.stepOver', function (err, res) {
                if (err) {
                  logger.error (
                    chalk.gray ('(Debugger.stepOver) ~ 1').toString ()
                  );
                  process.exit (-1);
                }
              });
            }
          }
        });
      }); // End of 'Debugger.paused'
    }).on ('error', function (error) {
      cb (
        new Error ('Unable to connect on the current tab of Chrome instance')
      );
    });
  }

  public updateContext (leenaContext : LeenaContext) {
    this.leenaContext = leenaContext;
  }

  public updateConfiguration (leenaConfig: LeenaConfiguration) {
    this.leenaConfig = leenaConfig;
  }

  private handleData (method, parameters, chrome) : any {
    var objName = _.isArray (parameters)
      ? parameters[0]
      : parameters;
    var params = _.isArray (parameters)
      ? parameters[1]
      : undefined;

    switch (method) {
      case 'getConfiguration':
        var getConfiguration = Promise.promisify (this.getConfiguration.bind (this));

        return getConfiguration (chrome);

      case 'getCoverageObject':
        var getCoverageObject_ = Promise.promisify (this.getCoverageObject.bind (this));

        return getCoverageObject_ (objName, chrome);

      case 'getSourceFunction':
        var getSourceFunction_ = Promise.promisify (this.getSourceFunction.bind (this));

        return getSourceFunction_ (objName, chrome);

      case 'getFunctionInstance':
        var getFunctionInstance_ = Promise.promisify (this.getFunctionInstance.bind (this));

        return getFunctionInstance_ (objName, chrome);

      case 'executeFunction':
        var executeFunction_ = Promise.promisify (this.executeFunction.bind (this));

        return executeFunction_ (objName, params, chrome);

      case 'executeFunctionWithDebugger':
        var executeFunctionWithDebugger_ = Promise.promisify (this.executeFunctionWithDebugger.bind (this));

        return executeFunctionWithDebugger_ (objName, params, chrome);

      case 'setUrl':
        var setUrl_ = Promise.promisify (this.setUrl.bind (this));

        return setUrl_ ('file://' + path.join (objName, 'index.html'), chrome);

      default:
        var errorMessage = 'Undefined method \'' + method + '\'';

        return Promise.reject (new Error (errorMessage));
    }
  }

  private getConfiguration (chrome : any, cb : (err : Error, res : any) => void) {
    cb (null, this.leenaConfig);
  }

  private getCoverageObject (coverageObject : any, chrome : any,
                             cb : (err : Error, res : any) => void) {
    var evalParams = this.getEvalParameters (coverageObject);

    chrome.Runtime.evaluate (evalParams, function (err, res) {
      if (err) {
        cb (
          new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "evaluate" method'),
          null
        );
      } else {
        var isVariable = res.result.hasOwnProperty ('type') &&
          res.result.type === 'object' &&
          res.result.hasOwnProperty ('value') !== undefined &&
          typeof res.result.value === 'object';

        if (isVariable) {
          cb (null, res.result.value);
        } else {
          cb (
            new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "evaluate" method. "' +
              coverageObject + '" is not a coverage object'),
            null
          );
        }
      }
    });
  }

  private getSourceFunction (functionName : string, chrome : any,
                             cb : (err : Error, res : any) => void) {
    var evalParams = this.getEvalParameters (functionName + '.toString ()');

    chrome.Runtime.evaluate (evalParams, function (err, res) {
      if (err) {
        cb (
          new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "getSourceFunction" method'),
          null
        );
      } else {
        var isFunction = res.result.hasOwnProperty ('type') &&
          typeof res.result.type === 'string' &&
          res.result.hasOwnProperty ('value') &&
          typeof res.result.value === 'string';

        if (isFunction) {
          // 'res.result.value' can contain '\n' and other characters that
          // Esprima won't parse
          res.result.value = res.result.value.replace (/\s+/g, ' ');

          cb (null, res);
        } else {
          cb (
            new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "getSourceFunction" method. "' +
              functionName + '" is not a function'),
            null
          );
        }
      }
    });
  }

  private getFunctionInstance (functionName : string, chrome : any,
                               cb : (err : Error, res : any) => void) {
    var f : CoverageFunction;

    try {
      f = this.leenaContext.getFunction (functionName);

      cb (null, f);
    } catch (e) {
      cb (
        new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "getFunctionInstance" method. "' +
          functionName + '" is not a function'),
        null
      );
    }
  }

  private executeFunction (functionName : string, params : any, chrome : any,
                           cb : (err : Error, res : any) => void) {
    var evalParams : Object = this.getEvalParameters (functionName + ' (' + params + ')');
    var that = this;

    chrome.Runtime.evaluate (evalParams, function (err, res) {
      if (err) {
        cb (
          new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "executeFunction" method'),
          null
        );
      } else {
        // example of 'res':
        //   {
        //     result: {
        //      type: 'number',
        //      value: 0,
        //      description: '0'
        //   },
        //   wasThrown: false }
        // Other possible scenarios:
        //    1) function produces an exception since function doesn't exists;
        //      => we handle this possibility with 'functionExists'
        //    2) function produces an exception through the code.
        //      => we handle it in another context
        that.leenaContext.executeFunction (functionName, function (err, newRes) {
          if (err) {
            cb (err, null);
          } else {
            try {
              res['function'] = that.leenaContext.getFunction (functionName);

              cb (null, res);
            } catch (e) {
              cb (
                new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "executeFunction" method. "' +
                  functionName + '" is not a function'),
                null
              );
            }
          }
        });
      }
    });
  }

  private executeFunctionWithDebugger (functionName : string, params : any,
                                       chrome : any,
                                       cb : (err : Error, res : any) => void) {
    var that = this;

    // Reset the control flow graph
    this.cfgStatements = [];
    // Reset the statement scope
    this.statementsScope = [];

    try {
      // Get instance of the function
      this.functionI = this.leenaContext.getFunction (functionName);

      // Try to set the breakpoint
      this.setBreakpoint (this.functionI, params, chrome, function (err, res) {
        if (err) {
          cb (err, null);
        } else {
          // Get breakpoint id
          var breakpointId : any = res.breakpointId;

          // Breakpoint has been set correctly. Now, we can execute the function
          var evalParams : any = that.getEvalParameters (functionName + ' (' + params + ')');

          // Execution of the function
          chrome.send ('Runtime.evaluate', evalParams, function (err, res) {
            if (err) {
              cb (
                new Error (ChromeTesterServer.ERROR_PREFIX +
                  'unable to execute "Runtime.evaluate" method'),
                null
              );
            } else {
              var rbParams : Object = {
                'breakpointId': breakpointId
              };
              // Store the return value of the function
              var resFunctionExecution : any = res;

              // Try to remove the breakpoint
              chrome.send ('Debugger.removeBreakpoint', rbParams, function (err, res) {
                if (err) { // Unable to remove the breakpoint
                  cb (
                    new Error (ChromeTesterServer.ERROR_PREFIX +
                      'unable to execute "Debugger.removeBreakpoint" method'),
                    null
                  );
                } else { // Breakpoint removed correctly
                  // Try to disable the debugger
                  chrome.send ('Debugger.disable', function (err, res) {
                    if (err) { // Unable to disable the debugger
                      cb (
                        new Error (ChromeTesterServer.ERROR_PREFIX +
                          'unable to execute "Debugger.disable" method'),
                        null
                      );
                    }
                    else { // Debugger disabled correctly
                      try {
                        // Execute the function based on the context
                        that.functionI.execute (
                          that.lastCoverageObjectValue, function (err, res) {
                          if (err) {
                            cb (err, null);
                          } else {
                            try {
                              resFunctionExecution['function'] = that.functionI;
                              resFunctionExecution['scope'] = that.statementsScope;
                              resFunctionExecution['cfgStatements'] = that.cfgStatements;

                              cb (null, resFunctionExecution);
                            } catch (e) {
                              cb (
                                new Error (ChromeTesterServer.ERROR_PREFIX +
                                  'unable to execute "executeFunction" method. "' +
                                  functionName + '" is not a function'),
                                null
                              );
                            }
                          }
                        });
                      } catch (e) {
                        cb (e, null);
                      }
                    }
                  }); // End of 'Debugger.disable'
                }
              }); // End of 'Debugger.removeBreakpoint'
            }
          }); // End of 'Runtime.evaluate'
        }
      }); // Enf of 'this.setBreakpoint'
    } catch (e) {
      cb (e, null);
    }
  }

  private setBreakpoint (functionInstance : CoverageFunction, params : any,
                         chrome : any, cb : (err : Error, res : any) => void) {
    var that = this;
    var functionLocation : any;

    // Enable debugger
    // Since 'Debugger.enable' will fire 'Debugger.scriptParsed', we reset
    // the array
    this.scriptsInfo = [];

    // Get location of the instrumented function
    try {
      functionLocation = ctUtils.getLocationOfInstrumentedFunction (this.functionI);

      // Try to enable the debugger
      chrome.send ('Debugger.enable', function (err, res) {
        if (err) {
          cb (
            new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "Debugger.enable" method'),
            null
          );
        } else { // Debugger is enabled
          // We can try to find the 'scriptId'
          var scriptId : number = -1;
          var pathFile : string = functionInstance.pathFile;
          var urlWithoutProtocol : string;

          for (var k = 0; k < that.scriptsInfo.length; k++) {
            urlWithoutProtocol = that.scriptsInfo[k].url.replace (/.*?:\/\//g, '');

            // Url is equal to the path of the file => we can get the 'scriptId'
            if (urlWithoutProtocol === pathFile) {
              scriptId = that.scriptsInfo[k].id;

              break;
            }
          }

          if (scriptId === -1) { // 'scriptId' not found
            cb (
              new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to get the scriptId'),
              null
            );
          } else { // We can set the breakpoint since we found the 'scriptId'
            // Get 'breakpointParams' using the function location
            var breakpointParams = {
              'location': {
                'columnNumber': functionLocation.column,
                // Line starts from 0
                'lineNumber': (functionLocation.line - 1),
                'scriptId': scriptId
              }
            };

            chrome.send ('Debugger.setBreakpoint', breakpointParams, function (errB, resB) {
              if (err) { // Unable to set the breakpoint
                cb (
                  new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "Debugger.setBreakpoint" method'),
                  null
                );
              } else { // We set the breakpoint correctly
                // Since we've set the breakpoint correctly, we can also get
                // the value of the coverage object before executing the function
                // for the first time
                var evalParamsCoverageObject = that.getEvalParameters (functionInstance.coverageObjectName);

                chrome.Runtime.evaluate (evalParamsCoverageObject, function (err, res) {
                  if (err) {
                    cb (
                      new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "evaluate" method'),
                      null
                    );
                  } else {
                    var isVariable = res.result.hasOwnProperty ('type') &&
                      res.result.type === 'object' &&
                      res.result.hasOwnProperty ('value') !== undefined &&
                      typeof res.result.value === 'object';

                    if (isVariable) {
                      // We can set the value of the coverage object
                      that.lastCoverageObjectValue = res.result.value;

                      // Initialize statements based on the coverage object
                      for (var k = 0; k < that.functionI.statements.length; k++) {
                        that.functionI.statements[k].initializeValues (that.lastCoverageObjectValue.s);
                      }

                      // Initialize branches based on the coverage object
                      for (var k = 0; k < that.functionI.branches.length; k++) {
                        that.functionI.branches[k].initializeValues (that.lastCoverageObjectValue.b);
                      }

                      // Callback with information about the breakpoint
                      cb (null, resB);
                    } else {
                      cb (
                        new Error (ChromeTesterServer.ERROR_PREFIX +
                          'unable to execute "evaluate" method. "' +
                          functionInstance.coverageObjectName +
                          '" is not a coverage object'),
                        null
                      );
                    }
                  }
                });
              }
            });
          }
        }
      }); // End of 'Debugger.enable'
    } catch (e) {
      cb (e, null);
    }
  }

  private setUrl (url : string, chrome : any,
                  cb : (err : Error, res : any) => void) {
    chrome.Page.navigate ({
      url: url
    }, function (err, res) {
      if (err) {
        cb (
          new Error (ChromeTesterServer.ERROR_PREFIX + 'unable to execute "setUrl" method'),
          null
        );
      } else {
        cb (null, res);
      }
    });
  }

  private getEvalParameters (expression : any) : Object {
    return {
      expression: expression,
      objectGroup: '0',
      includeCommandLineAPI: true,
      doNotPauseOnExceptionsAndMuteConsole: true,
      returnByValue: true,
      generatePreview: true
    };
  }
}

export = ChromeTesterServer;
