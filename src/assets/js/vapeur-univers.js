/**
 * src/assets/js/vapeur-univers.js — la photo des cartes « Nos univers »
 * ondule au survol, comme vue à travers de la vapeur
 *
 * Interrupteur : `site.json → effets.vapeurUnivers` (index.njk ne charge ce
 * fichier et ne pose `data-vapeur` que s'il est vrai). Voir CLAUDE.md,
 * « Effets visuels ».
 *
 * Fonctionnement : UN seul canvas WebGL, partagé. Au survol d'une carte, il
 * se glisse dans la carte, par-dessus sa photo, et la redessine déformée par
 * un champ de bruit qui MONTE (la vapeur s'élève) et se renforce près de la
 * souris. En sortant, l'effet retombe, puis le canvas s'en va et la photo
 * d'origine reprend sa place. Rien ne tourne quand aucune carte n'est survolée.
 *
 * ⚠ Uniquement sur les quatre cartes d'univers, jamais sur une photo de
 *   produit : là, le client doit voir l'article net.
 * ⚠ Pas de survol au doigt : sur écran tactile, rien n'est chargé ni dessiné.
 * ⚠ La photo d'origine n'est masquée qu'APRÈS la première image dessinée, et
 *   rendue dès la fin de l'effet : en cas d'échec, elle ne disparaît jamais.
 * ⚠ Réglages dans le shader (FS) : amplitude `.003+.009*pres` (déformation),
 *   `*.75` (opacité de la vapeur). Ajustés à la demande du développeur :
 *   « fumée peu visible, distorsion assez prononcée ».
 */
(function () {
  var grille = document.querySelector('[data-vapeur]');
  if (!grille || !window.requestAnimationFrame) return;
  var mm = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  if (!mm('(hover: hover) and (pointer: fine)') || mm('(prefers-reduced-motion: reduce)')) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'fx-vapeur';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext && canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return;

  var VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  var FS = [
    'precision mediump float;',
    'uniform sampler2D uImg;uniform vec2 uEchelle,uDecal,uSouris;uniform float uTemps,uForce,uOpac;uniform vec3 uFond;varying vec2 v;',
    'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}',
    'float fbm(vec2 p){float s=0.,a=.5;for(int k=0;k<3;k++){s+=a*n(p);p*=2.03;a*=.5;}return s;}',
    'void main(){',
    /* Champ de bruit qui monte : c'est ce qui fait « vapeur » plutôt que « eau ».
       ⚠ Recentré sur ±1 (`*2.`) : brut, `fbm - .5` reste vers ±0,2, et la
       première version ne déplaçait la photo que de 2-3 px — effet invisible,
       signalé le jour même par le développeur. */
    ' vec2 q=v*vec2(2.5,3.2)+vec2(0.,-uTemps*.45);',
    ' vec2 d=(vec2(fbm(q),fbm(q+vec2(5.2,1.3)))-.5)*2.;',
    ' float pres=1.-smoothstep(0.,.55,distance(v,uSouris));',
    /* Léger zoom qui monte avec l'effet : il libère 1,5 % de marge par bord,
       qui s'ajoutent aux 2,5 % du grossissement de la carte au survol
       (.cat-card-inner), soit 4 %. Déformation au plus ±1,2 % : le bord
       étiré de l'image n'apparaît jamais. Progressif, il ne saute pas à l'entrée. */
    ' float z=1.-.03*uForce;',
    ' vec2 p=(v-.5)*z+.5+d*uForce*(.003+.009*pres);',
    ' vec2 iu=uDecal+vec2(p.x,1.-p.y)*uEchelle;',
    ' vec4 c=texture2D(uImg,iu);',
    /* La photo est posée à 55 % d'opacité sur le fond de la carte : on fait ce
       mélange ICI, sur la photo seule, et le canvas reste opaque. Sinon les 55 %
       s'appliquaient aussi à la vapeur, qui restait pâle quoi qu'on règle. */
    ' c.rgb=mix(uFond,c.rgb,uOpac*c.a);c.a=1.;',   /* *c.a : les zones transparentes d'un PNG laissent voir le fond */
    /* Volutes lumineuses qui montent, dans la partie visible de la carte —
       le bas est déjà sous le dégradé sombre (.cat-overlay). */
    /* Deux couches : un voile large et doux, et des filets plus fins par-dessus.
       Volutes à plus basse fréquence que la déformation, pour qu'elles se
       lisent comme de la vapeur et non comme du grain. */
    ' vec2 qv=v*vec2(1.6,2.)+vec2(0.,-uTemps*.28);',
    ' float w=fbm(qv+d*.35);',
    ' float large=smoothstep(.38,.7,w);',
    ' float fin=pow(1.-abs(fbm(qv*2.2+vec2(3.1,0.))*2.-1.),6.);',
    ' float zone=smoothstep(.05,.4,v.y)*(1.-smoothstep(.9,1.,v.y));',
    ' float voile=(large*.55+fin*.35)*zone*(.65+.35*pres)*uForce;',
    ' c.rgb=mix(c.rgb,vec3(.96,.87,.68),clamp(voile,0.,1.)*.75);',
    ' gl_FragColor=c;',
    '}'
  ].join('\n');

  function sh(t, s) {
    var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  }
  var prog, U = {};
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'a'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch (e) { return; }
  gl.useProgram(prog);
  ['uImg', 'uEchelle', 'uDecal', 'uSouris', 'uTemps', 'uForce', 'uOpac', 'uFond'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
  gl.uniform1i(U.uImg, 0);

  /* Une texture par photo, créée au premier survol puis gardée. Une photo
     d'un autre domaine ne peut pas être lue par WebGL : on la laisse
     simplement telle quelle (null en cache = « ne pas réessayer »). */
  var textures = new Map();
  function texture(img) {
    if (textures.has(img)) return textures.get(img);
    var t = null;
    if (img.complete && img.naturalWidth) {
      try {
        t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch (e) { t = null; }
    }
    if (t || img.complete) textures.set(img, t);   // pas encore chargée : on réessaiera
    return t;
  }

  var actif = null;     // { carte, img, tex }
  var force = 0, cible = 0, souris = [.5, .5], t0 = performance.now(), raf = 0, avant = 0;

  function cadrer() {
    /* Reproduit `object-fit: cover` centré : quelle partie de l'image la
       carte montre-t-elle réellement ? */
    var r = actif.carte.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    var iw = actif.img.naturalWidth, ih = actif.img.naturalHeight;
    var s = Math.max(r.width / iw, r.height / ih);
    var ex = r.width / (iw * s), ey = r.height / (ih * s);
    gl.uniform2f(U.uEchelle, ex, ey); gl.uniform2f(U.uDecal, (1 - ex) / 2, (1 - ey) / 2);
  }

  function image() {
    raf = 0;
    if (!actif) return;
    /* Fondu calé sur le TEMPS, pas sur le nombre d'images : sur une machine
       lente, l'effet retombait en plusieurs secondes et la photo restait
       remplacée par le canvas bien après la sortie de la souris. */
    var maintenant = performance.now(), dt = Math.min(.25, (maintenant - (avant || maintenant)) / 1000);
    avant = maintenant;
    force += (cible - force) * (1 - Math.exp(-dt * 6));
    gl.uniform1f(U.uForce, force);
    gl.uniform1f(U.uTemps, (performance.now() - t0) / 1000);
    gl.uniform2f(U.uSouris, souris[0], souris[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (actif.img.style.visibility !== 'hidden') actif.img.style.visibility = 'hidden';
    if (cible === 0 && force < .01) { quitter(); return; }
    raf = window.requestAnimationFrame(image);
  }

  function quitter() {
    if (!actif) return;
    actif.img.style.visibility = '';
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    actif = null; force = 0; avant = 0;
  }

  function entrer(carte) {
    var img = carte.querySelector('.cat-card-inner img');
    if (!img) return;
    if (actif && actif.carte !== carte) quitter();
    var tex = texture(img);
    if (!tex) return;
    if (!actif) {
      actif = { carte: carte, img: img };
      gl.bindTexture(gl.TEXTURE_2D, tex);
      img.parentNode.appendChild(canvas);
      /* Opacité de la photo et couleur du fond de carte, lues sur la page
         (jamais recopiées) : le shader refait exactement le même mélange. */
      gl.uniform1f(U.uOpac, parseFloat(getComputedStyle(img).opacity) || 1);
      var fond = (getComputedStyle(carte).backgroundColor.match(/\d+(\.\d+)?/g) || [34, 30, 26]).map(Number);
      gl.uniform3f(U.uFond, fond[0] / 255, fond[1] / 255, fond[2] / 255);
      cadrer();
    }
    cible = 1;
    if (!raf) raf = window.requestAnimationFrame(image);
  }

  var cartes = grille.querySelectorAll('.cat-card');
  for (var i = 0; i < cartes.length; i++) (function (carte) {
    carte.addEventListener('mouseenter', function () { entrer(carte); });
    carte.addEventListener('mouseleave', function () { if (actif && actif.carte === carte) cible = 0; });
    carte.addEventListener('mousemove', function (e) {
      if (!actif || actif.carte !== carte) return;
      var r = carte.getBoundingClientRect();
      souris = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    });
  })(cartes[i]);
  window.addEventListener('resize', function () { if (actif) cadrer(); });
})();
