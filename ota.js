/* ════════════════════════════════════════════════════════════════════
   ota.js — Actualización interna (OTA) de Aspery
   Motor: @capgo/capacitor-updater  ·  Modo: autoalojado (gratis, GitHub Pages)

   Cómo funciona para la promotora:
   • Al abrir el app (con internet) revisa si hay una versión nueva.
   • Si la hay, la DESCARGA EN SEGUNDO PLANO — no la interrumpe mientras
     registra pedidos.
   • Cuando la descarga termina, le muestra un aviso visible:
         "📦 Nueva versión disponible  [Actualizar ahora]"
     Si toca el botón, se aplica al instante y el app se recarga.
   • Si NO toca nada, se aplica igual la próxima vez que abra el app.
     → Es obligatoria: no la puede rechazar, solo elegir cuándo.
   • Sin internet no hace nada: el app sigue con la versión que ya tiene
     (el modo offline-first queda intacto).

   Seguridad: si una versión nueva fallara al arrancar, el motor revierte
   solo a la anterior que sí funcionaba. Nadie se queda con el app roto.
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

  // 1b) Mostrar la versión en el pie de la pantalla de inicio.
  //     Sin esto no hay forma de saber qué paquete está corriendo y cada
  //     actualización queda a ciegas. Aparece 2 s al abrir y desaparece.
  try{
    up.current().then(function(c){
      var v = (c && c.bundle && c.bundle.version) ? String(c.bundle.version) : 'base';
      var pie = document.querySelector('.asp-foot');
      if(pie && pie.innerHTML.indexOf('·&nbsp;v') < 0){
        pie.innerHTML += ' ·&nbsp;v' + v;
      }
      log('versión en ejecución:', v);
    }).catch(function(){});
  }catch(e){}

  /* ──────────────── AVISO VISIBLE DE ACTUALIZACIÓN ──────────────── */
  function mostrarAviso(bundleId, version){
    if(document.getElementById('ota-aviso')) return;   // ya está puesto

    var st = document.createElement('style');
    st.textContent = [
      '#ota-aviso{position:fixed;left:12px;right:12px;z-index:99999;',
      'bottom:calc(14px + env(safe-area-inset-bottom,0px));',
      'background:linear-gradient(135deg,#051D3A,#0A2E52);color:#fff;',
      'border:1px solid rgba(14,165,249,.45);border-radius:16px;',
      'padding:14px 16px;display:flex;align-items:center;gap:12px;',
      "font-family:-apple-system,system-ui,'Segoe UI',sans-serif;",
      'box-shadow:0 10px 30px rgba(0,0,0,.35);',
      'animation:otaSube .35s cubic-bezier(.2,.9,.3,1)}',
      '@keyframes otaSube{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}',
      '#ota-aviso .ota-ic{font-size:24px;line-height:1}',
      '#ota-aviso .ota-tx{flex:1;min-width:0}',
      '#ota-aviso .ota-t1{font-size:14.5px;font-weight:700;letter-spacing:-.2px}',
      '#ota-aviso .ota-t2{font-size:11.5px;color:#9FC6E4;margin-top:2px}',
      '#ota-btn{background:#0EA5F9;color:#fff;border:0;border-radius:11px;',
      'padding:11px 15px;font-size:13.5px;font-weight:800;white-space:nowrap;',
      "font-family:inherit;-webkit-tap-highlight-color:transparent}",
      '#ota-btn:active{transform:scale(.96);background:#0284C7}',
      '#ota-btn[disabled]{opacity:.65}'
    ].join('');
    document.head.appendChild(st);

    var box = document.createElement('div');
    box.id = 'ota-aviso';
    box.innerHTML =
      '<div class="ota-ic">📦</div>' +
      '<div class="ota-tx">' +
        '<div class="ota-t1">Nueva versión disponible</div>' +
        '<div class="ota-t2">Ya está descargada. Toca para aplicarla.</div>' +
      '</div>' +
      '<button id="ota-btn" type="button">Actualizar</button>';
    document.body.appendChild(box);

    document.getElementById('ota-btn').addEventListener('click', function(){
      var b = this;
      b.disabled = true;
      b.textContent = 'Aplicando…';
      log('aplicando', version);
      up.set({ id: bundleId }).catch(function(e){
        log('error al aplicar', e && e.message);
        b.disabled = false;
        b.textContent = 'Actualizar';
        var t2 = box.querySelector('.ota-t2');
        if(t2) t2.textContent = 'No se pudo aplicar ahora. Se hará al reabrir el app.';
      });
    });
  }

  /* ──────────────── REVISAR / DESCARGAR ──────────────── */
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

        return up.list().catch(function(){ return {bundles:[]}; }).then(function(l){
          var bundles = (l && l.bundles) || [];
          var ya = null;
          for(var i=0;i<bundles.length;i++){ if(String(bundles[i].version) === vRemota){ ya = bundles[i]; break; } }

          if(ya){
            // Ya estaba descargada de una sesión anterior
            log('ya descargada → se programa y se avisa', vRemota);
            return up.next({ id: ya.id }).then(function(){
              limpiar(bundles, vRemota, vActual);
              mostrarAviso(ya.id, vRemota);
            });
          }

          // Descargar en segundo plano (sin molestar a la promotora)
          log('descargando', vRemota);
          return up.download({ url: m.url, version: vRemota }).then(function(nuevo){
            // Queda programada para el próximo arranque (obligatoria)
            return up.next({ id: nuevo.id }).then(function(){
              log('descargada ✓ · se avisa a la promotora');
              mostrarAviso(nuevo.id, vRemota);
              return up.list().catch(function(){ return {bundles:bundles}; }).then(function(l2){
                limpiar((l2 && l2.bundles) || bundles, vRemota, vActual);
              });
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
