# leena

***leena*** is a symbolic execution engine for JavaScript. It will try to explore all possible branches in a JavaScript function by concretely and symbolically executing it. For the first case, since we need a sort of `tracer` (an entity able to execute the code), it's enough to use `Chrome` enabling the `Chrome Debugging Protocol`. For the second case, we need an SMT-Solver to solve the condition of the branch.
Technically, it's enough that the solver supports the SMT2 language, but, for the moment, we provide support for [z3](https://github.com/Z3Prover/z3) and [cvc4](http://cvc4.cs.nyu.edu/web/).

<!--
Moreover, if you decide to use *z3*, and if you want to have string constraints support, you should install [Z3-str](https://github.com/z3str).
-->


### To do
  - [ ] string constraints
  - [ ] constraints on `switch`
  - [ ] constraints on `objects`
  - [ ] loop summarization (working on that)


### Requirements
As described above, you need an [SMT Solver](https://en.wikipedia.org/wiki/Satisfiability_modulo_theories) in order to solve the constraints. Possible choices:
  - [z3](link)
  - [cvc4](link)

<!--
(see [Z3-str](https://github.com/z3str) if you want support for strings constraints)
-->


### Installation
```bash
$ npm install
$ node_modules/grunt-cli/bin/grunt
```


### Command line options
```bash
$ node bin/leena --help
```

```
Usage: bin/leena <config file> [Options]

Commands:
  <config file>  Config file

Options:
  --no-color        Disable colored output.                            [boolean]
  -s, --smt-solver  SMT-Solver to use.                  [string] [default: "z3"]
  -v, --version     Print the version number.                          [boolean]
  -h, --help        Show help                                          [boolean]
```


### Example
In the folder `examples/browser/1` you can find an example:
```bash
$ tree examples/browser/1
examples/browser/1
├── foo_1.js
├── foo_2.js
├── foo_3.js
├── foo_4.js
├── index.html
└── leena_config.json
```
In order to test this application, `leena` requires a configuration file which describes the entire application. For this example, you have this config file:
```json
{
  "browserSync": {
    "watcher": {
      "server": "<YOUR_PATH>/examples/browser/1",
      "port": 4000,
      "ui": {
        "port": 4001
      }
    },
    "webServer": {
      "server": "<YOUR_PATH>/leena/temp/1",
      "port": 4002,
      "ui": {
        "port": 4003
      }
    }
  },
  "chrome": {
    "debuggingProtocol": {
      "hostname": "localhost",
      "port": 9222
    },
    "testerServer": {
      "hostname": "localhost",
      "port": 4004
    }
  },
  "smt-solvers": {
    "z3": "<YOUR_PATH>/z3"
  },
  "files": ["foo_1.js", "foo_2.js", "foo_3.js", "foo_4.js"]
}
```
If you want to use the same config file, you need to modify the properties:

  - `browserSync.Watcher.server`, path of the application that you want to test.
  - `browserSync.webServer.server`, path of the temporany application (you need a temp path since we instrument the code trough [istanbul](https://github.com/gotwarlost/istanbul)).
  - `smt-solvers.z3`, path of the SMT solver. You can specify one or more solvers, like:
    ```json
    {
      "smt-solvers": {
        "z3": "<YOUR_PATH>/z3",
        "cvc4": "<YOUR_PATH>/cvc4"
      }
    }
    ```
    In that case we select the solver that you specify with the option `-s` (default `z3`).

Before starting the web server, you have to execute `Chrome` enabling the `Chrome Debugging Protocol` (check from the script `bin/run_chrome_debugging.sh` if the path of Chrome is correct):
```bash
sh bin/run_chrome_debugging.sh
```
Optionally, you can check if `Chrome` is running correctly:
```bash
node build/test/integration/tester/chrome-debugging-protocol.js
```
You should have:
```bash
  ✓ Chrome running correctly (localhost:9222).
```
At this point, you can execute `leena`:
```bash
leena examples/browser/1/leena_config.json
```
The server is running, so you can test all the global functions declared inside the files specified in the `files` property:
```bash
node build/test/integration/api/browser-example-1/test-example-1.js
```
The script summarizes the results in an [HTML page](https://htmlpreview.github.io/?https://github.com/mmicu/leena/blob/master/data/results/examples-browser-1.html).


### Screencast
The example described above is summarized [here](https://www.youtube.com/watch?v=-syRsf-ldsQ).


<!--
### Other information
  -
-->


### License
leena is licensed under the [GPL-3.0](http://github.com/mmicu/leena/LICENSE).
