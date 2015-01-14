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
         * The name of an alternative header that will contain the Content-Length, in case
         * the server provides it.
         * Useful when computing the length of a response which has Transfer-Encoding: chunked
         *
         * @type    {String}
         */
        provider.altContentLengthHeader = "X-Content-Length";

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
             * Fetches a PouchDB cached value (if there's no connection) or throws an error.
             *
             * @param   {Model} model
             * @param   {Error} err
             * @returns {Promise}
             */
            function fetchCacheOrThrow ( model, err ) {
                var promise;
                var id = model.id();
                var offline = err && err.status === 0;
                var maybeThrow = function () {
                    return $q(function ( resolve, reject ) {
                        // Don't throw if a error is not available
                        err ? reject( err ) : resolve( null );
                    });
                };

                // Don't try to use a cached value coming from PouchDB if a connection is available
                if ( !offline && err != null ) {
                    return maybeThrow();
                }

                promise = id ? model._db.get( id ) : model._db.query( mapFn, {
                    include_docs: true
                });

                return promise.then(function ( data ) {
                    // If we're dealing with a collection which has no cached values,
                    // we must throw
                    if ( !id && !data.rows.length && err ) {
                        return $q.reject( err );
                    }

                    return id ? data.doc : data.rows.map(function ( item ) {
                        return item.doc;
                    });
                }, maybeThrow );
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

                this.__defineGetter__( "_db", function () {
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
                    this._db.get( id ).then(function ( doc ) {
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
                var msg;
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

                return createRequest( self, "GET", query, options ).then(function ( data ) {
                    return $modelCache.remove( self ).then(function () {
                        return $modelCache.set( self, data );
                    });
                }, function ( err ) {
                    return fetchCacheOrThrow( self, err );
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
                var self = this;

                if ( !this.id() ) {
                    self = id ? this.id( id ) : self;
                } else {
                    options = id;
                }

                return createRequest( self, "GET", null, options ).then(function ( data ) {
                    return $modelCache.set( self, data );
                }, function ( err ) {
                    return fetchCacheOrThrow( self, err );
                });
            };

            /**
             * Save the current collection/element.
             * Triggers a POST request.
             *
             * @param   {*} data            The data to save
             * @param   {Object} options
             * @returns {Promise}
             */
            Model.prototype.save = function ( data, options ) {
                var self = this;
                return createRequest( self, "POST", data, options ).then(function ( docs ) {
                    var id = self.id();
                    var offline = docs === SKIP_RESPONSE;

                    if ( offline ) {
                        // When offline on collections, we'll do nothing
                        if ( !id ) {
                            return null;
                        }

                        // Otherwise, set the PouchDB's _id, so we can cache and retrieve this
                        // entity later
                        data._id = data._id || id;
                        docs = data;
                    }

                    // We'll only update the cache if it's a single document
                    if ( id || !angular.isArray( data ) ) {
                        return $modelCache.set( self, docs );
                    }

                    // If it's a batch POST, then we'll only remove the data and return what
                    // has been posted.
                    return $modelCache.remove( self ).then(function () {
                        return docs;
                    });
                });
            };

            /**
             * Patches the current collection/element.
             * Triggers a PATCH request.
             *
             * @param   {*} [data]
             * @param   {Object} options
             * @returns {Promise}
             */
            Model.prototype.patch = function ( data, options ) {
                var self = this;
                return createRequest( this, "PATCH", data, options ).then(function ( docs ) {
                    var id = self.id();

                    if ( docs === SKIP_RESPONSE ) {
                        // Can't update cache for what we don't know what the ID is
                        // That's the case of batch patches on collections
                        if ( !id ) {
                            return null;
                        }

                        data._id = id;
                        return $modelCache.extend( self, data );
                    }

                    if ( id ) {
                        return $modelCache.set( self, docs );
                    }

                    return $modelCache.remove( self ).then(function () {
                        return docs;
                    });
                });
            };

            /**
             * Removes the current collection/element.
             * Triggers a DELETE request.
             *
             * @param   {Object} [options]
             * @returns {Promise}
             */
            Model.prototype.remove = function ( options ) {
                var response;
                var self = this;

                return createRequest( self, "DELETE", null, options ).then(function ( data ) {
                    response = data;
                    return fetchCacheOrThrow( self, null );
                }).then(function ( cached ) {
                    return $modelCache.remove( self, cached );
                }).then(function () {
                    return response === SKIP_RESPONSE ? null : response;
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

        /**
         * Map function for when listing docs offline.
         * Emits them in the order they were fetched.
         *
         * @param   {Object} doc
         */
        function mapFn ( doc ) {
            emit( doc.$order );
        }
    }
}();