interface Element {
  name : string;
  content : any;
}

class Memory {
  private elements : Array<Element>;

  constructor () {
    this.elements = [];
  }

  public add (name : string, content : any) : void {
    var el : Element = <Element> {};
    var hasProperty_ : any = this.hasProperty (name);

    if (hasProperty_.hasProperty) {
      this.elements[hasProperty_.index].content = content;
    } else {
      this.elements.push ({
        'name' : name,
        'content' : content
      });
    }
  }

  public hasProperty (name : string) : any {
    var retValue : any = {
      'content' : '',
      'hasProperty' : false,
      'index' : -1
    };

    for (var k = (this.elements.length - 1); k >= 0; k--) {
      if (this.elements[k].name === name) {
        retValue.content = this.elements[k].content;
        retValue.hasProperty = true;
        retValue.index = k;
        break;
      }
    }

    return retValue;
  }
}

export = Memory;
