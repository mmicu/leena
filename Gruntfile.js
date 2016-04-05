module.exports = function (grunt) {
  grunt.initConfig ({
    clean: {
      build: {
        src: [
          './build'
        ]
      }
    },
    copy: {
      main: {
        expand: true,
        cwd: 'test/integration/api/html-api-generator/',
        src: [
          '**',
          '!rendering.ts'
        ],
        dest: 'build/test/integration/api/html-api-generator/'
      }
    },
    ts: {
      options: {
        target: 'es5',
        module: 'commonjs',
        sourceMap: false,
        moduleResolution: 'node',
        compiler: './node_modules/typescript/bin/tsc'
      },
      dev: {
        src: [
          './src/**/*.ts',
          '!./src/front-end/*.ts',
          './test/**/*.ts'
        ],
        outDir: [
          './build'
        ]
      }
    }
  });

  grunt.loadNpmTasks ('grunt-contrib-clean');
  grunt.loadNpmTasks ('grunt-contrib-copy');
  grunt.loadNpmTasks ('grunt-ts');

  grunt.registerTask ('default', ['ts', 'copy']);
};
