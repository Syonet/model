describe( "$modelDB", function () {
    "use strict";

    var provider, model;

    beforeEach( module( "syonet.model", function ( $provide, $modelDBProvider ) {
        provider = $modelDBProvider;
    }));

    beforeEach( inject(function ( $injector ) {
        model = $injector.get( "model" );
    }));

    describe( ".dbNamePrefix", function () {
        it( "should be the prefix of the model DB", function () {
            var promise;

            provider.dbNamePrefix = "model";
            promise = model( "foo" )._db.info();

            return expect( promise ).to.eventually.have.property( "db_name", "model.foo" );
        });
    });
});