module.exports = function ( config ) {
    "use strict";

    config.set({
        basePath: "..",
        frameworks: [ "mocha", "chai", "chai-as-promised" ],
        files: [
            "test/function.bind.js",

            // Production deps
            "libs/pouchdb/dist/pouchdb.js",
            "libs/angular/angular.js",
            "libs/angular-pouchdb/angular-pouchdb.js",

            // Dev deps
            "libs/angular-mocks/angular-mocks.js",

            // Sources
            "dist/syonet.model.js",

            // Test specs
            "test/specs/**/*.js"
        ],
        browsers: [
            "Chrome",
            "PhantomJS"
        ]
    });

    // Special case for Travis CI
    if ( process.env.TRAVIS ) {
        config.transports = [ "xhr-polling" ];
        config.browsers = [ "PhantomJS" ];
    }
};