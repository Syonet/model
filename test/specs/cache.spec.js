describe( "$modelCache", function () {
    "use strict";

    var model, cache;
    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( $injector ) {
        model = $injector.get( "model" );
        cache = $injector.get( "$modelCache" );
    }));

    describe( ".set()", function () {
        it( "should create documents when they don't exist", function () {
            var foo = model( "foo" );
            return cache.set( foo, {
                _id: "foo"
            }).then(function () {
                return expect( foo._db.get( "foo" ) ).to.be.fulfilled;
            });
        });

        it( "should update existing documents", function () {
            var foo = model( "foo" );
            var data = {
                _id: "foo"
            };

            return cache.set( foo, data ).then(function () {
                data.bar = "baz";
                return cache.set( foo, data );
            }).then(function () {
                return expect( foo._db.get( "foo" ) ).to.eventually.have.property( "bar", "baz" );
            });
        });

        it( "should do bulk operations", function () {
            var foo = model( "foo" );
            return cache.set( foo, [{
                _id: "foo"
            }, {
                _id: "bar"
            }]).then(function () {
                return expect( foo._db.get( "foo" ) ).to.be.fulfilled;
            }).then(function () {
                return expect( foo._db.get( "bar" ) ).to.be.fulfilled;
            });
        });

        it( "should return the updated documents", function () {
            var foo = model( "foo" );
            var data = [{
                _id: "foo",
                foo: "bar"
            }];

            return expect( cache.set( foo, data ) ).to.eventually.have.deep.property(
                "[0].foo",
                "bar"
            );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".extend()", function () {
        it( "should extend existing documents", function () {
            var foo = model( "foo" );
            var data = {
                _id: "foo",
                bar: "baz"
            };

            return cache.set( foo, data ).then(function () {
                data.bar = "barbaz";
                data.baz = true;
                return cache.extend( foo, data );
            }).then(function () {
                return foo._db.get( "foo" );
            }).then(function ( doc ) {
                expect( doc ).to.have.property( "bar", "barbaz" );
                expect( doc ).to.have.property( "baz", true );
            });
        });

        it( "should create documents when they don't exist", function () {
            var foo = model( "foo" );
            return cache.extend( foo, {
                _id: "foo"
            }).then(function () {
                return expect( foo._db.get( "foo" ) ).to.be.fulfilled;
            });
        });

        it( "should return extended data", function () {
            var foo = model( "foo" );
            var data = {
                _id: "foo",
                bar: "baz"
            };

            return cache.set( foo, data ).then(function () {
                data.bar = "barbaz";
                data.baz = true;
                return expect( cache.extend( foo, data ) ).to.eventually.have.property(
                    "bar",
                    "barbaz"
                );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".remove()", function () {
        it( "should remove all documents from DB", function () {
            var foo = model( "foo" );
            return cache.set( foo, {
                _id: "foo"
            }).then(function () {
                return cache.remove( foo );
            }).then(function () {
                return expect( foo._db.allDocs() ).to.eventually.have.property( "total_rows", 0 );
            });
        });
    });
});