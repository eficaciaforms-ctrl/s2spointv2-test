/* ════════════════════════════════════════════════════════════════════
   ota.js — Actualización interna (OTA) de Aspery
   Motor: @capgo/capacitor-updater  ·  Modo: autoalojado (gratis, GitHub Pages)

   Qué hace:
   • Solo corre DENTRO del APK (en la web no aplica).
   • Al arrancar avisa que el app cargó bien (notifyAppReady). Si no, Capgo
     revierte a la versión anterior por seguridad.
   • Durante el arranque consulta un manifiesto en GitHub Pages. Si hay una
     versión más nueva, la descarga EN SEGUNDO PLANO y la deja lista para la
     próxima vez que la promotora abra el app — NO la interrumpe mientras
     registra pedidos, y es obligatoria (no puede rechazarla).
   • Sin internet: no hace nada, el app sigue funcionando con la versión que
     ya tiene guardada (offline-first intacto).
   ════════════════════════════════════════════════════════════════════ */
(function(){
  // URL del manifiesto (lo publica el workflow ota-bundle.yml en GitHub Pages)
  var MANIFEST_URL = 'https://eficaciaforms-ctrl.github.io/s2spointv2-test/ota-manifest.json';

  function CU(){
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater;
  }
  function esAPK(){
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function log(){ try{ console.log.apply(console, ['[OTA]'].concat([].slice.call(arguments))); }catch(e){} }

  if(!esAPK()) return;                 // en navegador no corre
  var up = CU();
  if(!up){ log('plugin no disponible'); return; }

  // 1) Confirmar que el app arrancó OK (evita rollback automático de Capgo)
  try{ up.notifyAppReady(); }catch(e){ log('notifyAppReady', e && e.message); }

  // 2) Revisar y preparar actualización, sin bloquear el arranque
  function revisar(){
    var vActual = 'builtin';
    Promise.resolve()
      .then(function(){ return up.current().catch(function(){ return null; }); })
      .then(function(cur){
        if(cur && cur.bundle && cur.bundle.version) vActual = String(cur.bundle.version);
        return fetch(MANIFEST_URL + '?t=' + Date.now(), { cache:'no-store' });
      })
      .then(function(r){ if(!r || !r.ok) throw new Error('http ' + (r&&r.status)); return r.json(); })
      .then(function(m){
        if(!m || !m.version || !m.url) throw new Error('manifiesto inválido');
        var vRemota = String(m.version);
        log('actual', vActual, '· remota', vRemota);
        if(vRemota === vActual){ log('ya está al día'); return; }

        // ¿Ya la descargamos antes? → solo re-programarla
        return up.list().catch(function(){ return {bundles:[]}; }).then(function(l){
          var bundles = (l && l.bundles) || [];
          var ya = null;
          for(var i=0;i<bundles.length;i++){ if(String(bundles[i].version) === vRemota){ ya = bundles[i]; break; } }
          if(ya){
            log('ya descargada → se programa', vRemota);
            return up.next({ id: ya.id }).then(function(){ limpiar(bundles, vRemota, vActual); });
          }
          // Descargar en segundo plano y dejar lista para el próximo arranque
          log('descargando', vRemota);
          return up.download({ url: m.url, version: vRemota }).then(function(nuevo){
            return up.next({ id: nuevo.id });
          }).then(function(){
            log('descargada ✓ · se aplicará al reabrir el app');
            return up.list().catch(function(){ return {bundles:bundles}; }).then(function(l2){
              limpiar((l2 && l2.bundles) || bundles, vRemota, vActual);
            });
          });
        });
      })
      .catch(function(e){ log('sin actualización (posible sin internet):', e && e.message); });
  }

  // Borra bundles viejos para no llenar el teléfono (nunca el actual, el objetivo ni el builtin)
  function limpiar(bundles, vRemota, vActual){
    try{
      (bundles || []).forEach(function(b){
        var v = String(b.version);
        if(b.id && v !== vRemota && v !== vActual && v !== 'builtin'){
          up.delete({ id: b.id }).catch(function(){});
        }
      });
    }catch(e){}
  }

  // Esperar un poco para no competir con la carga pesada del arranque (base_pdv ~5MB)
  if(document.readyState === 'complete') setTimeout(revisar, 1800);
  else window.addEventListener('load', function(){ setTimeout(revisar, 1800); });
})();
