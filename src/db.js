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

        provider.$get = function ( pouchDB ) {
            var instances = {};

            /**
             * Return a PouchDB instance with a standardized name.
             *
             * @param   {String} name
             * @returns {PouchDB}
             */
            return function ( name ) {
                if ( !instances[ name ] ) {
                    instances[ name ] = pouchDB( provider.dbNamePrefix + "." + name );
                }

                return instances[ name ];
            };
        };

        return provider;
    }
}();