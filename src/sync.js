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
                    // Order requests by their date of inclusion
                    docs.rows.sort(function ( a, b ) {
                        var date1 = new Date( a.doc.date ).getTime();
                        var date2 = new Date( b.doc.date ).getTime();
                        return date1 - date2;
                    });

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
                        var promise = $q.when();
                        sync.emit( "error", err, row );

                        // We'll only remove requests which failed in the server.
                        // Aborted/timed out requests will stay in our cache.
                        if ( err.status !== 0 ) {
                            sentReqs.push({
                                _id: row.id,
                                _rev: row.value.rev
                            });

                            // If we have docs, we'll try to roll them back to their previous
                            // versions
                            if ( doc.db && doc.docs ) {
                                promise = rollback( doc );
                            }
                        }

                        return promise.then(function () {
                            return $q.reject( err );
                        });
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
             * @param   {Model|String} model    The model or model URL
             * @param   {String} method         The HTTP method
             * @param   {Object} [data]         Optional data
             * @param   {Object} [options]      $modelRequest options
             * @returns {Promise}
             */
            sync.store = function ( model, method, data, options ) {
                var promise;
                var isArr = angular.isArray( data );
                var doc = {
                    model: typeof model === "string" ? model : model.toURL(),
                    method: method,
                    data: data,
                    options: options,
                    date: new Date()
                };

                // Optional - store current rev so we can rollback later if request fails
                if ( model.db && !$modelRequest.isSafe( method ) && data ) {
                    data = isArr ? data : [ data ];
                    promise = data.map(function ( item ) {
                        return $q.all({
                            _id: item._id,
                            _rev: model.id( item._id ).rev()
                        });
                    });

                    doc.db = model._path.name;
                    promise = $q.all( promise ).then(function ( docs ) {
                        doc.docs = docs;
                    });
                } else {
                    promise = $q.when();
                }

                return promise.then(function () {
                    return db.post( doc );
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

            // -------------------------------------------------------------------------------------

            /**
             * Rollback every item stored in an synchronization document.
             *
             * @param   {Object} doc
             * @return  {Promise}
             */
            function rollback ( doc ) {
                var db = $modelDB( doc.db );
                var promises = doc.docs.map(function ( item ) {
                    // Get the previous revisions of this item
                    return db.get( item._id, {
                        revs: true
                    }).then(function ( data ) {
                        var revs = data._revisions;

                        // Find the revision of this request
                        var revIndex = revs.ids.indexOf( item._rev.replace( /^\d+-/, "" ) );

                        // Does this item existed before? If not, we'll remove it from the DB.
                        if ( !~revIndex ) {
                            return remove();
                        }

                        return next();

                        // -------------------------------------------------------------------------

                        function remove () {
                            return db.remove( data._id, data._rev );
                        }

                        function next () {
                            // Increase 1, so we'll have the previous revision of the current one
                            revIndex++;

                            // If there's no next revision, we'll simply remove the item
                            if ( !revs.ids[ revIndex ] ) {
                                return remove();
                            }

                            // Build the revision
                            item._rev = ( revs.start - revIndex ) + "-" + revs.ids[ revIndex ];

                            // Get the data of the revision that we'll rollback to
                            return db.get( item._id, {
                                rev: item._rev
                            }).then(function ( atRev ) {
                                if ( atRev._deleted ) {
                                    return next();
                                }

                                // And finally overwrite it.
                                atRev._rev = data._rev;

                                return db.put( atRev );
                            });
                        }
                    });
                });

                return $q.all( promises );
            }
        };

        return provider;
    }
}();