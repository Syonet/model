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
    var $rootScope = $injector.get( "$rootScope" );

    // Ping request backend definition
    testHelpers.ping = $httpBackend.whenHEAD( "/" ).respond( 200 );

    testHelpers.timeout = function () {
        $timeout.flush();
    };

    testHelpers.digest = function ( timeout ) {
        timeout ? setTimeout( $rootScope.$digest ) : $rootScope.$digest();
    };

    testHelpers.flush = function ( timeout ) {
        timeout ? setTimeout( $httpBackend.flush ) : $httpBackend.flush();
    };
}