describe( "modelProvider", function () {
    "use strict";

    var $rootScope, $httpBackend, provider, model;
    var expect = chai.expect;

    beforeEach( module( "syonet.model", function ( $provide, modelProvider ) {
        provider = modelProvider;

        $provide.decorator( "$http", function ( $delegate ) {
            return sinon.spy( $delegate );
        });
    }));

    beforeEach( inject(function ( $injector ) {
        $rootScope = $injector.get( "$rootScope" );
        $httpBackend = $injector.get( "$httpBackend" );
        model = $injector.get( "model" );

        testHelpers( $injector );
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );
    });

    describe( ".idFieldHeader", function () {
        it( "should be used to determine the ID fields in the response headers", function () {
            var promise;

            provider.idFieldHeader = "X-Id";

            $httpBackend.expectGET( "/foo/bar" ).respond( 200, {
                baz: "qux"
            }, {
                "X-Id": "baz"
            });
            promise = model( "foo" ).get( "bar" );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.property( "_id", "qux" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".base()", function () {
        it( "should be used as the base URL for requests", function () {
            provider.base( "http://foo/api" );
            expect( model( "foo" ).toURL() ).to.equal( "http://foo/api/foo" );
        });

        it( "should return the base URL for requests", function () {
            expect( provider.base() ).to.equal( "/" );
        });
    });

});