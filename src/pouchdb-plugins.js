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
}();