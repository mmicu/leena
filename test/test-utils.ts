import chalk = require ('chalk');


export
function desc (description : string, function_ : () => void) : void {
  log (description);
  function_ ();
}

export
function log (message : string) : void {
  console.log ('    ' + message + '.');
}

export
function printInfo (message : string) : void {
  log (chalk.green ('○') + ' ' + message);
}

export
function printSuccess (message : string) : void {
  log (chalk.bold.green ('✓') + ' ' + message);
}

export
function printError (message : string) : void {
  log (chalk.bold.red ('✖') + ' ' + message);
}

export
function assert (condition : boolean, message : string) : void {
  //log (chalk.bold.green ('✓') + ' ' + message);
  if (!condition) {
    printError (message);
    process.exit (1);
  }
}
