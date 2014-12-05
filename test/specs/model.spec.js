describe( "Model", function () {
    "use strict";

    var model;
    var expect = chai.expect;

    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( $injector ) {
        model = $injector.get( "model" );
    }));

    it( "should be created with provided path", function () {
        var foo = model( "foo" );

        expect( foo._pathSegment ).to.eql({ name: "foo" });
        expect( foo._path ).to.eql([ foo._pathSegment ]);
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".id()", function () {
        it( "should return the ID", function () {
            var foo = model( "foo" ).id( "bar" );
            expect( foo.id() ).to.equal( "bar" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".id( value )", function () {
        it( "should be chainable", function () {
            var foo = model( "foo" );
            expect( foo.id( "bar" ) ).to.equal( foo );
        });

        it( "should set the ID into the path segment", function () {
            var foo = model( "foo" ).id( "bar" );
            expect( foo._pathSegment ).to.have.property( "id", "bar" );
        });
    });
});