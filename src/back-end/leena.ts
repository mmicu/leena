import SymbolicExecution = require ('./symbolic-execution/symbolic-execution');


interface ConnectionInformation {
  hostname : string;
  port : number;
}

interface Parameter {
  identifier : string;
  value : any;
}

class Leena {
  private options : ConnectionInformation;

  constructor (options : ConnectionInformation) {
    this.options = <ConnectionInformation> {};
    this.options.hostname = options.hostname;
    this.options.port = options.port;
  }

  public inspect (functionName : string, parameters : any, cb : (res) => void) : any {
    var symExec : SymbolicExecution;

    symExec = new SymbolicExecution (functionName, this.options);
    symExec.inspectFunction (parameters, function (res) {
      cb (res);
    });
  }
}

export = Leena;
