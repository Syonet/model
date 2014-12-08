"use strict";

var gulp =       require( "gulp" );
var concat =     require( "gulp-concat" );
var coveralls =  require( "gulp-coveralls" );
var jscs =       require( "gulp-jscs" );
var jshint =     require( "gulp-jshint" );
var ngAnnotate = require( "gulp-ng-annotate" );
var plumber =    require( "gulp-plumber" );
var watch =      require( "gulp-watch" );
var karma =      require( "karma" );

var IS_WATCHING = false;
var SRC_FILES =  [ "src/module.js", "src/**/*.js" ];

gulp.task( "test", [ "package" ], function ( cb ) {
    karma.server.start({
        configFile: __dirname + "/test/karma.conf.js",
        singleRun: !IS_WATCHING
    }, cb );
});

gulp.task( "coverage", function () {
    return gulp.src( "test/coverage/*/lcov.info" )
        .pipe( coveralls() );
});

gulp.task( "package", function () {
    return gulp.src( SRC_FILES )
        .pipe( plumber() )
        .pipe( jshint() )
        .pipe( jscs() )
        .pipe( ngAnnotate() )
        .pipe( concat( "syonet.model.js" ) )
        .pipe( gulp.dest( "dist" ) );
});

gulp.task( "watch", function () {
    IS_WATCHING = true;

    watch( SRC_FILES, function ( files, cb ) {
        gulp.start( "package", cb );
    });
});

gulp.task( "dev", [ "package", "test", "watch" ] );
gulp.task( "default", [ "package", "test" ] );