describe( "$modelConfig", function () {
    "use strict";

    var cfg;
    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( $injector ) {
        cfg = $injector.get( "$modelConfig" );
    }));

    afterEach(function () {
        localStorage.clear();
    });

    describe( ".get()", function () {
        it( "should return current configuration", function () {
            localStorage.setItem( "$model.__config", JSON.stringify( "foo" ) );
            expect( cfg.get() ).to.equal( "foo" );
        });

        it( "should return empty object if no config available", function () {
            expect( cfg.get() ).to.eql( {} );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".set( val )", function () {
        it( "should persist value on localStorage stringified", function () {
            cfg.set({});
            expect( localStorage.getItem( "$model.__config" ) ).to.equal( "{}" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".clear()", function () {
        it( "should clear the current configuration", function () {
            cfg.set({});
            cfg.clear();
            expect( localStorage.getItem( "$model.__config" ) ).to.not.be.ok;
        });
    });
});