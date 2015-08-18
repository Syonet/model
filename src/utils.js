!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelPromise", promiseService );

    function promiseService ( $q ) {
        function makeEmitter ( obj, origin ) {
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

                // Create a event object info and unshift it into the args
                args.unshift({
                    type: name
                });

                events.forEach(function ( listener ) {
                    listener.apply( null, args );
                });

                return obj;
            };

            return obj;
        }

        function modelPromise ( resolver ) {
            return makeEmitter( $q( resolver ) );
        }

        modelPromise.makeEmitter = makeEmitter;

        modelPromise.defer = function () {
            var deferred = $q.defer();
            deferred.promise = makeEmitter( deferred.promise );

            return deferred;
        };

        /**
         * Implementation of Promise.race().
         *
         * @see     https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race
         * @param   {Array} promises    List of values to either resolve/reject.
         * @returns {Promise}
         */
        modelPromise.race = function ( promises ) {
            var flag;
            var deferred = modelPromise.defer();

            promises.forEach(function ( promise ) {
                modelPromise.when( promise ).then( resolve, reject );
            });

            return deferred.promise;

            function resolve () {
                !flag && deferred.resolve.apply( deferred, arguments );
                flag = true;
            }

            function reject () {
                !flag && deferred.reject.apply( deferred, arguments );
                flag = true;
            }
        };

        [ "when", "reject", "all" ].forEach( function ( method ) {
            modelPromise[ method ] = function ( value ) {
                return makeEmitter( $q[ method ]( value ) );
            };
        });

        return modelPromise;
    }
}();