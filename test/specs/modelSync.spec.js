describe.only( "modelSync", function () {
    "use strict";

    var $q, $httpBackend, db, sync, model, req;

    beforeEach( module( "syonet.model", function ( $provide ) {
        $provide.decorator( "$modelRequest", function ( $q ) {
            return req = sinon.stub().returns( $q.when( true ) );
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
        var spy = sinon.spy();
        sync.on( "foo", spy );
        sync.emit( "foo", "bar" );

        // Event with listeners should call them
        expect( spy ).to.have.been.calledWith( "bar" );
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