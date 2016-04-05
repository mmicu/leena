import fs = require ('fs');
import path = require ('path');

import jade = require ('jade');


export
function renderingTests (pathHTMLFile : string, title : string, fSources : Array<string>,
                         leenaResponseObject : Array<any>) : boolean {
  var htmlContent : any;
  var pathJADE : string;

  pathJADE = path.join (__dirname, 'template-api.jade');
  htmlContent = jade.render (fs.readFileSync (pathJADE).toString (), {
    filename: pathJADE,
    'title' : title,
    'fSources' : fSources,
    'leenaResponseObject' : leenaResponseObject
  });

  return (fs.writeFileSync (pathHTMLFile, htmlContent, { encoding: 'utf8' }) === undefined);
}
