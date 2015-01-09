!function () {
    "use strict";

    angular.module( "syonet.model" ).factory( "modelSync", modelSyncService );

    function modelSyncService ( $q, $modelRequest, $modelDB ) {
        var UPDATE_DB_NAME = "__updates";
        var db = $modelDB( UPDATE_DB_NAME );

        function sync () {
            if ( sync.$$running ) {
                return;
            }

            sync.$$running = true;
            return db.allDocs({
                include_docs: true
            }).then(function ( docs ) {
                var promises = [];

                docs.rows.forEach(function ( row ) {
                    // Reconstitute model and try to send the request again
                    var promise = $modelRequest(
                        row.doc.model,
                        row.doc.method,
                        row.doc.data
                    );
                    promises.push( promise );
                });

                return $q.all( promises );
            }).then(function () {
                clear();
                sync.emit( "success" );
            }, function ( err ) {
                clear();

                // Pass the error to the callbacks whatever it is
                sync.emit( "error", err );
            });

            function clear () {
                sync.$$running = false;
            }
        }

        sync.$$events = {};

        /**
         * Store a combination of model/method/data.
         *
         * @param   {String} url        The model URL
         * @param   {String} method     The HTTP method
         * @param   {Object} [data]     Optional data
         * @returns {Promise}
         */
        sync.store = function ( url, method, data ) {
            return db.post({
                model: url,
                method: method,
                data: data
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

        return sync;
    }
}();