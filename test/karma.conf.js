module.exports = function ( config ) {
    "use strict";

    config.set({
        basePath: "..",
        frameworks: [ "mocha", "chai", "chai-as-promised", "sinon-chai" ],
        files: [
            // Production deps
            "libs/pouchdb/dist/pouchdb.js",
            "libs/angular/angular.js",
            "libs/angular-pouchdb/angular-pouchdb.js",

            // Dev deps
            "libs/angular-mocks/angular-mocks.js",

            // Sources
            "src/module.js",
            "src/**/*.js",

            // Test initialization code
            "test/init.js",

            // Test specs
            "test/specs/**/*.js"
        ],
        browsers: [ "PhantomJS" ],
        reporters: [ "dots", "coverage" ],
        preprocessors: {
            "src/**/*.js": [ "coverage" ]
        },
        coverageReporter: {
            type: "lcov",
            dir: "test/coverage/"
        }
    });

    // Special case for Travis CI
    if ( process.env.TRAVIS ) {
        config.transports = [ "xhr-polling" ];
    }
};