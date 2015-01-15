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
}();