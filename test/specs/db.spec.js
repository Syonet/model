describe( "$modelDB", function () {
    "use strict";

    var provider, db, model;

    beforeEach( module( "syonet.model", function ( $provide, $modelDBProvider ) {
        provider = $modelDBProvider;
    }));

    beforeEach( inject(function ( $injector ) {
        db = $injector.get( "$modelDB" );
        model = $injector.get( "model" );
    }));

    it( "should not duplicate DB instances with same name", function () {
        var foo1 = db( "foo" );
        var foo2 = db( "foo" );

        expect( foo1 ).to.equal( foo2 );
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".dbNamePrefix", function () {
        it( "should be the prefix of the model DB", function () {
            var promise;

            provider.dbNamePrefix = "model";
            promise = model( "foo" )._db.info();

            return expect( promise ).to.eventually.have.property( "db_name", "model.foo" );
        });
    });
});