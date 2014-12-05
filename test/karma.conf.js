module.exports = function ( config ) {
    "use strict";

    config.set({
        basePath: "..",
        frameworks: [ "mocha", "chai-sinon" ],
        files: [
            "test/function.bind.js",

            // Production deps
            "libs/lodash/dist/lodash.js",
            "libs/pouchdb/dist/pouchdb.js",
            "libs/angular/angular.js",
            "libs/angular-pouchdb/angular-pouchdb.js",
            "libs/restangular/dist/restangular.js",

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
};