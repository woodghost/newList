define(function (require, exports, module) {
  var Actions = require('../resources/Actions');
  var BasicModel = require('app/model/Model');
  var MovieModel = require('app/model/MovieModel');
  var BasicView = require('app/view/View');
  var MovieListView = require('app/view/MovieListView');

  function MovieListController(){
    this.models = {
      Basic: BasicModel,
      Movie: MovieModel
    }
    this.views = {
      Basic: BasicView,
      MovieList: MovieListView
    }

    var CTRL = this,
      viewNames,
      curViewId = '',
      viewMovieListQuery = {};

    viewNames = {
      'movielist': 'MovieList'
    }
    Core.Router.subscribe('/movielist/', onViewMovieList, unViewMovieList);

    //统计视图
    Core.Event.on('analyticsCurView', analyticsCurView);
    //forwardMovieList
    Core.Event.on('forwardMovieList', forwardMovieList);


    function unViewMovieList() {
      CTRL.views.MovieList.hide();
    }

    function onViewMovieList(req){
      curViewId = 'movielist';
      viewMovieListQuery = req.query;
      CTRL.views.MovieList.show();
      CTRL.models.Movie.movieList.request({id:'5622309ccee3c65f0fbdfd45'});

      //追加统计
      analyticsCurView();
    }

    function forwardMovieList(arg){
      Core.Router.forward('/movielist/' + (arg || ''));
    }

    function analyticsCurView(params, title) {
      if (!Core.Router.currentMatch(['/movielist/'])) {
        return;
      }
      params = params ? ('&' + params) : '';
      title = title || viewNames[curViewId] || document.title;

      Core.Event.trigger('analytics', 'viewid=' + curViewId + params, title);
    }
  }
  return new MovieListController;
});
