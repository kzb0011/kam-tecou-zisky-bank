// Měření návštěvnosti (GoatCounter, bez cookies). Spustí se jen po kliknutí na „Přijmout“ v cookie liště:
// app.js volá window.onConsent() po souhlasu a při dalších návštěvách, pokud souhlas trvá.
(function () {
  var CK = "kzb-consent";
  var consented = function () { try { return localStorage.getItem(CK) === "all"; } catch (e) { return false; } };
  var path = function () { return location.pathname + (location.hash || "#prehled"); };
  var loaded = false;
  window.onConsent = function () {
    if (loaded) return;
    loaded = true;
    // web používá adresy s #, GoatCounter je proto dostane celé (jinak by vše počítal jako hlavní stránku)
    window.goatcounter = { path: path };
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://kamtecou.goatcounter.com/count");
    document.head.appendChild(s);
    window.addEventListener("hashchange", function () {
      if (consented() && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: path() });
    });
  };
})();
