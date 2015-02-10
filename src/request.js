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

        /**
         * The name of the header that contains the ID fields in the response body.
         * @type    {String}
         */
        provider.idFieldHeader = "X-Id-Field";

        provider.$get = function ( $timeout, $q, $http, $window, $modelEventEmitter, $modelTemp ) {
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
                var pingUrl, config, promise;
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
                promise = updateTempRefs( config ).then(function ( config ) {
                    return $http( config ).then(function ( response ) {
                        var promise;
                        response = applyIdField( response );
                        promise = $q.when( response );

                        // Set an persisted ID to the temporary ID posted
                        if ( data && $modelTemp.is( data._id ) ) {
                            promise = $modelTemp.set( data._id, response._id ).then( promise );
                        }

                        return promise;
                    }, function ( response ) {
                        return $q.reject({
                            data: response.data,
                            status: response.status
                        });
                    });
                });

                return $modelEventEmitter( promise );
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

            // -------------------------------------------------------------------------------------

            /**
             * Recursively update references for temporary IDs across the data and URL of a HTTP
             * config object.
             *
             * @param   {Object} config
             * @returns {Promise}
             */
            function updateTempRefs ( config ) {
                var refs = {};
                ( config.url.match( $modelTemp.regex ) || [] ).forEach(function ( id ) {
                    refs[ id ] = refs[ id ] || $modelTemp.get( id );
                });

                function recursiveFindAndReplace ( obj, replace ) {
                    angular.forEach( obj, function ( val, key ) {
                        // Recursively find/replace temporary IDs if we're dealing with an
                        // object or array. If we're not, the only requirement is that the field is
                        // not _id, because we could be messing with data important to PouchDB.
                        if ( angular.isObject( val ) || angular.isArray( val ) ) {
                            recursiveFindAndReplace( val, replace );
                        } else if ( key !== "_id" && $modelTemp.is( val ) ) {
                            if ( replace ) {
                                obj[ key ] = refs[ val ];
                            } else {
                                refs[ val ] = refs[ val ] || $modelTemp.get( val );
                            }
                        }
                    });
                }

                recursiveFindAndReplace( config.query || config.data, false );

                return $q.all( refs ).then(function ( resolvedRefs ) {
                    angular.extend( refs, resolvedRefs );

                    recursiveFindAndReplace( config.query || config.data, true );
                    config.url = config.url.replace( $modelTemp.regex, function ( match ) {
                        return refs[ match ];
                    });

                    return config;
                });
            }
        };

        return provider;

        // -----------------------------------------------------------------------------------------

        /**
         * Applies the ID field into a HTTP response.
         *
         * @param   {Object} response
         * @returns {Object|Object[]}
         */
        function applyIdField ( response ) {
            var idFields = response.headers( provider.idFieldHeader ) || "id";
            var data = response.data;
            var isArray = angular.isArray( data );
            data = isArray ? data : [ data ];
            idFields = idFields.split( "," ).map(function ( field ) {
                return field.trim();
            });

            data.forEach(function ( item ) {
                var id = [];
                if ( !item ) {
                    return;
                }

                angular.forEach( item, function ( value, key ) {
                    if ( ~idFields.indexOf( key ) ) {
                        id.push( value );
                    }
                });

                item._id = id.join( "," );
            });

            return isArray ? data : data[ 0 ];
        }
    }
}();