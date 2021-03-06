!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "model", modelProvider );

    function modelProvider () {
        var auth;
        var provider = this;

        // Special object to determine that returning a HTTP response should be skipped
        var SKIP_RESPONSE = {};

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

        /**
         * Define if collections should be pluralized by default when making the requests.
         *
         * @type    {Boolean}
         */
        provider.pluralizeCollections = false;

        /**
         * Mapping of Model methods to HTTP method.
         * The configured values here will be used by their corresponding Model methods when
         * triggering the HTTP requests.
         *
         * @type    {Object}
         */
        provider.methods = {
            get:    "GET",
            list:   "GET",
            create: "POST",
            update: "PUT",
            patch:  "PATCH",
            remove: "DELETE"
        };

        provider.$get = function (
            $modelPromise,
            $modelConfig,
            $modelRequest,
            $modelDB,
            $modelCache,
            modelSync
        ) {

            /**
             * @param   {String} name
             * @param   {Object} [options]
             * @param   {String|String[]} [options.id="id"]  List of fields to take from the XHR
             *                                               response and adopt as the primary key
             *                                               of the returned array/object.
             * @returns {Model}
             * @constructor
             */
            function Model ( name, options ) {
                if ( !( this instanceof Model ) ) {
                    return new Model( name, options );
                }

                if ( !name ) {
                    throw new Error( "Model name must be supplied" );
                }

                this.__defineGetter__( "db", function () {
                    return $modelDB( name );
                });

                this._options = options;
                this._path = {
                    name: name
                };
            }

            /**
             * @param   {String} method
             * @param   {*} [data]
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype._request = function ( method, data, options ) {
                var req;
                var model = this;
                var url = model.toURL();

                options = angular.extend( {}, options, model._options, {
                    auth: provider.auth(),
                    baseUrl: Model.base()
                });
                req = $modelRequest( url, method, data, options );

                return req.then( null, function ( err ) {
                    if ( !$modelRequest.isSafe( method ) && err.status === 0 ) {
                        return modelSync.store( model, method, data, options ).then(function () {
                            return SKIP_RESPONSE;
                        });
                    }

                    return $modelPromise.reject( err );
                });
            };

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

                other = new Model( this._path.name, this._options );
                other._parent = this._parent;
                other._path.id = id;

                return other;
            };

            /**
             * Creates a new model with the specified `name` inheriting from this one.
             *
             * @param   {String} name
             * @param   {Object} [options]  Model options. See {@link Model} for further info.
             * @returns {Model}
             */
            Model.prototype.model = function ( name, options ) {
                var other, id;

                if ( name instanceof Model ) {
                    id = name._path.id;
                    options = options || name._options;
                    name = name._path.name;
                }

                other = new Model( name, options );
                other._parent = this;
                other._path.id = id;

                return other;
            };

            /**
             * Get the latest revision for a item.
             *
             * @returns {Promise}
             */
            Model.prototype.rev = function () {
                var id = this.id();
                var deferred = $modelPromise.defer();

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
                var id, name;
                var next = this;
                var path = "";

                do {
                    id = next._path.id;
                    id = id && ( angular.isArray( id ) ? id.join( "," ) : id );
                    name = next._path.name;

                    // Pluralize the collection URL if needed
                    if ( !id && provider.pluralizeCollections ) {
                        name += "s";
                    }

                    path = "/" + name + ( id ? "/" + id : "" ) + path;
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
                var promise, cachePromise, reqPromise;
                var self = this;

                self = invokeInCollection( self, collection, "list" );
                if ( !this.id() ) {
                    options = query;
                    query = collection;
                }

                cachePromise = $modelCache.getAll( self ).then(function ( docs ) {
                    promise.emit( "cache", docs );

                    // If the DB has ever been touched before, we'll return that value.
                    // Otherwise, let's just make this promise eternal, so the request has a chance
                    // to finish.
                    cachePromise.failed = !docs.touched;
                    if ( docs.touched ) {
                        return docs;
                    }

                    return reqPromise.failed ? $modelPromise.reject({
                        status: 0
                    }) : eternalPromise();
                });

                reqPromise = self._request(
                    provider.methods.list,
                    query,
                    options
                ).then(function ( docs ) {
                    var cache;
                    promise.emit( "server", docs );

                    if ( !query || angular.equals( query, {} ) ) {
                        cache = $modelCache.remove( self );
                    } else {
                        cache = $modelPromise.when();
                    }

                    return cache.then(function () {
                        return $modelCache.compact( self );
                    }).then(function () {
                        return $modelCache.set( self, docs );
                    });
                }, function ( err ) {
                    if ( err.status !== 0 ) {
                        return $modelPromise.reject( err );
                    }

                    reqPromise.failed = true;
                    return cachePromise.failed ? $modelPromise.reject( err ) : cachePromise;
                });

                return promise = $modelPromise.race([ reqPromise, cachePromise ]);
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
                var promise, reqPromise, cachePromise;
                var self = this;

                if ( !this.id() ) {
                    self = id ? this.id( id ) : self;
                } else {
                    options = id;
                }

                cachePromise = $modelCache.getOne( self ).then(function ( doc ) {
                    promise.emit( "cache", doc );
                    return doc;
                }, function ( err ) {
                    // If the document was not found and the request has not finished yet, let's
                    // make this promise eternal, so the request has a chance to finish.
                    // If the document was not found and the request has finished, then we should
                    // assume this is an HTTP status 0.
                    // Other errors should be thrown.
                    if ( err != null && err.message !== "missing" ) {
                        return $modelPromise.reject( err );
                    }

                    cachePromise.failed = true;
                    return reqPromise.failed ? $modelPromise.reject({
                        status: 0
                    }) : eternalPromise();
                });

                reqPromise = self._request(
                    provider.methods.get,
                    null,
                    options
                ).then(function ( doc ) {
                    // Use the ID from the model instead of the ID from PouchDB if we have one.
                    // This allows us to have a sane ID management.
                    doc._id = self.id() || doc._id;

                    promise.emit( "server", doc );
                    return $modelCache.set( self, doc );
                }, function ( err ) {
                    if ( err.status !== 0 ) {
                        return $modelPromise.reject( err );
                    }

                    reqPromise.failed = true;
                    return cachePromise.failed ? $modelPromise.reject( err ) : cachePromise;
                });

                return promise = $modelPromise.race([ reqPromise, cachePromise ]);
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
                var promise;
                var self = this;

                self = invokeInCollection( self, collection, "create" );
                if ( !this.id() ) {
                    options = data;
                    data = collection;
                }

                promise = self._request( provider.methods.create, data, options );
                promise.$$cached = $modelCache.set( self, data ).then(function ( docs ) {
                    promise.emit( "cache", docs );
                    return docs;
                });

                return promise.then(function ( docs ) {
                    if ( docs === SKIP_RESPONSE ) {
                        return promise.$$cached;
                    }

                    // Wait until the cache response is finished, so we guarantee no duplicated
                    // data will happen
                    return promise.$$cached.then(function () {
                        promise.emit( "server", docs );
                        return $modelCache.remove( self, data );
                    }).then(function () {
                        return $modelCache.set( self, docs );
                    });
                }, function ( err ) {
                    return $modelCache.remove( self, data ).then(function () {
                        return $modelPromise.reject( err );
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
            Model.prototype.update = createUpdateFn( "set", "update" );

            /**
             * Updates the current collection/element.
             * Triggers a PATCH request.
             *
             * @param   {Object|Object[]} data
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.patch = createUpdateFn( "extend", "patch" );

            /**
             * Removes the current collection/element.
             * Triggers a DELETE request.
             *
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.remove = function ( options ) {
                var self = this;
                var promise = self._request( provider.methods.remove, null, options );

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
                var deferred = $modelPromise.defer();
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
             * @param   {String} method     The method configuration to use.
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
                            item._id = item._id.length <= 1 ? item._id[ 0 ] : item._id.join( "," );

                            if ( !item._id ) {
                                throw new Error(
                                    "Can't do batch operation without ID defined on all items"
                                );
                            }

                            item._id += "";
                        });
                    } else {
                        data._id = self.id();
                    }

                    promise = self._request( provider.methods[ method ], data, options );
                    return promise.then(function ( docs ) {
                        if ( docs === SKIP_RESPONSE ) {
                            return $modelCache[ cacheFn ]( self, data ).then(function ( docs ) {
                                promise.emit( "cache", docs );
                                return docs;
                            });
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

            /**
             * Instantiate a subcollection for a element or throw error.
             * Used by .list() and .create().
             *
             * @param   {Model} self
             * @param   {String} collection
             * @param   {String} method
             * @returns {Model}
             */
            function invokeInCollection ( self, collection, method ) {
                var msg;

                if ( self.id() ) {
                    if ( collection ) {
                        self = self.model( collection );
                    } else {
                        msg =
                            "Can't invoke ." + method + "() in a element without specifying " +
                            "child collection name.";
                        throw new Error( msg );
                    }
                }

                return self;
            }

            /**
             * Returns a promise that's never resolved.
             * Useful for disallowing cache promises to resolve in .get() and .list() methods
             *
             * @returns {Promise}
             */
            function eternalPromise () {
                return $modelPromise.defer().promise;
            }
        };

        return provider;

        // -----------------------------------------------------------------------------------------

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