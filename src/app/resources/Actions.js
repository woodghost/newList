define(function (require, exports, module) {
  var thisPage = window.location.href
    //注意，保留search 是为了避免微信自动追加的应用检测状态值
    //.replace(window.location.search,'')
    .replace(window.location.hash, '');
  var thisPath = thisPage.substring(0, thisPage.lastIndexOf('/') + 1);

  ///*official
  var Actions = {
    user: Core.localHost + '/user/list.php',

    login: Core.localHost + '/account/login_third?success={SURL}&fail={FURL}&pf={PF}',
    main: thisPath + 'index.html',
    analytics: thisPath + 'analytics.html',
    dejame: 'http://deja.me/u/XPKab9',
    dejaAppAndroid: 'http://deja.me/u/XPKab9',
    dejaAppIos: 'http://deja.me/u/fzb1KO',
    dejaDwonloadBridge: 'http://m.deja.me/bridge/',
    dejaShareLogo: thisPath + 'resources/images/deja_icon_ios_228.png'
  }
  //*/

  ///_DEBUG_*Todo: debug actions
  var Actions = {
    user: 'http://ddms.mozat.com/apis/v1/form/',

    login: Core.localHost + '/account/login_third?success={SURL}&fail={FURL}&pf={PF}',
    main: thisPath + 'index.html',
    analytics: thisPath + 'analytics.html',
    dejame: 'http://deja.me/u/XPKab9',
    dejaAppAndroid: 'http://deja.me/u/XPKab9',
    dejaAppIos: 'http://deja.me/u/fzb1KO',
    dejaDwonloadBridge: 'http://m.deja.me/bridge/',
    dejaShareLogo: thisPath + 'resources/images/deja_icon_ios_228.png'
  }
  //*/
  return Actions;
});
