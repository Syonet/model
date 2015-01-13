!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "modelSync", modelSyncProvider );

    function modelSyncProvider ( $modelRequestProvider ) {
        var provider = this;

        provider.$get = function ( $q, $interval, $document, $modelRequest, $modelDB ) {
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
                        var doc = row.doc;

                        // Reconstitute model and try to send the request again
                        var promise = $modelRequest(
                            doc.model,
                            doc.method,
                            doc.data,
                            doc.options
                        );
                        promises.push( promise );
                    });

                    return $q.all( promises );
                }).then(function ( values ) {
                    clear();

                    // Don't emit if there were no resolved values
                    if ( values.length ) {
                        sync.emit( "success" );
                    }
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
             * @param   {Object} [options]  $modelRequest options
             * @returns {Promise}
             */
            sync.store = function ( url, method, data, options ) {
                return db.post({
                    model: url,
                    method: method,
                    data: data,
                    options: options
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

            /**
             * Create a schedule for synchronization runs.
             * Useful for hitting offline servers.
             *
             * @param   {Number} [delay] Number of milliseconds between each synchronization run.
             *                           If delay is smaller than the ping delay, then the delay
             *                           used is the ping delay.
             */
            sync.schedule = function ( delay ) {
                delay = Math.max( delay || $modelRequestProvider.pingDelay );

                sync.schedule.cancel();
                sync.$$schedule = $interval( sync, delay );
            };

            /**
             * Cancel a scheduled synchronization interval.
             */
            sync.schedule.cancel = function () {
                $interval.cancel( sync.$$schedule );
            };

            // When the page is back online, then we'll trigger an synchronization run
            $document.on( "online", sync );

            // Also create a default schedule
            sync.schedule();

            return sync;
        };

        return provider;
    }
}();