describe( "PouchDB plugins", function () {
    "use strict";

    var db;

    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( $injector, _pouchDB_ ) {
        testHelpers( $injector );
        db = _pouchDB_( "foo" );
    }));

    afterEach(function () {
        return db.destroy();
    });

    describe( ".patch()", function () {
        it( "should extend existing document with passed data", function () {
            return db.put({
                foo: "bar"
            }, "foobar" ).then(function () {
                return db.patch({
                    foo: "barbaz"
                }, "foobar" );
            }).then(function () {
                return expect( db.get( "foobar" ) ).to.eventually.have.property( "foo", "barbaz" );
            });
        });

        it( "should reject if document doesn't exist", function () {
            return expect( db.patch( {}, "xyz" ) ).to.be.rejected;
        });
    });
});