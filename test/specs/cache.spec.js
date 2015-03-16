describe( "$modelCache", function () {
    "use strict";

    var db, model, cache;
    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( $injector ) {
        model = $injector.get( "model" );
        cache = $injector.get( "$modelCache" );
        db = $injector.get( "$modelDB" );
    }));

    afterEach(function () {
        return db.clear();
    });

    describe( ".set()", function () {
        it( "should create documents when they don't exist", function () {
            var foo = model( "foo" );
            return cache.set( foo, {
                _id: "foo"
            }).then(function () {
                return expect( foo.db.get( "foo" ) ).to.be.fulfilled;
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
                return expect( foo.db.get( "foo" ) ).to.eventually.have.property( "bar", "baz" );
            });
        });

        it( "should do bulk operations", function () {
            var foo = model( "foo" );
            return cache.set( foo, [{
                _id: "foo"
            }, {
                _id: "bar"
            }]).then(function () {
                return expect( foo.db.get( "foo" ) ).to.be.fulfilled;
            }).then(function () {
                return expect( foo.db.get( "bar" ) ).to.be.fulfilled;
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

        it( "should store parents", function () {
            var baz = model( "foo" ).id( "bar" ).model( "baz" ).id( "qux" );
            return cache.set( baz, {
                _id: "qux"
            }).then(function ( doc ) {
                expect( doc.$parents ).to.eql({
                    foo: {
                        $id: "bar",
                        $parents: {}
                    }
                });
            });
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
                return foo.db.get( "foo" );
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
                return expect( foo.db.get( "foo" ) ).to.be.fulfilled;
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
        it( "should remove all documents passed", function () {
            var foo = model( "foo" );
            return cache.set( foo, [{
                _id: "foo"
            }, {
                _id: "bar"
            }]).then(function () {
                return cache.remove( foo, {
                    _id: "foo"
                });
            }).then(function () {
                // 1 item is the management data, never removed
                return expect( foo.db.allDocs() ).to.eventually.have.property( "total_rows", 2 );
            });
        });

        it( "should remove all documents from DB if no data passed", function () {
            var foo = model( "foo" );
            return cache.set( foo, {
                _id: "foo"
            }).then(function () {
                return cache.remove( foo );
            }).then(function () {
                // 1 item is the management data, never removed
                return expect( foo.db.allDocs() ).to.eventually.have.property( "total_rows", 1 );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".getOne()", function () {
        it( "should return cached document", function () {
            var foobar = model( "foo" ).id( "bar" );
            return cache.set( foobar, {
                _id: "bar",
                foo: "bar"
            }).then( function () {
                return expect( cache.getOne( foobar ) ).to.eventually.have.property( "foo", "bar" );
            });
        });

        it( "should return cached document with same parents", function () {
            var baz = model( "foo" ).id( "bar" ).model( "baz" );
            return cache.set( baz, {
                _id: "qux"
            }).then( function () {
                var promise = cache.getOne( baz );
                return expect( promise ).to.eventually.have.property( "$parents" ).and.eql({
                    foo: {
                        $id: "bar",
                        $parents: {}
                    }
                });
            });
        });

        it( "should reject whwen no document with same parents exist", function () {
            var m1 = model( "foo" ).id( "bar" ).model( "baz" );
            var m2 = model( "foo" ).id( "barbaz" ).model( "baz" );
            return cache.set( m1, {
                _id: "qux"
            }).then(function () {
                return expect( cache.getOne( m2 ) ).to.be.rejected;
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".getAll()", function () {
        var $q;

        beforeEach( inject(function ( _$q_ ) {
            $q = _$q_;
        }));

        it( "should return all cached documents", function () {
            var foo = model( "foo" );
            return cache.set( foo, [{
                _id: "bar"
            }, {
                _id: "baz"
            }]).then(function () {
                return expect( cache.getAll( foo ) ).to.eventually.have.length( 2 );
            });
        });

        it( "should not return protected documents", function () {
            var foo = model( "foo" );
            sinon.stub( foo.db, "info" ).returns( $q.when({
                update_seq: 1000
            }));

            return cache.compact( foo ).then(function () {
                return expect( cache.getAll( foo ) ).to.eventually.have.length( 0 );
            });
        });

        it( "should return cached documents with same parents", function () {
            var baz = model( "foo" ).id( "bar" ).model( "baz" );
            return cache.set( baz, [{
                _id: "qux"
            }, {
                _id: "quux"
            }]).then(function () {
                var baz = model( "baz" );
                return cache.set( baz, [{
                    _id: "xyz"
                }]);
            }).then(function () {
                var promise = cache.getAll( baz );
                return expect( promise ).to.eventually.have.length( 2 );
            });
        });

        it( "should return proper 'touched' value for different parents", function () {
            var baz = model( "foo" ).id( "bar" ).model( "baz" );
            return cache.set( baz, [{
                _id: "qux"
            }]).then(function () {
                var promise = cache.getAll( model( "baz" ) );
                return expect( promise ).to.eventually.have.property( "touched", false );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".compact()", function () {
        var $q;

        beforeEach( inject(function ( _$q_ ) {
            $q = _$q_;
        }));

        it( "should compact each 1000 updates to the DB", function () {
            var foo = model( "foo" );
            var spy = sinon.spy( foo.db, "compact" );

            sinon.stub( foo.db, "info" ).returns( $q.when({
                update_seq: 1000
            }));

            return cache.compact( foo ).then(function () {
                return cache.compact( foo );
            }).then(function () {
                expect( spy ).to.have.been.calledOnce;
            });
        });

        it( "should compact each 1000 updates to the DB", function () {
            var foo = model( "foo" );
            var spy = sinon.spy( foo.db, "compact" );

            sinon.stub( foo.db, "info" ).returns( $q.when({
                update_seq: 999
            }));

            return cache.compact( foo ).then(function () {
                expect( spy ).to.not.have.been.called;
            });
        });
    });
});