"use strict";

// For PhantomJS, we need to supply Function.prototype.bind
var proto = Function.prototype;
if ( !proto.bind ) {
    proto.bind = function () {
        var args = [].slice.call( arguments );
        args.splice( 1, 0, this );

        return angular.bind.apply( null, args );
    };
}

function testHelpers ( $injector ) {
    var $timeout = $injector.get( "$timeout" );
    var $httpBackend = $injector.get( "$httpBackend" );

    // Ping request backend definition
    testHelpers.ping = $httpBackend.whenHEAD( "/" ).respond( 200 );

    testHelpers.timeout = function () {
        $timeout.flush();
    };

    testHelpers.flush = function ( timeout ) {
        timeout ? setTimeout( $httpBackend.flush ) : $httpBackend.flush();
    };
}