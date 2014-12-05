"use strict";

// For PhantomJS, we need to supply Function.prototype.bind
var proto = Function.prototype;
if ( !proto.bind ) {
    proto.bind = function () {
        var args = _.toArray( arguments );
        args.unshift( this );

        return _.bind.apply( _, args );
    };
}