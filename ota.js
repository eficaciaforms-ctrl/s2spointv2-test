/* ════════════════════════════════════════════════════════════════════
   ota.js — Actualización interna (OTA) de Aspery
   Motor: @capgo/capacitor-updater  ·  Modo: autoalojado (gratis, GitHub Pages)

   CÓMO FUNCIONA (obligatorio, al abrir el app):
   1. Al arrancar consulta si hay versión nueva. Esto es silencioso y rápido:
      si no hay internet o no hay novedad, la promotora no ve absolutamente
      nada y entra directo al app.
   2. Si SÍ hay versión nueva, aparece una pantalla que cubre todo:
         "Actualizando Aspery · Espera un momento"
      con la barra de avance. No puede seguir hasta que termine.
   3. Al terminar, el app se recarga solo con la versión nueva.

   EL RESGUARDO (importante):
   Si la descarga se traba (señal mala en un mercado), a los 25 segundos
   aparece "Continuar" para que pueda trabajar igual. NO es saltarse la
   actualización: queda descargándose y se aplica al reabrir el app. Sin
   esto, una promotora con mala señal se quedaría sin poder registrar.

   Si una versión nueva fallara al arrancar, el motor revierte solo a la
   anterior. Nadie se queda con el app roto.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  var MANIFEST_URL = 'https://eficaciaforms-ctrl.github.io/s2spointv2-test/ota-manifest.json';
  var MS_MANIFIESTO = 10000;   // esperar el manifiesto como máximo 10 s
  var MS_ESCAPE     = 40000;   // recién a los 40 s ofrecer "Continuar"

  function CU(){
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater;
  }
  function esAPK(){
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function log(){ try{ console.log.apply(console, ['[OTA]'].concat([].slice.call(arguments))); }catch(e){} }

  if(!esAPK()) return;
  var up = CU();
  if(!up){ log('plugin no disponible'); return; }

  // Confirmar que el app arrancó OK (si no, Capgo revierte por seguridad)
  try{ up.notifyAppReady(); }catch(e){ log('notifyAppReady', e && e.message); }

  // Versión en ejecución, en el pie de la pantalla de inicio (para verificar)
  var _vActual = 'base';
  try{
    up.current().then(function(c){
      if(c && c.bundle && c.bundle.version) _vActual = String(c.bundle.version);
      // Pie de la pantalla de inicio (se ve 2 s al arrancar)
      var pie = document.querySelector('.asp-foot');
      if(pie && pie.innerHTML.indexOf('&nbsp;v') < 0) pie.innerHTML += ' ·&nbsp;v' + _vActual;
      // Y FIJO en las pantallas de ingreso (login y confirmación de fecha),
      // que es donde da tiempo de leerlo con calma.
      var etq = document.querySelectorAll('.ver-app');
      for(var i=0;i<etq.length;i++) etq[i].textContent = 'Aspery · versión ' + _vActual;
      // Sello fijo, visible en TODAS las pantallas
      var sello = document.getElementById('ver-fija');
      if(sello) sello.textContent = 'Aspery v' + _vActual;
      log('versión en ejecución:', _vActual);
    }).catch(function(){});
  }catch(e){}

  /* ─────────────── PANTALLA DE ACTUALIZACIÓN ─────────────── */
  var _ov=null, _escTimer=null;
  function abrirPantalla(version){
    if(_ov) return;
    var st=document.createElement('style');
    st.textContent = [
      '#ota-ov{position:fixed;inset:0;z-index:2000000;background:linear-gradient(170deg,#051D3A,#0A2E52 60%,#0F172A);',
      "color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:26px;",
      "font-family:-apple-system,system-ui,'Segoe UI',sans-serif;text-align:center}",
      '#ota-ov .ic{font-size:52px;margin-bottom:16px;animation:otaFlota 1.9s ease-in-out infinite}',
      '@keyframes otaFlota{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}',
      '#ota-ov h2{font-size:21px;font-weight:800;letter-spacing:-.3px;margin-bottom:7px}',
      '#ota-ov p{font-size:13.5px;color:#9FC6E4;line-height:1.6;max-width:300px}',
      '#ota-ov .ver{font-size:11.5px;color:#5b83a6;margin-top:5px}',
      '#ota-ov .barra{width:min(270px,78vw);height:9px;border-radius:999px;background:rgba(255,255,255,.14);',
      'overflow:hidden;margin:22px 0 10px}',
      '#ota-ov .relleno{height:100%;width:18%;border-radius:999px;background:#0EA5F9;animation:otaCarga 1.5s ease-in-out infinite}',
      '@keyframes otaCarga{0%{margin-left:-20%;width:28%}50%{width:46%}100%{margin-left:100%;width:28%}}',
      '#ota-ov .paso{font-size:12.5px;color:#7DD3FC;font-weight:700;min-height:18px}',
      '#ota-esc{margin-top:26px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);',
      'color:#fff;border-radius:11px;padding:13px 22px;font-size:13.5px;font-weight:700;font-family:inherit;',
      'display:none;cursor:pointer}',
      '#ota-esc small{display:block;font-weight:400;font-size:11px;color:#9FC6E4;margin-top:3px}'
    ].join('');
    document.head.appendChild(st);

    _ov=document.createElement('div');
    _ov.id='ota-ov';
    _ov.innerHTML =
      '<div class="ic">📦</div>'+
      '<h2>Actualizando Aspery</h2>'+
      '<p>Estamos instalando una mejora. Toma unos segundos y se hace sola.</p>'+
      '<div class="ver">Versión ' + version + '</div>'+
      '<div class="barra"><div class="relleno"></div></div>'+
      '<div class="paso" id="ota-paso">Descargando…</div>'+
      '<button id="ota-esc" type="button">Continuar sin esperar'+
        '<small>La mejora se instalará al volver a abrir el app</small></button>';
    document.body.appendChild(_ov);

    // Resguardo: si la señal está mala, que pueda trabajar igual
    _escTimer = setTimeout(function(){
      var b=document.getElementById('ota-esc');
      if(b){
        b.style.display='block';
        b.addEventListener('click', function(){ cerrarPantalla(); });
      }
      var p=document.getElementById('ota-paso');
      if(p) p.textContent='La conexión está lenta…';
    }, MS_ESCAPE);
  }
  function paso(txt){ var p=document.getElementById('ota-paso'); if(p) p.textContent=txt; }
  function cerrarPantalla(){
    if(_escTimer){ clearTimeout(_escTimer); _escTimer=null; }
    if(_ov && _ov.parentNode){ _ov.parentNode.removeChild(_ov); }
    _ov=null;
  }

  /* ─────────────── REVISAR Y APLICAR ─────────────── */
  function revisar(){
    var vActual='builtin';
    Promise.resolve()
      .then(function(){ return up.current().catch(function(){ return null; }); })
      .then(function(cur){
        if(cur && cur.bundle && cur.bundle.version) vActual=String(cur.bundle.version);
        // Consulta corta: sin internet falla rápido y no se muestra nada
        var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
        var tm=setTimeout(function(){ if(ctrl) ctrl.abort(); }, MS_MANIFIESTO);
        return fetch(MANIFEST_URL+'?t='+Date.now(), {cache:'no-store', signal:ctrl?ctrl.signal:undefined})
                 .then(function(r){ clearTimeout(tm); return r; });
      })
      .then(function(r){ if(!r || !r.ok) throw new Error('http '+(r&&r.status)); return r.json(); })
      .then(function(m){
        if(!m || !m.version || !m.url) throw new Error('manifiesto inválido');
        var vRemota=String(m.version);
        log('actual', vActual, '· remota', vRemota);
        if(vRemota===vActual){ log('ya está al día'); return; }   // nada visible

        // Hay versión nueva → recién aquí se muestra la pantalla
        abrirPantalla(vRemota);

        return up.list().catch(function(){ return {bundles:[]}; }).then(function(l){
          var bundles=(l&&l.bundles)||[], ya=null;
          for(var i=0;i<bundles.length;i++){ if(String(bundles[i].version)===vRemota){ ya=bundles[i]; break; } }
          if(ya){                                    // ya estaba descargada: aplicar al toque
            paso('Aplicando…');
            limpiar(bundles, vRemota, vActual);
            return up.next({id: ya.id})
                     .catch(function(){})
                     .then(function(){ return up.set({id: ya.id}); });
          }
          paso('Descargando…');
          return up.download({url:m.url, version:vRemota}).then(function(nuevo){
            paso('Aplicando…');
            up.list().then(function(l2){ limpiar((l2&&l2.bundles)||bundles, vRemota, vActual); }).catch(function(){});
            // Dejarla programada ANTES de aplicar: si algo corta aquí,
            // igual entra al reabrir el app.
            return up.next({id: nuevo.id}).then(function(){ return up.set({id: nuevo.id}); });
          });
        });
      })
      .catch(function(e){
        log('sin actualización:', e && e.message);
        cerrarPantalla();     // cualquier problema → que pueda trabajar
      });
  }

  function limpiar(bundles, vRemota, vActual){
    try{
      (bundles||[]).forEach(function(b){
        var v=String(b.version);
        if(b.id && v!==vRemota && v!==vActual && v!=='builtin'){ up.delete({id:b.id}).catch(function(){}); }
      });
    }catch(e){}
  }

  // Arrancar la revisión de inmediato (no esperamos a que cargue todo el app)
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(revisar,250); });
  else setTimeout(revisar, 250);
})();
