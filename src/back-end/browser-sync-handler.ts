import fs = require ('fs');
import path = require ('path');

import chalk = require ('chalk');
import mkdirp = require ('mkdirp');
import _ = require ('underscore');

import LeenaConfiguration = require ('./config');
import logger = require ('./logger');
import utils = require ('./utils');


export
interface PropertyReturnValue {
  pathFile : string;
  pathTempFile : string;
  fileToTest : boolean;
}

export
function handleEvent (event : string, pathFile : string, leenaConfig : LeenaConfiguration) : PropertyReturnValue {
  var ret : PropertyReturnValue = <PropertyReturnValue> {};
  var message : string = 'Event on "' + pathFile + '" ' +
    '(' + chalk.green.underline (event) + ')'
  // Every change in a file must be reflected int the temporary application
  // Suppose that:
  //   - watcher: /Users/lol/application
  //   - webServer: /Users/temp
  // When the watcher gets an external event, for example on path
  // '/Users/lol/application/lib/foo.js', common path will be '/lib/foo.js'
  // In fact, there is a file also in '/Users/temp/lib/foo.js'
  var commonPath : any;

  // Init the return value
  ret.pathFile     = pathFile;
  ret.pathTempFile = null;
  ret.fileToTest   = false;

  commonPath = pathFile.split (leenaConfig.browserSync.watcher.server);
  if (commonPath.length !== 2) {
    throw new Error (
      'Unable to get the common path between application and temporary application'
    );
  }
  commonPath = path.normalize (commonPath[1]);

  // Log every event even if it's not handled
  logger.info (message);

  // Handle events
  switch (event) {
    // Handle 'add' event
    case 'add':
      if (utils.fileExists (pathFile)) {
        ret = add (pathFile, commonPath, leenaConfig);
      }
      else {
        throw new Error (
          'Unable to handle "add" event. "' + pathFile + '" does not exist'
        );
      }

      break;

    // Handle 'change' event. This event occurs only for files.
    // When we rename a dir, suppose from 'a' to 'b' we have this chain
    // of events: ({'unlinkDir', 'a'} --> {'unlinkDir', 'b'})
    case 'change':
      if (utils.fileExists (pathFile)) {
        ret = change (pathFile, commonPath, leenaConfig);
      }
      else {
        throw new Error (
          'Unable to handle "change" event. "' + pathFile + '" does not exist'
        );
      }

      break;

    // Handle 'unlink' event
    case 'unlink':
      ret = unlink (pathFile, commonPath, leenaConfig);

      break;

    // Handle 'unlinkDir' event
    case 'unlinkDir':

      break;
  }

  return ret;
}

function add (pathFile : string, commonPath : string, leenaConfig : LeenaConfiguration) : PropertyReturnValue {
  var ret = <PropertyReturnValue> {};
  var fileToTest : boolean = isFileToTest (pathFile, leenaConfig);
  var tempPathFile : string;
  var tempPath : string;
  var contentToWrite : string;

  // Set temporary path of 'pathFile'
  tempPathFile = path.normalize ([
    leenaConfig.browserSync.webServer.server,
    commonPath
  ].join (path.sep));

  // Set temporary path
  tempPath = path.dirname (tempPathFile);

  // Since we do not handle 'addDir' event, we should have the situation
  // where the user, for example, add 'n' folders and then add the file.
  // In this case, it's not enough to write the content (contentPathFile)
  // in 'tempPath', but we must use 'mkdir -p' to be sure that
  // each directory will be added
  if (!utils.pathExists (tempPath)) {
    mkdirp.sync (tempPath, {mode: 755});

    if (!utils.pathExists (tempPath)) {
      throw new Error (
        'Unable to create directories recursively'
      );
    }
  }

  // Simply copy the file
  contentToWrite = utils.readFile (pathFile);

  if (contentToWrite === null) {
    throw new Error (
      'Unable to read "' + pathFile + '" in the "add" handler'
    );
  }

  // Write on file in both cases
  if (!utils.writeOnFile (tempPathFile, contentToWrite)) {
    throw new Error (
      'Unable to write in "' + tempPathFile + '" in the "add" handler'
    );
  }

  // If is file to test we instrument it
  if (fileToTest) {
    var instrumentedSource : string = utils.getInstrumentedSource (tempPathFile);

    if (instrumentedSource === null) {
      throw new Error (
        'Unable to get the instrumented code in "' + tempPathFile + '"'
      );
    }

    // Overwrite file
    if (!utils.writeOnFile (tempPathFile, instrumentedSource)) {
      throw new Error (
        'Unable to write the instrumented in "' + tempPathFile + '" in the "add" handler'
      );
    }
  }

  ret.pathFile     = pathFile;
  ret.pathTempFile = tempPathFile;
  ret.fileToTest   = fileToTest;

  return ret;
}

function change (pathFile : string, commonPath : string, leenaConfig : LeenaConfiguration) : PropertyReturnValue {
  var ret = <PropertyReturnValue> {};
  var fileToTest : boolean = isFileToTest (pathFile, leenaConfig);
  var tempPathFile : string;
  var tempPath : string;
  var contentToWrite : string;

  // Set temporary path of 'pathFile'
  tempPathFile = path.normalize ([
    leenaConfig.browserSync.webServer.server,
    commonPath
  ].join (path.sep));

  // Set temporary path
  tempPath = path.dirname (tempPathFile);

  // Simply copy the file
  contentToWrite = utils.readFile (pathFile);

  if (contentToWrite === null) {
    throw new Error (
      'Unable to read "' + pathFile + '" in the "change" handler'
    );
  }

  // Write on file in both cases
  if (!utils.writeOnFile (tempPathFile, contentToWrite)) {
    throw new Error (
      'Unable to write in "' + tempPathFile + '" in the "change" handler'
    );
  }

  // If is file to test we must instrument it
  if (fileToTest) {
    var instrumentedSource : string = utils.getInstrumentedSource (tempPathFile);

    if (instrumentedSource === null) {
      throw new Error (
        'Unable to get the instrumented code in "' + tempPathFile + '"'
      );
    }

    // Overwrite file
    if (!utils.writeOnFile (tempPathFile, instrumentedSource)) {
      throw new Error (
        'Unable to write the instrumented in "' + tempPathFile + '" in the "change" handler'
      );
    }
  }

  ret.pathFile     = pathFile;
  ret.pathTempFile = tempPathFile;
  ret.fileToTest   = fileToTest;

  return ret;
}

function unlink (pathFile : string, commonPath : string, leenaConfig : LeenaConfiguration) : PropertyReturnValue {
  var ret = <PropertyReturnValue> {};
  var tempPathFile : string;
  var tempPath : string;

  // Set temporary path of 'pathFile'
  tempPathFile = path.normalize ([
    leenaConfig.browserSync.webServer.server,
    commonPath
  ].join (path.sep));

  // Set temporary path
  tempPath = path.dirname (tempPathFile);

  // Delete 'tempPathFile'
  if (!utils.fileExists (tempPathFile)) {
    throw new Error (
      'Unable to delete "' + tempPathFile + '". It does not exist'
    );
  }
  if (fs.unlinkSync (pathFile) !== undefined) {
    throw new Error (
      'Unable to delete "' + tempPathFile + '"'
    );
  }

  ret.pathFile     = pathFile;
  ret.pathTempFile = tempPathFile;
  ret.fileToTest   = isFileToTest (pathFile, leenaConfig);

  return ret;
}

function isFileToTest (pathFile : string, leenaConfig : LeenaConfiguration) : boolean {
  for (var k = 0; k < leenaConfig.files.length; k++) {
    if (leenaConfig.files[k].originalPath === pathFile) {
      return true;
    }
  }

  return false;
}
