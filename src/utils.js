!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelEventEmitter", eventEmitterService );

    function eventEmitterService () {
        return function makeEmitter ( obj, origin ) {
            var then = obj.then;
            if ( typeof then === "function" ) {
                obj.then = function () {
                    return makeEmitter( then.apply( this, arguments ), obj );
                };
            }

            // Stores event listeners for the object passed
            obj.$$events = origin && origin.$$events || {};

            /**
             * Add a event to <code>obj</code>
             *
             * @param   {String} name
             * @param   {Function} listener
             * @returns void
             */
            obj.on = function ( name, listener ) {
                name.split( " " ).forEach(function ( evt ) {
                    var store = obj.$$events[ evt ] = obj.$$events[ evt ] || [];
                    store.push( listener );
                });
                return obj;
            };

            /**
             * Emit a event in <code>obj</code>
             *
             * @param   {String} name
             * @returns void
             */
            obj.emit = function ( name ) {
                var args = [].slice.call( arguments, 1 );
                var events = obj.$$events[ name ] || [];

                events.forEach(function ( listener ) {
                    listener.apply( null, args );
                });

                return obj;
            };

            return obj;
        };
    }
}();