!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelCache", cacheService );

    function cacheService ( $q ) {
        /**
         * Remove every item from the DB of the passed model.
         *
         * @param   {Model} model
         * @returns {Promise}
         */
        function remove ( model ) {
            var db = model._db;
            return db.allDocs().then(function ( docs ) {
                // Modify each document and set the _deleted key
                docs = docs.rows.map(function ( row ) {
                    return {
                        _id: row.id,
                        _rev: row.value.rev,
                        _deleted: true
                    };
                });

                // If we don't have any document, let's not do anything
                return docs.length ? db.bulkDocs( docs ) : null;
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

                return model._db.bulkDocs( data );
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
            var db = model._db;
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
}();