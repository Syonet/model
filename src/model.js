!function () {
    "use strict";

    angular.module( "syonet.model" ).provider( "model", modelProvider );

    function modelProvider () {
        this.apiBasePath = "/api";

        this.$get = function ( Restangular, PouchDB ) {
            function createRestPath ( path, collection ) {
                return path.reduce(function ( memo, next, i ) {
                    var last = path.length === i + 1;
                    if ( !next.id || ( last && collection ) ) {
                        return memo.all( next.name );
                    }

                    return memo.one( next.name, next.id );
                }, Restangular );
            }

            function Model ( name ) {
                if ( !( this instanceof Model ) ) {
                    return new Model( name );
                }

                this._pathSegment = {
                    name: name
                };
                this._path = [ this._pathSegment ];
            }

            Model.prototype.id = function ( id ) {
                if ( id === undefined ) {
                    return this._pathSegment.id;
                }

                this._pathSegment.id = id;
                return this;
            };

            Model.prototype.model = function ( name ) {
                var other;

                if ( !name ) {
                    throw new Error( "Model name must be supplied" );
                }

                other = new Model( name );
                other._path = this_path.concat( other._path );

                return other;
            };

            Model.prototype.list = function () {
                return createRestPath( this._path ).getList();
            };

            Model.prototype.get = function () {
                return createRestPath( this._path ).get();
            };

            Model.prototype.save = function () {
                return createRestPath( this._path ).post();
            };

            Model.prototype.remove = function () {
                return createRestPath( this._path ).remove();
            };

            return Model;
        };

        return this;
    }
}();