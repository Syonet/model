describe.only( "modelSync", function () {
    "use strict";

    var db, sync;

    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( $injector ) {
        db = $injector.get( "$modelDB" )( "__updates" );
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