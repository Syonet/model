!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "model", modelProvider );

    function modelProvider () {
        var auth;
        var provider = this;

        // Special object to determine that returning a HTTP response should be skipped
        var SKIP_RESPONSE = {};

        /**
         * The name of the header that contains the ID fields in the response body.
         * @type    {String}
         */
        provider.idFieldHeader = "X-Id-Field";

        /**
         * Get/set the username and password used for authentication.
         *
         * @param   {String} [username]
         * @param   {String} [password]
         */
        provider.auth = function ( username, password ) {
            if ( !username ) {
                return auth;
            }

            auth = {
                username: username,
                password: password
            };
        };

        provider.$get = function (
            $q,
            $modelConfig,
            $modelRequest,
            $modelDB,
            $modelCache,
            modelSync
        ) {
            /**
             * @param   {Model} model
             * @param   {String} method
             * @param   {*} [data]
             * @param   {Object} [options]
             * @returns {Promise}
             */
            function createRequest ( model, method, data, options ) {
                var req;
                var url = model.toURL();

                options = angular.extend( {}, options, {
                    auth: provider.auth(),
                    baseUrl: Model.base()
                });
                req = $modelRequest( url, method, data, options );

                return req.then( applyIdField, function ( err ) {
                    if ( !$modelRequest.isSafe( method ) && err.status === 0 ) {
                        return modelSync.store( url, method, data, options ).then(function () {
                            return SKIP_RESPONSE;
                        });
                    }

                    return $q.reject( err );
                });
            }

            /**
             * @param   {String} name
             * @returns {Model}
             * @constructor
             */
            function Model ( name ) {
                if ( !( this instanceof Model ) ) {
                    return new Model( name );
                }

                if ( !name ) {
                    throw new Error( "Model name must be supplied" );
                }

                this.__defineGetter__( "db", function () {
                    return $modelDB( name );
                });

                this._path = {
                    name: name
                };
            }

            /**
             * Get/set the ID of the current collection/element.
             *
             * If `id` is undefined, then the ID of the model is returned.
             * If `id` is not undefined, then a new model is created with the passed `id`.
             *
             * @param   {*} [id]
             * @returns {*}
             */
            Model.prototype.id = function ( id ) {
                var other;

                if ( id === undefined ) {
                    return this._path.id;
                }

                other = new Model( this._path.name );
                other._parent = this._parent;
                other._path.id = id;

                return other;
            };

            /**
             * Creates a new model  with the specified `name` inheriting from this one.
             *
             * @param   {String} name
             * @returns {Model}
             */
            Model.prototype.model = function ( name ) {
                var other = new Model( name );
                other._parent = this;

                return other;
            };

            /**
             * Get the latest revision for a item.
             *
             * @returns {Promise}
             */
            Model.prototype.rev = function () {
                var id = this.id();
                var deferred = $q.defer();

                if ( !id ) {
                    throw new Error( "Can't get revision of a collection!" );
                } else {
                    this.db.get( id ).then(function ( doc ) {
                        deferred.resolve( doc._rev );
                    }, function ( err ) {
                        if ( err.name === "not_found" ) {
                            return deferred.resolve( null );
                        }

                        deferred.reject( err );
                    });
                }

                return deferred.promise;
            };

            /**
             * Build the URL for the current model.
             * IDs that are arrays are joined with a "," as the glue.
             *
             * @returns {String}
             */
            Model.prototype.toURL = function () {
                var id;
                var next = this;
                var path = "";

                do {
                    id = next._path.id;
                    id = id && ( angular.isArray( id ) ? id.join( "," ) : id );

                    path = "/" + next._path.name + ( id ? "/" + id : "" ) + path;
                    next = next._parent;
                } while ( next );
                return fixDoubleSlashes( Model.base() + path );
            };

            /**
             * List the current collection or a child collection of the current element.
             *
             * If `collection` is passed, then `.model( collection )` is invoked and a new model is
             * created.
             *
             * Triggers a GET request.
             *
             * @param   {*} [collection]
             * @param   {Object} [query]
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.list = function ( collection, query, options ) {
                var promise, msg;
                var self = this;

                if ( this.id() ) {
                    if ( collection ) {
                        self = this.model( collection );
                    } else {
                        msg =
                            "Can't invoke .list() in a element without specifying " +
                            "child collection name.";
                        throw new Error( msg );
                    }
                } else {
                    options = query;
                    query = collection;
                }

                promise = createRequest( self, "GET", query, options );
                promise.$$cached = $modelCache.getAll( self ).then(function ( docs ) {
                    promise.emit( "cache", docs );
                    return docs;
                });

                return promise.then(function ( docs ) {
                    promise.emit( "server", docs );

                    return $modelCache.remove( self ).then(function () {
                        return $modelCache.set( self, docs );
                    });
                }, function ( err ) {
                    if ( err.status === 0 ) {
                        return promise.$$cached;
                    }

                    return $q.reject( err );
                });
            };

            /**
             * Get the current element or a child element of the current collection.
             *
             * If `id` is passed, then `.id( id )` is invoked and a new model is created.
             *
             * Triggers a GET request.
             *
             * @param   {*} [id]
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.get = function ( id, options ) {
                var promise;
                var self = this;

                if ( !this.id() ) {
                    self = id ? this.id( id ) : self;
                } else {
                    options = id;
                }

                promise = createRequest( self, "GET", null, options );
                promise.$$cached = $modelCache.getOne( self ).then(function ( doc ) {
                    promise.emit( "cache", doc );
                    return doc;
                });

                return promise.then(function ( doc ) {
                    promise.emit( "server", doc );
                    return $modelCache.set( self, doc );
                }, function ( err ) {
                    if ( err.status === 0 ) {
                        return promise.$$cached.then( null, function ( e ) {
                            return $q.reject( e.name === "not_found" ? err : e );
                        });
                    }

                    return $q.reject( err );
                });
            };

            /**
             * Create one or more elements into the current collection or into
             * <code>collection</code>.
             * Triggers a POST request.
             *
             * @param   {String} [collection]   A subcollection to create the elements on.
             * @param   {*} data                The data to save
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.create = function ( collection, data, options ) {
                var promise, msg;
                var self = this;

                if ( this.id() ) {
                    if ( collection ) {
                        self = this.model( collection );
                    } else {
                        msg =
                            "Can't invoke .create() in a element without specifying " +
                            "child collection name.";
                        throw new Error( msg );
                    }
                } else {
                    options = data;
                    data = collection;
                }

                promise = createRequest( self, "POST", data, options );
                promise.$$cached = $modelCache.set( self, data ).then(function ( docs ) {
                    promise.emit( "cache", docs );
                    return docs;
                });

                return promise.then(function ( docs ) {
                    if ( docs === SKIP_RESPONSE ) {
                        return promise.$$cached;
                    }

                    promise.emit( "server", docs );
                    return $modelCache.remove( self, data ).then(function () {
                        return $modelCache.set( self, docs );
                    });
                });
            };

            /**
             * Updates the current collection/element.
             * Triggers a POST request.
             *
             * @param   {Object|Object[]} data
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.update = createUpdateFn( "set", "POST" );

            /**
             * Updates the current collection/element.
             * Triggers a PATCH request.
             *
             * @param   {Object|Object[]} data
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.patch = createUpdateFn( "extend", "PATCH" );

            /**
             * Removes the current collection/element.
             * Triggers a DELETE request.
             *
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.remove = function ( options ) {
                var self = this;
                var promise = createRequest( self, "DELETE", null, options );

                // Find the needed docs and remove then from cache right away
                promise.$$cached = $modelCache[ self.id() ? "getOne" : "getAll" ]( self );
                promise.$$cached = promise.$$cached.then(function ( data ) {
                    return $modelCache.remove( self, data ).then(function () {
                        promise.emit( "cached" );
                        return null;
                    });
                });

                return promise.then(function ( response ) {
                    if ( response === SKIP_RESPONSE ) {
                        promise.emit( "server" );
                    }

                    return promise.$$cached;
                });
            };

            /**
             * Get/set base URL for the RESTful API we'll be talking to
             *
             * @param   {String} [base]
             */
            Model.base = function ( base ) {
                var deferred = $q.defer();
                var cfg = $modelConfig.get();
                if ( base == null ) {
                    return cfg.baseUrl;
                }

                // No need to re-save the configuration if URL didn't change
                if ( cfg.baseUrl !== base ) {
                    // Clear all our DBs upon change of the base URL, but only if this isn't the
                    // first time using model
                    deferred.resolve( cfg.baseUrl && $modelDB.clear() );

                    cfg.baseUrl = base;
                    $modelConfig.set( cfg );
                }

                return deferred.promise;
            };

            // Supply provider methods to the service layer
            Model.auth = provider.auth;

            // Initialize base url by default with "/"
            Model.base( Model.base() || "/" );

            return Model;

            // -------------------------------------------------------------------------------------

            /**
             * Create and return a request function suitable for update/patch offline logic.
             *
             * @param   {String} cacheFn    The cache function to use. One of extend or set.
             * @param   {String} method     The HTTP method to use. One of POST or PATCH.
             * @returns {Function}
             */
            function createUpdateFn ( cacheFn, method ) {
                return function ( data, options  ) {
                    var promise;
                    var self = this;

                    options = angular.extend( {}, options );
                    options.id = options.id || "id";

                    if ( !self.id() ) {
                        if ( !angular.isArray( data ) ) {
                            throw new Error( "Can only do batch operations on arrays" );
                        }

                        data.forEach(function ( item ) {
                            item._id = Object.keys( item ).filter( filterKeys );
                            item._id = item._id.map(function ( key ) {
                                return item[ key ];
                            });

                            // Checks for length <= 1 and use index 0 if so.
                            // This is because only the index 0 is useful when there's only one ID
                            // key. If there's no ID key defined, then this is also useful as a
                            // catch method, so no empty ID is passed along.
                            item._id = item._id.length <= 1 ? item._id[ 0 ] : item._id;

                            if ( !item._id ) {
                                throw new Error(
                                    "Can't do batch operation without ID defined on all items"
                                );
                            }
                        });
                    } else {
                        data._id = self.id();
                    }

                    promise = createRequest( self, method, data, options );
                    promise.$$cached = $modelCache[ cacheFn ]( self, data ).then(function ( docs ) {
                        promise.emit( "cache", docs );
                        return docs;
                    });

                    return promise.then(function ( docs ) {
                        if ( docs === SKIP_RESPONSE ) {
                            return promise.$$cached;
                        }

                        promise.emit( "server", docs );

                        // Overwrite previously updated cache with the response from the server
                        return $modelCache.set( self, docs );
                    });

                    // Helper function for filtering out keys that are not part of the ID of this
                    // request.
                    function filterKeys ( key ) {
                        return !!~options.id.indexOf( key );
                    }
                };
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

        /**
         * Remove double slashes from a URL.
         *
         * @param   {String} url
         * @returns {String}
         */
        function fixDoubleSlashes ( url ) {
            return url.replace( /\/\//g, function ( match, index ) {
                return /https?:/.test( url.substr( 0, index ) ) ? match : "/";
            });
        }
    }
}();