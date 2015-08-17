describe( "modelSync", function () {
    "use strict";

    var $q, $httpBackend, $interval, $modelDB, db, sync, model, pingProvider, req;

    beforeEach( module( "syonet.model", function ( $modelPingProvider, $provide ) {
        pingProvider = $modelPingProvider;

        $provide.decorator( "$modelRequest", function ( $delegate, $q ) {
            req = sinon.stub().returns( $q.when( true ) );
            req.isSafe = $delegate.isSafe;
            return req;
        });

        $provide.decorator( "$interval", function ( $delegate ) {
            return $interval = sinon.spy( $delegate );
        });
    }));

    beforeEach( inject(function ( $injector ) {
        testHelpers( $injector );

        $q = $injector.get( "$modelPromise" );
        $httpBackend = $injector.get( "$httpBackend" );
        $modelDB = $injector.get( "$modelDB" );
        db = $modelDB( "__updates" );
        model = $injector.get( "model" );
        sync = $injector.get( "modelSync" );
    }));

    afterEach(function () {
        localStorage.clear();
        return $modelDB.clear();
    });

    it( "should have an event emitter interface", function () {
        expect( sync.on ).to.be.a( "function" );
        expect( sync.emit ).to.be.a( "function" );
    });

    it( "should retrigger each persisted request and trigger success event", function () {
        var spy = sinon.spy( sync, "emit" );
        var stores = [
            sync.store( "/", "POST" ),
            sync.store( "/foo", "PATCH" )
        ];

        testHelpers.digest( true );
        return $q.all( stores ).then( sync ).then(function () {
            expect( req ).to.have.been.calledWith( "/", "POST" );
            expect( req ).to.have.been.calledWith( "/foo", "PATCH" );
            expect( spy ).to.have.been.calledWith( "success" );
        });
    });

    it( "should retrigger with provided options", function () {
        var options = {
            auth: {
                username: "foo",
                password: "bar"
            }
        };

        testHelpers.digest( true );
        return sync.store( "/", "POST", null, options ).then( sync ).then(function () {
            expect( req ).to.have.been.calledWith( "/", "POST", null, options );
        });
    });

    it( "should trigger error event with the promise rejection cause", function () {
        var spy = sinon.spy( sync, "emit" );
        var stores = [
            sync.store( "/", "POST" ),
            sync.store( "/foo", "PATCH" )
        ];

        // Make the request service return a rejected promise
        req.returns( $q.reject( "foo" ) );

        testHelpers.digest( true );
        return $q.all( stores ).then( sync ).catch( sinon.spy() ).then(function () {
            expect( spy ).to.have.been.calledWith( "error", "foo" );
        });
    });

    it( "should not allow two synchronizations to overlap", function () {
        expect( sync().then ).to.be.a( "function" );
        expect( sync() ).to.be.undefined;
    });

    it( "should not emit success event if no request was stored", function () {
        var spy = sinon.spy( sync, "emit" );
        return sync().then(function () {
            expect( spy ).to.not.have.been.called;
        });
    });

    it( "should have a default scheduled synchronization interval", function () {
        expect( sync.$$schedule ).to.be.defined;
    });

    it( "should watch on online events", inject(function ( $document ) {
        expect( sync.$$running ).to.not.be.ok;
        $document.triggerHandler( "online" );
        expect( sync.$$running ).to.be.ok;
    }));

    it( "should remove sent requests", function () {
        req.withArgs( "/foo", "PATCH" ).returns( $q.reject({
            status: 0
        }));

        testHelpers.digest( true );
        return sync.store( "/", "POST" ).then(function () {
            return sync.store( "/foo", "PATCH" );
        }).then( sync ).catch( sinon.spy() ).then(function () {
            return expect( db.allDocs() ).to.eventually.have.property( "total_rows", 1 );
        });
    });

    it( "should execute requests in series", function () {
        var store = sync.store( "/", "POST" );

        testHelpers.digest( true );
        return store.then(function () {
            return sync.store( "/foo", "DELETE" );
        }).then( sync ).then(function () {
            var req1 = req.withArgs( "/", "POST" );
            var req2 = req.withArgs( "/foo", "DELETE" );

            expect( req1 ).to.have.been.calledBefore( req2 );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( "on rollback", function () {
        it( "should restore documents to their previous version", function () {
            var foo = model( "foo" );
            var data = [{
                _id: 1,
                id: 1,
                foo: "bar"
            }, {
                _id: 2,
                id: 2,
                foo: "barbaz"
            }];
            req.returns( $q.when( data ) );

            return foo.create( data ).then(function () {
                // Modify something and then update these docs
                data[ 0 ].foo += "1";
                data[ 1 ].foo += "1";

                req.returns( $q.reject({
                    status: 0
                }));

                return foo.update( data );
            }).then(function () {
                // Must be a non-zero error
                req.returns( $q.reject({
                    status: 500
                }));

                return sync();
            }).then( null, sinon.spy() ).then(function () {
                return foo.db.allDocs({
                    include_docs: true,
                    keys: [ "1", "2" ]
                });
            }).then(function ( docs ) {
                expect( docs.rows ).to.have.deep.property( "[0].doc.foo", "bar" );
                expect( docs.rows ).to.have.deep.property( "[1].doc.foo", "barbaz" );
            });
        });

        it( "should remove items with no previous version", function () {
            var foo = model( "foo" );
            req.returns( $q.reject({
                status: 0
            }));

            return foo.create({
                foo: "bar"
            }).then(function () {
                // Must be a non-zero error
                req.returns( $q.reject({
                    status: 500
                }));

                return sync();
            }).then( null, sinon.spy() ).then(function () {
                var promise = foo.db.allDocs({
                    include_docs: true
                });

                // 1 item is the management data, never removed
                return expect( promise ).to.eventually.have.property( "total_rows", 1 );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".schedule( delay )", function () {
        it( "should use ping delay as the minimum delay between calls", function () {
            sync.schedule( 30 );
            expect( $interval ).to.have.been.calledWith( sync, pingProvider.pingDelay );
        });

        it( "should cancel the other schedule", function () {
            var spy = sinon.spy( sync.schedule, "cancel" );

            sync.schedule();
            expect( spy ).to.have.been.called;
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".schedule.cancel()", function () {
        it( "should cancel the scheduled interval", function () {
            var spy = sinon.spy( $interval, "cancel" );

            sync.schedule.cancel();
            expect( spy ).to.have.been.calledWith( sync.$$schedule );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".store( url, method, data )", function () {
        it( "should persist data into updates DB", function () {
            testHelpers.digest( true );
            return sync.store( "/", "GET" ).then(function () {
                return db.allDocs({
                    include_docs: true
                });
            }).then(function ( docs ) {
                var doc = docs.rows[ 0 ].doc;

                expect( doc.model ).to.equal( "/" );
                expect( doc.method ).to.equal( "GET" );
            });
        });
    });
});