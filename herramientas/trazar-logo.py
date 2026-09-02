#!/usr/bin/env python3
"""Convierte logo-al3d.png en logo-al3d.svg, que es la marca de la que cuelga todo lo demás.

El repositorio tenía CUATRO dibujos distintos del logotipo —el PNG de 260x130 en la barra del
cotizador y en el PDF, un SVG de tres círculos pegado a mano tres veces con colores que no son
los de la marca, un cuarto con solo el texto en el Vectorizador y el Escalador, y el favicon—
y el único archivo de verdad medía 260x130 px. Eso es suficiente para una barra a 38 px de alto
y no alcanza para nada más: ni para una pantalla retina, ni para el papel, ni para el icono de
512 px que pide una PWA. De ahí sale este archivo: un solo dibujo, en vector, del que se derivan
todos los demás usos.

El camino tiene cuatro trampas y las cuatro cuestan un logotipo feo. Están explicadas abajo, en
el sitio donde se esquivan, porque leídas fuera de su línea no se entienden.

Pide tres paquetes que NO son dependencias del producto —el producto no tiene ninguna— sino de
esta herramienta de autoría, igual que extraer-estilo.sh pide sh:

    pip3 install pillow numpy vtracer

Uso:
    herramientas/trazar-logo.py            regenera logo-al3d.svg y logo-al3d-oscuro.svg
    herramientas/trazar-logo.py --diff     solo dice si cambiarían, no escribe

Después de correrlo, verifica el parecido con el original:
    node herramientas/verificar-logo.mjs
"""

import collections
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'logo-al3d.png')
DESTINO = os.path.join(RAIZ, 'logo-al3d.svg')
DESTINO_OSCURO = os.path.join(RAIZ, 'logo-al3d-oscuro.svg')

try:
    from PIL import Image
    import numpy as np
    import vtracer
except ImportError as e:
    print('Falta un paquete de esta herramienta: %s' % e.name, file=sys.stderr)
    print('Instálalos con:  pip3 install pillow numpy vtracer', file=sys.stderr)
    sys.exit(2)

# Los cuatro colores, muestreados del propio PNG y no copiados de ningún documento: son el 65 %
# de los píxeles opacos del archivo. El azul medio manda —39.6 % él solo— y es el que debería
# gobernar los tokens de la app.
DEEP   = (52, 30, 253)     # 341efd  el lóbulo pequeño oscuro
MID    = (66, 103, 254)    # 4267fe  el lóbulo grande, el color dominante
LIGHT  = (98, 144, 255)    # 6290ff  el lóbulo claro de en medio
TINTA  = (54, 52, 53)      # 363435  el "AL" y el filete vertical
TINTA_OSCURO = (232, 236, 245)   # e8ecf5  el mismo texto sobre fondo oscuro
PALETA = [DEEP, MID, LIGHT, TINTA]

ESCALA = 12          # a cuánto se amplía antes de trazar
# Los umbrales de vtracer están en píxeles del mapa que recibe, no del original, así que tienen
# que ir en unidades de ESCALA o dejan de significar lo que dicen. Con los valores de fábrica
# —pensados para una imagen a tamaño natural— a 12x el trazador pone un punto de control cada
# tercio de píxel del logotipo real y el archivo se va a 124 KB de curvas que nadie puede ver.
MOTA_MIN = 0.5       # manchas más chicas que esto (en píxeles del original) se descartan
TRAMO_MIN = 1.0      # y tramos más cortos que esto no se dibujan
COBERTURA_MIN = 0.5  # a partir de qué mezcla un píxel cuenta como tinta y no como papel


def hexa(c):
    return '#%02x%02x%02x' % c


def aplanar_sobre_blanco(im):
    """El PNG es 51 % transparente. Trazar la transparencia da un contorno de más, así que se
    compone sobre blanco y a partir de ahí todo es una mezcla de un color con el papel."""
    fondo = Image.new('RGBA', im.size, (255, 255, 255, 255))
    fondo.alpha_composite(im)
    return fondo.convert('RGB')


def cuantizar(rgb_grande):
    """TRAMPA 1 — asignar cada píxel al color más cercano en RGB produce halos.

    Un píxel del borde de una letra es una mezcla de la tinta con el papel: un gris medio como
    (154,153,154). Su distancia al cuadrado es 13 418 contra el azul claro y unos 30 400 tanto
    contra la tinta como contra el blanco. O sea que el borde de una letra NEGRA queda 2.3 veces
    más cerca del AZUL que de la propia tinta, y el "AL 3D" sale rodeado de un halo celeste.

    Lo correcto no es medir distancias entre colores, es deshacer la mezcla. Cada píxel es
    P = alfa*C + (1-alfa)*blanco para UN color C de la marca. Para cada C se despeja el alfa que
    mejor ajusta —una proyección sobre la recta que va del blanco a C—, se mide cuánto error deja
    esa hipótesis, y gana la que menos deje. Lo que no llega a media cobertura es papel.
    """
    a = rgb_grande.astype(float)
    alto, ancho, _ = a.shape
    error_min = np.full((alto, ancho), np.inf)
    cual = np.zeros((alto, ancho), dtype=int)
    cobertura = np.zeros((alto, ancho))

    for i, color in enumerate(PALETA):
        d = np.array(color, dtype=float) - 255.0        # del blanco hacia el color
        alfa = np.clip(((a - 255.0) * d).sum(-1) / (d * d).sum(), 0.0, 1.0)
        error = ((a - (255.0 + alfa[..., None] * d)) ** 2).sum(-1)
        mejora = error < error_min
        error_min[mejora] = error[mejora]
        cual[mejora] = i
        cobertura[mejora] = alfa[mejora]

    salida = np.full((alto, ancho, 3), 255, dtype=np.uint8)
    tinta = cobertura >= COBERTURA_MIN
    salida[tinta] = np.array(PALETA, dtype=np.uint8)[cual][tinta]
    return salida


def desplazamiento(trazo):
    """Dónde coloca vtracer un trazo. Y esto es la trampa 5, que no se ve leyendo el SVG por
    encima: vtracer NO escribe coordenadas absolutas. Cada <path> empieza en `M0 0` y lleva su
    propio transform="translate(x,y)". Dos trazos con la misma `d` pueden estar en esquinas
    opuestas del dibujo. Cualquier cosa que compare o mezcle trazos —como convertir un ojal en
    agujero— tiene que colocarlos primero, o el agujero de la A acaba abierto en un lóbulo."""
    m = re.search(r'transform="translate\(([-\d.]+),\s*([-\d.]+)\)"', trazo)
    return (float(m.group(1)), float(m.group(2))) if m else (0.0, 0.0)


def recuadro(trazo):
    """El rectángulo que envuelve un trazo, ya colocado en el lienzo."""
    d = re.search(r'd="([^"]+)"', trazo).group(1)
    dx, dy = desplazamiento(trazo)
    nums = [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]
    xs, ys = nums[0::2], nums[1::2]
    if not xs or not ys:
        return (dx, dy, dx, dy)
    return (min(xs) + dx, min(ys) + dy, max(xs) + dx, max(ys) + dy)


def recolocar(d, dx, dy):
    """Reescribe una `d` para que se dibuje corrida (dx, dy). Se usa al meter el contorno de un
    ojal dentro de la figura que lo contiene: los dos venían de transforms distintos."""
    xs = iter(range(10 ** 9))
    salida = []
    par = [0]

    def uno(m):
        v = float(m.group(0)) + (dx if par[0] % 2 == 0 else dy)
        par[0] += 1
        return ('%g' % v)

    for tramo in re.split(r'([A-Za-z])', d):
        if len(tramo) == 1 and tramo.isalpha():
            par[0] = 0
            salida.append(tramo)
        else:
            salida.append(re.sub(r'-?\d+\.?\d*', uno, tramo))
    return ''.join(salida)


def limpiar(svg):
    """Las otras tres trampas, en el orden en que muerden."""

    # TRAMPA 2 — vtracer escribe width/height y NO escribe viewBox. Un <svg> sin viewBox no
    # escala: al pedirle 260x130 por CSS recorta en vez de encoger. Medido, la diferencia contra
    # el original pasa de 5.4 % a 47.7 % por esto solo, y el síntoma —"el logo sale cortado"— no
    # se parece en nada a su causa.
    m = re.search(r'width="(\d+)" height="(\d+)"', svg)
    if not m:
        raise SystemExit('El SVG de vtracer no trae width/height. ¿Cambió su formato de salida?')
    ancho, alto = int(m.group(1)), int(m.group(2))
    svg = svg.replace(m.group(0), 'viewBox="0 0 %d %d"' % (ancho, alto))

    # TRAMPA 3 — vtracer promedia y devuelve casi-duplicados (#4165F9, #4268FE, #446AFE…). Una
    # marca con seis azules parecidos no es una marca: cada relleno se ajusta al de la paleta más
    # cercano, y el archivo acaba con exactamente cuatro colores.
    #
    # Esto va ANTES de quitar el fondo, y el orden costó una tarde: el blanco que emite vtracer
    # no siempre es #ffffff exacto —depende de filter_speckle y de color_precision—, así que
    # buscar el fondo por su color literal lo dejaba puesto en la mitad de las combinaciones. El
    # síntoma es un rectángulo blanco opaco encima de todo y una diferencia del 47 % contra el
    # original, que es exactamente el mismo número que produce la trampa 2: dos causas
    # distintas, el mismo síntoma, y ninguna se parece a lo que pasa.
    admitidos = {hexa(c): c for c in PALETA}
    admitidos['#ffffff'] = (255, 255, 255)

    def ajustar(m):
        v = m.group(1).lower()
        rgb = (int(v[1:3], 16), int(v[3:5], 16), int(v[5:7], 16))
        cerca = min(admitidos, key=lambda k: sum((x - y) ** 2 for x, y in zip(admitidos[k], rgb)))
        return 'fill="%s"' % cerca

    svg = re.sub(r'fill="(#[0-9a-fA-F]{6})"', ajustar, svg)

    # TRAMPA 4 — los blancos son DOS cosas distintas y hay que tratarlas distinto.
    #
    # vtracer no dibuja agujeros: apila figuras opacas, así que el papel de fondo y las
    # contraformas de la A y de la D salen las tres como trazos blancos. Borrarlos todos deja
    # las letras macizas. Dejarlos todos deja un recuadro blanco detrás del logotipo, y eso solo
    # se ve el día que lo pones sobre algo que no sea blanco —el fondo oscuro, la placa azul del
    # icono de Android—, que es justo el día en que ya lo diste por bueno.
    #
    # El fondo se tira: se reconoce porque cubre casi todo el lienzo. Las contraformas se
    # convierten en agujeros de verdad, pegando su contorno al de la figura que las contiene y
    # marcando esa figura con fill-rule="evenodd", que es la regla que hace hueco un contorno
    # metido dentro de otro sin importar en qué sentido esté dibujado. Con eso el logotipo deja
    # de tener fondo y se puede poner encima de lo que sea.
    trazos = re.findall(r'<path[^>]*?/>', svg)
    cajas = [recuadro(t) for t in trazos]

    for i, trazo in enumerate(trazos):
        if not re.search(r'fill="#ffffff"', trazo, re.I):
            continue
        x0, y0, x1, y1 = cajas[i]
        if (x1 - x0) * (y1 - y0) > 0.55 * ancho * alto:
            svg = svg.replace(trazo, '')          # el papel
            continue
        # La figura que lo contiene es la última pintada ANTES que él que lo envuelve: son capas
        # apiladas, así que la de encima es la que este blanco vino a tapar.
        madre = None
        for j in range(i - 1, -1, -1):
            a0, b0, a1, b1 = cajas[j]
            if a0 <= x0 and b0 <= y0 and a1 >= x1 and b1 >= y1:
                madre = j
                break
        if madre is None:
            svg = svg.replace(trazo, '')          # un blanco suelto que no es agujero de nadie
            continue
        antes = trazos[madre]
        # El ojal viene con el transform del blanco y va a vivir bajo el de la figura: se corre
        # por la diferencia entre los dos, o aparece a medio dibujo de donde tiene que estar.
        hx, hy = desplazamiento(trazo)
        mx, my = desplazamiento(antes)
        hueco = recolocar(re.search(r'd="([^"]+)"', trazo).group(1), hx - mx, hy - my)
        despues = antes.replace('<path ', '<path fill-rule="evenodd" ', 1) if 'fill-rule' not in antes else antes
        despues = re.sub(r'd="([^"]+)"', lambda m: 'd="%s %s"' % (m.group(1), hueco), despues, count=1)
        svg = svg.replace(antes, despues, 1)
        svg = svg.replace(trazo, '')
        trazos[madre] = despues

    return svg


def cabecera(svg):
    """Un rótulo dentro del archivo: quien lo abra a mano tiene que saber que se regenera."""
    return svg.replace(
        '<svg ',
        '<!-- Generado por herramientas/trazar-logo.py desde logo-al3d.png. No editar a mano. -->\n<svg ',
        1)


def trazar():
    original = Image.open(ORIGEN).convert('RGBA')
    plano = aplanar_sobre_blanco(original)

    # TRAMPA 0, y es la que más se nota — hay que ampliar SUAVIZANDO y cuantizar después, nunca
    # al revés. Ampliando por vecino más cercano, el trazo persigue la escalera de píxeles del
    # original de 260 px y el logotipo sale dentado en cuanto crece. Con Lanczos el borde llega
    # al trazador como una rampa y sale una curva. De regalo, así sobrevive el filete oscuro de
    # 1 px que separa los lóbulos, que con el otro orden se lo comía la cuantización.
    grande = plano.resize((plano.width * ESCALA, plano.height * ESCALA), Image.LANCZOS)

    plano_png = os.path.join(RAIZ, '.logo-plano.png')
    Image.fromarray(cuantizar(np.array(grande)), 'RGB').save(plano_png)
    crudo = os.path.join(RAIZ, '.logo-crudo.svg')
    try:
        vtracer.convert_image_to_svg_py(
            plano_png, crudo,
            colormode='color', mode='spline',
            filter_speckle=int(MOTA_MIN * ESCALA ** 2), color_precision=8,
            layer_difference=1, corner_threshold=70,
            length_threshold=TRAMO_MIN * ESCALA,
            # path_precision=0 son coordenadas ENTERAS sobre el mapa ampliado, o sea una
            # doceava parte de un píxel del logotipo: más resolución de la que nadie puede
            # ver, y 40 KB menos que con dos decimales. Es el único ajuste que baja el peso
            # sin tocar el dibujo: medido, la diferencia contra el original ni se mueve
            # (3.81 % con dos decimales, 3.78 % con cero).
            splice_threshold=45, path_precision=0)
        svg = limpiar(open(crudo).read())
    finally:
        for tmp in (plano_png, crudo):
            if os.path.exists(tmp):
                os.remove(tmp)

    # La variante para fondo oscuro es el MISMO dibujo con la tinta cambiada, no otro archivo
    # dibujado aparte: si fueran dos originales, se separarían al primer retoque.
    oscuro = svg.replace(hexa(TINTA), hexa(TINTA_OSCURO))
    return cabecera(svg), cabecera(oscuro)


def incrustar_en_index(svg, solo_diff):
    """Escribe el dibujo dentro de cotizador.html, en la constante MARCA_SVG.

    Hace falta porque el documento que se manda a imprimir se arma como un Blob, y dentro de un
    Blob una ruta relativa no resuelve contra nada: `logo-al3d.svg` no existe desde ahí. Es la
    misma solución que ya usan css/sistema.css y js/datos/catalogo-precios.js —una copia
    generada, nunca transcrita— y por eso lo escribe esta herramienta y no una persona.

    Se guarda el SVG en una sola línea y sin la cabecera XML: va dentro de un literal de
    JavaScript y de ahí a innerHTML, donde <?xml ... ?> no pinta nada."""
    ruta = os.path.join(RAIZ, 'cotizador.html')
    html = open(ruta).read()
    cuerpo = re.sub(r'<\?xml[^>]*\?>\s*', '', svg)
    cuerpo = re.sub(r'<!--.*?-->\s*', '', cuerpo, flags=re.S).strip()
    cuerpo = re.sub(r'\s*\n\s*', '', cuerpo)
    if "'" in cuerpo or '\\' in cuerpo:
        raise SystemExit('El SVG trae comillas simples o barras: no cabe tal cual en el literal.')
    linea = "const MARCA_SVG='%s';" % cuerpo

    viejas = [l for l in html.split('\n') if l.startswith('const MARCA_SVG=')]
    if not viejas:
        raise SystemExit('No encontré la línea `const MARCA_SVG=` en cotizador.html.')
    if viejas[0] == linea:
        print('  = cotizador.html ya lleva esta marca incrustada')
        return False
    if solo_diff:
        print('  ~ cotizador.html cambiaría (MARCA_SVG)')
        return True
    open(ruta, 'w').write(html.replace(viejas[0], linea, 1))
    print('  ✓ cotizador.html actualizado (MARCA_SVG, %d bytes)' % len(cuerpo))
    return True


def main():
    solo_diff = '--diff' in sys.argv
    claro, oscuro = trazar()

    cuenta = collections.Counter(re.findall(r'fill="(#[0-9a-f]{6})"', claro))
    print('%d trazos · %s' % (claro.count('<path'), ' '.join('%s×%d' % kv for kv in cuenta.most_common())))

    cambio = False
    for ruta, contenido in ((DESTINO, claro), (DESTINO_OSCURO, oscuro)):
        antes = open(ruta).read() if os.path.exists(ruta) else None
        if antes == contenido:
            print('  = %s sin cambios' % os.path.basename(ruta))
            continue
        cambio = True
        if solo_diff:
            print('  ~ %s cambiaría' % os.path.basename(ruta))
        else:
            open(ruta, 'w').write(contenido)
            print('  ✓ %s escrito (%d bytes)' % (os.path.basename(ruta), len(contenido)))

    cambio = incrustar_en_index(claro, solo_diff) or cambio

    if not solo_diff and cambio:
        print('\nVerifica el parecido antes de subirlo:  node herramientas/verificar-logo.mjs')
    return 0


if __name__ == '__main__':
    sys.exit(main())
