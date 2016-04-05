import fs = require ('fs');
import path = require ('path');

var browserSync = require ('browser-sync');
import chalk = require ('chalk');
import ncp = require ('ncp');
import Promise = require ('bluebird');
var Table = require ('cli-table');

import BShandler = require ('./browser-sync-handler');
import ChromeTesterClient = require ('./tester/chrome-tester-client');
import ChromeTesterServer = require ('./tester/chrome-tester-server');
import LeenaConfiguration = require ('./config');
import LeenaContext = require ('./context/context');
import logger = require ('./logger');
import utils = require ('./utils');


// Global variables for 'browser-sync' watcher and web server
var bsWatcher : any   = browserSync.create ('Watcher');
var bsWebServer : any = browserSync.create ('Web Server');

export
function initialize (pathConfigFile : string, smtSolver : string) : void {
  // JSON object for the configuration file
  var JSONcontent;

  // Content of the configuration file
  var contentFile : string;

  // Istance of LeenaConfiguration
  var leenaConfig;

  // Array of errors that can be occurred during
  // the parsing of the 'JSONcontent', errors = 0 --> no errors during parsing
  var errors : Array<string>;

  // Watcher for the application
  var watcher;

  // Web server
  var webServer;

  // Chrome server for the 'Chrome Debugging Protocol'
  var chromeServer : ChromeTesterServer;

  // Context of the application
  var leenaContext : LeenaContext;

  // Read the config file
  contentFile = utils.readFile (pathConfigFile);
  if (contentFile === null) {
    throw new Error ('Unable to read the config file "' + pathConfigFile + '"');
  }

  // Parse the config file
  try {
    JSONcontent = JSON.parse (contentFile);

    leenaConfig = new LeenaConfiguration (JSONcontent);

    // Get errors and eventually print on the console
    errors = leenaConfig.parseJSONObject (smtSolver);
    if (errors.length > 0) {
      for (var k = 0, lengthE = errors.length; k < lengthE; k++) {
        logger.error (errors[k]);
      }

      process.exit ();
    }
  }
  catch (e) {
    logger.error ('Unable to parse config file: ' + e.message);

    process.exit ();
  }

  // Config file is correct
  // Init Chrome Tester
  chromeServer = new ChromeTesterServer ({
    hostname: leenaConfig.chromeTester.debuggingProtocol.hostname,
    port: leenaConfig.chromeTester.debuggingProtocol.port
  });
  // Update the configuration
  chromeServer.updateConfiguration (leenaConfig);

  // Try to connect to the chrome instance
  chromeServer.listen ({
    hostname: leenaConfig.chromeTester.testerServer.hostname,
    port: leenaConfig.chromeTester.testerServer.port
  }, function (err : Error) {
    if (err) {
      logger.error ('Unable to connect to the Chrome instance');

      process.exit ();
    }

    // Chrome instance is active
    var source : string      = leenaConfig.browserSync.watcher.server;
    var destination : string = leenaConfig.browserSync.webServer.server;

    ncp.ncp (source, destination, function (error) {
      if (error) {
        var errorMessage : string = 'Unable to copy application from "' +
          leenaConfig.browserSync.watcher.server + '" to "' +
          leenaConfig.browserSync.webServer.server + '"';

        logger.error (errorMessage);

        process.exit ();
      }

      // At this point:
      //   - Chrome instance with remote debugging procotol is running.
      //   - Chrome server is running correctly.
      //   - Path of the application exists.
      //   - Path of the temporary application does not exist.
      //   - SMT solver executable has been found.
      //   - Files to test are:
      //       - Valid files (they exist).
      //       - Syntatticaly correct (using Esprima).
      // At this point, we must initialize:
      //   - The watcher.
      //   - The web server.

      // Instrument files
      try {
        instrumentFileToTest (leenaConfig);
      } catch (e) {
        logger.error (e.message);

        process.exit ();
      }

      // Starts the web server
      try {
        var chromeClient = new ChromeTesterClient ({
          hostname: leenaConfig.chromeTester.testerServer.hostname,
          port: leenaConfig.chromeTester.testerServer.port
        });

        // Print some info
        logLeenaConfiguration (leenaConfig);
        logger.info ('Application copied successfully');
        logger.info ('SMT solver: ' + leenaConfig.solver.name);

        var url : string = leenaConfig.browserSync.webServer.server;

        chromeClient.setUrl (url, function (err, res) {
          if (err) {
            logger.error (
              'Unable to set the url on the Chrome instance (url = "' + url + '")'
            );
          } else {
            try {
              leenaContext = initContext (leenaConfig);
              leenaContext.setChromeServer (chromeServer);

              // Initialize the watcher
              initWatcher (leenaConfig, leenaContext, chromeServer);
            } catch (e) {
              logger.error (e.message);
            }
          }
        });
      } catch (e) {
        logger.error (e.message);

        process.exit ();
      }
    });
  });
}

function instrumentFileToTest (leenaConfig) : void {
  for (var k = 0; k < leenaConfig.files.length; k++) {
    var file_ : string = leenaConfig.files[k].tempPath;

    var instrumentedCode : string = utils.getInstrumentedSource (file_);

    if (instrumentedCode === null) {
      throw new Error ('Unable to instrument "' + file_ + '"');
    }
    if (!utils.writeOnFile (file_, instrumentedCode)) {
      throw new Error ('Unable to write instrumented code in "' + file_ + '"');
    }
  }
}

function initContext (leenaConfig) : LeenaContext {
  var leenaContext : LeenaContext = new LeenaContext (leenaConfig);

  for (var k = 0; k < leenaConfig.files.length; k++) {
    try {
      leenaContext.handleProperty ('add', {
        pathFile: path.normalize (leenaConfig.files[k].originalPath),
        pathTempFile: path.normalize (leenaConfig.files[k].tempPath),
        fileToTest: true
      });
    } catch (e) {
      throw e;
    }
  }

  return leenaContext;
}

function initWatcher (leenaConfig, leenaContext, chromeServer) : void {
  try {
    bsWatcher.init ({
      port: leenaConfig.browserSync.watcher.port,
      ui: {
        port: leenaConfig.browserSync.watcher.uiPort
      },
      // We have already handle all files. Anyway, we initialize the watcher
      // for future events
      logLevel: 'silent',
      files: [
        {
          match: [
            [
              leenaConfig.browserSync.watcher.server,
              '**',
              '*'
            ].join (path.sep)
          ],
          fn: function (event, file) {
            var retValue : BShandler.PropertyReturnValue;

            try {
              retValue = BShandler.handleEvent (event, file, leenaConfig);

              leenaContext.handleProperty (event, retValue);
            } catch (e) {
              logger.error (e.message);
            }
          },
          options: {
            ignoreInitial: true
          }
        }
      ]
    });
  } catch (e) {
    throw new Error ('Unable to initialize the watcher');
  }
}

function logLeenaConfiguration (leenaConfiguration) : void {
  var table = new Table ({ });

  table.push (
    // Header
    [
      chalk.bold.green ('Service'),
      chalk.bold.green ('IP/Path'),
      chalk.bold.green ('Port')
    ],
    // Watcher info
    [
      'Watcher',
      leenaConfiguration.browserSync.watcher.server,
      [
        '{',
        leenaConfiguration.browserSync.watcher.port,
        ', ',
        leenaConfiguration.browserSync.watcher.uiPort,
        '}'
      ].join ('')
    ],
    // Web server info
    [
      'Web Server',
      leenaConfiguration.browserSync.webServer.server,
      [
        '{',
        leenaConfiguration.browserSync.webServer.port,
        ', ',
        leenaConfiguration.browserSync.webServer.uiPort,
        '}'
      ].join ('')
    ],
    // Chrome tester server info
    [
      'Chrome Tester Server',
      leenaConfiguration.chromeTester.testerServer.hostname,
      leenaConfiguration.chromeTester.testerServer.port
    ],
    // Chrome remote protocol info
    [
      'Chrome Remote Protocol',
      leenaConfiguration.chromeTester.debuggingProtocol.hostname,
      leenaConfiguration.chromeTester.debuggingProtocol.port
    ]
  );

  console.log (table.toString ());
}
