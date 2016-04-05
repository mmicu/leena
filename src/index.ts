///<reference path='../typings/tsd.d.ts'/>

declare module 'cli-table' {
  class Table {
    new (params : any);
    push : (params : any) => void;
  }
}

declare module 'escodegen' {
  function generate (ast : any, options? : Object) : any;
}

declare module 'estraverse' {
  function traverse (ast : any, walkers : any) : any;
  function replace (ast : any, walkers : any) : any;
}
