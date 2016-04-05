import path = require ('path');

import chalk = require ('chalk');
import winston = require ('winston');


var logger = new (winston.Logger) ({
  transports: [
    new (winston.transports.File) ({
      name: 'error-file',
      level: 'error',
      filename: path.resolve (__dirname, '..', '..', '..', 'logs', 'l-error'),
      maxFiles: 10
    }),
    new (winston.transports.File) ({
      name: 'debug-file',
      level: 'debug',
      filename: path.resolve (__dirname, '..', '..', '..', 'logs', 'l-debug'),
      maxFiles: 10
    }),
    new (winston.transports.Console) ({
      level: 'info',
      colorize: true,
      timestamp: true,
      formatter: function (options) {
        var levelMessage : string = (options.level.length > 0)
          ? options.level[0].toUpperCase () +
            options.level.substring (1, options.level.length).toLowerCase ()
          : options.level;
        var colorLevelString : any = (levelMessage === 'Info')
          ? chalk.bold.cyan
          : chalk.bold.red;
        var prefix : string = '[' + levelMessage + ']';
        var suffix : string = (options.message !== undefined) ? options.message : '';

        return colorLevelString (prefix) + suffix;
      }
    })
  ]
});

logger.cli ();

export = logger;
