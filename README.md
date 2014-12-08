# Model [![Build Status](https://img.shields.io/travis/Syonet/model.svg?style=flat-square)](https://travis-ci.org/Syonet/model)
Angular.js RESTful API with fallback to PouchDB when offline.

## Usage
Inject `syonet.model` module into your app:

```javascript
angular.module( "app", [ "syonet.model" ] );
```

Then, inject the `model` service in any controller:

```javascript
angular.module( "app" ).controller( "MyController", function ( model ) {
    model( "foo" ).id( "bar" ).save({
        baz: "qux",
        creationDate: new Date()
    }).then(function ( document ) {
        // Document is now persisted!
        console.log( document );
    });
});
```

## License
MIT