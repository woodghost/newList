define(function (require, exports, module) {
  var BasicView = require('app/view/View');
  var BasicModel = require('app/model/Model');
  var MovieModel = require('app/model/MovieModel');

  function MovieListView(){
    this.models = {
      Basic: BasicModel,
      Movie: MovieModel
    }
    this.viewCls = 'view-movielist';
    this._BasicView = BasicView;

    var VIEW = this,
      isApp = Core.NativeBridge.isApp(),
      Tpl, els,
      tap = VIEW._BasicView.tapEvent;

    //model listeners
    VIEW.models.Movie.movieList.updated(render);  //add updated method

    function initEls() {
      if(els){return;}
      var main = VIEW._BasicView.getView(VIEW.viewCls);
      els = {
        main: main,
        movieList: main.find('.movie-list')  //find class .movie-list
      }
      bindEvent();
    }//end initEls
    function initTpls(){
      if(Tpl){return;}
      Tpl = Tpl || VIEW._BasicView.getTemplates(VIEW.viewCls);
    }
    function initResources() {
      initEls();
      initTpls();
    }
    this.getEls = function () {
      initEls();
      return els;
    }
    this.getTpls = function(){
      initTpls();
      return Tpl;
    }
    function bindEvent() {
      els.movieList.on(tap, '.item>header', function(){
        Core.Event.trigger('toggleTextSectionExpand',this.parentNode);
      });


    }//end bindEvent

    this.show = function () {
      initResources();

      Core.Event.trigger('trigerAnimate',els.main);
      VIEW._BasicView.show(VIEW.viewCls);
    }
    this.hide = function () {
      if (!els) {
        return;
      }
    }
    function render(data) {
      initResources();
      data = data || VIEW.models.Movie.movieList.get();   // 1. data =  2. get() method.
      var list = [];
      //data = data.data.schemata;
      data.data.schemata.forEach(function(val){
        var d = {};
        d['title'] = val.name;
        d['desc'] = val.title;
        val.child.forEach(function(val){
          d[val.name] = val.title;    //name:name    title:value
        });
        list.push(Tpl.movieList(d));
        //console.log(d);
      });
      els.movieList.html( list.join('') );


    }//end render

  }//end View
  return new MovieListView();
});
