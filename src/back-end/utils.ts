import fs = require ('fs');

import istanbul = require ('istanbul');


export
function fileExists (file : string) : boolean {
  var statFile : fs.Stats;
  var ret : boolean;

  try {
    statFile = fs.statSync (file);

    ret = statFile.isFile ();
  } catch (e) {
    ret = false;
  }

  return ret;
}

export
function pathExists (path : string) : boolean {
  var statFile : fs.Stats;
  var ret : boolean;

  try {
    statFile = fs.statSync (path);

    ret = statFile.isDirectory ();
  } catch (e) {
    ret = false;
  }

  return ret;
}

export
function getInstrumentedSource (file : string) : string {
  if (!fileExists (file)) {
    return null;
  }
  // File exists. We can use Istanbul to instrument the code
  var contentFile : string = readFile (file, 'utf8');
  var instrumentedCode = new istanbul.Instrumenter ().instrumentSync (
    contentFile,
    file
  );

  return instrumentedCode;
}

export
function readFile (file : string, encoding? : string) : string {
  if (!fileExists (file)) {
    return null;
  }

  encoding = encoding || 'utf8';

  return fs.readFileSync (file, { encoding: encoding });
}

export
function writeOnFile (file : string, content : string, encoding? : string) : boolean {
  encoding = encoding || 'utf8';

  var writeSync = fs.writeFileSync (file, content, { encoding: encoding });

  return (writeSync === undefined);
}

export
function removeFile (file : string) : boolean {
  if (!fileExists (file)) {
    return false;
  }

  var unlinkSync = fs.unlinkSync (file);

  return (unlinkSync === undefined);
}

export
function isCorrectPort (port : number) : boolean {
  return (port >= 0 && port <= 65535);
}
