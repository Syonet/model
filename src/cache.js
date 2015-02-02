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
         * @param   {Object} [query]        What query returned this data
         * @returns {Promise}
         */
        function set ( model, data, query ) {
            var promises;
            var coll = !model.id();
            var arr = angular.isArray( data );
            data = arr ? data : [ data ];
            query = query && queryToString( query );

            // Find the current revision of each item in the data array
            promises = data.map(function ( item ) {
                item = arr || coll ? model.id( item._id ) : model;
                return item.rev();
            });

            return $q.all( promises ).then(function ( revs ) {
                data.forEach(function ( item, i ) {
                    removeSpecialKeys( item );
                    createRelations( item, model );

                    // Add the current query to the list of queries that returned this data
                    item.$queries = item.$queries || [];
                    if ( query && !~item.$queries.indexOf( query ) ) {
                        item.$queries.push( query );
                    }

                    item.$order = i;
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
            return id ? model.db.get( id ) : model.db.allDocs({
                include_docs: true
            }).then(function ( data ) {
                var i, doc;
                for ( i = 0; i < data.total_rows; i++ ) {
                    doc = data.rows[ i ].doc;
                    if ( checkRelations( doc, model ) ) {
                        return doc;
                    }
                }

                return $q.reject();
            });
        }

        /**
         * Get all documents for a Model.
         *
         * @param   {Model} model
         * @param   {Object} query
         * @returns {Promise}
         */
        function getAll ( model, query ) {
            query = query && queryToString( query );
            return model.db.query( mapFn, {
                include_docs: true
            }).then(function ( data ) {
                return data.rows.filter(function ( item ) {
                    var doc = item.doc;
                    var hasQueries = angular.isArray( doc.$queries );

                    // Only test for query if a query has been passed
                    if ( query  ) {
                        // If this document doesn't have a $queries property or it's not an array,
                        // then we'll ignore this document.
                        return hasQueries ? !!~doc.$queries.indexOf( query ) : false;
                    }

                    return true;
                }).map(function ( item ) {
                    return item.doc;
                });
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
         * @param   {Object} query
         * @returns {String}
         */
        function queryToString ( query ) {
            var keys = Object.keys( query ).sort();
            return keys.map(function ( key ) {
                var val = query[ key ];
                if ( val != null && typeof val === "object" ) {
                    val = JSON.stringify( val );
                }

                return encodeURIComponent( key ) + "=" + encodeURIComponent( val );
            }).join( "&" );
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

        return {
            remove: remove,
            set: set,
            extend: extend,
            getOne: getOne,
            getAll: getAll
        };
    }
}();