describe( "Model Provider", function () {
    "use strict";

    var $rootScope, $httpBackend, provider, model;
    var expect = chai.expect;

    angular.module( "provider", [ "syonet.model" ], function ( modelProvider ) {
        provider = modelProvider;
    });

    beforeEach( module( "provider" ) );
    beforeEach( inject(function ( $injector ) {
        $rootScope = $injector.get( "$rootScope" );
        $httpBackend = $injector.get( "$httpBackend" );
        model = $injector.get( "model" );

        this.flush = function () {
            setTimeout(function () {
                $httpBackend.flush( null );
            });
        };
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );
    });

    describe( ".dbNamePrefix", function () {
        it( "should be the prefix of the model DB", function () {
            var promise;

            provider.dbNamePrefix = "model";
            promise = model( "foo" )._db.info();

            return expect( promise ).to.eventually.have.property( "db_name", "model.foo" );
        });
    });

    // ---------------------------------------------------------------------------------------------

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
            this.flush();

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