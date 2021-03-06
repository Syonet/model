!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "$modelRequest", requestProvider );

    function requestProvider () {
        var provider = this;

        /**
         * The name of an alternative header that will contain the Content-Length, in case
         * the server provides it.
         * Useful when computing the length of a response which has Transfer-Encoding: chunked
         *
         * @type    {String}
         */
        provider.altContentLengthHeader = "X-Content-Length";

        provider.$get = function ( $http, $window, $modelPromise, $modelTemp, $modelPing ) {
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
                var pingUrl, config;
                var safe = createRequest.isSafe( method );

                // Synchronously check if we're dealing with an temporary ID.
                // Can't do this later because $modelCache.set may override this value
                var isTemp = data && $modelTemp.is( data._id );

                // Ensure options is an object
                options = options || {};

                // Allow bypassing the request - this will be treated as an offline response.
                if ( options.bypass ) {
                    return $modelPromise.reject({
                        status: 0,
                        data: null
                    });
                }

                // Create the URL to ping
                pingUrl = options.baseUrl || getPingUrl( url );

                config = {
                    method: method,
                    url: url,
                    params: safe ? data : null,
                    data: safe ? null : data,
                    headers: {},
                    timeout: $modelPing( pingUrl, options.force )
                };

                // FIXME This functionality has not been tested yet.
                // config.headers.__modelXHR__ = createXhrNotifier( deferred );

                putAuthorizationHeader( config, options.auth );
                return updateTempRefs( config ).then(function ( config ) {
                    return $http( config ).then(function ( response ) {
                        var promise;
                        response = applyIdField( response, options.id );
                        promise = $modelPromise.when( response );

                        // Set an persisted ID to the temporary ID posted
                        if ( isTemp ) {
                            promise = $modelTemp.set( data._id, response._id ).then( promise );
                        }

                        return promise;
                    }, function ( response ) {
                        return $modelPromise.reject({
                            data: response.data,
                            status: response.status
                        });
                    });
                }, function () {
                    // Let's emulate a offline connection if some temp refs wheren't found
                    return $modelPromise.reject({
                        data: null,
                        status: 0
                    });
                });
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

                return $modelPromise.all( refs ).then(function ( resolvedRefs ) {
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
         * @param   {String|String[]} [idFields]
         * @returns {Object|Object[]}
         */
        function applyIdField ( response, idFields ) {
            var data = response.data;
            var isArray = angular.isArray( data );

            idFields = idFields || "id";
            idFields = angular.isArray( idFields ) ? idFields : [ idFields ];
            data = isArray ? data : [ data ];

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