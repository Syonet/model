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

    describe( ".clear()", function () {
        it( "should destroy every created DB", function () {
            var spy = sinon.spy();
            window.PouchDB.on( "destroyed", spy );

            // Create some DBs
            db( "foo" );
            db( "bar" );

            // Destroy them and then do the assertions
            return db.clear().then(function () {
                expect( spy ).to.be.calledWith( "modelDB.foo" );
                expect( spy ).to.be.calledWith( "modelDB.bar" );
                expect( spy ).to.be.calledWith( "modelDB.__updates" );
            }).finally( testHelpers.asyncDigest() );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".dbNamePrefix", function () {
        it( "should be the prefix of the model DB", function () {
            var promise;

            provider.dbNamePrefix = "model";
            promise = model( "foo" ).db.info().finally( testHelpers.asyncDigest() );

            return expect( promise ).to.eventually.have.property( "db_name", "model.foo" );
        });
    });
});