describe( "modelSync", function () {
    "use strict";

    var $q, $httpBackend, $interval, db, sync, model, reqProvider, req;

    beforeEach( module( "syonet.model", function ( $modelRequestProvider, $provide ) {
        reqProvider = $modelRequestProvider;

        $provide.decorator( "$modelRequest", function ( $q ) {
            return req = sinon.stub().returns( $q.when( true ) );
        });

        $provide.decorator( "$interval", function ( $delegate ) {
            return $interval = sinon.spy( $delegate );
        });
    }));

    beforeEach( inject(function ( $injector ) {
        testHelpers( $injector );

        $q = $injector.get( "$q" );
        $httpBackend = $injector.get( "$httpBackend" );
        db = $injector.get( "$modelDB" )( "__updates" );
        model = $injector.get( "model" );
        sync = $injector.get( "modelSync" );
    }));

    afterEach(function () {
        return db.destroy();
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

        return $q.all( stores ).then( sync ).then(function () {
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
        var stores = [
            sync.store( "/", "POST" ),
            sync.store( "/foo", "PATCH" )
        ];

        req.withArgs( "/foo", "PATCH" ).returns( $q.reject({
            status: 0
        }));

        return $q.all( stores ).then( sync ).then(function () {
            return expect( db.allDocs() ).to.eventually.have.property( "total_rows", 1 );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".schedule( delay )", function () {
        it( "should use ping delay as the minimum delay between calls", function () {
            sync.schedule( 30 );
            expect( $interval ).to.have.been.calledWith( sync, reqProvider.pingDelay );
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