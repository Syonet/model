!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "$modelRequest", requestProvider );

    function requestProvider () {
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

        /**
         * The name of an alternative header that will contain the Content-Length, in case
         * the server provides it.
         * Useful when computing the length of a response which has Transfer-Encoding: chunked
         *
         * @type    {String}
         */
        provider.altContentLengthHeader = "X-Content-Length";

        provider.$get = function ( $timeout, $q, $http, $window, $modelEventEmitter ) {
            var currPing;

            /**
             * Return a URL suitable for the ping request.
             * The returned value contains only the protocol and host, with no path.
             *
             * @param   {String} url
             * @returns {String}
             */
            function getPingUrl ( url ) {
                return url.replace( /^(https?:\/\/)?(.*?)\/.+$/i, "$1$2/" );
            }

            /**
             * Create a ping request and return its promise.
             * If it's a
             *
             * @param   {String} url
             * @param   {Boolean} [force]
             * @returns {Promise}
             */
            function createPingRequest ( url, force ) {
                return currPing = ( !force && currPing ) || $http({
                    method: "HEAD",
                    url: url,
                    timeout: provider.timeout
                }).then(function () {
                    clearPingRequest();
                    return $q.reject( new Error( "Succesfully pinged RESTful server" ) );
                }, function ( err ) {
                    clearPingRequest();
                    return err;
                });
            }

            /**
             * Clear the current saved ping request.
             * Uses $timeout, however does not trigger a digest cycle.
             */
            function clearPingRequest () {
                $timeout(function () {
                    currPing = null;
                }, provider.pingDelay, false );
            }

            /**
             * Watch on progress events of a XHR and trigger promises notifications
             *
             * @param   {Object} deferred
             * @returns {Function}
             */
            function createXhrNotifier ( deferred ) {
                return function () {
                    return function ( xhr ) {
                        var altHeader = provider.altContentLengthHeader;

                        if ( !xhr ) {
                            return;
                        }

                        xhr.addEventListener( "progress", function ( evt ) {
                            var obj = {
                                total: evt.total,
                                loaded: evt.loaded
                            };

                            // Provide total bytes of the response with the alternative
                            // Content-Length, when it exists in the response.
                            if ( !evt.total ) {
                                obj.total = +xhr.getResponseHeader( altHeader );
                                obj.total = obj.total || 0;
                            }

                            deferred.notify( obj );
                        });
                    };
                };
            }

            /**
             * Sets authentication headers in a HTTP configuration object.
             *
             * @param   {Object} config
             * @param   {Object} [auth]
             */
            function putAuthorizationHeader ( config, auth ) {
                var password, base64;

                if ( !auth || !auth.username ) {
                    return;
                }

                password = auth.password == null ? "" : auth.password;
                base64 = $window.btoa( auth.username + ":" + password );
                config.headers.Authorization = "Basic " + base64;
            }

            /**
             * Create a request and return a promise for it.
             *
             * @param   {String} url
             * @param   {String} method
             * @param   {*} [data]
             * @param   {Object} [options]
             * @returns {Promise}
             */
            function createRequest ( url, method, data, options ) {
                var pingUrl, config, httpPromise;
                var safe = createRequest.isSafe( method );

                // Ensure options is an object
                options = options || {};

                // Create the URL to ping
                pingUrl = options.baseUrl || getPingUrl( url );

                config = {
                    method: method,
                    url: url,
                    params: safe ? data : null,
                    data: safe ? null : data,
                    headers: {},
                    timeout: createPingRequest( pingUrl, options.force )
                };

                // FIXME This functionality has not been tested yet.
                // config.headers.__modelXHR__ = createXhrNotifier( deferred );

                putAuthorizationHeader( config, options.auth );
                httpPromise = $http( config ).then( null, function ( response ) {
                    return $q.reject({
                        data: response.data,
                        status: response.status
                    });
                });

                return $modelEventEmitter( httpPromise );
            }

            /**
             * Detect if a string is a safe HTTP method.
             *
             * @param   {String} method
             * @returns {Boolean}
             */
            createRequest.isSafe = function isSafe ( method ) {
                return /^(?:GET|HEAD)$/.test( method );
            };

            // Finally return our super powerful function!
            return createRequest;
        };

        return provider;
    }
}();