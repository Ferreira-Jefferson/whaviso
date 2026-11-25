// Retorno do login do Instagram (redirect URI do Bot-Tube).
// Leva o navegador ao backend local com o code e o state. Nada é enviado ao whaviso.
(function () {
  var BACKEND = "http://localhost:8000/api/instagram/oauth/callback/";
  var query = window.location.search.replace(/#.*$/, "");
  if (!query || query === "?") {
    document.getElementById("empty").hidden = false;
    return;
  }
  var target = BACKEND + query;
  var link = document.getElementById("link");
  link.href = target;
  link.textContent = target;
  var box = document.getElementById("manual");
  setTimeout(function () { box.hidden = false; }, 1500);
  document.getElementById("copy").addEventListener("click", function () {
    if (navigator.clipboard) navigator.clipboard.writeText(target);
  });
  window.location.replace(target);
})();
