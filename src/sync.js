!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "modelSync", modelSyncProvider );

    function modelSyncProvider ( $modelRequestProvider ) {
        var provider = this;

        provider.$get = function (
            $q,
            $interval,
            $document,
            $modelRequest,
            $modelDB,
            $modelEventEmitter
        ) {
            var UPDATE_DB_NAME = "__updates";
            var db = $modelDB( UPDATE_DB_NAME );

            function sync () {
                // Will store the requests sent, so they can be removed later
                var sentReqs = [];

                if ( sync.$$running ) {
                    return;
                }

                sync.$$running = true;
                return db.allDocs({
                    include_docs: true
                }).then(function ( docs ) {
                    return processRequest( docs.rows );
                }).then(function () {
                    // Don't emit if there were no sent requests
                    if ( sentReqs.length ) {
                        sync.emit( "success" );
                    }
                }).finally( clear );

                function processRequest ( rows ) {
                    var doc;
                    var row = rows.shift();

                    if ( !row ) {
                        return $q.when();
                    }

                    doc = row.doc;

                    // Reconstitute model and try to send the request again
                    return $modelRequest(
                        doc.model,
                        doc.method,
                        doc.data,
                        doc.options
                    ).then(function ( response ) {
                        sentReqs.push({
                            _id: row.id,
                            _rev: row.value.rev
                        });

                        sync.emit( "response", response, doc );
                        return processRequest( rows );
                    }, function ( err ) {
                        // We'll only remove requests which failed in the server.
                        // Aborted/timed out requests will stay in our cache.
                        if ( err.status !== 0 ) {
                            sentReqs.push({
                                _id: row.id,
                                _rev: row.value.rev
                            });
                        }

                        sync.emit( "error", err, row );
                        return $q.reject( err );
                    });
                }

                function clear () {
                    sync.$$running = false;

                    sentReqs.forEach(function ( doc ) {
                        doc._deleted = true;
                    });
                    return db.bulkDocs( sentReqs );
                }
            }

            sync = $modelEventEmitter( sync );

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