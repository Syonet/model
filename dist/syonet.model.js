!function () {
    "use strict";

    angular.module( "syonet.model", [
        "pouchdb"
    ]);
}();
!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelCache", cacheService );

    function cacheService ( $q ) {
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
                promise = $q.when();
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
                var promises = data.map( function ( item ) {
                    item = arr || coll ? model.id( item._id ) : model;
                    return item.rev();
                });

                return $q.all( promises );
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
                item = arr || coll ? model.id( item._id ) : model;
                return item.rev();
            });

            return $q.all( promises ).then(function ( revs ) {
                data.forEach(function ( item, i ) {
                    removeSpecialKeys( item );
                    item.$order = i;
                    item._rev = revs[ i ];
                });

                return model.db.bulkDocs( data );
            }).then(function () {
                return arr ? data : data[ 0 ];
            });
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
            var ids;
            // Will store data that's going to be updated
            var bulkData = [];
            var db = model.db;
            var arr = angular.isArray( data );
            data = arr ? data : [ data ];

            // Find the ID of each posted item, for easier manipulation later
            ids = data.map(function ( item ) {
                return item._id;
            });

            return db.allDocs({
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

        return {
            remove: remove,
            set: set,
            extend: extend
        };
    }
    cacheService.$inject = ["$q"];
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

        provider.$get = function ( $q, pouchDB ) {
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

                return $q.all( promises );
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

                promise = id ? model.db.get( id ) : model.db.query( mapFn, {
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

        provider.$get = function ( $timeout, $q, $http, $window ) {
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
                var deferred = $q.defer();
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
                config.headers.__modelXHR__ = createXhrNotifier( deferred );

                putAuthorizationHeader( config, options.auth );
                httpPromise = $http( config ).then( null, function ( response ) {
                    return $q.reject({
                        data: response.data,
                        status: response.status
                    });
                });

                deferred.resolve( httpPromise );
                return deferred.promise;
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
!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "modelSync", modelSyncProvider );

    function modelSyncProvider ( $modelRequestProvider ) {
        var provider = this;

        provider.$get = function ( $q, $interval, $document, $modelRequest, $modelDB ) {
            var UPDATE_DB_NAME = "__updates";
            var db = $modelDB( UPDATE_DB_NAME );

            function sync () {
                // Will store the requests sent, so they can be removed later
                var sentReqs = [];

                if ( sync.$$running ) {
                    return;
                }

                sync.$$running = true;
                return db.allDocs({
                    include_docs: true
                }).then(function ( docs ) {
                    var promises = [];

                    docs.rows.forEach(function ( row ) {
                        var doc = row.doc;

                        // Reconstitute model and try to send the request again
                        var promise = $modelRequest(
                            doc.model,
                            doc.method,
                            doc.data,
                            doc.options
                        ).then(function ( response ) {
                            sentReqs.push({
                                _id: row.id,
                                _rev: row.value.rev
                            });
                            return response;
                        }, function ( err ) {
                            // We'll only remove requests which failed in the server.
                            // Aborted/timed out requests will stay in our cache.
                            if ( err.status !== 0 ) {
                                sentReqs.push({
                                    _id: row.id,
                                    _rev: row.value.rev
                                });
                            }

                            return $q.reject( err );
                        });
                        promises.push( promise );
                    });

                    return $q.all( promises );
                }).then(function ( values ) {
                    // Don't emit if there were no resolved values
                    if ( values.length ) {
                        sync.emit( "success" );
                    }

                    return clear();
                }, function ( err ) {
                    // Pass the error to the callbacks whatever it is
                    sync.emit( "error", err );

                    return clear();
                });

                function clear () {
                    sync.$$running = false;

                    sentReqs.forEach(function ( doc ) {
                        doc._deleted = true;
                    });
                    return db.bulkDocs( sentReqs );
                }
            }

            sync.$$events = {};

            /**
             * Store a combination of model/method/data.
             *
             * @param   {String} url        The model URL
             * @param   {String} method     The HTTP method
             * @param   {Object} [data]     Optional data
             * @param   {Object} [options]  $modelRequest options
             * @returns {Promise}
             */
            sync.store = function ( url, method, data, options ) {
                return db.post({
                    model: url,
                    method: method,
                    data: data,
                    options: options
                });
            };

            /**
             * Add a event to the synchronization object
             *
             * @param   {String} event
             * @param   {Function} listener
             * @returns void
             */
            sync.on = function ( event, listener ) {
                sync.$$events[ event ] = sync.$$events[ event ] || [];
                sync.$$events[ event ].push( listener );
            };

            /**
             * Emit a event in the synchronization object
             *
             * @param   {String} event
             * @returns void
             */
            sync.emit = function ( event ) {
                var args = [].slice.call( arguments, 1 );
                var listeners = sync.$$events[ event ] || [];

                listeners.forEach(function ( listener ) {
                    listener.apply( null, args );
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
        };

        return provider;
    }
    modelSyncProvider.$inject = ["$modelRequestProvider"];
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