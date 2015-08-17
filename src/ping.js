!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "$modelPing", pingProvider );

    function pingProvider () {
        var provider = this;

        /**
         * Get/set the timeout (in ms) for pinging the target REST server
         *
         * @param   {Number}
         */
        provider.timeout = 5000;

        /**
         * Get/set the delay (in ms) for triggering another ping request.
         *
         * @param   {Number}
         */
        provider.pingDelay = 60000;

        this.$get = function ( $http, $timeout, $modelPromise ) {
            var cache = {};

            /**
             * Clear the ping request for a given URL.
             * Uses $timeout, however does not trigger a digest cycle.
             */
            function clear ( url ) {
                $timeout(function () {
                    delete cache[ url ];
                }, provider.pingDelay, false );
            }

            /**
             * Create a ping request and return its promise.
             * If the given URL has already been pinged in the last <code>pingDelay</code>
             * milliseconds, then the existing promise will be returned.
             *
             * @param   {String} url
             * @param   {Boolean} [force]
             * @returns {Promise}
             */
            return function ( url, force ) {
                if ( cache[ url ] && !force ) {
                    return cache[ url ];
                }

                return cache[ url ] = $http({
                    method: "HEAD",
                    url: url,
                    timeout: provider.timeout
                }).then(function () {
                    clear( url );
                    return $modelPromise.reject( new Error( "Succesfully pinged RESTful server" ) );
                }, function ( err ) {
                    clear( url );
                    return err;
                });
            };
        };
    }
}();