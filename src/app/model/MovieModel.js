define(function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');
  var Basic = require('app/model/Model');

  var Movie,
    Mdl = Core.Class.Model,
    lcStorage = Core.localStorage;

  function Movie() {
  }

  Movie.prototype.movieList = new Mdl({
    request: function(data,callback){
      RequestHelper.request(Actions.movieList,data,callback,this);
    }
  });
  //Movie.prototype.movieList = new Mdl({ //create movieList
  //  request: function (data){
  //    RequestHelper.JSONP({
  //      action: Actions.movieList+'?id='+data.id+'&callback=afterRequestMovieList'
  //    });
  //  }
  //});

  window.afterRequestMovieList = function(data){  //invoke(call) mycallback method
    Movie.movieList.set(data);
  }
  Movie = new Movie;

  return Movie;
});
