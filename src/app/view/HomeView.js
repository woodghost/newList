define(function (require, exports, module) {
  var BasicView = require('app/view/View');
  var BasicModel = require('app/model/Model');
  var UserModel = require('app/model/UserModel');


  function HomeView() {
    this.models = {
      Basic: BasicModel,
      User: UserModel
    }
    this.viewCls = 'view-home';
    this._BasicView = BasicView;

    var VIEW = this,
      isApp = Core.NativeBridge.isApp(),
      Tpl, els,
      tap = VIEW._BasicView.tapEvent;

    //model listeners
    VIEW.models.User.userList.updated(render);


    function initEls() {
      if(els){return;}
      var main = VIEW._BasicView.getView(VIEW.viewCls);
      els = {
        main: main,
        userList: main.find('.user-list')
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

    }//end bindEvent

    this.show = function () {
      initResources();

      if (!els.main.hasClass('show')) {
        Core.Event.trigger('trigerAnimate', els.main);
        VIEW._BasicView.show(VIEW.viewCls);
      }
    }
    this.hide = function () {
      if (!els) {
        return;
      }
    }
    function render(data) {
      initResources();
      data = data || VIEW.models.User.userList.get();
      console.log(data);

      var list = [];
      //var d = {name: 1,age: 2,tel: 3,company: 4};
      data = data.data;
      data = data.schemata;
      data.forEach(function(key, idx){
        var d = {};
        key.child.forEach(function(key){
          d[key.name] = key.title;//name:name    title:value
        });
        list.push(Tpl.userList(d));
      });
      els.userList.html( list.join('') );


    }//end render

  }//end View
  return new HomeView();
});
