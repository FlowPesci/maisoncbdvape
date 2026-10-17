/**
 * src/assets/js/hero-fumee.js — fumée dorée du hero de l'accueil
 *
 * Une vraie simulation de fluide (méthode « stable fluids », Navier-Stokes
 * simplifié) et non un motif de bruit : la fumée naît de sources en bas du
 * hero, monte par flottaison, s'enroule, se dissipe en montant, et la souris
 * la déplace comme une main dans l'air. Plus une poussière d'or en canvas 2D
 * et une parallaxe légère de la vitrine. Aucune librairie.
 *
 * ─── Interrupteur ─────────────────────────────────────────────────────────
 * `site.json` → `effets.fumeeAccueil` (case « Fumée animée sur l'accueil »
 * dans /admin/contenu/ → Configuration du site). À `false`, `index.njk` ne
 * pose ni les canvas, ni ce script, ni l'animation du titre : le hero redevient
 * exactement celui d'avant. Voir CLAUDE.md, section « Fumée du hero ».
 *
 * ─── Ce script ne doit JAMAIS conditionner l'affichage du contenu ─────────
 * Le titre se révèle en CSS pur (`.hero-titre-anime`), pas ici. Deux scripts
 * morts ont déjà vidé des pages dans ce dépôt (`admin-commandes`,
 * `categorie-menu`) : si celui-ci meurt, on perd la fumée, rien d'autre.
 *
 * ─── Garde-fous ───────────────────────────────────────────────────────────
 * - sans WebGL / sans demi-flottants : le canvas reste vide, fond CSS d'origine ;
 * - mouvement réduit demandé : une image fixe, aucune boucle ;
 * - hero hors de vue ou onglet masqué : la boucle s'arrête ;
 * - appareil trop lent (images > 34 ms en moyenne) : la fumée s'éteint en
 *   fondu, la poussière reste — mieux vaut moins d'effet qu'un site qui rame.
 */
(function () {
  var hero = document.querySelector('[data-hero-fumee]');
  if (!hero || !window.requestAnimationFrame || !window.IntersectionObserver) return;
  var canvas = hero.querySelector('.fx-fumee');
  var dust   = hero.querySelector('.fx-poussiere');
  if (!canvas || !dust || !dust.getContext) return;
  var mm = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  var reduce = mm('(prefers-reduced-motion: reduce)');
  var small  = mm('(max-width: 1023px)');
  var raf_ = function (f) { return window.requestAnimationFrame(f); };


  /* ─── Réglages : c'est ici qu'on ajuste le caractère de la fumée ────── */
  var CFG = {
    SIM: small ? 96 : 144,     // grille du mouvement (le flou de la fumée cache la basse résolution)
    DYE: small ? 384 : 640,    // grille de la fumée elle-même
    ITER: small ? 14 : 20,     // précision de l'incompressibilité
    CURL: 12,                  // tendance à s'enrouler
    VEL_DISS: 0.55,            // l'air freine le mouvement
    DEN_DISS: 0.42,            // la fumée s'efface en montant
    PRESSURE: 0.8,
    BUOY: 18,                  // flottaison : la fumée chaude monte
    LIFT: 750,                 // poussée à la source
    DYE_RATE: 10,             // quantité de fumée émise
    MOUSE: 0.55,               // force du geste de la souris
    GAIN: 1.5                  // opacité de la fumée selon sa densité
  };

  /* ─── Souris ─────────────────────────────────────────────────────────── */
  var ptr = { x: .72, y: .5, px: .72, py: .5, moved: false, last: -1e9 };
  var look = { x: .72, y: .5 };        // version lissée, pour la poussière et la vitrine
  hero.addEventListener('pointermove', function (e) {
    var r = hero.getBoundingClientRect(), now = performance.now();
    var x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (now - ptr.last > 200) { ptr.px = x; ptr.py = y; }   // pas de saut au retour du curseur
    ptr.x = x; ptr.y = y; ptr.moved = true; ptr.last = now;
  }, { passive: true });

  /* ═══ 1. FUMÉE ═══════════════════════════════════════════════════════ */
  var fx = (function () { try {
    var params = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' };
    var gl = canvas.getContext('webgl2', params), isGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', params);
    if (!gl) return null;

    var type, linear;
    if (isGL2) { gl.getExtension('EXT_color_buffer_float'); type = gl.HALF_FLOAT; linear = true; }
    else {
      var hf = gl.getExtension('OES_texture_half_float');
      linear = !!gl.getExtension('OES_texture_half_float_linear');
      type = hf && hf.HALF_FLOAT_OES;
    }
    if (!type) return null;

    function supported(internal, format) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
      var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t);
      return ok;
    }
    function format(kind) {
      if (!isGL2) return supported(gl.RGBA, gl.RGBA) ? { i: gl.RGBA, f: gl.RGBA } : null;
      var chain = { r: [[gl.R16F, gl.RED], [gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]],
                    rg: [[gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]], rgba: [[gl.RGBA16F, gl.RGBA]] }[kind];
      for (var k = 0; k < chain.length; k++) if (supported(chain[k][0], chain[k][1])) return { i: chain[k][0], f: chain[k][1] };
      return null;
    }
    var FR = format('r'), FRG = format('rg');
    if (!FR || !FRG) return null;

    /* ─── Shaders ───────────────────────────────────────────────────── */
    var VS = 'precision highp float;attribute vec2 aPosition;varying vec2 vUv,vL,vR,vT,vB;uniform vec2 texelSize;' +
      'void main(){vUv=aPosition*.5+.5;vL=vUv-vec2(texelSize.x,0.);vR=vUv+vec2(texelSize.x,0.);' +
      'vT=vUv+vec2(0.,texelSize.y);vB=vUv-vec2(0.,texelSize.y);gl_Position=vec4(aPosition,0.,1.);}';
    var H = 'precision highp float;precision highp sampler2D;varying vec2 vUv,vL,vR,vT,vB;\n';
    /* Bord OUVERT en haut (pression nulle au-dessus du cadre) :
       sans ça, le haut agit comme un couvercle, la fumée ne peut pas sortir et
       s'étale à l'horizontale. Les côtés restent fermés : ouverts, ils aspirent
       l'air de travers et couchent la fumée. */
    var OPEN = 'if(vT.y>1.)T=0.;';
    var SRC = {
      clear: 'uniform sampler2D uTexture;uniform float value;void main(){gl_FragColor=value*texture2D(uTexture,vUv);}',
      splat: 'uniform sampler2D uTarget;uniform float aspectRatio,radius;uniform vec3 color;uniform vec2 point;' +
        'void main(){vec2 p=vUv-point;p.x*=aspectRatio;vec3 s=exp(-dot(p,p)/radius)*color;' +
        'gl_FragColor=vec4(texture2D(uTarget,vUv).xyz+s,1.);}',
      advect: 'uniform sampler2D uVelocity,uSource;uniform vec2 texelSize,dyeTexelSize;uniform float dt,dissipation;' +
        'vec4 bilerp(sampler2D s,vec2 uv,vec2 ts){vec2 st=uv/ts-.5;vec2 i=floor(st);vec2 f=fract(st);' +
        'vec4 a=texture2D(s,(i+vec2(.5,.5))*ts),b=texture2D(s,(i+vec2(1.5,.5))*ts),c=texture2D(s,(i+vec2(.5,1.5))*ts),d=texture2D(s,(i+vec2(1.5,1.5))*ts);' +
        'return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}' +
        'void main(){\n#ifdef MANUAL\nvec2 co=vUv-dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize;vec4 r=bilerp(uSource,co,dyeTexelSize);\n' +
        '#else\nvec2 co=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;vec4 r=texture2D(uSource,co);\n#endif\n' +
        'gl_FragColor=r/(1.+dissipation*dt);}',
      buoy: 'uniform sampler2D uVelocity,uDensity;uniform float dt,strength;' +
        'void main(){vec2 v=texture2D(uVelocity,vUv).xy;v.y+=dt*strength*texture2D(uDensity,vUv).x;gl_FragColor=vec4(v,0.,1.);}',
      curl: 'uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).y,R=texture2D(uVelocity,vR).y,' +
        'T=texture2D(uVelocity,vT).x,B=texture2D(uVelocity,vB).x;gl_FragColor=vec4(.5*(R-L-T+B),0.,0.,1.);}',
      vort: 'uniform sampler2D uVelocity,uCurl;uniform float curl,dt;' +
        'void main(){float L=texture2D(uCurl,vL).x,R=texture2D(uCurl,vR).x,T=texture2D(uCurl,vT).x,B=texture2D(uCurl,vB).x,C=texture2D(uCurl,vUv).x;' +
        'vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+.0001;f*=curl*C;f.y*=-1.;' +
        'vec2 v=clamp(texture2D(uVelocity,vUv).xy+f*dt,-1000.,1000.);gl_FragColor=vec4(v,0.,1.);}',
      div: 'uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).x,R=texture2D(uVelocity,vR).x,' +
        'T=texture2D(uVelocity,vT).y,B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;' +
        'if(vB.y<0.)B=-C.y;' +          /* seul le bas est un mur : la fumée sort librement par le haut et les côtés */
        'gl_FragColor=vec4(.5*(R-L+T-B),0.,0.,1.);}',
      pressure: 'uniform sampler2D uPressure,uDivergence;void main(){float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x,' +
        'T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;' + OPEN + 'gl_FragColor=vec4((L+R+B+T-texture2D(uDivergence,vUv).x)*.25,0.,0.,1.);}',
      grad: 'uniform sampler2D uPressure,uVelocity;void main(){float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x,' +
        'T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;' + OPEN + 'vec2 v=texture2D(uVelocity,vUv).xy-vec2(R-L,T-B);gl_FragColor=vec4(v,0.,1.);}',
      /* Rendu : densité → voile translucide, bronze dans les zones fines,
         crème dorée là où la fumée est dense (elle « prend la lumière »). */
      display: 'uniform sampler2D uTexture;uniform float uMin,uOpacity,uBase,uGain;' +
        'void main(){float d=texture2D(uTexture,vUv).x;float a=1.-exp(-d*uGain);' +
        'a*=mix(uMin,1.,smoothstep(.2,.55,vUv.x));a*=smoothstep(1.,.8,vUv.y)*smoothstep(uBase,uBase+.1,vUv.y);a*=.78*uOpacity;' +
        'vec3 c=mix(vec3(.5,.36,.18),vec3(.92,.8,.56),smoothstep(.08,.65,a));gl_FragColor=vec4(c*a,a);}'
    };
    function sh(t, s) {
      var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    }
    var vs = sh(gl.VERTEX_SHADER, VS);
    function prog(name) {
      var p = gl.createProgram(), u = {};
      gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, (linear ? '' : '#define MANUAL\n') + H + SRC[name]));
      gl.bindAttribLocation(p, 0, 'aPosition'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      for (var i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
        var nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm);
      }
      return { p: p, u: u };
    }
    var P;
    try { P = {}; for (var k in SRC) P[k] = prog(k); } catch (e) { return null; }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);

    function use(pr) { gl.useProgram(pr.p); return pr.u; }
    function blit(t) {
      if (t) { gl.viewport(0, 0, t.w, t.h); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); }
      else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function fbo(w, h, F, filter) {
      gl.activeTexture(gl.TEXTURE0);
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, F.i, w, h, 0, F.f, type, null);
      var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex: t, fbo: f, w: w, h: h, tx: 1 / w, ty: 1 / h,
        bind: function (unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); return unit; } };
    }
    function dbl(w, h, F, filter) {
      var a = fbo(w, h, F, filter), b = fbo(w, h, F, filter);
      return { w: w, h: h, tx: 1 / w, ty: 1 / h, get read() { return a; }, get write() { return b; }, swap: function () { var t = a; a = b; b = t; } };
    }
    function size(r) {
      var W = gl.drawingBufferWidth, Hh = gl.drawingBufferHeight, a = Math.max(W, Hh) / Math.min(W, Hh);
      var mn = Math.round(r), mx = Math.round(r * a);
      return W > Hh ? { w: mx, h: mn } : { w: mn, h: mx };
    }

    var vel, dye, prs, dv, crl, filt = linear ? gl.LINEAR : gl.NEAREST, radScale = 1;
    function init() {
      var s = size(CFG.SIM), d = size(CFG.DYE);
      vel = dbl(s.w, s.h, FRG, filt); dye = dbl(d.w, d.h, FR, filt);
      prs = dbl(s.w, s.h, FR, gl.NEAREST); dv = fbo(s.w, s.h, FR, gl.NEAREST); crl = fbo(s.w, s.h, FR, gl.NEAREST);
      var W = gl.drawingBufferWidth, Hh = gl.drawingBufferHeight;
      radScale = Math.pow(Math.min(W, Hh) / Hh, 2);   // garde des filets fins même sur un hero très haut (téléphone)
    }

    function splat(target, x, y, c0, c1, radius) {
      var u = use(P.splat);
      gl.uniform1i(u.uTarget, target.read.bind(0));
      gl.uniform1f(u.aspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight);
      gl.uniform2f(u.point, x, y); gl.uniform3f(u.color, c0, c1, 0);
      gl.uniform1f(u.radius, radius * radScale);
      blit(target.write); target.swap();
    }

    function step(dt) {
      gl.disable(gl.BLEND);
      var u;
      u = use(P.buoy); gl.uniform2f(u.texelSize, vel.tx, vel.ty);
      gl.uniform1i(u.uVelocity, vel.read.bind(0)); gl.uniform1i(u.uDensity, dye.read.bind(1));
      gl.uniform1f(u.dt, dt); gl.uniform1f(u.strength, CFG.BUOY); blit(vel.write); vel.swap();

      u = use(P.curl); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform1i(u.uVelocity, vel.read.bind(0)); blit(crl);

      u = use(P.vort); gl.uniform2f(u.texelSize, vel.tx, vel.ty);
      gl.uniform1i(u.uVelocity, vel.read.bind(0)); gl.uniform1i(u.uCurl, crl.bind(1));
      gl.uniform1f(u.curl, CFG.CURL); gl.uniform1f(u.dt, dt); blit(vel.write); vel.swap();

      u = use(P.div); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform1i(u.uVelocity, vel.read.bind(0)); blit(dv);

      u = use(P.clear); gl.uniform1i(u.uTexture, prs.read.bind(0)); gl.uniform1f(u.value, CFG.PRESSURE); blit(prs.write); prs.swap();

      u = use(P.pressure); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform1i(u.uDivergence, dv.bind(0));
      for (var i = 0; i < CFG.ITER; i++) { gl.uniform1i(u.uPressure, prs.read.bind(1)); blit(prs.write); prs.swap(); }

      u = use(P.grad); gl.uniform2f(u.texelSize, vel.tx, vel.ty);
      gl.uniform1i(u.uPressure, prs.read.bind(0)); gl.uniform1i(u.uVelocity, vel.read.bind(1)); blit(vel.write); vel.swap();

      u = use(P.advect); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform2f(u.dyeTexelSize, vel.tx, vel.ty);
      var vi = vel.read.bind(0); gl.uniform1i(u.uVelocity, vi); gl.uniform1i(u.uSource, vi);
      gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, CFG.VEL_DISS); blit(vel.write); vel.swap();

      gl.uniform2f(u.dyeTexelSize, dye.tx, dye.ty);
      gl.uniform1i(u.uVelocity, vel.read.bind(0)); gl.uniform1i(u.uSource, dye.read.bind(1));
      gl.uniform1f(u.dissipation, CFG.DEN_DISS); blit(dye.write); dye.swap();
    }

    function render(opacity, base) {
      var u = use(P.display);
      gl.uniform1i(u.uTexture, dye.read.bind(0));
      gl.uniform1f(u.uMin, small ? .6 : .18); gl.uniform1f(u.uOpacity, opacity); gl.uniform1f(u.uBase, base); gl.uniform1f(u.uGain, CFG.GAIN);
      blit(null);
    }

    return { gl: gl, init: init, step: step, splat: splat, render: render, vel: function () { return vel; }, dye: function () { return dye; } };
  } catch (e) { return null; } })();

  /* ─── Sources de fumée ─────────────────────────────────────────────────
     Sur ordinateur : une entre le texte et la vitrine, une DERRIÈRE la
     vitrine (elle réapparaît au-dessus, ce qui donne de la profondeur), une
     au bord droit. Chacune a son propre balancement, pour que les filets ne
     montent jamais en même temps. */
  var SOURCES = small
    ? [{ x: .74, s: 1, ph: 0 }, { x: .94, s: .75, ph: 2.1 }]
    : [{ x: .535, s: .7, ph: 0 }, { x: .76, s: 1, ph: 1.7 }, { x: .965, s: .85, ph: 3.9 }];
  var srcY = 0;

  function emit(t, dt) {
    var V = fx.vel();
    for (var i = 0; i < SOURCES.length; i++) {
      var s = SOURCES[i];
      var x = s.x + Math.sin(t * .21 + s.ph) * .012;
      /* Balancement latéral : trois sinus de périodes non multiples, d'où un
         mouvement qui ne se répète pas — c'est ce qui déclenche les volutes. */
      var wob = Math.sin(t * 1.3 + s.ph) * .55 + Math.sin(t * 2.9 + s.ph * 1.7) * .3 + Math.sin(t * .47 + s.ph) * .6;
      var puff = .7 + .3 * Math.sin(t * .9 + s.ph * 2.3);           // la source « respire »
      fx.splat(V, x, srcY + .07, wob * 90 * dt * V.h / 128, CFG.LIFT * dt * s.s, .0011);
      fx.splat(fx.dye(), x, srcY + .065, CFG.DYE_RATE * dt * s.s * puff, 0, .00035);
    }
  }
  function mouse() {
    if (!ptr.moved) return;
    var V = fx.vel();
    var dx = (ptr.x - ptr.px) * V.w * 60 * CFG.MOUSE, dy = (ptr.y - ptr.py) * V.h * 60 * CFG.MOUSE;
    if (dx * dx + dy * dy > .01) fx.splat(V, ptr.x, ptr.y, dx, dy, .0025);
    ptr.px = ptr.x; ptr.py = ptr.y; ptr.moved = false;
  }

  /* ─── Taille ─────────────────────────────────────────────────────────── */
  var dctx = dust.getContext('2d'); if (!dctx) return;
  var DPR = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0;
  function resize(force) {
    var r = hero.getBoundingClientRect();
    if (!force && Math.abs(r.width - W) < 2 && Math.abs(r.height - H) < 2) return;   // la barre d'adresse mobile ne réinitialise rien
    W = r.width; H = r.height;
    dust.width = Math.round(W * DPR); dust.height = Math.round(H * DPR); dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (fx) {
      canvas.width = Math.round(W); canvas.height = Math.round(H);
      /* Sur téléphone le hero dépasse l'écran : les sources se placent au bas
         du PREMIER écran, sinon la fumée naîtrait hors de vue. */
      srcY = small ? Math.max(0, 1 - (window.innerHeight * .95) / H) : 0;
      fx.init();
    }
  }

  /* ═══ 2. POUSSIÈRE D'OR ══════════════════════════════════════════════ */
  var sprite = document.createElement('canvas'); sprite.width = sprite.height = 32;
  (function () {
    var c = sprite.getContext('2d'), g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(240,222,170,1)'); g.addColorStop(.25, 'rgba(232,213,163,.55)'); g.addColorStop(1, 'rgba(201,169,110,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  })();
  var motes = [];
  for (var m = 0, n = small ? 22 : 44; m < n; m++) motes.push({
    x: Math.random(), y: Math.random(), z: .3 + Math.random() * .7,
    s: 2 + Math.random() * 5, v: .004 + Math.random() * .012, ph: Math.random() * 6.28, w: .5 + Math.random() * 1.5
  });
  function drawDust(t, k) {
    dctx.clearRect(0, 0, W, H);
    var px = (look.x - .5) * 24, py = (look.y - .5) * -16;
    for (var i = 0; i < motes.length; i++) {
      var o = motes[i];
      o.y -= o.v * o.z * k; o.x += Math.sin(t * .4 + o.ph) * .0004 * k;
      if (o.y < -.05) { o.y = 1.05; o.x = Math.random(); }
      var a = (.55 + .45 * Math.sin(t * o.w + o.ph)) * o.z * (.25 + .75 * o.x) * Math.min(1, (1 - o.y) * 4, o.y * 6);
      dctx.globalAlpha = Math.max(0, a) * .7;
      var s = o.s * o.z; dctx.drawImage(sprite, o.x * W + px * o.z - s, o.y * H + py * o.z - s, s * 2, s * 2);
    }
    dctx.globalAlpha = 1;
  }

  var img = hero.querySelector('[data-hero-parallaxe]');

  /* ═══ Boucle ═════════════════════════════════════════════════════════
     Pas de temps FIXE (1/60 s) : la fumée se comporte pareil sur un écran
     60 Hz et 120 Hz. Et rien ne tourne quand le hero est hors de vue. */
  var STEP = 1 / 60, running = false, visible = true, raf = 0;
  var lent = { n: 0, somme: 0 };      // surveillance des appareils lents
  var simT = 0, acc = 0, last = 0, opacity = 0;
  function advance(dt) { emit(simT, dt); fx.step(dt); simT += dt; }
  function frame(now) {
    raf = 0; if (!running) return;
    var el = Math.min(.1, (now - last) / 1000); last = now;
    if (fx) {
      mouse();
      acc += el; var n = 0;
      while (acc >= STEP && n < 3) { advance(STEP); acc -= STEP; n++; }
      if (n === 3) acc = 0;                       // appareil lent : on ralentit plutôt que de s'emballer
      opacity = Math.min(1, opacity + el / 1.5);
      fx.render(opacity, srcY);
      surveiller(el);
    }
    if (now - ptr.last > 2500) { look.x += (.72 + Math.sin(now / 7000) * .12 - look.x) * .02; look.y += (.5 - look.y) * .02; }
    else { look.x += (ptr.x - look.x) * .06; look.y += (ptr.y - look.y) * .06; }
    drawDust(now / 1000, el * 60);
    if (img) img.style.transform = 'translate3d(' + ((look.x - .5) * -14).toFixed(2) + 'px,' + ((look.y - .5) * 10).toFixed(2) + 'px,0)';
    raf = raf_(frame);
  }
  /* Entre la 30ᵉ et la 150ᵉ image (le temps que le navigateur se stabilise),
     moyenne des durées d'image. Au-delà de 34 ms (< 30 i/s), la simulation
     coûte plus qu'elle n'apporte : on l'éteint en fondu et on libère le GPU. */
  function surveiller(el) {
    lent.n++;
    if (lent.n < 30 || lent.n > 150) return;
    lent.somme += el;
    if (lent.n === 150 && lent.somme / 120 > .034) {
      canvas.style.opacity = '0';
      var ext = fx.gl.getExtension('WEBGL_lose_context');
      fx = null;
      setTimeout(function () { canvas.style.display = 'none'; if (ext) ext.loseContext(); }, 2400);
    }
  }
  function update() {
    var go = visible && !document.hidden && !reduce;
    if (go && !running) { running = true; last = performance.now(); raf = raf_(frame); }
    if (!go && running) { running = false; if (raf) window.cancelAnimationFrame(raf); raf = 0; }
  }
  function prewarm(sec) { if (!fx) return; for (var i = 0, n = Math.round(sec / STEP); i < n; i++) advance(STEP); fx.render(opacity = 1, srcY); }

  resize(true);
  if (fx) canvas.style.opacity = '1'; else canvas.style.display = 'none';
  if (reduce) prewarm(4);           /* mouvement réduit : une image fixe de fumée déjà installée */
  new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }).observe(hero);
  document.addEventListener('visibilitychange', update);
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { resize(false); if (reduce) prewarm(4); }, 150); });
  update();
})();
