!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "model", modelProvider );

    function modelProvider () {
        var auth;
        var baseUrl = "/";
        var provider = this;

        /**
         * PouchDB database name prefix
         * @type    {String}
         */
        provider.dbNamePrefix = "modelDB";

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

        /**
         * Get/set base URL for the RESTful API we'll be talking to
         *
         * @param   {String} [base]
         */
        provider.base = function ( base ) {
            if ( base == null ) {
                return baseUrl;
            }

            baseUrl = base;
            return baseUrl;
        };

        provider.$get = function ( $window, $q, $http, pouchDB ) {
            /**
             * @param   {Model} model
             * @param   {String} method
             * @param   {*} [data]
             * @returns {Promise}
             */
            function createRequest ( model, method, data ) {
                var config = {
                    method: method,
                    url: model.toURL(),
                    data: data,
                    headers: {}
                };

                putAuthorizationHeader( config );
                return $http( config ).then( applyIdField, function ( response ) {
                    return $q.reject({
                        data: response.data,
                        status: response.status
                    });
                });
            }

            /**
             * Updates a PouchDB cached value.
             *
             * @param   {Model} model
             * @param   {*} data
             * @param   {Boolean} [remove]
             * @returns {Promise}
             */
            function updateCache ( model, data, remove ) {
                var promises;
                var isCollection = !model.id();
                data = isCollection ? data : [ data ];

                promises = data.map(function ( item ) {
                    return isCollection ? model.id( item._id ).rev() : model.rev();
                });

                return $q.all( promises ).then(function ( revs ) {
                    // Set the _rev and _deleted flags into each document
                    data.forEach(function ( item, i ) {
                        // Drop all properties starting with _ (except _id), as they're special for
                        // PouchDB, and that would cause us problems while persisting the documents
                        Object.keys( item ).forEach(function ( key ) {
                            if ( key[ 0 ] === "_" && key !== "_id" ) {
                                delete item[ key ];
                            }
                        });

                        item._rev = revs[ i ];
                        item._deleted = remove === true;
                    });

                    // Trigger the mass operation
                    return model._db.bulkDocs( data );
                }).then(function () {
                    return isCollection ? data : data[ 0 ];
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
                var offline = ( err && err.status === 0 ) || !$window.navigator.onLine;
                var maybeThrow = function () {
                    return $q(function ( resolve, reject ) {
                        // Don't throw if a error is not available
                        err ? reject( err ) : resolve();
                    });
                };

                // Don't try to use a cached value coming from PouchDB if a connection is available
                if ( !offline ) {
                    return maybeThrow();
                }

                promise = id ? model._db.get( id ) : model._db.allDocs({
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
             * Sets authentication headers in a HTTP configuration object.
             *
             * @param   {Object} config
             */
            function putAuthorizationHeader ( config ) {
                var password, base64;
                var auth = provider.auth();

                if ( !auth || !auth.username ) {
                    return;
                }

                password = auth.password == null ? "" : auth.password;
                base64 = $window.btoa( auth.username + ":" + password );
                config.headers.Authorization = "Basic " + base64;
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

                this._db = pouchDB( provider.dbNamePrefix + "." + name );

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
                    deferred.reject( new Error( "Can't get revision of a collection!" ) );
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

                return fixDoubleSlashes( provider.base() + path );
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
             * @returns {Promise}
             */
            Model.prototype.list = function ( collection ) {
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
                }

                return createRequest( self, "GET" ).then(function ( data ) {
                    return updateCache( self, data );
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
             * @returns {Promise}
             */
            Model.prototype.get = function ( id ) {
                var msg;
                var self = this;

                if ( !this.id() ) {
                    if ( id ) {
                        self = this.id( id );
                    } else {
                        msg =
                            "Can't invoke .get() in a collection without specifying " +
                            "child element ID.";
                        throw new Error( msg );
                    }
                }

                return createRequest( self, "GET" ).then(function ( data ) {
                    return updateCache( self, data );
                }, function ( err ) {
                    return fetchCacheOrThrow( self, err );
                });
            };

            /**
             * Save the current collection/element.
             * Triggers a POST request.
             *
             * @param   {*} data    The data to save
             * @returns {Promise}
             */
            Model.prototype.save = function ( data ) {
                var self = this;
                return createRequest( self, "POST", data ).then(function ( docs ) {
                    return updateCache( self, docs );
                });
            };

            /**
             * Patches the current collection/element.
             * Triggers a PATCH request.
             *
             * @param   {*} [data]
             * @returns {Promise}
             */
            Model.prototype.patch = function ( data ) {
                var self = this;
                return createRequest( this, "PATCH", data ).then(function ( docs ) {
                    return updateCache( self, docs );
                });
            };

            /**
             * Removes the current collection/element.
             * Triggers a DELETE request.
             *
             * @returns {Promise}
             */
            Model.prototype.remove = function () {
                var response;
                var self = this;

                return createRequest( self, "DELETE" ).then(function ( data ) {
                    response = data;
                    return fetchCacheOrThrow( self, null );
                }).then(function ( cached ) {
                    return cached && updateCache( self, cached, true );
                }).then(function () {
                    return response;
                });
            };

            // Supply provider methods to the service layer
            Model.auth = provider.auth;
            Model.base = provider.base;

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
    }
}();