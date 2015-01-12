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