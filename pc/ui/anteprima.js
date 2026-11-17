/*
 * Wisper Ufficio: l'esempio di un modello dentro la pagina Modelli (anteprima.html#<codice>).
 * Chiede l'HTML alla pagina che lo ospita (WisperAnteprima, in modelli.js), lo scrive al posto di questa pagina e, quando i
 * caratteri sono pronti, dice alla pagina quanto è alto (WisperAnteprimaPronta) per metterlo in scala.
 */
(function () {
  'use strict';
  function scrivi() {
    var casa = window.parent;
    var cornice = window.frameElement;
    var html = '';
    try { html = casa && casa !== window && casa.WisperAnteprima ? casa.WisperAnteprima(decodeURIComponent(location.hash.slice(1))) : ''; } catch (e) { html = ''; }
    if (!html) return;
    document.open();
    document.write(html);
    document.close();
    var pronta = function () {
      try { if (casa.WisperAnteprimaPronta) casa.WisperAnteprimaPronta(cornice, document.documentElement.scrollHeight); } catch (e) { /* la pagina è già andata via */ }
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(pronta, pronta); else setTimeout(pronta, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scrivi); else scrivi();
})();
