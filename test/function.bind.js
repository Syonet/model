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