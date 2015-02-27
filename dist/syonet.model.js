!function () {
    "use strict";

    angular.module( "syonet.model", [
        "pouchdb"
    ]);
}();
!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelCache", cacheService );

    function cacheService ( $modelPromise, $modelTemp ) {
        var MANAGEMENT_DATA = "$$model";
        var PROTECTED_DOCS = [ MANAGEMENT_DATA ];

        /**
         * Remove every document passed, or the entire DB if nothing passed.
         *
         * @param   {Model} model
         * @param   {Object|Object[]} data
         * @returns {Promise}
         */
        function remove ( model, data ) {
            var arr, promise;
            var coll = !model.id();

            if ( data ) {
                arr = angular.isArray( data );
                data = arr ? data : [ data ];
                promise = $modelPromise.when();
            } else {
                // If there's no data, we'll remove everything from the DB
                promise = model.db.allDocs().then(function ( docs ) {
                    data = docs.rows.map(function ( row ) {
                        return {
                            _id: row.id
                        };
                    });
                });
            }

            return promise.then(function () {
                // Find the current revision of each item in the data array
                var promises = data.filter( filterProtected ).map( function ( item ) {
                    item = arr || coll ? model.id( item._id ) : model;
                    return item.rev();
                });

                return $modelPromise.all( promises );
            }).then(function ( revs ) {
                data = revs.map(function ( rev, i ) {
                    return {
                        _id: data[ i ]._id,
                        _rev: rev,
                        _deleted: true
                    };
                }).filter(function ( item ) {
                    return item._rev;
                });

                return data.length ? model.db.bulkDocs( data ) : [];
            });
        }

        /**
         * Replace the data of each document passed.
         * If some item in the data array doesn't exist, then it'll be inserted.
         *
         * @param   {Model} model
         * @param   {Object|Object[]} data
         * @returns {Promise}
         */
        function set ( model, data ) {
            var promises;
            var coll = !model.id();
            var arr = angular.isArray( data );
            data = arr ? data : [ data ];

            // Find the current revision of each item in the data array
            promises = data.map(function ( item ) {
                // Generate a temporary ID if doesn't have one
                item._id = ( item._id || $modelTemp.next() ) + "";

                item = arr || coll ? model.id( item._id ) : model;
                return item.rev();
            });

            return $modelPromise.all( promises ).then(function ( revs ) {
                data.forEach(function ( item, i ) {
                    removeSpecialKeys( item );
                    createRelations( item, model );
                    item._rev = revs[ i ];
                });

                return model.db.bulkDocs( data );
            }).then(function () {
                return arr ? data : data[ 0 ];
            });
        }

        /**
         * Get one document for a Model.
         * If it's a collection, will try to match parents of each cached document.
         *
         * @param   {Model} model
         * @returns {Promise}
         */
        function getOne ( model ) {
            var id = model.id();
            var promise = id ? model.db.get( id ) : model.db.allDocs({
                include_docs: true
            }).then(function ( data ) {
                var i, doc;
                for ( i = 0; i < data.total_rows; i++ ) {
                    doc = data.rows[ i ].doc;
                    if ( checkRelations( doc, model ) ) {
                        return doc;
                    }
                }

                return $modelPromise.reject();
            });

            return $modelPromise.when( promise );
        }

        /**
         * Get all documents for a Model.
         *
         * @param   {Model} model
         * @returns {Promise}
         */
        function getAll ( model ) {
            var promise = model.db.allDocs({
                include_docs: true
            }).then(function ( data ) {
                return data.rows.map(function ( item ) {
                    return item.doc;
                }).filter(function ( item ) {
                    return checkRelations( item, model ) && filterProtected( item );
                });
            });

            return $modelPromise.when( promise );
        }

        /**
         * Extend the original data of each document passed.
         * If some item in the data array doesn't exist, then it'll be inserted.
         *
         * @param   {Model} model
         * @param   {Object|Object[]} data
         * @returns {Promise}
         */
        function extend ( model, data ) {
            var ids, promise;
            // Will store data that's going to be updated
            var bulkData = [];
            var db = model.db;
            var arr = angular.isArray( data );
            data = arr ? data : [ data ];

            // Find the ID of each posted item, for easier manipulation later
            ids = data.map(function ( item ) {
                return item._id;
            });

            promise = db.allDocs({
                include_docs: true
            }).then(function ( docs ) {
                docs.rows.forEach(function ( row ) {
                    var index = ids.indexOf( row.id );
                    if ( ~index ) {
                        // Strip special keys (ie "_foo") first
                        removeSpecialKeys( data[ index ] );

                        // Extend current document with the corresponding posted document
                        row = angular.extend( row.doc, data[ index ] );
                        bulkData.push( row );

                        // And remove its ID and data from helper/posted data arrays
                        ids.splice( index, 1 );
                        data.splice( index, 1 );
                    }
                });

                // If there's data left in the original data array, we'll insert them
                // instead of extending
                if ( data.length ) {
                    data.forEach(function ( item ) {
                        removeSpecialKeys( item );
                        bulkData.push( item );
                    });
                }

                return db.bulkDocs( bulkData );
            }).then(function () {
                return arr ? bulkData : bulkData[ 0 ];
            });

            return $modelPromise.when( promise );
        }

        /**
         * Compact DB data if needed
         *
         * @param   {Model} model
         * @returns {Promise}
         */
        function compact ( model ) {
            var db = model.db;
            var promise = db.get( MANAGEMENT_DATA ).then( checkCompaction, function () {
                // Wrapped this function instead of simply passing it to the errback just to
                // control what goes into the args
                return checkCompaction();
            });

            return $modelPromise.when( promise );

            function checkCompaction ( mgmt ) {
                mgmt = mgmt || {
                    _id: MANAGEMENT_DATA,
                    lastCompactionIndex: 0
                };

                return db.info().then(function ( info ) {
                    // Only compact if we are more than 1000 updates outdated.
                    // Less than that is just not enough to justify.
                    if ( mgmt.lastCompactionIndex + 1000 <= info.update_seq ) {
                        return db.compact().then(function () {
                            mgmt.lastCompactionIndex = info.update_seq;
                            return db.post( mgmt );
                        });
                    }
                });
            }
        }

        /**
         * Remove special properties for PouchDB from an item
         *
         * Removes all properties starting with _ (except _id), as they're special for PouchDB, and
         * that would cause problems while persisting the documents
         *
         * @param   {Object} item
         */
        function removeSpecialKeys ( item ) {
            Object.keys( item ).forEach(function ( key ) {
                if ( key[ 0 ] === "_" && key !== "_id" ) {
                    delete item[ key ];
                }
            });
        }

        /**
         * Create relations with parent models
         *
         * @param   {Object} item
         * @param   {Model} model
         */
        function createRelations ( item, model ) {
            var obj = item.$parents = item.$parents || {};

            while ( model = model._parent ) {
                obj[ model._path.name ] = {
                    $id: model._path.id,
                    $parents: {}
                };
                obj = obj[ model._path.name ].$parents;
            }
        }

        /**
         * Check whether relations between an DB item and the Model are the same.
         *
         * @param   {Object} item
         * @param   {Model} model
         * @returns {boolean}
         */
        function checkRelations ( item, model ) {
            while ( model = model._parent ) {
                item = ( item.$parents || {} )[ model._path.name ];
                if ( !item || item.$id !== model._path.id ) {
                    return false;
                }
            }

            return true;
        }

        /**
         * Returns whether the item is a protected document.
         * Useful for usage as the callback of Array.prototype.filter()
         *
         * @param   {Object} item
         * @returns {Boolean}
         */
        function filterProtected ( item ) {
            return !~PROTECTED_DOCS.indexOf( item._id );
        }

        // I'd love to have ES6 shorthands for the case below
        return {
            remove: remove,
            set: set,
            extend: extend,
            getOne: getOne,
            getAll: getAll,
            compact: compact
        };
    }
    cacheService.$inject = ["$modelPromise", "$modelTemp"];
}();
!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelConfig", configService );

    function configService ( $window ) {
        // The localStorage key which will store configurations for the model service
        var MODEL_CFG_KEY = "$model.__config";

        var storage = $window.localStorage;

        return {
            clear: function () {
                storage.removeItem( MODEL_CFG_KEY );
            },
            get: function () {
                var stored = storage.getItem( MODEL_CFG_KEY );
                return stored && JSON.parse( stored ) || {};
            },
            set: function ( val ) {
                storage.setItem( MODEL_CFG_KEY, JSON.stringify( val ) );
            }
        };
    }
    configService.$inject = ["$window"];
}();
!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "$modelDB", dbProvider );

    function dbProvider () {
        var provider = this;

        /**
         * PouchDB database name prefix
         * @type    {String}
         */
        provider.dbNamePrefix = "modelDB";

        provider.$get = function ( $modelPromise, pouchDB ) {
            var instances = {};

            /**
             * Return a PouchDB instance with a standardized name.
             *
             * @param   {String} name
             * @returns {PouchDB}
             */
            var getDB = function ( name ) {
                if ( !instances[ name ] ) {
                    instances[ name ] = pouchDB( provider.dbNamePrefix + "." + name );
                }

                return instances[ name ];
            };

            /**
             * Destroy all DBs
             */
            getDB.clear = function () {
                var promises = [];

                angular.forEach( instances, function ( db, name ) {
                    delete instances[ name ];
                    promises.push( db.destroy() );
                });

                return $modelPromise.all( promises );
            };

            return getDB;
        };

        return provider;
    }
}();
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

        provider.$get = function (
            $modelPromise,
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

                return req.then( null, function ( err ) {
                    if ( !$modelRequest.isSafe( method ) && err.status === 0 ) {
                        return modelSync.store( model, method, data, options ).then(function () {
                            return SKIP_RESPONSE;
                        });
                    }

                    return $modelPromise.reject( err );
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
                var promise;
                var self = this;

                self = invokeInCollection( self, collection, "list" );
                if ( !this.id() ) {
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
                        return $modelCache.compact( self );
                    }).then(function () {
                        return $modelCache.set( self, docs );
                    });
                }, function ( err ) {
                    if ( err.status === 0 ) {
                        return promise.$$cached;
                    }

                    return $modelPromise.reject( err );
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
                    // Use the ID from the model instead of the ID from PouchDB if we have one.
                    // This allows us to have a sane ID management.
                    doc._id = self.id() || doc._id;

                    promise.emit( "server", doc );
                    return $modelCache.set( self, doc );
                }, function ( err ) {
                    if ( err.status === 0 ) {
                        return promise.$$cached.then( null, function ( e ) {
                            return $modelPromise.reject( !e || e.name === "not_found" ? err : e );
                        });
                    }

                    return $modelPromise.reject( err );
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
                var promise;
                var self = this;

                self = invokeInCollection( self, collection, "create" );
                if ( !this.id() ) {
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

                    // Wait until the cache response is finished, so we guarantee no duplicated
                    // data will happen
                    return promise.$$cached.then(function () {
                        promise.emit( "server", docs );
                        return $modelCache.remove( self, data );
                    }).then(function () {
                        return $modelCache.set( self, docs );
                    });
                }, function ( err ) {
                    return $modelCache.remove( self, data ).then( $modelPromise.reject( err ) );
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

                    promise = createRequest( self, method, data, options );
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
!function () {
    "use strict";

    angular.module( "syonet.model" ).config( createPluginMethods );

    function createPluginMethods ( pouchDBProvider, POUCHDB_DEFAULT_METHODS ) {
        var plugins = {
            patch: patch
        };

        PouchDB.plugin( plugins );
        pouchDBProvider.methods = POUCHDB_DEFAULT_METHODS.concat( Object.keys( plugins ) );

        // -----------------------------------------------------------------------------------------

        function patch ( patches, id, callback ) {
            var db = this;

            return db.get( String( id ) ).then(function ( doc ) {
                angular.extend( doc, patches );
                return db.put( doc, id, doc._rev, callback );
            }, callback );
        }
    }
    createPluginMethods.$inject = ["pouchDBProvider", "POUCHDB_DEFAULT_METHODS"];
}();
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

        provider.$get = function ( $timeout, $http, $window, $modelPromise, $modelTemp ) {
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
                    return $modelPromise.reject( new Error( "Succesfully pinged RESTful server" ) );
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
                    timeout: createPingRequest( pingUrl, options.force )
                };

                // FIXME This functionality has not been tested yet.
                // config.headers.__modelXHR__ = createXhrNotifier( deferred );

                putAuthorizationHeader( config, options.auth );
                return updateTempRefs( config ).then(function ( config ) {
                    return $http( config ).then(function ( response ) {
                        var promise;
                        response = applyIdField( response );
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
!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "modelSync", modelSyncProvider );

    function modelSyncProvider ( $modelRequestProvider ) {
        var provider = this;

        provider.$get = function ( $interval, $document, $modelRequest, $modelDB, $modelPromise ) {
            var UPDATE_DB_NAME = "__updates";
            var db = $modelDB( UPDATE_DB_NAME );

            function sync () {
                var promise;

                // Will store the requests sent, so they can be removed later
                var sentReqs = [];

                if ( sync.$$running ) {
                    return;
                }

                sync.$$running = true;
                promise = db.allDocs({
                    include_docs: true
                }).then(function ( docs ) {
                    // Order requests by their date of inclusion
                    docs.rows.sort(function ( a, b ) {
                        var date1 = new Date( a.doc.date ).getTime();
                        var date2 = new Date( b.doc.date ).getTime();
                        return date1 - date2;
                    });

                    return processRequest( docs.rows );
                }).then(function () {
                    // Don't emit if there were no sent requests
                    if ( sentReqs.length ) {
                        sync.emit( "success" );
                    }
                }).finally( clear );

                return $modelPromise.when( promise );

                function processRequest ( rows ) {
                    var doc;
                    var row = rows.shift();

                    if ( !row ) {
                        return $modelPromise.when();
                    }

                    doc = row.doc;

                    // Reconstitute model and try to send the request again
                    return $modelRequest(
                        doc.model,
                        doc.method,
                        doc.data,
                        doc.options
                    ).then(function ( response ) {
                        sentReqs.push({
                            _id: row.id,
                            _rev: row.value.rev
                        });

                        sync.emit( "response", response, doc );
                        return processRequest( rows );
                    }, function ( err ) {
                        var promise = $modelPromise.when();
                        sync.emit( "error", err, row );

                        // We'll only remove requests which failed in the server.
                        // Aborted/timed out requests will stay in our cache.
                        if ( err.status !== 0 ) {
                            sentReqs.push({
                                _id: row.id,
                                _rev: row.value.rev
                            });

                            // If we have docs, we'll try to roll them back to their previous
                            // versions
                            if ( doc.db && doc.docs ) {
                                promise = rollback( doc );
                            }
                        }

                        return promise.then(function () {
                            return $modelPromise.reject( err );
                        });
                    });
                }

                function clear () {
                    sync.$$running = false;

                    sentReqs.forEach(function ( doc ) {
                        doc._deleted = true;
                    });
                    return db.bulkDocs( sentReqs );
                }
            }

            $modelPromise.makeEmitter( sync );

            /**
             * Store a combination of model/method/data.
             *
             * @param   {Model|String} model    The model or model URL
             * @param   {String} method         The HTTP method
             * @param   {Object} [data]         Optional data
             * @param   {Object} [options]      $modelRequest options
             * @returns {Promise}
             */
            sync.store = function ( model, method, data, options ) {
                var promise;
                var isArr = angular.isArray( data );
                var doc = {
                    model: typeof model === "string" ? model : model.toURL(),
                    method: method,
                    data: data,
                    options: options,
                    date: new Date()
                };

                // Optional - store current rev so we can rollback later if request fails
                if ( model.db && !$modelRequest.isSafe( method ) && data ) {
                    data = isArr ? data : [ data ];
                    promise = data.map(function ( item ) {
                        return $modelPromise.all({
                            _id: item._id,
                            _rev: model.id( item._id ).rev()
                        });
                    });

                    doc.db = model._path.name;
                    promise = $modelPromise.all( promise ).then(function ( docs ) {
                        doc.docs = docs;
                    });
                } else {
                    promise = $modelPromise.when();
                }

                return promise.then(function () {
                    return db.post( doc );
                });
            };

            /**
             * Create a schedule for synchronization runs.
             * Useful for hitting offline servers.
             *
             * @param   {Number} [delay] Number of milliseconds between each synchronization run.
             *                           If delay is smaller than the ping delay, then the delay
             *                           used is the ping delay.
             */
            sync.schedule = function ( delay ) {
                delay = Math.max( delay || $modelRequestProvider.pingDelay );

                sync.schedule.cancel();
                sync.$$schedule = $interval( sync, delay );
            };

            /**
             * Cancel a scheduled synchronization interval.
             */
            sync.schedule.cancel = function () {
                $interval.cancel( sync.$$schedule );
            };

            // When the page is back online, then we'll trigger an synchronization run
            $document.on( "online", sync );

            // Also create a default schedule
            sync.schedule();

            return sync;

            // -------------------------------------------------------------------------------------

            /**
             * Rollback every item stored in an synchronization document.
             *
             * @param   {Object} doc
             * @return  {Promise}
             */
            function rollback ( doc ) {
                var db = $modelDB( doc.db );
                var promises = doc.docs.map(function ( item ) {
                    // Get the previous revisions of this item
                    return db.get( item._id, {
                        revs: true
                    }).then(function ( data ) {
                        var revIndex;
                        var revs = data._revisions;

                        // Find the revision of this request
                        item._rev = item._rev || "";
                        revIndex = revs.ids.indexOf( item._rev.replace( /^\d+-/, "" ) );

                        // Does this item existed before? If not, we'll remove it from the DB.
                        if ( !~revIndex ) {
                            return remove();
                        }

                        return next();

                        // -------------------------------------------------------------------------

                        function remove () {
                            return db.remove( data._id, data._rev );
                        }

                        function next () {
                            // Increase 1, so we'll have the previous revision of the current one
                            revIndex++;

                            // If there's no next revision, we'll simply remove the item
                            if ( !revs.ids[ revIndex ] ) {
                                return remove();
                            }

                            // Build the revision
                            item._rev = ( revs.start - revIndex ) + "-" + revs.ids[ revIndex ];

                            // Get the data of the revision that we'll rollback to
                            return db.get( item._id, {
                                rev: item._rev
                            }).then(function ( atRev ) {
                                if ( atRev._deleted ) {
                                    return next();
                                }

                                // And finally overwrite it.
                                atRev._rev = data._rev;

                                return db.put( atRev );
                            });
                        }
                    });
                });

                return $modelPromise.all( promises );
            }
        };

        return provider;
    }
    modelSyncProvider.$inject = ["$modelRequestProvider"];
}();
!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelTemp", tempService );

    function tempService ( $modelConfig, $modelDB ) {
        var db = $modelDB( "__temp" );
        var api = {
            get regex () {
                return /\$\$temp\d+/g;
            }
        };

        /**
         * Generate the next temporary ID
         *
         * @returns {Number}
         */
        api.next = function () {
            var cfg = $modelConfig.get();
            cfg.tempID = ( cfg.tempID || 0 ) + 1;
            $modelConfig.set( cfg );

            return "$$temp" + cfg.tempID;
        };

        /**
         * Define an real ID to an temporary one
         *
         * @param   {String} tempID
         * @param   {*} currID
         * @returns {Promise}
         */
        api.set = function ( tempID, currID ) {
            return db.put({
                id: currID
            }, tempID );
        };

        /**
         * Return an persisted ID for an temporary one
         *
         * @param   {String} tempID
         * @returns {Promise}
         */
        api.get = function ( tempID ) {
            return db.get( tempID ).then(function ( doc ) {
                return doc.id;
            });
        };

        /**
         * Determine if a string is a temporary ID.
         *
         * @param   {String} id
         * @returns {Boolean}
         */
        api.is = function ( id ) {
            return api.regex.test( id );
        };

        return api;
    }
    tempService.$inject = ["$modelConfig", "$modelDB"];
}();
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

        [ "when", "reject", "all" ].forEach( function ( method ) {
            modelPromise[ method ] = function ( value ) {
                return makeEmitter( $q[ method ]( value ) );
            };
        });

        return modelPromise;
    }
    promiseService.$inject = ["$q"];
}();
!function () {
    "use strict";

    var proto = window.XMLHttpRequest.prototype;
    var setReqHeader = proto.setRequestHeader;
    proto.setRequestHeader = function ( header, value ) {
        if ( header === "__modelXHR__" ) {
            value( this );
        } else {
            return setReqHeader.apply( this, arguments );
        }
    };
}();