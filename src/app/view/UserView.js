define(function (require, exports, module) {
  var BasicView = require('app/view/View');
  var BasicModel = require('app/model/Model');
  var UserModel = require('app/model/UserModel');
  var ProductModel = require('app/model/ProductModel');


  function UserView(){
    this.models = {
      Basic: BasicModel,
      User: UserModel,
      Product: ProductModel
    }
    this.viewCls = 'view-user';
    this._BasicView = BasicView;

    var VIEW = this,
      isApp = Core.NativeBridge.isApp(),
      Tpl, els,
      tap = VIEW._BasicView.tapEvent;

    //model listeners
    VIEW.models.User.userInfo.updated(render);
    VIEW.models.User.userStyle.updated(renderUserStyle);


    Core.Router.subscribe('/user/', function(req){
      //console.log(req);
    });

    function initEls() {
      if(els){return;}
      var main = VIEW._BasicView.getView(VIEW.viewCls);
      els = {
        //body: $('body'),
        main: main,

        tab: main.find('.tabs'),
        tabs: main.find('.tabs>div'),
        tabContents: main.find('.tab-content'),

        myStyle: main.find('.user-styles .my-style .list'),
        likedStyle: main.find('.user-styles .liked-style .list'),
        likedItem: main.find('.user-styles .liked-item'),

        userProfile: main.find('.profile'),

        back: main.find('.back')
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
      els.tab.on(tap,'div',function(){
        Core.Event.trigger('switchTab',this,els.tabs,els.tabContents);
      });
      els.back.on(tap, Core.Router.back);

      els.userProfile.on(tap, '.user .avatar,.user .meta .name',function(){
        Core.Event.trigger('appAPI','profile',null,null,this.getAttribute('data-id'));
      });
      els.userProfile.on(tap, '.user .follow i',renderFollow);

    }//end bindEvent

    this.show = function () {
      initResources();

      VIEW._BasicView.show(VIEW.viewCls);
    }
    this.hide = function () {
      if (!els) {
        return;
      }
    }


    function render(data) {
      initResources();
      data = data || VIEW.models.User.userInfo.get();

      if(!data || data.ret != 0 || !data.data){
        return;
      }
      var user = data.data[0],
        userStyle = VIEW.models.User.userStyle.get();

      user.followed = VIEW.models.User.profile.isFollowed(user.id);

      user.creations_count = 0;
      if(userStyle && userStyle.ret == 0 && userStyle.data && userStyle.data.creations){
        user.creations_count = userStyle.data.creations.length;
      }
      els.userProfile.html(Tpl.userProfile(user));

    }//end render
    function renderUserStyle(data){
      data = data || VIEW.models.User.userStyle.get();

      if(!data || data.ret != 0 || !data.data){
        return;
      }

      var mystyle = data.data.creations;
      var likedstyle = data.data.liked_creations;
      //data.id = viewLikedItemsQuery.id;

      renderMyStyles(mystyle);
      renderLikedStyles(likedstyle);
      renderLikedItems();

    }
    function renderMyStyles(data) {
      if(!data || data.length<1){
        els.myStyle.parent().addClass('hide');
        return;
      }
      var list = [];
      data.forEach(function(key,idx){
        list.push( Tpl.myStyle(key) );
      });

      els.myStyle.parent().removeClass('hide');
      els.myStyle.one('virtualdomrendered',function(){
        VIEW._BasicView.lazyLoadImg($(this));
      }).html(list.join(''),true);

    }
    function renderLikedStyles(data) {
      if(!data || data.length<1){
        els.likedStyle.parent().addClass('hide');
        return;
      }
      var list = [];
      data.forEach(function(key,idx){
        list.push( Tpl.likedStyle(key) );
      });

      els.likedStyle.parent().removeClass('hide');
      els.likedStyle.one('virtualdomrendered',function(){
        VIEW._BasicView.lazyLoadImg($(this));
      }).html(list.join(''),true);
    }

    function renderLikedItems(data) {
      data = data || VIEW.models.User.userStyle.get();

      if(!data || data.ret != 0 || !data.data){
        return;
      }
      var llist = [],rlist = [],dd = data.data.liked_items.slice(0);
      dd.forEach(function(key,idx){
        var _list = idx%2?rlist:llist;
        key = VIEW.models.Product.formatHelper.normal(key);

        _list.push( Tpl.likedItem(key) );
      });
      var sec = els.likedItem.find('.list');
      if(sec[0]){
        var fn = VIEW.models.User.userStyle.page?'append': 'html';
        sec.find('.loading').remove();
        sec.find('.list-row.left')[fn](llist.join(''));
        sec.find('.list-row.right')[fn](rlist.join(''));
        VIEW._BasicView.lazyLoadImg(sec);
      }
    }

    function renderFollow(){
      if (!VIEW.models.Basic.isLogined()) {
        Core.Event.trigger('login', window.location.hash);
        return;
      }
      var el = $(this),
        isInvoker = el.attr('data-invoker'),
        isFollow = el.hasClass('unfollow');

      if (isFollow){
        if(isInvoker == 0){
          el.siblings('.followed').removeClass('hide');
        }else{
          el.siblings('.each').removeClass('hide');
        }
        el.addClass('hide');
        Core.Event.trigger('UserController.beforeFollow',el.attr('data-id'),isFollow);
      }else{
        VIEW._BasicView.msgbox.showMenu({
          msg:'',
          noCls: 'highlight',
          options: [
            {
              text:'Unfollow',
              callback: function () {
                el.siblings('.followed,.each').addClass('hide');
                el.siblings('.unfollow').removeClass('hide');
                el.addClass('hide');
                Core.Event.trigger('UserController.beforeFollow',el.attr('data-id'),isFollow);
              }
            }
          ]
        });
      }
    }
  }//end View
  return new UserView();
});
