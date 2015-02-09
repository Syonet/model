!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelCache", cacheService );

    function cacheService ( $q, $modelTemp ) {
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
        function set ( model, data ) {
            var promises;
            var coll = !model.id();
            var arr = angular.isArray( data );
            data = arr ? data : [ data ];

            // Find the current revision of each item in the data array
            promises = data.map(function ( item ) {
                // Generate a temporary ID if doesn't have one
                item._id = item._id || $modelTemp.next();

                item = arr || coll ? model.id( item._id ) : model;
                return item.rev();
            });

            return $q.all( promises ).then(function ( revs ) {
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
         * @returns {Promise}
         */
        function getAll ( model ) {
            return model.db.allDocs({
                include_docs: true
            }).then(function ( data ) {
                return data.rows.map(function ( item ) {
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

        return {
            remove: remove,
            set: set,
            extend: extend,
            getOne: getOne,
            getAll: getAll
        };
    }
}();