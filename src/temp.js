!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "$modelTemp", tempService );

    function tempService ( $modelConfig, $modelDB ) {
        var db = $modelDB( "__temp" );

        /**
         * Generate the next temporary ID
         *
         * @returns {Number}
         */
        db.next = function () {
            var cfg = $modelConfig.get();
            cfg.tempID = ( cfg.tempID || 0 ) + 1;
            $modelConfig.set( cfg );

            return cfg.tempID;
        };

        return db;
    }
}();