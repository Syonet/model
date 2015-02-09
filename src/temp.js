!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelTemp", tempService );

    function tempService ( $modelConfig, $modelDB ) {
        var db = $modelDB( "__temp" );
        var api = {
            regex: /\$\$temp\d+/g
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
}();